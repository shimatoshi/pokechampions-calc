// v22: install耐性向上 + GETのみキャッシュ
const CACHE = 'pokechamp-v22';

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/calc.js',
  './js/damage.js',
  './js/db.js',
  './js/team.js',
  './js/box.js',
  './js/records.js',
  './js/poke-data.js',
  './js/ui.js',
  './js/sim.js',
  './js/sim-setup.js',
  './manifest.json',
  './data/data_pokemon.json',
  './data/data_learnsets.json',
  './data/data_moves.json',
  './data/data_types.json',
  './data/data_natures.json',
  './data/data_items.json',
  './data/names_pokemon_ja.json',
  './data/names_moves_ja.json',
  './data/names_natures_ja.json',
  './data/names_items_ja.json',
  './data/names_abilities_ja.json',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 個別にキャッシュ: 1ファイル失敗しても他は保存される
    await Promise.all(PRECACHE.map(url =>
      cache.add(url).catch(() => console.warn('SW precache skip:', url))
    ));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pokechamp-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach(c => { try { c.navigate(c.url); } catch {} });
  })());
});

// ネットワーク優先、失敗時キャッシュフォールバック。GETのみキャッシュ更新。
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    } catch {
      const c = await caches.match(e.request);
      return c || new Response('', { status: 503 });
    }
  })());
});
