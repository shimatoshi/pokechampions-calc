const CACHE = 'pokechamp-v1';
const ASSETS = [
  '/',
  '/css/style.css',
  '/js/app.js',
  '/js/damage.js',
  '/js/db.js',
  '/data/data_pokemon.json',
  '/data/data_moves.json',
  '/data/data_types.json',
  '/data/data_natures.json',
  '/data/data_items.json',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
