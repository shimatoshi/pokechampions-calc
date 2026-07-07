// Pokemon Champions Calculator - Entry point (init + page navigation)
// 依存は一方向: app → ページ(calc/sim/team/box/records) → ui/state/data → damage/poke-data/db
import { DB } from './db.js';
import { loadData } from './data.js';
import { pageDirty, restoreCalcSession } from './state.js';
import { switchPage } from './ui.js';
import { initCalcPage } from './calc.js';

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
    // 新SWがcontrollerを乗っ取ったら一度だけリロード。
    // 旧ページが新キャッシュから遅延importして新旧モジュールが混在するのを防ぐ。
    // (初回訪問のclaim()では hadController=false なのでリロードしない)
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) location.reload();
      hadController = true;
    });
  }
  DB.persist();
  await loadData();
  restoreCalcSession();
  initCalcPage(); // 起動時はダメ計ページだけ初期化
  const initialized = { calc: true, sim: false, team: false, records: false, box: false, search: false };
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const page = btn.dataset.page;
      if (page === 'dex') { toggleDexOverlay(); return; } // 図鑑は通常ページでなくオーバーレイ
      switchPage(page);
      if (!initialized[page]) {
        if (page === 'sim')     (await import('./sim.js')).initSimPage();
        if (page === 'team')    (await import('./team.js')).initTeamPage();
        if (page === 'records') (await import('./records.js')).initRecordsPage();
        if (page === 'box')     (await import('./box.js')).renderBoxPage();
        if (page === 'search')  (await import('./search.js')).initSearchPage();
        initialized[page] = true;
        pageDirty[page] = false;
      } else if (pageDirty[page]) {
        if (page === 'box')     (await import('./box.js')).renderBoxPage();
        if (page === 'team')    (await import('./team.js')).renderTeamPage();
        if (page === 'records') (await import('./records.js')).renderRecordsPage();
        pageDirty[page] = false;
      }
    });
  });
}

// 図鑑 (static/dex/ の自己完結サイト) をアプリ内オーバーレイで開く
function toggleDexOverlay() {
  const existing = document.getElementById('dex-overlay');
  if (existing) { existing.remove(); return; }
  const ov = document.createElement('div');
  ov.id = 'dex-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:400;background:#1a1a2e;display:flex;flex-direction:column';
  ov.innerHTML = `
    <div style="display:flex;align-items:center;padding:4px 8px;gap:8px;background:#16213e;border-bottom:1px solid #e94560">
      <strong style="flex:1;color:#e0e0e0;font-size:.9rem">ポケモンチャンピオンズ 図鑑</strong>
      <button id="dex-close" style="background:#444;color:#eee;border:none;border-radius:4px;padding:6px 14px;font-size:.8rem">閉じる</button>
    </div>
    <iframe src="dex/index.html" style="flex:1;border:none;width:100%"></iframe>`;
  document.body.appendChild(ov);
  ov.querySelector('#dex-close').addEventListener('click', () => ov.remove());
}

init();
