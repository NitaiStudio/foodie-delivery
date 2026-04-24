// Admin Payment Verification System
class AdminPaymentVerifier {
    constructor() {
        this.pendingVerifications = [];
        this.paymentHistory = [];
    }
    
    async initialize() {
        this.setupRealTimeListeners();
        this.loadPaymentStats();
        this.setupUPIVerificationPanel();
    }
    
    // Real-time Listener for Pending Verifications
    setupRealTimeListeners() {
        db.collection('payment_verifications')
            .where('status', '==', 'pending_verification')
            .orderBy('createdAt', 'asc')
            .onSnapshot((snapshot) => {
                this.renderPendingVerifications(snapshot.docs);
            });
        
        // Listen for new payments
        db.collection('payments')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .onSnapshot((snapshot) => {
                this.renderRecentPayments(snapshot.docs);
            });
    }
    
    // Render Pending UPI Verifications
    renderPendingVerifications(verifications) {
        const container = document.getElementById('pendingVerifications');
        
        if (verifications.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>✅ No pending verifications</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = verifications.map(doc => {
            const data = doc.data();
            return `
                <div class="verification-card" id="verification-${doc.id}">
                    <div class="verification-header">
                        <span class="badge badge-pending">Pending</span>
                        <span class="timestamp">${this.formatTime(data.createdAt)}</span>
                    </div>
                    <div class="verification-body">
                        <div class="verification-info">
                            <p><strong>Order ID:</strong> #${data.orderId}</p>
                            <p><strong>User ID:</strong> ${data.userId}</p>
                            <p><strong>Amount:</strong> ${data.currency} ${data.amount}</p>
                            <p><strong>Transaction Ref:</strong> ${data.transactionRef}</p>
                            <p><strong>Method:</strong> ${data.method}</p>
                        </div>
                        <div class="screenshot-preview">
                            <img src="${data.screenshot}" alt="Payment Screenshot" 
                                 onclick="window.open('${data.screenshot}', '_blank')">
                            <button class="btn btn-small" onclick="window.open('${data.screenshot}', '_blank')">
                                🔍 View Full Screenshot
                            </button>
                        </div>
                    </div>
                    <div class="verification-actions">
                        <input type="text" id="adminNote-${doc.id}" 
                               placeholder="Admin note (optional)" class="admin-note-input">
                        <button class="btn btn-success" onclick="approveVerification('${doc.id}')">
                            ✅ Approve
                        </button>
                        <button class="btn btn-danger" onclick="rejectVerification('${doc.id}')">
                            ❌ Reject
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Approve UPI Payment
    async approveVerification(verificationId) {
        const adminNote = document.getElementById(`adminNote-${verificationId}`).value;
        
        try {
            const verifyPayment = firebase.functions().httpsCallable('verifyUPIPayment');
            await verifyPayment({
                verificationId: verificationId,
                status: 'verified',
                adminNote: adminNote
            });
            
            this.showNotification('Payment verified successfully!', 'success');
            
        } catch (error) {
            this.showNotification('Failed to verify payment: ' + error.message, 'error');
        }
    }
    
    // Reject UPI Payment
    async rejectVerification(verificationId) {
        const adminNote = document.getElementById(`adminNote-${verificationId}`).value;
        
        if (!adminNote) {
            this.showNotification('Please provide a reason for rejection', 'warning');
            return;
        }
        
        try {
            const verifyPayment = firebase.functions().httpsCallable('verifyUPIPayment');
            await verifyPayment({
                verificationId: verificationId,
                status: 'rejected',
                adminNote: adminNote
            });
            
            this.showNotification('Payment rejected', 'warning');
            
        } catch (error) {
            this.showNotification('Failed to reject payment: ' + error.message, 'error');
        }
    }
    
    // Payment Gateway Switch System
    setupPaymentGatewayControls() {
        document.querySelectorAll('.gateway-toggle').forEach(toggle => {
            toggle.addEventListener('change', async (e) => {
                const gateway = e.target.dataset.gateway;
                const enabled = e.target.checked;
                
                try {
                    await db.collection('admin_settings').doc('payment_gateways').update({
                        [`gateways.${gateway}.enabled`]: enabled
                    });
                    
                    this.showNotification(`${gateway} ${enabled ? 'enabled' : 'disabled'}`, 'success');
                    
                } catch (error) {
                    e.target.checked = !enabled;
                    this.showNotification('Failed to update gateway settings', 'error');
                }
            });
        });
        
        // Active Gateway Switch
        document.getElementById('activeGatewaySwitch').addEventListener('change', async (e) => {
            const activeGateway = e.target.value;
            
            try {
                await db.collection('admin_settings').doc('payment_gateways').update({
                    activeGateway: activeGateway
                });
                
                this.showNotification(`Active gateway switched to ${activeGateway}`, 'success');
                
            } catch (error) {
                this.showNotification('Failed to switch gateway', 'error');
            }
        });
    }
    
    // Format Timestamp
    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate();
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff/60000)} minutes ago`;
        if (diff < 86400000) return `${Math.floor(diff/3600000)} hours ago`;
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
    
    // Show Notification
    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `admin-notification ${type}`;
        notification.innerHTML = `
            <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span>
            <p>${message}</p>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 4000);
    }
}

// Initialize Admin Payment Verifier
const adminVerifier = new AdminPaymentVerifier();
document.addEventListener('DOMContentLoaded', () => adminVerifier.initialize());
