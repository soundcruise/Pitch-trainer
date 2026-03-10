const CACHE_NAME = 'pitch-trainer-v54';
const VERSION = '54';
const ASSETS = [
    './?v=' + VERSION,
    './index.html?v=' + VERSION,
    './pro.html?v=' + VERSION,
    './style.css?v=' + VERSION,
    './pro-theme.css?v=' + VERSION,
    './script.js?v=' + VERSION,
    './manifest.json?v=' + VERSION,
    './manifest-pro.json?v=' + VERSION,
    './icon.png',
    './icon_idea/Pro_3.png?v=1'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Navigate requests or HTML requests should try network first to prevent getting stuck on old versions
    if (e.request.mode === 'navigate' ||
        (e.request.method === 'GET' && e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'))) {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))
        );
        return;
    }

    // Default Cache First strategy for resources (CSS, JS, images, etc.)
    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then((response) => {
            return response || fetch(e.request);
        })
    );
});
