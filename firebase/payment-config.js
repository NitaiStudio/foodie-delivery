// Payment Gateway Configuration
const paymentGatewayConfig = {
    // Country Detection is Automatic
    // India: Shows Indian Gateways
    // International: Shows International Gateways
    
    india: {
        gateways: {
            razorpay: {
                name: 'Razorpay',
                key_id: 'rzp_live_YOUR_KEY',
                key_secret: 'YOUR_SECRET',
                enabled: true,
                icon: '💳',
                description: 'Credit/Debit Card, NetBanking, UPI',
                minAmount: 1,
                maxAmount: 100000,
                supportedCards: ['Visa', 'Mastercard', 'Rupay', 'American Express'],
                upiEnabled: true,
                webhookSecret: 'YOUR_WEBHOOK_SECRET'
            },
            payu: {
                name: 'PayU',
                merchantKey: 'YOUR_MERCHANT_KEY',
                merchantSalt: 'YOUR_SALT',
                enabled: true,
                icon: '🏦',
                description: 'NetBanking, Cards, UPI',
                minAmount: 1,
                maxAmount: 100000,
                testMode: true,
                baseUrl: 'https://test.payu.in/_payment'
            },
            ccavenue: {
                name: 'CCAvenue',
                merchantId: 'YOUR_MERCHANT_ID',
                accessCode: 'YOUR_ACCESS_CODE',
                workingKey: 'YOUR_WORKING_KEY',
                enabled: true,
                icon: '🔐',
                description: 'All Cards, NetBanking, Wallets',
                minAmount: 1,
                maxAmount: 500000
            },
            cashfree: {
                name: 'Cashfree Payments',
                appId: 'YOUR_APP_ID',
                secretKey: 'YOUR_SECRET_KEY',
                enabled: true,
                icon: '⚡',
                description: 'Instant Payments, UPI, Cards',
                minAmount: 1,
                maxAmount: 200000,
                environment: 'PRODUCTION' // or 'TEST'
            },
            instamojo: {
                name: 'Instamojo',
                apiKey: 'YOUR_API_KEY',
                authToken: 'YOUR_AUTH_TOKEN',
                enabled: true,
                icon: '📱',
                description: 'UPI, Cards, NetBanking',
                minAmount: 1,
                maxAmount: 50000,
                salt: 'YOUR_SALT'
            },
            upi_manual: {
                name: 'UPI (Manual Verification)',
                enabled: true,
                icon: '📲',
                description: 'Pay via any UPI App & Upload Screenshot',
                upiIds: {
                    googlepay: 'business@okicici',
                    phonepe: 'business@ybl',
                    paytm: 'business@paytm',
                    bhim: 'business@upi'
                },
                qrCodes: {
                    googlepay: '/assets/images/qr/gpay-qr.png',
                    phonepe: '/assets/images/qr/phonepe-qr.png',
                    paytm: '/assets/images/qr/paytm-qr.png'
                }
            }
        },
        walletPayment: {
            enabled: true,
            name: 'FoodieExpress Wallet',
            description: 'Pay using your wallet balance',
            cashbackPercentage: 2,
            minBalance: 1
        },
        codEnabled: true,
        codName: 'Cash On Delivery'
    },
    
    international: {
        gateways: {
            stripe: {
                name: 'Stripe',
                publishableKey: 'pk_live_YOUR_KEY',
                secretKey: 'sk_live_YOUR_SECRET',
                enabled: true,
                icon: '💳',
                description: 'International Cards, Apple Pay, Google Pay',
                minAmount: 1,
                maxAmount: 999999,
                supportedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'INR'],
                webhookSecret: 'whsec_YOUR_SECRET'
            },
            paypal: {
                name: 'PayPal',
                clientId: 'YOUR_CLIENT_ID',
                clientSecret: 'YOUR_CLIENT_SECRET',
                enabled: true,
                icon: '🅿️',
                description: 'PayPal Balance, Cards, Bank Account',
                minAmount: 1,
                maxAmount: 10000,
                environment: 'production', // or 'sandbox'
                supportedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD']
            },
            twocheckout: {
                name: '2Checkout (Verifone)',
                sellerId: 'YOUR_SELLER_ID',
                publishableKey: 'YOUR_PUBLISHABLE_KEY',
                privateKey: 'YOUR_PRIVATE_KEY',
                enabled: true,
                icon: '🌍',
                description: 'Global Payments, 87+ Currencies',
                minAmount: 1,
                maxAmount: 50000,
                supportedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'INR'],
                demo: true
            },
            authorize_net: {
                name: 'Authorize.Net',
                apiLoginId: 'YOUR_API_LOGIN_ID',
                transactionKey: 'YOUR_TRANSACTION_KEY',
                enabled: true,
                icon: '🔒',
                description: 'Secure Credit Card Processing',
                minAmount: 1,
                maxAmount: 100000,
                supportedCurrencies: ['USD', 'CAD', 'GBP', 'EUR', 'AUD'],
                environment: 'production' // or 'sandbox'
            }
        },
        walletPayment: {
            enabled: true,
            name: 'FoodieExpress Wallet',
            description: 'Pay using your wallet balance',
            cashbackPercentage: 2,
            minBalance: 1
        },
        codEnabled: true,
        codName: 'Cash On Delivery'
    },
    
    // Admin Settings (Controlled from Admin Panel)
    adminSettings: {
        autoVerifyPayments: false, // Manual verification required
        upiVerificationRequired: true,
        maxManualVerificationAmount: 5000,
        notifyAdminOnPayment: true,
        allowWalletWithdrawal: true,
        minWithdrawalAmount: 100,
        maxWithdrawalAmount: 50000,
        withdrawalMethods: ['upi', 'bank', 'paypal', 'binance'],
        withdrawalCharges: {
            upi: 0,
            bank: 10,
            paypal: 2.5,
            binance: 1
        }
    }
};

// Export configuration
window.paymentGatewayConfig = paymentGatewayConfig;
