// ===============================
// FoodieExpress Service Worker
// PWA Caching & Offline Support
// ===============================

const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `foodieexpress-${CACHE_VERSION}`;

// Assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/app/index.html',
    '/app/menu.html',
    '/app/cart.html',
    '/app/checkout.html',
    '/app/payment.html',
    '/app/order-confirmed.html',
    '/app/orders.html',
    '/app/tracking.html',
    '/app/wallet.html',
    '/app/chat.html',
    '/app/profile.html',
    '/app/favorites.html',
    '/rider/index.html',
    '/rider/orders.html',
    '/rider/earnings.html',
    '/rider/wallet.html',
    '/rider/profile.html',
    '/rider/chat.html',
    '/admin/index.html',
    '/admin/users.html',
    '/admin/riders.html',
    '/admin/restaurants.html',
    '/admin/orders.html',
    '/admin/payments.html',
    '/admin/wallet.html',
    '/admin/chat.html',
    '/admin/notifications.html',
    '/admin/settings.html',
    '/assets/css/style.css',
    '/assets/css/landing.css',
    '/assets/css/app.css',
    '/assets/css/rider.css',
    '/assets/css/admin.css',
    '/assets/css/payment.css',
    '/assets/js/app.js',
    '/assets/js/auth.js',
    '/assets/js/wallet.js',
    '/assets/js/chat.js',
    '/assets/js/tracking.js',
    '/assets/js/notifications.js',
    '/assets/js/cart.js',
    '/assets/js/payment-system.js',
    '/assets/js/country-detector.js',
    '/assets/js/admin-payment-verify.js',
    '/assets/js/utils.js',
    '/assets/images/logo.svg',
    '/assets/images/splash.svg',
    '/assets/images/icons/icon-192x192.png',
    '/assets/images/icons/icon-512x512.png',
    '/firebase/config.js',
    '/firebase/payment-config.js',
    '/firebase/payment-handler.js'
];

// Install Event
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('✅ Service Worker installed');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Cache failed:', error);
            })
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    console.log('🔧 Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return name.startsWith('foodieexpress-') && name !== CACHE_NAME;
                        })
                        .map((name) => {
                            console.log('🗑️ Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('✅ Service Worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch Event - Network First, Cache Fallback
self.addEventListener('fetch', (event) => {
    // Skip Firebase API calls
    if (event.request.url.includes('firestore.googleapis.com') ||
        event.request.url.includes('firebaseio.com') ||
        event.request.url.includes('googleapis.com')) {
        return;
    }
    
    // Skip POST requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache successful GET responses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseClone);
                        })
                        .catch(() => {});
                }
                return response;
            })
            .catch(() => {
                // Offline fallback
                return caches.match(event.request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // Return offline page for HTML requests
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/offline.html');
                        }
                        
                        return new Response('Offline - Please check your internet connection', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// Push Notification Event
self.addEventListener('push', (event) => {
    console.log('📨 Push notification received');
    
    let data = {
        title: 'FoodieExpress',
        body: 'You have a new notification',
        icon: '/assets/images/icons/icon-192x192.png',
        badge: '/assets/images/icons/icon-72x72.png',
        vibrate: [200, 100, 200],
        data: {
            url: '/'
        }
    };
    
    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        vibrate: data.vibrate,
        data: data.data,
        actions: [
            {
                action: 'open',
                title: 'Open App'
            },
            {
                action: 'close',
                title: 'Dismiss'
            }
        ],
        requireInteraction: true,
        tag: data.tag || 'default'
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
    console.log('👆 Notification clicked');
    
    event.notification.close();
    
    if (event.action === 'close') {
        return;
    }
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        })
        .then((windowClients) => {
            // Check if there is already a window open
            for (let client of windowClients) {
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Background Sync
self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync:', event.tag);
    
    if (event.tag === 'sync-orders') {
        event.waitUntil(syncPendingOrders());
    } else if (event.tag === 'sync-payments') {
        event.waitUntil(syncPendingPayments());
    }
});

// Sync pending orders
async function syncPendingOrders() {
    try {
        const cache = await caches.open('pending-orders');
        const requests = await cache.keys();
        
        for (const request of requests) {
            try {
                await fetch(request);
                await cache.delete(request);
            } catch (error) {
                console.error('Sync failed for:', request.url);
            }
        }
    } catch (error) {
        console.error('Sync failed:', error);
    }
}

// Sync pending payments
async function syncPendingPayments() {
    // Similar to syncPendingOrders
    console.log('Syncing pending payments...');
}

console.log('🚀 FoodieExpress Service Worker Ready');
