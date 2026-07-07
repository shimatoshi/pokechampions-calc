// Pokemon Champions Calculator - Entry point (init + page navigation)
// 依存は一方向: app → ページ(calc/sim/team/box/records) → ui/state/data → damage/poke-data/db
import { DB } from './db.js';
import { loadData } from './data.js';
import { pageDirty, restoreCalcSession, makePokemonState, generateUid, currentTeam, atkState, defState, markDirty } from './state.js';
import { switchPage, showToast, restoreStateToUI } from './ui.js';
import { initCalcPage, selectPokemon } from './calc.js';

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
  window.addEventListener('message', handleDexMessage); // 図鑑iframe→BOX/編成/ダメ計の追加導線
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

// 図鑑iframe(同一オリジン)からの「BOX/編成/ダメ計に追加」メッセージを受ける。
// 種族名(name_en)だけ受け取り、技/持ち物/特性は空のまま本体エディタで埋める運用(スラッグ変換不要)。
async function handleDexMessage(e) {
  if (e.origin !== location.origin) return;
  const d = e.data;
  if (!d || d.type !== 'dex-add' || !d.name) return;
  const name = d.name;
  if (d.dest === 'box') {
    const entry = makePokemonState();
    entry.name = name; entry.uid = generateUid(); entry.savedCalcs = []; entry.notes = '';
    await DB.add('box', entry);
    markDirty('box');
    showToast(`${name} をBOXに追加`);
  } else if (d.dest === 'team') {
    if (currentTeam.members.length >= 6) { showToast('チームは6匹まで'); return; }
    const m = makePokemonState(); m.name = name; m.uid = generateUid();
    currentTeam.members.push(m);
    markDirty('team');
    showToast(`${name} を編成に追加`);
  } else if (d.dest === 'atk' || d.dest === 'def') {
    const st = d.dest === 'atk' ? atkState : defState;
    const fresh = makePokemonState(); fresh.name = name;
    Object.assign(st, fresh);
    document.getElementById('dex-overlay')?.remove(); // 図鑑を閉じてダメ計を見せる
    switchPage('calc');
    initCalcPage();
    if (atkState.name) { selectPokemon('atk', atkState.name); restoreStateToUI('atk', atkState); }
    if (defState.name) { selectPokemon('def', defState.name); restoreStateToUI('def', defState); }
    showToast(`${name} をダメ計(${d.dest === 'atk' ? '攻' : '防'})に読込`);
  }
}

// 図鑑 (static/dex/ の自己完結サイト) をアプリ内オーバーレイで開く
function toggleDexOverlay() {
  const existing = document.getElementById('dex-overlay');
  if (existing) { existing.remove(); return; }
  const ov = document.createElement('div');
  ov.id = 'dex-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:400;background:#14151a;display:flex;flex-direction:column';
  ov.innerHTML = `
    <div style="display:flex;align-items:center;padding:4px 8px;gap:8px;background:#1e2025;border-bottom:1px solid #e23b2e">
      <strong style="flex:1;color:#e0e0e0;font-size:.9rem">ポケモンチャンピオンズ 図鑑</strong>
      <button id="dex-close" style="background:#444;color:#eee;border:none;border-radius:4px;padding:6px 14px;font-size:.8rem">閉じる</button>
    </div>
    <iframe src="dex/index.html" style="flex:1;border:none;width:100%"></iframe>`;
  document.body.appendChild(ov);
  ov.querySelector('#dex-close').addEventListener('click', () => ov.remove());
}

init();
