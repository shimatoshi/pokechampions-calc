// v18: 検索候補タップ修正版。過去キャッシュは引き続き全削除。
const CACHE = 'pokechamp-v18';

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 過去の全 cache を削除 (現バージョンも空のまま start)
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
    // 既存タブを reload して新 SW + 新コードを反映
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach(c => { try { c.navigate(c.url); } catch {} });
  })());
});

// fetch は素通し (ネットワーク優先)。オフライン時のみ画像/データを cache フォールバック。
self.addEventListener('fetch', e => {
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      // 画像とデータだけバックグラウンドで cache 保存 (オフライン時保険)
      if (res.ok && (e.request.url.includes('/img/') || e.request.url.includes('/data/'))) {
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
