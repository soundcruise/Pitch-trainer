const CACHE_NAME = 'pitch-trainer-v14';
const VERSION = '14';
const ASSETS = [
    './?v=' + VERSION,
    './index.html?v=' + VERSION,
    './style.css?v=' + VERSION,
    './script.js?v=' + VERSION,
    './manifest.json?v=' + VERSION,
    './icon.png'
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
    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then((response) => {
            return response || fetch(e.request);
        })
    );
});
