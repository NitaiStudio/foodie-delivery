// Firebase Configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const functions = firebase.functions();

// Enable offline persistence
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
        } else if (err.code == 'unimplemented') {
            console.log('The current browser does not support persistence.');
        }
    });

// Real-time Database Listeners for Payment Updates
const paymentsRef = db.collection('payments');
const transactionsRef = db.collection('transactions');
const walletsRef = db.collection('wallets');

// Live Payment Listener for Admin
function listenLivePayments(callback) {
    return paymentsRef
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            const payments = [];
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    payments.push({
                        id: change.doc.id,
                        ...change.doc.data(),
                        changeType: 'added'
                    });
                } else if (change.type === 'modified') {
                    payments.push({
                        id: change.doc.id,
                        ...change.doc.data(),
                        changeType: 'modified'
                    });
                } else if (change.type === 'removed') {
                    payments.push({
                        id: change.doc.id,
                        ...change.doc.data(),
                        changeType: 'removed'
                    });
                }
            });
            callback(payments);
        });
}

// Real-time Wallet Balance Listener
function listenWalletBalance(userId, callback) {
    return walletsRef.doc(userId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                callback(doc.data());
            }
        });
}

// Export services
window.firebaseServices = {
    auth,
    db,
    storage,
    functions,
    paymentsRef,
    transactionsRef,
    walletsRef,
    listenLivePayments,
    listenWalletBalance
};
