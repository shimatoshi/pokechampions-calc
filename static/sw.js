// v25: 対戦シミュ拡張(命中/急所/強制交代/天候・場/設置技/個体詳細)+編成一覧の新規順表示
const CACHE = 'pokechamp-v25';

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
  })());
});

// キャッシュ優先 + バックグラウンド更新 (stale-while-revalidate)
// キャッシュがあれば即返し、裏でネットワークから取得してキャッシュを更新。
// 次回アクセス時に最新版が使われる。
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    // バックグラウンドでキャッシュ更新（レスポンスは待たない）
    const fetchAndUpdate = fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => null);
    // キャッシュがあれば即返す、なければネットワーク待ち
    if (cached) {
      fetchAndUpdate; // fire-and-forget
      return cached;
    }
    const fresh = await fetchAndUpdate;
    return fresh || new Response('', { status: 503 });
  })());
});
