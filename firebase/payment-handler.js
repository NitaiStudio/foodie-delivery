// Main Payment Handler Class
class PaymentHandler {
    constructor() {
        this.currentGateway = null;
        this.paymentAmount = 0;
        this.userCountry = null;
        this.currency = 'INR';
        this.orderId = null;
        this.userId = null;
    }
    
    // Initialize Payment System
    async initialize(userId, orderId, amount) {
        this.userId = userId;
        this.orderId = orderId;
        this.paymentAmount = amount;
        
        // Detect user's country
        this.userCountry = await this.detectCountry();
        
        // Set currency based on country
        this.currency = this.userCountry === 'IN' ? 'INR' : 'USD';
        
        // Load appropriate payment gateways
        this.loadPaymentGateways();
        
        return this;
    }
    
    // Auto-detect user's country
    async detectCountry() {
        try {
            // Try IP-based detection
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            return data.country_code;
        } catch (error) {
            // Fallback: Check user's saved country in Firestore
            const userDoc = await db.collection('users').doc(this.userId).get();
            if (userDoc.exists && userDoc.data().country) {
                return userDoc.data().country;
            }
            // Default to International
            return 'US';
        }
    }
    
    // Load Payment Gateways based on country
    loadPaymentGateways() {
        const container = document.getElementById('paymentGatewaysContainer');
        const config = this.userCountry === 'IN' ? 
            paymentGatewayConfig.india : 
            paymentGatewayConfig.international;
        
        let html = '';
        
        // Add Wallet Payment Option (Always available)
        if (config.walletPayment.enabled) {
            html += this.createWalletPaymentButton(config);
        }
        
        // Add All Active Gateways
        for (const [key, gateway] of Object.entries(config.gateways)) {
            if (gateway.enabled) {
                html += this.createGatewayButton(key, gateway);
            }
        }
        
        // Add COD Option
        if (config.codEnabled) {
            html += this.createCODButton(config);
        }
        
        container.innerHTML = html;
        this.attachEventListeners();
    }
    
    // Create Gateway Button HTML
    createGatewayButton(key, gateway) {
        return `
            <div class="payment-option" data-gateway="${key}">
                <div class="payment-option-icon">${gateway.icon}</div>
                <div class="payment-option-details">
                    <h4>${gateway.name}</h4>
                    <p>${gateway.description}</p>
                    ${gateway.supportedCurrencies ? 
                        `<small>Currencies: ${gateway.supportedCurrencies.join(', ')}</small>` : 
                        ''}
                </div>
                <div class="payment-option-select">▶</div>
            </div>
        `;
    }
    
    // Create Wallet Payment Button
    createWalletPaymentButton(config) {
        return `
            <div class="payment-option wallet-option" data-gateway="wallet">
                <div class="payment-option-icon">💰</div>
                <div class="payment-option-details">
                    <h4>${config.walletPayment.name}</h4>
                    <p>${config.walletPayment.description}</p>
                    <small>Get ${config.walletPayment.cashbackPercentage}% Cashback!</small>
                </div>
                <div class="payment-option-select">▶</div>
            </div>
        `;
    }
    
    // Create COD Button
    createCODButton(config) {
        return `
            <div class="payment-option cod-option" data-gateway="cod">
                <div class="payment-option-icon">💵</div>
                <div class="payment-option-details">
                    <h4>${config.codName}</h4>
                    <p>Pay when you receive your order</p>
                </div>
                <div class="payment-option-select">▶</div>
            </div>
        `;
    }
    
    // Attach Click Listeners
    attachEventListeners() {
        document.querySelectorAll('.payment-option').forEach(option => {
            option.addEventListener('click', async (e) => {
                const gateway = option.dataset.gateway;
                
                // Highlight selected
                document.querySelectorAll('.payment-option').forEach(opt => 
                    opt.classList.remove('selected'));
                option.classList.add('selected');
                
                // Process based on gateway type
                switch(gateway) {
                    case 'wallet':
                        this.processWalletPayment();
                        break;
                    case 'cod':
                        this.processCOD();
                        break;
                    case 'upi_manual':
                        this.processUPIManual();
                        break;
                    default:
                        this.processGatewayPayment(gateway);
                        break;
                }
            });
        });
    }
    
    // ============ PAYMENT PROCESSORS ============
    
    // Process Wallet Payment
    async processWalletPayment() {
        try {
            const walletRef = db.collection('wallets').doc(this.userId);
            const walletDoc = await walletRef.get();
            
            if (!walletDoc.exists || walletDoc.data().balance < this.paymentAmount) {
                this.showError('Insufficient wallet balance. Please add money to your wallet.');
                return;
            }
            
            // Deduct from wallet using transaction
            await db.runTransaction(async (transaction) => {
                const walletData = (await transaction.get(walletRef)).data();
                const newBalance = walletData.balance - this.paymentAmount;
                
                transaction.update(walletRef, {
                    balance: newBalance,
                    lastTransaction: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Create transaction record
                const transactionRef = db.collection('transactions').doc();
                transaction.set(transactionRef, {
                    userId: this.userId,
                    orderId: this.orderId,
                    type: 'debit',
                    amount: this.paymentAmount,
                    gateway: 'wallet',
                    status: 'completed',
                    description: `Payment for order #${this.orderId}`,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    balance: newBalance
                });
                
                // Update order payment status
                const orderRef = db.collection('orders').doc(this.orderId);
                transaction.update(orderRef, {
                    paymentStatus: 'paid',
                    paymentMethod: 'wallet',
                    paidAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            this.showSuccess('Payment successful via Wallet!');
            this.redirectToOrder();
            
        } catch (error) {
            console.error('Wallet payment failed:', error);
            this.showError('Payment failed. Please try again.');
        }
    }
    
    // Process COD
    async processCOD() {
        try {
            await db.collection('orders').doc(this.orderId).update({
                paymentMethod: 'cod',
                paymentStatus: 'pending_cod',
                codConfirmed: false
            });
            
            this.showSuccess('Cash on Delivery selected! Pay when you receive your order.');
            this.redirectToOrder();
        } catch (error) {
            this.showError('Failed to process COD. Please try again.');
        }
    }
    
    // Process UPI Manual Verification
    processUPIManual() {
        const upiConfig = paymentGatewayConfig.india.gateways.upi_manual;
        
        const upiModal = document.getElementById('upiModal');
        const upiAppsContainer = document.getElementById('upiAppsContainer');
        
        let upiAppsHTML = '';
        for (const [app, upiId] of Object.entries(upiConfig.upiIds)) {
            upiAppsHTML += `
                <div class="upi-app-option" data-app="${app}">
                    <img src="/assets/images/upi/${app}.png" alt="${app}">
                    <div>
                        <h4>${app.replace(/([A-Z])/g, ' $1').trim()}</h4>
                        <small>UPI ID: ${upiId}</small>
                        <p class="amount-display">Amount: ${this.currency} ${this.paymentAmount}</p>
                    </div>
                    <button class="btn btn-primary" onclick="window.open('${app}://pay?pa=${upiId}&pn=FoodieExpress&am=${this.paymentAmount}&cu=INR', '_blank')">
                        Pay Now
                    </button>
                </div>
                <div class="qr-code-section">
                    <img src="${upiConfig.qrCodes[app]}" alt="${app} QR">
                    <p>Scan with ${app}</p>
                </div>
            `;
        }
        
        upiAppsContainer.innerHTML = upiAppsHTML;
        
        // Add Screenshot Upload Section
        upiAppsContainer.innerHTML += `
            <div class="upi-screenshot-upload">
                <h4>Upload Payment Screenshot</h4>
                <input type="file" id="paymentScreenshot" accept="image/*" capture="environment">
                <input type="text" id="transactionRef" placeholder="Enter UPI Transaction ID">
                <button class="btn btn-success" onclick="verifyUPIPayment('${this.orderId}')">
                    Submit for Verification
                </button>
                <p class="verification-note">
                    ⚠️ Your payment will be verified manually by admin within 5-10 minutes
                </p>
            </div>
        `;
        
        upiModal.style.display = 'block';
    }
    
    // Verify UPI Payment (Called after screenshot upload)
    async verifyUPIPayment(orderId) {
        const screenshotFile = document.getElementById('paymentScreenshot').files[0];
        const transactionRef = document.getElementById('transactionRef').value;
        
        if (!screenshotFile || !transactionRef) {
            this.showError('Please upload screenshot and enter transaction ID');
            return;
        }
        
        try {
            // Upload screenshot to Firebase Storage
            const storageRef = storage.ref(`upi_payments/${orderId}_${Date.now()}`);
            await storageRef.put(screenshotFile);
            const screenshotUrl = await storageRef.getDownloadURL();
            
            // Save payment verification request
            await db.collection('payment_verifications').add({
                orderId: orderId,
                userId: this.userId,
                amount: this.paymentAmount,
                currency: this.currency,
                transactionRef: transactionRef,
                screenshot: screenshotUrl,
                method: 'upi_manual',
                status: 'pending_verification',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update order
            await db.collection('orders').doc(orderId).update({
                paymentMethod: 'upi_manual',
                paymentStatus: 'pending_verification',
                transactionRef: transactionRef
            });
            
            this.showSuccess('Payment submitted for verification. Admin will verify shortly.');
            document.getElementById('upiModal').style.display = 'none';
            
        } catch (error) {
            console.error('UPI verification failed:', error);
            this.showError('Failed to submit verification. Please try again.');
        }
    }
    
    // Process Gateway Payments (Stripe, PayPal, Razorpay, etc.)
    async processGatewayPayment(gatewayName) {
        this.currentGateway = gatewayName;
        
        switch(gatewayName) {
            case 'stripe':
                this.processStripePayment();
                break;
            case 'paypal':
                this.processPayPalPayment();
                break;
            case 'razorpay':
                this.processRazorpayPayment();
                break;
            case 'payu':
                this.processPayUPayment();
                break;
            case 'ccavenue':
                this.processCCAvenuePayment();
                break;
            case 'cashfree':
                this.processCashfreePayment();
                break;
            case 'instamojo':
                this.processInstamojoPayment();
                break;
            case 'twocheckout':
                this.process2CheckoutPayment();
                break;
            case 'authorize_net':
                this.processAuthorizeNetPayment();
                break;
            default:
                this.showError('Payment gateway not supported');
        }
    }
    
    // ============ INDIVIDUAL GATEWAY PROCESSORS ============
    
    // Stripe Payment
    async processStripePayment() {
        const stripe = Stripe(paymentGatewayConfig.international.gateways.stripe.publishableKey);
        
        try {
            // Create payment intent on server
            const paymentIntent = await this.createPaymentIntent('stripe');
            
            const { error } = await stripe.confirmCardPayment(paymentIntent.client_secret, {
                payment_method: {
                    card: elements.getElement('card'),
                    billing_details: {
                        name: this.userName,
                        email: this.userEmail
                    }
                }
            });
            
            if (error) {
                throw error;
            }
            
            await this.saveSuccessfulPayment('stripe', paymentIntent.id);
            
        } catch (error) {
            this.showError(`Stripe payment failed: ${error.message}`);
        }
    }
    
    // PayPal Payment
    async processPayPalPayment() {
        const paypalConfig = paymentGatewayConfig.international.gateways.paypal;
        
        // Load PayPal SDK dynamically
        if (!window.paypal) {
            const script = document.createElement('script');
            script.src = `https://www.paypal.com/sdk/js?client-id=${paypalConfig.clientId}&currency=${this.currency}`;
            script.onload = () => this.renderPayPalButtons();
            document.head.appendChild(script);
        } else {
            this.renderPayPalButtons();
        }
    }
    
    renderPayPalButtons() {
        paypal.Buttons({
            createOrder: async (data, actions) => {
                const order = await this.createPaymentIntent('paypal');
                return order.id;
            },
            onApprove: async (data, actions) => {
                const capture = await actions.order.capture();
                await this.saveSuccessfulPayment('paypal', capture.id);
                this.showSuccess('PayPal payment successful!');
                this.redirectToOrder();
            },
            onError: (err) => {
                this.showError('PayPal payment failed. Please try again.');
            }
        }).render('#paypal-button-container');
    }
    
    // Razorpay Payment (India)
    async processRazorpayPayment() {
        const razorpayConfig = paymentGatewayConfig.india.gateways.razorpay;
        
        const options = {
            key: razorpayConfig.key_id,
            amount: this.paymentAmount * 100, // Amount in paise
            currency: 'INR',
            name: 'FoodieExpress',
            description: `Order #${this.orderId}`,
            order_id: await this.createRazorpayOrder(),
            handler: async (response) => {
                await this.saveSuccessfulPayment('razorpay', response.razorpay_payment_id);
                this.showSuccess('Payment successful!');
                this.redirectToOrder();
            },
            prefill: {
                name: this.userName,
                email: this.userEmail,
                contact: this.userPhone
            },
            theme: {
                color: '#FF6B35'
            },
            modal: {
                ondismiss: () => {
                    this.showError('Payment cancelled');
                }
            }
        };
        
        const rzp = new Razorpay(options);
        rzp.open();
    }
    
    // PayU Payment (India)
    async processPayUPayment() {
        const payuConfig = paymentGatewayConfig.india.gateways.payu;
        
        const formData = {
            key: payuConfig.merchantKey,
            txnid: `${this.orderId}_${Date.now()}`,
            amount: this.paymentAmount,
            productinfo: `FoodieExpress Order #${this.orderId}`,
            firstname: this.userName,
            email: this.userEmail,
            phone: this.userPhone,
            surl: `${window.location.origin}/payment/success`,
            furl: `${window.location.origin}/payment/failure`,
            hash: await this.generatePayUHash(formData)
        };
        
        // Create and submit form
        const form = document.createElement('form');
        form.action = payuConfig.baseUrl;
        form.method = 'POST';
        
        for (const [key, value] of Object.entries(formData)) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = value;
            form.appendChild(input);
        }
        
        document.body.appendChild(form);
        form.submit();
    }
    
    // CCAvenue Payment (India)
    async processCCAvenuePayment() {
        const ccConfig = paymentGatewayConfig.india.gateways.ccavenue;
        
        const formData = {
            merchant_id: ccConfig.merchantId,
            order_id: this.orderId,
            currency: 'INR',
            amount: this.paymentAmount,
            redirect_url: `${window.location.origin}/payment/ccavenue/response`,
            cancel_url: `${window.location.origin}/payment/cancel`,
            language: 'EN',
            billing_name: this.userName,
            billing_address: this.userAddress,
            billing_city: this.userCity,
            billing_state: this.userState,
            billing_zip: this.userZip,
            billing_country: 'India',
            billing_tel: this.userPhone,
            billing_email: this.userEmail
        };
        
        const encryptedData = await this.encryptCCAvenueData(formData, ccConfig.workingKey);
        
        const form = document.createElement('form');
        form.action = 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction';
        form.method = 'POST';
        
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'encRequest';
        input.value = encryptedData;
        form.appendChild(input);
        
        const accessCode = document.createElement('input');
        accessCode.type = 'hidden';
        accessCode.name = 'access_code';
        accessCode.value = ccConfig.accessCode;
        form.appendChild(accessCode);
        
        document.body.appendChild(form);
        form.submit();
    }
    
    // Cashfree Payment (India)
    async processCashfreePayment() {
        const cfConfig = paymentGatewayConfig.india.gateways.cashfree;
        
        try {
            // Create order in Cashfree
            const response = await fetch('/api/cashfree/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: this.orderId,
                    orderAmount: this.paymentAmount,
                    customerName: this.userName,
                    customerEmail: this.userEmail,
                    customerPhone: this.userPhone
                })
            });
            
            const data = await response.json();
            
            // Initialize Cashfree checkout
            const cashfree = new Cashfree({
                mode: cfConfig.environment.toLowerCase()
            });
            
            const checkoutOptions = {
                paymentSessionId: data.payment_session_id,
                returnUrl: `${window.location.origin}/payment/cashfree/response?order_id=${this.orderId}`
            };
            
            cashfree.checkout(checkoutOptions).then((result) => {
                if (result.error) {
                    this.showError('Payment failed');
                } else if (result.paymentDetails) {
                    this.saveSuccessfulPayment('cashfree', result.paymentDetails.paymentMessage);
                }
            });
            
        } catch (error) {
            this.showError('Cashfree payment failed');
        }
    }
    
    // Instamojo Payment (India)
    async processInstamojoPayment() {
        const imConfig = paymentGatewayConfig.india.gateways.instamojo;
        
        try {
            const response = await fetch('https://www.instamojo.com/api/1.1/payment-requests/', {
                method: 'POST',
                headers: {
                    'X-Api-Key': imConfig.apiKey,
                    'X-Auth-Token': imConfig.authToken
                },
                body: JSON.stringify({
                    purpose: `FoodieExpress Order #${this.orderId}`,
                    amount: this.paymentAmount,
                    buyer_name: this.userName,
                    email: this.userEmail,
                    phone: this.userPhone,
                    redirect_url: `${window.location.origin}/payment/instamojo/success`,
                    webhook_url: `${window.location.origin}/api/payment/instamojo/webhook`,
                    allow_repeated_payments: false
                })
            });
            
            const data = await response.json();
            
            if (data.payment_request && data.payment_request.longurl) {
                window.location.href = data.payment_request.longurl;
            }
            
        } catch (error) {
            this.showError('Instamojo payment failed');
        }
    }
    
    // 2Checkout Payment (International)
    async process2CheckoutPayment() {
        const tcoConfig = paymentGatewayConfig.international.gateways.twocheckout;
        
        const params = {
            merchant: tcoConfig.sellerId,
            dynamic: 1,
            'return-url': `${window.location.origin}/payment/2checkout/success`,
            'return-type': 'redirect',
            name: `Order #${this.orderId}`,
            price: this.paymentAmount,
            currency: this.currency,
            quantity: 1,
            tangible: 0,
            'purchase-step': 'payment-method'
        };
        
        const form = document.createElement('form');
        form.action = 'https://secure.2checkout.com/checkout/buy';
        form.method = 'POST';
        
        for (const [key, value] of Object.entries(params)) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = value;
            form.appendChild(input);
        }
        
        document.body.appendChild(form);
        form.submit();
    }
    
    // Authorize.Net Payment (International)
    async processAuthorizeNetPayment() {
        const anConfig = paymentGatewayConfig.international.gateways.authorize_net;
        
        // Show card form and process via Accept.js
        const response = await fetch('/api/authorize-net/get-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const { token } = await response.json();
        
        // Use Accept.js to tokenize card
        Accept.dispatchData({
            apiLoginID: anConfig.apiLoginId,
            clientKey: token,
            cardData: {
                cardNumber: document.getElementById('cardNumber').value,
                month: document.getElementById('expMonth').value,
                year: document.getElementById('expYear').value,
                cardCode: document.getElementById('cvv').value
            },
            authData: {
                clientKey: token,
                apiLoginID: anConfig.apiLoginId
            }
        }, async (response) => {
            if (response.messages.resultCode === 'Ok') {
                const paymentResult = await this.processAuthorizeNetTransaction(
                    response.opaqueData.dataValue,
                    response.opaqueData.dataDescriptor
                );
                
                if (paymentResult.success) {
                    await this.saveSuccessfulPayment('authorize_net', paymentResult.transactionId);
                    this.showSuccess('Payment successful!');
                    this.redirectToOrder();
                }
            } else {
                this.showError('Card validation failed');
            }
        });
    }
    
    // ============ HELPER FUNCTIONS ============
    
    // Create Payment Intent (Unified)
    async createPaymentIntent(gateway) {
        const createPaymentIntent = functions.httpsCallable('createPaymentIntent');
        const result = await createPaymentIntent({
            gateway: gateway,
            amount: this.paymentAmount,
            currency: this.currency,
            orderId: this.orderId,
            userId: this.userId,
            country: this.userCountry
        });
        return result.data;
    }
    
    // Save Successful Payment to Firestore
    async saveSuccessfulPayment(gateway, transactionId) {
        const batch = db.batch();
        
        // Save payment record
        const paymentRef = db.collection('payments').doc();
        batch.set(paymentRef, {
            userId: this.userId,
            orderId: this.orderId,
            gateway: gateway,
            transactionId: transactionId,
            amount: this.paymentAmount,
            currency: this.currency,
            country: this.userCountry,
            status: 'completed',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update transaction record
        const transactionRef = db.collection('transactions').doc();
        batch.set(transactionRef, {
            userId: this.userId,
            orderId: this.orderId,
            type: 'payment',
            gateway: gateway,
            transactionId: transactionId,
            amount: this.paymentAmount,
            currency: this.currency,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update order status
        const orderRef = db.collection('orders').doc(this.orderId);
        batch.update(orderRef, {
            paymentStatus: 'paid',
            paymentMethod: gateway,
            paymentId: transactionId,
            paidAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();
        
        // Send real-time notification to admin
        if (paymentGatewayConfig.adminSettings.notifyAdminOnPayment) {
            await this.notifyAdmin(gateway, transactionId);
        }
    }
    
    // Notify Admin in Real-time
    async notifyAdmin(gateway, transactionId) {
        await db.collection('admin_notifications').add({
            type: 'new_payment',
            paymentGateway: gateway,
            transactionId: transactionId,
            amount: this.paymentAmount,
            currency: this.currency,
            orderId: this.orderId,
            userId: this.userId,
            read: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    // Show Success Message
    showSuccess(message) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-success';
        toast.innerHTML = `
            <span>✅</span>
            <p>${message}</p>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }
    
    // Show Error Message
    showError(message) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.innerHTML = `
            <span>❌</span>
            <p>${message}</p>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }
    
    // Redirect to Order Page
    redirectToOrder() {
        setTimeout(() => {
            window.location.href = `/app/order-confirmed.html?id=${this.orderId}`;
        }, 2000);
    }
}

// Initialize Global Payment Handler
window.paymentHandler = new PaymentHandler();
