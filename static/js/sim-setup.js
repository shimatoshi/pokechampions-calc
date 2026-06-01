// Pokemon Champions - Sim Setup/Editor/Selection phases
import {
  DATA, ja, esc, spriteImg, typeBadge, STAT_SHORT,
  pokemonNames, buildNatureUI, initNatureUI,
  setupSearch, setupItemSearch, showToast, makePokemonState, generateUid,
  currentTeam,
} from './app.js';
import { DB } from './db.js';
import { parties, selection, field, startBattle } from './sim.js';
import { renderPokemonInfo, updateStatDisplay, getFilteredMoves, setupAbilitySelect } from './ui.js';

// ============================================================
// PHASE 1: SETUP
// ============================================================
export function renderSetup() {
  const page = document.getElementById('page-sim');
  page.innerHTML = `
    ${renderPartySection('a')}
    ${renderPartySection('b')}
    <div class="card" style="margin-top:6px">
      <h3>フィールド</h3>
      <div class="col2">
        <div><label>天候</label><select id="sim-weather">
          <option value="">なし</option><option value="Sun">はれ</option><option value="Rain">あめ</option>
          <option value="Sand">すなあらし</option><option value="Snow">ゆき</option>
        </select></div>
        <div><label>フィールド</label><select id="sim-terrain">
          <option value="">なし</option><option value="Electric">エレキ</option><option value="Grassy">グラス</option>
          <option value="Psychic">サイコ</option><option value="Misty">ミスト</option>
        </select></div>
      </div>
    </div>
    <button class="btn mt" style="width:100%" id="sim-to-select">選出へ進む →</button>
  `;
  document.getElementById('sim-weather').value = field.weather;
  document.getElementById('sim-terrain').value = field.terrain;
  document.getElementById('sim-weather').addEventListener('change', e => { field.weather = e.target.value; });
  document.getElementById('sim-terrain').addEventListener('change', e => { field.terrain = e.target.value; });
  document.getElementById('sim-to-select').addEventListener('click', goToSelect);

  for (const side of ['a','b']) {
    document.getElementById(`sim-party-add-${side}`).addEventListener('click', () => openEditor(side, -1));
    document.getElementById(`sim-party-load-${side}`).addEventListener('click', () => openPartyLoadPicker(side));
    document.getElementById(`sim-party-save-${side}`).addEventListener('click', () => savePartyAsTeam(side));
    document.querySelectorAll(`.sim-party-slot[data-side="${side}"]`).forEach(slot => {
      const idx = parseInt(slot.dataset.idx);
      slot.querySelector('.sim-slot-edit')?.addEventListener('click', e => { e.stopPropagation(); openEditor(side, idx); });
      slot.querySelector('.sim-slot-del')?.addEventListener('click', e => { e.stopPropagation(); parties[side].splice(idx, 1); renderSetup(); });
    });
  }
}

function renderPartySection(side) {
  const label = side === 'a' ? '自分' : '相手';
  const party = parties[side];
  return `
    <div class="card">
      <h3>${label}のパーティ (${party.length}/6)</h3>
      <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
        <button class="btn btn-sm" id="sim-party-load-${side}">読込</button>
        <button class="btn btn-sm btn-outline" id="sim-party-add-${side}" ${party.length >= 6 ? 'disabled' : ''}>+追加</button>
        <button class="btn btn-sm btn-outline" id="sim-party-save-${side}" style="border-color:var(--ok);color:var(--ok)" ${party.length === 0 ? 'disabled' : ''}>チームに保存</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${party.map((p, i) => `
          <div class="sim-party-slot" data-side="${side}" data-idx="${i}" style="background:var(--bg);border-radius:var(--radius);padding:4px 6px;display:flex;align-items:center;gap:4px;border:1px solid var(--bg3);min-width:0">
            ${spriteImg(p.name, 32)}
            <div style="min-width:0;flex:1">
              <div style="font-size:.75rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ja('pokemon', p.name))}</div>
              <div style="font-size:.6rem;color:var(--fg2)">${p.item ? esc(ja('items', p.item)) : ''}</div>
            </div>
            <button class="btn btn-sm btn-outline sim-slot-edit" style="padding:2px 5px;font-size:.6rem">編集</button>
            <button class="btn btn-sm sim-slot-del" style="padding:2px 5px;font-size:.6rem;background:var(--danger)">×</button>
          </div>
        `).join('')}
        ${party.length === 0 ? '<div style="font-size:.8rem;color:var(--fg2)">ポケモンを追加してください</div>' : ''}
      </div>
    </div>`;
}

// ===== EDITOR MODAL =====
function openEditor(side, idx) {
  const page = document.getElementById('page-sim');
  const isNew = idx < 0;
  const state = isNew ? makePokemonState() : JSON.parse(JSON.stringify(parties[side][idx]));
  state._moveEntries = getFilteredMoves(state.name);

  let modal = document.getElementById('sim-editor-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'sim-editor-modal'; page.appendChild(modal); }
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;overflow-y:auto;padding:10px';
  modal.innerHTML = `
    <div class="card" style="max-width:400px;margin:0 auto">
      <h3>${isNew ? 'ポケモン追加' : '編集'} (${side === 'a' ? '自分' : '相手'})</h3>
      <div class="search-wrap">
        <input type="text" id="ed-search" placeholder="ポケモン名..." autocomplete="off" value="${state.name ? `${ja('pokemon', state.name)} (${state.name})` : ''}">
        <div class="search-list" id="ed-list"></div>
      </div>
      <div id="ed-info"></div>
      ${buildNatureUI('ed')}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="ed-item-search" placeholder="もちもの..." autocomplete="off" value="${state.item ? ja('items', state.item) : ''}">
        <div class="search-list" id="ed-item-list"></div>
      </div>
      <div id="ed-ability-wrap" class="${state.ability ? '' : 'hidden'}">
        <label>とくせい</label>
        <select id="ed-ability"></select>
      </div>
      <label>SP配分 <span id="ed-sp-total" class="sp-total">0/66</span></label>
      <div id="ed-sp">
        ${['hp','at','df','sa','sd','sp'].map(stat => `
          <div class="sp-row">
            <span class="sp-label">${STAT_SHORT[stat]}</span>
            <button class="sp-btn" data-side="ed" data-stat="${stat}" data-act="0">0</button>
            <button class="sp-btn" data-side="ed" data-stat="${stat}" data-act="-">-</button>
            <input type="number" id="ed-sp-${stat}" min="0" max="32" value="${state.sp[stat] || 0}" data-stat="${stat}">
            <button class="sp-btn" data-side="ed" data-stat="${stat}" data-act="+">+</button>
            <button class="sp-btn" data-side="ed" data-stat="${stat}" data-act="32">32</button>
            <span class="sp-val" id="ed-val-${stat}">-</span>
          </div>
        `).join('')}
      </div>
      <label>わざ</label>
      ${[0,1,2,3].map(i => `
        <div class="search-wrap" style="margin-bottom:4px">
          <input type="text" id="ed-move-${i}" placeholder="わざ${i+1}..." autocomplete="off" value="${state.moves[i] ? `${ja('moves', state.moves[i])} (${state.moves[i]})` : ''}">
          <div class="search-list" id="ed-movelist-${i}"></div>
        </div>
      `).join('')}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn" id="ed-save" style="flex:1">${isNew ? '追加' : '保存'}</button>
        <button class="btn btn-outline" id="ed-box" style="flex:1;border-color:var(--accent2);color:var(--accent2)">BOXに保存</button>
        <button class="btn btn-outline" id="ed-cancel">キャンセル</button>
      </div>
    </div>`;

  // Pokemon search
  setupSearch(document.getElementById('ed-search'), document.getElementById('ed-list'), pokemonNames, n => {
    state.name = n;
    const data = DATA.pokemon[n];
    if (!data) return;
    showEdInfo(state);
    state._moveEntries.length = 0;
    getFilteredMoves(n).forEach(m => state._moveEntries.push(m));
    setupAbilitySelect(document.getElementById('ed-ability'), document.getElementById('ed-ability-wrap'), state, data);
    edUpdateStats(state);
  });

  // Item
  const itemEntries = Object.keys(DATA.items).sort().map(k => ({ key: k, ja: ja('items', k) }));
  const itemInput = document.getElementById('ed-item-search');
  itemInput.dataset.key = state.item || '';
  setupItemSearch(itemInput, document.getElementById('ed-item-list'), itemEntries, n => { state.item = n; });

  // Nature
  initNatureUI('ed', state);

  // Ability (pre-existing)
  if (state.name && DATA.pokemon[state.name]) {
    setupAbilitySelect(document.getElementById('ed-ability'), document.getElementById('ed-ability-wrap'), state, DATA.pokemon[state.name]);
  }

  // Moves
  for (let i = 0; i < 4; i++) {
    const inp = document.getElementById(`ed-move-${i}`);
    inp.dataset.key = state.moves[i] || '';
    setupSearch(inp, document.getElementById(`ed-movelist-${i}`), state._moveEntries, n => { state.moves[i] = n; });
  }

  // SP inputs + buttons (event delegation)
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    document.getElementById(`ed-sp-${stat}`).addEventListener('input', e => {
      state.sp[stat] = Math.max(0, Math.min(32, parseInt(e.target.value) || 0));
      edUpdateStats(state);
    });
  }
  modal.addEventListener('click', e => {
    const btn = e.target.closest('.sp-btn');
    if (!btn || btn.dataset.side !== 'ed') return;
    const { stat, act } = btn.dataset;
    let val = state.sp[stat] || 0;
    if (act === '+') val = Math.min(32, val + 1);
    else if (act === '-') val = Math.max(0, val - 1);
    else if (act === '0') val = 0;
    else if (act === '32') val = 32;
    state.sp[stat] = val;
    document.getElementById(`ed-sp-${stat}`).value = val;
    edUpdateStats(state);
  });

  if (state.name) showEdInfo(state);
  edUpdateStats(state);

  // Save / Cancel
  document.getElementById('ed-save').addEventListener('click', () => {
    if (!state.name) { showToast('ポケモンを選択してください'); return; }
    const abilSel = document.getElementById('ed-ability');
    if (abilSel) state.ability = abilSel.value;
    delete state._moveEntries;
    if (isNew) parties[side].push(state);
    else parties[side][idx] = state;
    modal.remove();
    renderSetup();
  });
  document.getElementById('ed-box').addEventListener('click', async () => {
    if (!state.name) { showToast('ポケモンを選択してください'); return; }
    const abilSel = document.getElementById('ed-ability');
    if (abilSel) state.ability = abilSel.value;
    const entry = JSON.parse(JSON.stringify(state));
    delete entry._moveEntries; delete entry.id;
    if (!entry.uid) entry.uid = generateUid();
    entry.savedCalcs = []; entry.notes = '';
    await DB.add('box', entry);
    showToast(`${ja('pokemon', state.name)} をBOXに追加`);
  });
  document.getElementById('ed-cancel').addEventListener('click', () => modal.remove());
}

function showEdInfo(state) {
  if (state.name) document.getElementById('ed-info').innerHTML = renderPokemonInfo(state.name, 40);
}

function edUpdateStats(state) { return updateStatDisplay('ed', state);
}

// ===== LOAD PARTY =====
async function openPartyLoadPicker(side) {
  const page = document.getElementById('page-sim');
  let picker = document.getElementById('sim-party-picker');
  if (!picker) { picker = document.createElement('div'); picker.id = 'sim-party-picker'; page.appendChild(picker); }
  picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;overflow-y:auto;padding:10px';

  const teams = await DB.getAll('teams');
  const threats = await DB.getAll('threats');
  const boxAll = await DB.getAll('box');
  const members = currentTeam?.members || [];

  picker.innerHTML = `
    <div class="card" style="max-width:400px;margin:0 auto;max-height:80vh;overflow-y:auto">
      <h3>${side === 'a' ? '自分' : '相手'}のパーティに読込</h3>
      <div style="font-size:.75rem;color:var(--fg2);margin-bottom:4px">チームを選ぶ���全員読込、個体を選ぶと1匹追加</div>
      ${members.length > 0 ? `
        <div class="team-slot pick-team" data-src="current" style="border:2px solid var(--accent)">
          <div class="name" style="font-weight:700">現在のチーム (${members.length}匹)</div>
          <div style="display:flex;gap:2px">${members.map(m => spriteImg(m.name, 24)).join('')}</div>
        </div>` : ''}
      ${teams.map(t => `
        <div class="team-slot pick-team" data-src="team" data-id="${t.id}">
          <div class="name" style="font-weight:700">${esc(t.name)} (${t.members?.length || 0}匹)</div>
          <div style="display:flex;gap:2px">${(t.members||[]).map(m => spriteImg(m.name, 24)).join('')}</div>
        </div>`).join('')}
      <hr>
      <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">個体追加</div>
      <input type="text" id="sim-pick-search" placeholder="ポケモン名で検索..." autocomplete="off" style="margin-bottom:6px">
      <div id="sim-pick-individuals">
      ${threats.map(t => `
        <div class="team-slot pick-one" data-src="threat" data-id="${t.id}" data-name="${esc(t.name)}" data-ja="${esc(ja('pokemon', t.name))}">
          ${spriteImg(t.name, 28)}<div class="name">${esc(ja('pokemon', t.name))}</div>
          ${DATA.pokemon[t.name]?.types.map(tp => typeBadge(tp)).join('')||''}
        </div>`).join('')}
      ${boxAll.map(b => `
        <div class="team-slot pick-one" data-src="box" data-id="${b.id}" data-name="${esc(b.name)}" data-ja="${esc(ja('pokemon', b.name))}">
          ${spriteImg(b.name, 28)}<div class="name">${esc(ja('pokemon', b.name))}</div>
          ${DATA.pokemon[b.name]?.types.map(tp => typeBadge(tp)).join('')||''}
        </div>`).join('')}
      </div>
      <button class="btn btn-outline mt" id="sim-pick-close">閉じる</button>
    </div>`;

  picker.querySelector('#sim-pick-close').addEventListener('click', () => picker.remove());
  picker.querySelector('#sim-pick-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    picker.querySelectorAll('.pick-one').forEach(slot => {
      const en = (slot.dataset.name || '').toLowerCase();
      const jp = (slot.dataset.ja || '').toLowerCase();
      slot.style.display = (!q || en.includes(q) || jp.includes(q)) ? '' : 'none';
    });
  });
  picker.querySelectorAll('.pick-team').forEach(el => {
    el.addEventListener('click', async () => {
      let teamMembers;
      if (el.dataset.src === 'current') teamMembers = members;
      else { const t = teams.find(t => t.id === parseInt(el.dataset.id)); teamMembers = t?.members || []; }
      parties[side].length = 0;
      teamMembers.forEach(m => parties[side].push(JSON.parse(JSON.stringify(m))));
      picker.remove(); renderSetup();
      showToast(`パーティ読込 (${parties[side].length}匹)`);
    });
  });
  picker.querySelectorAll('.pick-one').forEach(el => {
    el.addEventListener('click', async () => {
      if (parties[side].length >= 6) { showToast('パーティは6匹まで'); return; }
      let src;
      if (el.dataset.src === 'threat') src = threats.find(t => t.id === parseInt(el.dataset.id));
      else src = boxAll.find(b => b.id === parseInt(el.dataset.id));
      if (!src) return;
      parties[side].push(JSON.parse(JSON.stringify(src)));
      picker.remove(); renderSetup();
      showToast(`${ja('pokemon', src.name)} を追加`);
    });
  });
}

async function savePartyAsTeam(side) {
  if (parties[side].length === 0) return;
  const teamName = `SIM_${side === 'a' ? '自分' : '相手'}_${new Date().toLocaleDateString('ja')}`;
  const team = { name: teamName, members: parties[side].map(p => { const c = JSON.parse(JSON.stringify(p)); delete c._moveEntries; if (!c.uid) c.uid = generateUid(); return c; }), notes: '', updatedAt: Date.now() };
  await DB.add('teams', team);
  showToast(`「${teamName}」をチームに保存`);
}

// ============================================================
// PHASE 2: SELECTION
// ============================================================
function goToSelect() {
  if (parties.a.length < 1 || parties.b.length < 1) { showToast('両方に最低1匹は必要です'); return; }
  for (const s of ['a','b']) selection[s] = parties[s].map((_, i) => i).slice(0, 3);
  renderSelect();
}

export function renderSelect() {
  const page = document.getElementById('page-sim');
  page.innerHTML = `
    <div class="card">
      <h3>選出 (最大3匹、タップで選択/解除)</h3>
      ${renderSelectSide('a')}
      <hr>
      ${renderSelectSide('b')}
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="btn btn-outline" id="sim-back-setup" style="flex:1">← 構築に戻る</button>
      <button class="btn" id="sim-start-battle" style="flex:2;background:var(--ok)">バトル開始 !</button>
    </div>
  `;
  document.getElementById('sim-back-setup').addEventListener('click', renderSetup);
  document.getElementById('sim-start-battle').addEventListener('click', startBattle);
  for (const side of ['a','b']) {
    document.querySelectorAll(`.sel-slot[data-side="${side}"]`).forEach(slot => {
      slot.addEventListener('click', () => {
        const idx = parseInt(slot.dataset.idx);
        const pos = selection[side].indexOf(idx);
        if (pos >= 0) selection[side].splice(pos, 1);
        else if (selection[side].length < 3) selection[side].push(idx);
        renderSelect();
      });
    });
  }
}

function renderSelectSide(side) {
  const label = side === 'a' ? '自分' : '相手';
  return `
    <div style="margin:6px 0">
      <div style="font-size:.8rem;font-weight:700;margin-bottom:4px">${label} (${selection[side].length}/3)</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${parties[side].map((p, i) => {
          const sel = selection[side].includes(i);
          const order = sel ? selection[side].indexOf(i) + 1 : '';
          return `<div class="sel-slot${sel ? ' sel-active' : ''}" data-side="${side}" data-idx="${i}">
              ${spriteImg(p.name, 44)}
              <div style="font-size:.7rem;font-weight:700">${esc(ja('pokemon', p.name))}</div>
              ${sel ? `<div style="font-size:.65rem;color:var(--accent)">${order === 1 ? '先発' : order + '番手'}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>`;
}
