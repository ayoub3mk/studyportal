/* ============================================================
   Service Worker — بوابة المساعد الدراسي
   يخزن الملفات الثابتة للتشغيل السريع والاستخدام دون اتصال
   ============================================================ */

var CACHE_NAME = 'study-portal-v1';
var urlsToCache = [
    '/',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

/* التثبيت: تخزين الملفات الأساسية */
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(urlsToCache).catch(function(err) {
                console.log('Cache addAll error:', err);
            });
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

/* التفعيل: حذف النسخ القديمة */
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

/* الجلب: استراتيجية ذكية */
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    /* لا نخزن طلبات API */
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    /* لا نخزن الطلبات الخارجية (CDN، Google Fonts، إلخ) */
    if (url.origin !== self.location.origin) {
        return;
    }

    /* للـ HTML: network first، cache fallback */
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(function() {
                return caches.match('/');
            })
        );
        return;
    }

    /* للملفات الثابتة: cache first، network fallback */
    event.respondWith(
        caches.match(event.request).then(function(response) {
            if (response) {
                return response;
            }
            return fetch(event.request).then(function(response) {
                /* تخزين نسخة في الـ cache */
                if (response && response.status === 200) {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            });
        })
    );
});

/* استقبال رسائل من الصفحة */
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
