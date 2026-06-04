// v29: 連続技の急所を1発ごとに1/24抽選
// 配信戦略: アプリ本体(JS/CSS/HTML)はこのCACHEバージョンのスナップショットからのみ配信し、
// SW更新時に一括差し替え(+クライアント側でcontrollerchangeリロード)。
// 個別ファイルが裏でバラバラに更新されて新旧モジュールが混在する事故を根絶する。
const CACHE = 'pokechamp-v29';

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/data.js',
  './js/state.js',
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
  './js/battle-engine.js',
  './js/move-effects.js',
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

// 配信戦略:
// - アプリ本体(JS/CSS/HTML): cache-only。precacheされたスナップショットだけを返し、
//   裏更新はしない。更新はSWバージョンbump(=新CACHE一括precache)経由のみ → 常に一貫
// - データJSON/画像: stale-while-revalidate。キャッシュ即返し+裏で更新
const APP_SHELL_RE = /\.(?:js|css|html)$|\/$/;

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isShell = url.origin === location.origin && APP_SHELL_RE.test(url.pathname);
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (isShell) {
      if (cached) return cached;
      // precache漏れ: 一度だけ取得して今のスナップショットに固定
      const fresh = await fetch(e.request).catch(() => null);
      if (fresh?.ok) caches.open(CACHE).then(c => c.put(e.request, fresh.clone()));
      return fresh || new Response('', { status: 503 });
    }
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
