// v21: オフライン完全対応 (HTML/JS/CSSもプリキャッシュ)
const CACHE = 'pokechamp-v21';

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
  './js/sim.js',
  './manifest.json',
  './data/data_pokemon.json',
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
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 旧バージョンのキャッシュのみ削除（他PWAのキャッシュは触らない）
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pokechamp-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // 既存タブを reload して新 SW + 新コードを反映
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach(c => { try { c.navigate(c.url); } catch {} });
  })());
});

// ネットワーク優先、失敗時キャッシュフォールバック。成功時はキャッシュ更新。
self.addEventListener('fetch', e => {
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
