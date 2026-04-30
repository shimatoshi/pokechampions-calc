const CACHE = 'pokechamp-v15';

// Relative asset list - resolved against SW scope at install time
const ASSETS = [
  './',
  'css/style.css',
  'js/app.js',
  'js/calc.js',
  'js/team.js',
  'js/box.js',
  'js/records.js',
  'js/damage.js',
  'js/db.js',
  'data/data_pokemon.json',
  'data/data_moves.json',
  'data/data_types.json',
  'data/data_natures.json',
  'data/data_items.json',
  'data/names_pokemon_ja.json',
  'data/names_moves_ja.json',
  'data/names_natures_ja.json',
  'data/names_items_ja.json',
  'data/names_abilities_ja.json',
  'manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      const base = self.registration.scope;
      return c.addAll(ASSETS.map(a => new URL(a, base).href));
    })
  );
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
    caches.match(e.request).then(r => {
      if (r) return r;
      return fetch(e.request).then(res => {
        if (res.ok && (e.request.url.includes('/img/') || e.request.url.includes('/data/'))) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => new Response('', { status: 404 }));
    })
  );
});
