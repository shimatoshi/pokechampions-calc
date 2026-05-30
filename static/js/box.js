// Pokemon Champions Calculator - Box Page
import {
  DATA, ja, esc, spriteImg, typeBadge, STAT_SHORT,
  atkState, showdownHTML, switchPage, showToast,
  restoreStateToUI, currentTeam,
  pokemonNames, buildNatureUI, initNatureUI,
  setupSearch, setupItemSearch, makePokemonState, generateUid,
} from './app.js';
import { DB } from './db.js';
import { selectPokemon, initCalcPage } from './calc.js';
import { renderPokemonInfo, updateStatDisplay, getFilteredMoves, setupAbilitySelect } from './ui.js';

export async function renderBoxPage() {
  const boxAll = await DB.getAll('box');
  const page = document.getElementById('page-box');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:4px;flex-wrap:wrap">
        <h3 style="flex:1;margin:0">BOX (${boxAll.length}匹)</h3>
        <button class="btn btn-sm" id="box-add-new" style="background:var(--accent2)">＋追加</button>
        <button class="btn btn-sm" id="box-export">エクスポート</button>
        <button class="btn btn-sm btn-outline" id="box-import">インポート</button>
        <input type="file" id="box-import-file" accept=".json" class="hidden">
      </div>
    </div>
    <div id="box-list">
      ${boxAll.length === 0 ? '<div class="card"><p style="text-align:center;color:var(--fg2)">BOXは空です。上の「＋追加」からポケモンを登録できます</p></div>' : ''}
      ${boxAll.map(b => renderBoxSlot(b)).join('')}
    </div>
  `;

  document.getElementById('box-add-new').addEventListener('click', () => openBoxEditor());
  document.getElementById('box-export').addEventListener('click', exportData);
  document.getElementById('box-import').addEventListener('click', () => document.getElementById('box-import-file').click());
  document.getElementById('box-import-file').addEventListener('change', importData);

  page.querySelectorAll('.box-entry').forEach(entry => {
    const id = parseInt(entry.dataset.id);
    entry.querySelector('.box-detail-toggle')?.addEventListener('click', e => {
      e.stopPropagation();
      const detail = entry.querySelector('.box-detail');
      detail?.classList.toggle('hidden');
    });
    entry.querySelector('.box-edit')?.addEventListener('click', e => {
      e.stopPropagation();
      const b = boxAll.find(x => x.id === id);
      if (b) openBoxEditor(b);
    });
    entry.querySelector('.box-del')?.addEventListener('click', async e => {
      e.stopPropagation();
      await DB.del('box', id);
      renderBoxPage();
    });
    entry.querySelector('.box-to-team')?.addEventListener('click', e => {
      e.stopPropagation();
      const b = boxAll.find(x => x.id === id);
      if (!b) return;
      if (currentTeam.members.length >= 6) { showToast('チームは6匹まで'); return; }
      currentTeam.members.push(JSON.parse(JSON.stringify(b)));
      showToast(`${ja('pokemon', b.name)} をチームに追加`);
    });
    entry.querySelector('.box-to-calc')?.addEventListener('click', e => {
      e.stopPropagation();
      const b = boxAll.find(x => x.id === id);
      if (!b) return;
      Object.assign(atkState, JSON.parse(JSON.stringify(b)));
      switchPage('calc');
      initCalcPage();
      selectPokemon('atk', atkState.name);
      restoreStateToUI('atk', atkState);
    });
    entry.querySelectorAll('.calc-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ci = parseInt(btn.dataset.ci);
        const b = boxAll.find(x => x.id === id);
        if (!b || !b.savedCalcs) return;
        b.savedCalcs.splice(ci, 1);
        await DB.put('box', b);
        renderBoxPage();
      });
    });
    const notesEl = entry.querySelector('.box-notes');
    if (notesEl) {
      let saveTimer;
      notesEl.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          const b = await DB.get('box', id);
          if (b) { b.notes = notesEl.value; await DB.put('box', b); }
        }, 500);
      });
    }
  });
}

function renderBoxSlot(b) {
  const p = DATA.pokemon[b.name];
  const types = p ? p.types.map(t => typeBadge(t)).join('') : '';
  const calcs = b.savedCalcs || [];

  return `
    <div class="box-entry card" data-id="${b.id}" style="padding:6px">
      <div style="display:flex;align-items:flex-start;gap:6px">
        ${spriteImg(b.name, 40)}
        <div style="flex:1;min-width:0">
          ${b.uid ? `<div style="font-size:.55rem;color:var(--fg2);font-family:monospace">ID: ${esc(b.uid.slice(0,8))}</div>` : ''}
          ${showdownHTML(b)}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <button class="btn btn-sm box-to-calc" style="font-size:.6rem;padding:2px 6px">ダメ計</button>
          <button class="btn btn-sm btn-outline box-edit" style="font-size:.6rem;padding:2px 6px">編集</button>
          <button class="btn btn-sm btn-outline box-to-team" style="font-size:.6rem;padding:2px 6px">チーム</button>
        </div>
      </div>
      ${calcs.length > 0 ? `
        <div style="margin-top:4px">
          <button class="btn btn-sm btn-outline box-detail-toggle" style="font-size:.65rem;width:100%;padding:2px">ダメ計結果 (${calcs.length}件)</button>
          <div class="box-detail hidden" style="margin-top:4px">
            ${calcs.map((c, ci) => {
              const icon = c.dir === 'def' ? '🛡' : '⚔';
              const label = c.dir === 'def'
                ? `${ja('pokemon', c.vs)}の${ja('moves', c.move)}→自分`
                : `自分の${ja('moves', c.move)}→${ja('pokemon', c.vs)}`;
              return `
              <div style="font-size:.7rem;padding:2px 0;display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--bg3)">
                <span style="flex:1">${icon} ${esc(label)} ${esc(c.range)} <strong>${esc(c.ko)}</strong> ${esc(c.detail)}</span>
                <button class="btn btn-sm btn-danger calc-del" data-ci="${ci}" style="font-size:.55rem;padding:1px 4px">×</button>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      <div style="margin-top:4px">
        <textarea class="box-notes" data-id="${b.id}" rows="2" placeholder="メモ（調整意図、立ち回り等）" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:4px;font-size:.7rem;resize:vertical">${esc(b.notes||'')}</textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:2px">
        <button class="btn btn-sm btn-danger box-del" style="font-size:.6rem;padding:2px 6px">削除</button>
      </div>
    </div>`;
}

// ===== BOX EDITOR MODAL =====
function openBoxEditor(existingEntry) {
  const page = document.getElementById('page-box');
  const isEdit = !!existingEntry;
  const state = isEdit ? JSON.parse(JSON.stringify(existingEntry)) : makePokemonState();
  state._moveEntries = getFilteredMoves(state.name);

  let modal = document.getElementById('box-editor-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'box-editor-modal'; page.appendChild(modal); }
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;overflow-y:auto;padding:10px';
  modal.innerHTML = `
    <div class="card" style="max-width:400px;margin:0 auto">
      <h3>${isEdit ? 'ポケモン編集' : 'BOXに追加'}</h3>
      <div class="search-wrap">
        <input type="text" id="bed-search" placeholder="ポケモン名..." autocomplete="off" value="${state.name ? `${ja('pokemon', state.name)} (${state.name})` : ''}">
        <div class="search-list" id="bed-list"></div>
      </div>
      <div id="bed-info"></div>
      ${buildNatureUI('bed')}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="bed-item-search" placeholder="もちもの..." autocomplete="off" value="${state.item ? ja('items', state.item) : ''}">
        <div class="search-list" id="bed-item-list"></div>
      </div>
      <div id="bed-ability-wrap" class="${state.ability ? '' : 'hidden'}">
        <label>とくせい</label>
        <select id="bed-ability"></select>
      </div>
      <label>SP配分 <span id="bed-sp-total" class="sp-total">0/66</span></label>
      <div id="bed-sp">
        ${['hp','at','df','sa','sd','sp'].map(stat => `
          <div class="sp-row">
            <span class="sp-label">${STAT_SHORT[stat]}</span>
            <button class="sp-btn" data-side="bed" data-stat="${stat}" data-act="0">0</button>
            <button class="sp-btn" data-side="bed" data-stat="${stat}" data-act="-">-</button>
            <input type="number" id="bed-sp-${stat}" min="0" max="32" value="${state.sp[stat] || 0}" data-stat="${stat}">
            <button class="sp-btn" data-side="bed" data-stat="${stat}" data-act="+">+</button>
            <button class="sp-btn" data-side="bed" data-stat="${stat}" data-act="32">32</button>
            <span class="sp-val" id="bed-val-${stat}">-</span>
          </div>
        `).join('')}
      </div>
      <label>わざ</label>
      ${[0,1,2,3].map(i => `
        <div class="search-wrap" style="margin-bottom:4px">
          <input type="text" id="bed-move-${i}" placeholder="わざ${i+1}..." autocomplete="off" value="${state.moves[i] ? `${ja('moves', state.moves[i])} (${state.moves[i]})` : ''}">
          <div class="search-list" id="bed-movelist-${i}"></div>
        </div>
      `).join('')}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn" id="bed-save" style="flex:1">${isEdit ? '保存' : 'BOXに追加'}</button>
        <button class="btn btn-outline" id="bed-cancel">キャンセル</button>
      </div>
    </div>`;

  // Pokemon search
  setupSearch(document.getElementById('bed-search'), document.getElementById('bed-list'), pokemonNames, n => {
    state.name = n;
    const data = DATA.pokemon[n];
    if (!data) return;
    showBedInfo(state);
    state._moveEntries.length = 0;
    getFilteredMoves(n).forEach(m => state._moveEntries.push(m));
    setupAbilitySelect(document.getElementById('bed-ability'), document.getElementById('bed-ability-wrap'), state, data);
    bedUpdateStats(state);
  });

  // Item
  const itemEntries = Object.keys(DATA.items).sort().map(k => ({ key: k, ja: ja('items', k) }));
  const itemInput = document.getElementById('bed-item-search');
  itemInput.dataset.key = state.item || '';
  setupItemSearch(itemInput, document.getElementById('bed-item-list'), itemEntries, n => { state.item = n; });

  // Nature
  initNatureUI('bed', state);

  // Ability (pre-existing)
  if (state.name && DATA.pokemon[state.name]) {
    setupAbilitySelect(document.getElementById('bed-ability'), document.getElementById('bed-ability-wrap'), state, DATA.pokemon[state.name]);
  }

  // Moves
  for (let i = 0; i < 4; i++) {
    const inp = document.getElementById(`bed-move-${i}`);
    inp.dataset.key = state.moves[i] || '';
    setupSearch(inp, document.getElementById(`bed-movelist-${i}`), state._moveEntries, n => { state.moves[i] = n; });
  }

  // SP inputs + buttons
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    document.getElementById(`bed-sp-${stat}`).addEventListener('input', e => {
      state.sp[stat] = Math.max(0, Math.min(32, parseInt(e.target.value) || 0));
      bedUpdateStats(state);
    });
  }
  modal.addEventListener('click', e => {
    const btn = e.target.closest('.sp-btn');
    if (!btn || btn.dataset.side !== 'bed') return;
    const { stat, act } = btn.dataset;
    let val = state.sp[stat] || 0;
    if (act === '+') val = Math.min(32, val + 1);
    else if (act === '-') val = Math.max(0, val - 1);
    else if (act === '0') val = 0;
    else if (act === '32') val = 32;
    state.sp[stat] = val;
    document.getElementById(`bed-sp-${stat}`).value = val;
    bedUpdateStats(state);
  });

  if (state.name) showBedInfo(state);
  bedUpdateStats(state);

  // Save / Cancel
  document.getElementById('bed-save').addEventListener('click', async () => {
    if (!state.name) { showToast('ポケモンを選択してください'); return; }
    const abilSel = document.getElementById('bed-ability');
    if (abilSel) state.ability = abilSel.value;
    delete state._moveEntries;
    if (isEdit) {
      // Update existing entry, preserve savedCalcs and notes
      const updated = { ...state };
      await DB.put('box', updated);
      showToast(`${ja('pokemon', state.name)} を更新`);
    } else {
      const entry = JSON.parse(JSON.stringify(state));
      delete entry.id;
      if (!entry.uid) entry.uid = generateUid();
      entry.savedCalcs = [];
      entry.notes = '';
      await DB.add('box', entry);
      showToast(`${ja('pokemon', state.name)} をBOXに追加`);
    }
    modal.remove();
    renderBoxPage();
  });
  document.getElementById('bed-cancel').addEventListener('click', () => modal.remove());
}

function showBedInfo(state) {
  if (state.name) document.getElementById('bed-info').innerHTML = renderPokemonInfo(state.name, 40);
}

function bedUpdateStats(state) { return updateStatDisplay('bed', state); }

// ===== JSON IMPORT / EXPORT =====
async function exportData() {
  const data = await DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pokechamp_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('エクスポート完了');
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const stats = await DB.importAll(data);
    showToast(`インポート完了: ${stats.added}件追加${stats.skipped ? `, ${stats.skipped}件スキップ(重複)` : ''}`);
    renderBoxPage();
  } catch (err) {
    showToast('インポート失敗: ' + err.message);
  }
  e.target.value = '';
}
