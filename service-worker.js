const CACHE_NAME = 'pitch-trainer-v32';
const VERSION = '32';
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
    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then((response) => {
            return response || fetch(e.request);
        })
    );
});
