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
  const initialized = { calc: true, sim: false, team: false, records: false, box: false };
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const page = btn.dataset.page;
      switchPage(page);
      if (!initialized[page]) {
        if (page === 'sim')     (await import('./sim.js')).initSimPage();
        if (page === 'team')    (await import('./team.js')).initTeamPage();
        if (page === 'records') (await import('./records.js')).initRecordsPage();
        if (page === 'box')     (await import('./box.js')).renderBoxPage();
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
init();
