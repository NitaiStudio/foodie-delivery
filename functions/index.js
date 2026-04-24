const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')('sk_live_YOUR_STRIPE_SECRET');
const Razorpay = require('razorpay');

admin.initializeApp();

// Initialize payment gateways
const razorpay = new Razorpay({
    key_id: 'rzp_live_YOUR_KEY',
    key_secret: 'YOUR_SECRET'
});

// ============ PAYMENT FUNCTIONS ============

// Unified Payment Intent Creator
exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
    const { gateway, amount, currency, orderId, userId, country } = data;
    
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
        switch (gateway) {
            case 'stripe':
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: Math.round(amount * 100), // Convert to cents
                    currency: currency.toLowerCase(),
                    metadata: {
                        orderId: orderId,
                        userId: userId
                    }
                });
                return { client_secret: paymentIntent.client_secret, id: paymentIntent.id };
                
            case 'razorpay':
                const razorpayOrder = await razorpay.orders.create({
                    amount: Math.round(amount * 100), // Convert to paise
                    currency: 'INR',
                    receipt: orderId,
                    notes: {
                        userId: userId
                    }
                });
                return { orderId: razorpayOrder.id, amount: razorpayOrder.amount };
                
            case 'paypal':
                // Create PayPal order
                const paypalOrder = await createPayPalOrder(amount, currency, orderId);
                return { id: paypalOrder.id };
                
            default:
                return { success: true, message: `Payment intent created for ${gateway}` };
        }
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Manual UPI Payment Verification by Admin
exports.verifyUPIPayment = functions.https.onCall(async (data, context) => {
    // Check if user is admin
    const callerDoc = await admin.firestore()
        .collection('users')
        .doc(context.auth.uid)
        .get();
    
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }
    
    const { verificationId, status, adminNote } = data;
    
    const batch = admin.firestore().batch();
    
    // Update verification status
    const verificationRef = admin.firestore()
        .collection('payment_verifications')
        .doc(verificationId);
    
    batch.update(verificationRef, {
        status: status,
        verifiedBy: context.auth.uid,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminNote: adminNote || ''
    });
    
    // Get verification details
    const verificationDoc = await verificationRef.get();
    const verificationData = verificationDoc.data();
    
    if (status === 'verified') {
        // Update order payment status
        const orderRef = admin.firestore()
            .collection('orders')
            .doc(verificationData.orderId);
        
        batch.update(orderRef, {
            paymentStatus: 'paid',
            adminVerified: true,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Add money to user wallet (if needed)
        // Or mark payment as complete
        
        // Send notification to user
        const userRef = admin.firestore()
            .collection('users')
            .doc(verificationData.userId);
        
        const userDoc = await userRef.get();
        
        if (userDoc.exists && userDoc.data().fcmToken) {
            const message = {
                token: userDoc.data().fcmToken,
                notification: {
                    title: 'Payment Verified ✅',
                    body: `Your payment of ${verificationData.amount} ${verificationData.currency} has been verified.`
                },
                data: {
                    type: 'payment_verified',
                    orderId: verificationData.orderId
                }
            };
            
            await admin.messaging().send(message);
        }
    }
    
    await batch.commit();
    
    return { success: true, status: status };
});

// Real-time Payment Listener for Admin Dashboard
exports.onPaymentCreated = functions.firestore
    .document('payments/{paymentId}')
    .onCreate(async (snap, context) => {
        const payment = snap.data();
        
        // Update admin dashboard stats in real-time
        const statsRef = admin.firestore()
            .collection('admin_stats')
            .doc('payments');
        
        await admin.firestore().runTransaction(async (transaction) => {
            const statsDoc = await transaction.get(statsRef);
            
            if (!statsDoc.exists) {
                transaction.set(statsRef, {
                    totalPayments: 1,
                    totalAmount: payment.amount,
                    todayPayments: 1,
                    todayAmount: payment.amount,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                transaction.update(statsRef, {
                    totalPayments: admin.firestore.FieldValue.increment(1),
                    totalAmount: admin.firestore.FieldValue.increment(payment.amount),
                    todayPayments: admin.firestore.FieldValue.increment(1),
                    todayAmount: admin.firestore.FieldValue.increment(payment.amount),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        
        // Send real-time notification to all admins
        const adminsSnapshot = await admin.firestore()
            .collection('users')
            .where('role', '==', 'admin')
            .get();
        
        const tokens = adminsSnapshot.docs
            .map(doc => doc.data().fcmToken)
            .filter(Boolean);
        
        if (tokens.length > 0) {
            await admin.messaging().sendMulticast({
                tokens: tokens,
                notification: {
                    title: '💰 New Payment Received',
                    body: `Amount: ${payment.amount} ${payment.currency} via ${payment.gateway}`
                },
                data: {
                    type: 'new_payment',
                    paymentId: context.params.paymentId,
                    orderId: payment.orderId
                }
            });
        }
    });

// Auto-update wallet balance on payment
exports.onPaymentCompleted = functions.firestore
    .document('payments/{paymentId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();
        
        // Check if payment was just completed
        if (newData.status === 'completed' && oldData.status !== 'completed') {
            const batch = admin.firestore().batch();
            
            // Update user's transaction history
            const transactionRef = admin.firestore()
                .collection('users')
                .doc(newData.userId)
                .collection('transactions')
                .doc();
            
            batch.set(transactionRef, {
                type: 'payment',
                amount: newData.amount,
                gateway: newData.gateway,
                orderId: newData.orderId,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Update daily report
            const today = new Date().toISOString().split('T')[0];
            const reportRef = admin.firestore()
                .collection('daily_reports')
                .doc(today);
            
            batch.set(reportRef, {
                totalPayments: admin.firestore.FieldValue.increment(1),
                totalRevenue: admin.firestore.FieldValue.increment(newData.amount),
                gatewayRevenue: {
                    [newData.gateway]: admin.firestore.FieldValue.increment(newData.amount)
                },
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            await batch.commit();
        }
    });

// Clean up expired payment verifications
exports.cleanExpiredVerifications = functions.pubsub
    .schedule('every 1 hours')
    .onRun(async (context) => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const expired = await admin.firestore()
            .collection('payment_verifications')
            .where('status', '==', 'pending_verification')
            .where('createdAt', '<=', oneHourAgo)
            .get();
        
        const batch = admin.firestore().batch();
        
        expired.docs.forEach(doc => {
            batch.update(doc.ref, {
                status: 'expired',
                note: 'Auto-expired after 1 hour'
            });
        });
        
        await batch.commit();
        
        console.log(`Cleaned ${expired.size} expired verifications`);
    });
