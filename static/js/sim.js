// Pokemon Champions - Battle Simulator (Party/Selection/Switch)
import {
  DATA, ja, esc, spriteImg, typeBadge, STAT_JA, STAT_SHORT,
  pokemonNames, buildNatureUI, initNatureUI, updateNatureDisplay,
  setupSearch, setupItemSearch, showToast, makePokemonState, generateUid,
  scheduleSessionSave,
} from './app.js';
import { DMG } from './damage.js';
import { DB } from './db.js';
import { currentTeam } from './team.js';

// ===== CONSTANTS =====
// Fallback for moves missing recoil/drain in data
const RECOIL_FB = {'Brave Bird':1/3,'Double-Edge':1/3,'Flare Blitz':1/3,'Head Smash':1/2,'Light of Ruin':1/2,'Submission':1/4,'Take Down':1/4,'Volt Tackle':1/3,'Wild Charge':1/4,'Wood Hammer':1/3,'Wave Crash':1/3,'Head Charge':1/4};
const DRAIN_FB = {'Drain Punch':1/2,'Giga Drain':1/2,'Horn Leech':1/2,'Leech Life':1/2,'Parabolic Charge':1/2,'Absorb':1/2,'Mega Drain':1/2,'Oblivion Wing':3/4,'Draining Kiss':3/4};
function getRecoilFrac(m) { return DATA.moves[m]?.recoil || RECOIL_FB[m] || 0; }
function getDrainFrac(m) { return DATA.moves[m]?.drain || DRAIN_FB[m] || 0; }

// -ate skin abilities: resolve effective move type for display
const SKIN_ABILITIES = { 'Pixilate':'Fairy','Aerilate':'Flying','Refrigerate':'Ice','Galvanize':'Electric','Dragonize':'Dragon' };
function getEffectiveMoveType(moveName, ability) {
  const move = DATA.moves[moveName];
  if (!move) return '';
  if (move.type === 'Normal' && SKIN_ABILITIES[ability]) return SKIN_ABILITIES[ability];
  return move.type;
}

// Two-turn moves
const TWO_TURN_MOVES = new Set(['Phantom Force','Shadow Force','Fly','Dig','Dive','Bounce','Sky Attack','Solar Beam','Solar Blade','Meteor Beam','Geomancy','Skull Bash']);

// Mega evolution helpers
function getMegaFormes(poke) {
  const data = DATA.pokemon[poke.name];
  if (!data?.formes) return [];
  return data.formes.filter(f => (f.startsWith('Mega ') || f.includes('-Mega')) && f !== poke.name);
}
function getMegaForme(poke) {
  const megas = getMegaFormes(poke);
  return megas.length === 1 ? megas[0] : null; // single mega only; multi uses buttons
}
function isMega(name) { return name.startsWith('Mega ') || name.includes('-Mega'); }
function getPreMegaName(name) {
  // "Mega Gardevoir" → "Gardevoir", "Mega Charizard X" → "Charizard"
  if (name.startsWith('Mega ')) {
    const base = name.replace(/^Mega /, '').replace(/ [XY]$/, '');
    return base;
  }
  return null;
}

// Aegislash forme helpers
function isAegislash(name) { return name === 'Aegislash' || name === 'Aegislash-Shield' || name === 'Aegislash-Blade'; }
function getAegislashAlternateForme(name) {
  if (name === 'Aegislash' || name === 'Aegislash-Shield') return 'Aegislash-Blade';
  return 'Aegislash-Shield';
}

// Generic forme change: keep HP ratio, update stats
function applyFormeChange(side, selIdx, newName) {
  const oldPoke = parties[side][selection[side][selIdx]];
  const rt = battle.rt[side][selIdx];
  oldPoke.name = newName;
  // Update ability to new forme's first ability
  const newData = DATA.pokemon[newName];
  if (newData?.abilities?.length > 0) oldPoke.ability = newData.abilities[0];
  // Recalculate stats
  const newStats = DMG.getStats(oldPoke);
  if (newStats) {
    // HP stays same for mega (same HP base), but recalc for safety
    rt.maxHp = newStats.hp;
    rt.hp = Math.min(rt.hp, rt.maxHp); // cap if new max is lower
  }
}

// ===== STATE =====
let phase = 'setup'; // 'setup' | 'select' | 'battle'
const parties = { a: [], b: [] }; // arrays of makePokemonState(), up to 6
const selection = { a: [], b: [] }; // indices into parties[side]
const field = { weather: '', terrain: '' };

// Battle state
let battle = null; // initialized on battle start
function makeBattleRuntime(poke) {
  const stats = DMG.getStats(poke);
  return {
    hp: stats?.hp || 1, maxHp: stats?.hp || 1,
    toxicCount: 0, leechSeed: false,
    boosts: { at:0, df:0, sa:0, sd:0, sp:0 },
    disguise: (poke.ability === 'Disguise' || poke.ability === 'Ice Face'),
    status: '',
  };
}

// ===== ENTRY =====
export function initSimPage() {
  renderSetup();
}

// ============================================================
// PHASE 1: SETUP
// ============================================================
function renderSetup() {
  phase = 'setup';
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

  // Bind party section events
  for (const side of ['a','b']) {
    document.getElementById(`sim-party-add-${side}`).addEventListener('click', () => openEditor(side, -1));
    document.getElementById(`sim-party-load-${side}`).addEventListener('click', () => openPartyLoadPicker(side));
    document.getElementById(`sim-party-save-${side}`).addEventListener('click', () => savePartyAsTeam(side));
    // Slot clicks
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
  if (isNew) state._moveEntries = [...Object.keys(DATA.moves).sort()];
  else state._moveEntries = state.name && DATA.pokemon[state.name]?.learnset
    ? Object.keys(DATA.moves).filter(m => DATA.pokemon[state.name].learnset.includes(m)).sort()
    : [...Object.keys(DATA.moves).sort()];

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

  // Wire up search
  setupSearch(document.getElementById('ed-search'), document.getElementById('ed-list'), pokemonNames, n => {
    state.name = n;
    const data = DATA.pokemon[n];
    if (!data) return;
    const info = document.getElementById('ed-info');
    info.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin:4px 0">${spriteImg(n, 40)}<div><div style="font-weight:700">${esc(ja('pokemon', n))}</div><div>${data.types.map(t => typeBadge(t)).join(' ')}</div></div></div>`;
    // Learnset
    if (data.learnset) {
      state._moveEntries.length = 0;
      for (const m of Object.keys(DATA.moves).sort()) { if (data.learnset.includes(m)) state._moveEntries.push(m); }
    }
    // Ability
    updateEdAbility(state, data);
    edUpdateStats(state);
  });

  // Item
  const itemEntries = Object.keys(DATA.items).sort().map(k => ({ key: k, ja: ja('items', k) }));
  const itemInput = document.getElementById('ed-item-search');
  itemInput.dataset.key = state.item || '';
  setupItemSearch(itemInput, document.getElementById('ed-item-list'), itemEntries, n => { state.item = n; });

  // Nature
  initNatureUI('ed', state);

  // Ability select (for pre-existing state)
  if (state.name && DATA.pokemon[state.name]) {
    updateEdAbility(state, DATA.pokemon[state.name]);
  }

  // Moves
  for (let i = 0; i < 4; i++) {
    const inp = document.getElementById(`ed-move-${i}`);
    inp.dataset.key = state.moves[i] || '';
    setupSearch(inp, document.getElementById(`ed-movelist-${i}`), state._moveEntries, n => { state.moves[i] = n; });
  }

  // SP
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    document.getElementById(`ed-sp-${stat}`).addEventListener('input', e => {
      state.sp[stat] = Math.max(0, Math.min(32, parseInt(e.target.value) || 0));
      edUpdateStats(state);
    });
  }
  // SP buttons
  modal.addEventListener('click', e => {
    const btn = e.target.closest('.sp-btn');
    if (!btn || btn.dataset.side !== 'ed') return;
    const stat = btn.dataset.stat, act = btn.dataset.act;
    let val = state.sp[stat] || 0;
    if (act === '+') val = Math.min(32, val + 1);
    else if (act === '-') val = Math.max(0, val - 1);
    else if (act === '0') val = 0;
    else if (act === '32') val = 32;
    state.sp[stat] = val;
    document.getElementById(`ed-sp-${stat}`).value = val;
    edUpdateStats(state);
  });

  // Show info if already set
  if (state.name && DATA.pokemon[state.name]) {
    const data = DATA.pokemon[state.name];
    document.getElementById('ed-info').innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin:4px 0">${spriteImg(state.name, 40)}<div><div style="font-weight:700">${esc(ja('pokemon', state.name))}</div><div>${data.types.map(t => typeBadge(t)).join(' ')}</div></div></div>`;
  }
  edUpdateStats(state);

  // Save / Cancel
  document.getElementById('ed-save').addEventListener('click', () => {
    if (!state.name) { showToast('ポケモンを選択してください'); return; }
    // Read ability from select
    const abilSel = document.getElementById('ed-ability');
    if (abilSel) state.ability = abilSel.value;
    delete state._moveEntries;
    if (isNew) { parties[side].push(state); }
    else { parties[side][idx] = state; }
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

function updateEdAbility(state, data) {
  const abilWrap = document.getElementById('ed-ability-wrap');
  const abilSel = document.getElementById('ed-ability');
  if (!data?.abilities?.length) return;
  abilWrap.classList.remove('hidden');
  abilSel.innerHTML = data.abilities.map(a => `<option value="${a}">${ja('abilities', a) || a}</option>`).join('');
  if (!data.abilities.includes(state.ability)) state.ability = data.abilities[0];
  abilSel.value = state.ability;
  abilSel.onchange = e => { state.ability = e.target.value; };
}

function edUpdateStats(state) {
  if (!state.name) return;
  const stats = DMG.getStats(state);
  if (!stats) return;
  let total = 0;
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    const el = document.getElementById(`ed-val-${stat}`);
    if (el) {
      el.textContent = stats[stat];
      if (state.natureMods?.plus === stat) el.style.color = '#e74c3c';
      else if (state.natureMods?.minus === stat) el.style.color = '#3498db';
      else el.style.color = '';
    }
    total += (state.sp[stat] || 0);
  }
  const te = document.getElementById('ed-sp-total');
  if (te) { te.textContent = `${total}/66`; te.classList.toggle('over', total > 66); }
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
      <div style="font-size:.75rem;color:var(--fg2);margin-bottom:4px">チームを選ぶと全員読込、個体を選ぶと1匹追加</div>
      ${members.length > 0 ? `
        <div class="team-slot pick-team" data-src="current" style="border:2px solid var(--accent)">
          <div class="name" style="font-weight:700">現在のチーム (${members.length}匹)</div>
          <div style="display:flex;gap:2px">${members.map(m => spriteImg(m.name, 24)).join('')}</div>
        </div>
      ` : ''}
      ${teams.map(t => `
        <div class="team-slot pick-team" data-src="team" data-id="${t.id}">
          <div class="name" style="font-weight:700">${esc(t.name)} (${t.members?.length || 0}匹)</div>
          <div style="display:flex;gap:2px">${(t.members||[]).map(m => spriteImg(m.name, 24)).join('')}</div>
        </div>
      `).join('')}
      <hr>
      <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">個体追加</div>
      ${threats.map(t => `
        <div class="team-slot pick-one" data-src="threat" data-id="${t.id}">
          ${spriteImg(t.name, 28)}<div class="name">${esc(ja('pokemon', t.name))}</div>
          ${DATA.pokemon[t.name]?.types.map(tp => typeBadge(tp)).join('')||''}
        </div>`).join('')}
      ${boxAll.map(b => `
        <div class="team-slot pick-one" data-src="box" data-id="${b.id}">
          ${spriteImg(b.name, 28)}<div class="name">${esc(ja('pokemon', b.name))}</div>
          ${DATA.pokemon[b.name]?.types.map(tp => typeBadge(tp)).join('')||''}
        </div>`).join('')}
      <button class="btn btn-outline mt" id="sim-pick-close">閉じる</button>
    </div>`;

  picker.querySelector('#sim-pick-close').addEventListener('click', () => picker.remove());

  // Load entire team
  picker.querySelectorAll('.pick-team').forEach(el => {
    el.addEventListener('click', async () => {
      let teamMembers;
      if (el.dataset.src === 'current') {
        teamMembers = members;
      } else {
        const t = teams.find(t => t.id === parseInt(el.dataset.id));
        teamMembers = t?.members || [];
      }
      parties[side] = teamMembers.map(m => JSON.parse(JSON.stringify(m)));
      picker.remove();
      renderSetup();
      showToast(`パーティ読込 (${parties[side].length}匹)`);
    });
  });

  // Load single pokemon
  picker.querySelectorAll('.pick-one').forEach(el => {
    el.addEventListener('click', async () => {
      if (parties[side].length >= 6) { showToast('パーティは6匹まで'); return; }
      let src;
      if (el.dataset.src === 'threat') src = threats.find(t => t.id === parseInt(el.dataset.id));
      else src = boxAll.find(b => b.id === parseInt(el.dataset.id));
      if (!src) return;
      parties[side].push(JSON.parse(JSON.stringify(src)));
      picker.remove();
      renderSetup();
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
  if (parties.a.length < 1 || parties.b.length < 1) {
    showToast('両方に最低1匹は必要です');
    return;
  }
  // Default: select all (up to 3) in order
  for (const s of ['a','b']) {
    selection[s] = parties[s].map((_, i) => i).slice(0, 3);
  }
  renderSelect();
}

function renderSelect() {
  phase = 'select';
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

  // Selection toggle
  for (const side of ['a','b']) {
    document.querySelectorAll(`.sel-slot[data-side="${side}"]`).forEach(slot => {
      slot.addEventListener('click', () => {
        const idx = parseInt(slot.dataset.idx);
        const pos = selection[side].indexOf(idx);
        if (pos >= 0) { selection[side].splice(pos, 1); }
        else if (selection[side].length < 3) { selection[side].push(idx); }
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
          return `
            <div class="sel-slot${sel ? ' sel-active' : ''}" data-side="${side}" data-idx="${i}">
              ${spriteImg(p.name, 44)}
              <div style="font-size:.7rem;font-weight:700">${esc(ja('pokemon', p.name))}</div>
              ${sel ? `<div style="font-size:.65rem;color:var(--accent)">${order === 1 ? '先発' : order + '番手'}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ============================================================
// PHASE 3: BATTLE
// ============================================================
function startBattle() {
  if (selection.a.length === 0 || selection.b.length === 0) {
    showToast('両方1匹以上選出してください');
    return;
  }
  battle = {
    active: { a: 0, b: 0 }, // index into selection arrays
    rt: { a: [], b: [] },    // runtime per selected pokemon
    log: [],
    turnNum: 0,
    actions: { a: null, b: null }, // {type:'move',move:''} or {type:'switch',to:idx}
    megaUsed: { a: false, b: false }, // 1回限り
  };
  for (const s of ['a','b']) {
    battle.rt[s] = selection[s].map(pi => makeBattleRuntime(parties[s][pi]));
  }
  phase = 'battle';
  battle.log.push({ text: 'バトル開始！', isHeader: true });
  renderBattle();
}

function getActive(side) {
  return parties[side][selection[side][battle.active[side]]];
}
function getActiveRt(side) {
  return battle.rt[side][battle.active[side]];
}

function renderBattle() {
  const page = document.getElementById('page-sim');
  page.innerHTML = `
    <div class="sim-sides" style="margin-bottom:6px">
      ${renderBattleSide('a')}
      ${renderBattleSide('b')}
    </div>
    ${renderBench('a')}
    ${renderBench('b')}
    <div class="card" style="margin-top:6px">
      <div class="col2">
        <div><label>自分 状態異常</label><select id="sim-st-a" style="font-size:.75rem">
          <option value="">なし</option><option value="brn">やけど</option><option value="psn">どく</option><option value="tox">もうどく</option><option value="par">まひ</option>
        </select></div>
        <div><label>相手 状態異常</label><select id="sim-st-b" style="font-size:.75rem">
          <option value="">なし</option><option value="brn">やけど</option><option value="psn">どく</option><option value="tox">もうどく</option><option value="par">まひ</option>
        </select></div>
      </div>
      <div class="col2" style="margin-top:4px">
        <label><input type="checkbox" id="sim-ls-a"> 自分にやどりぎ</label>
        <label><input type="checkbox" id="sim-ls-b"> 相手にやどりぎ</label>
      </div>
      <div class="col2" style="margin-top:4px">
        ${renderBoostUI('a')}
        ${renderBoostUI('b')}
      </div>
    </div>
    <div class="sim-actions">
      <button class="btn btn-sm" id="sim-exec" style="background:var(--accent);flex:2">ターン実行</button>
      <button class="btn btn-sm btn-outline" id="sim-eot">EOT処理</button>
      <button class="btn btn-sm btn-danger" id="sim-end">終了</button>
    </div>
    <div class="sim-turn-log" id="sim-log">
      <h3>ターン履歴</h3>
      ${renderLog()}
    </div>
  `;

  // Wire events
  for (const s of ['a','b']) {
    const rt = getActiveRt(s);
    document.getElementById(`sim-st-${s}`).value = rt.status;
    document.getElementById(`sim-st-${s}`).addEventListener('change', e => { rt.status = e.target.value; if (e.target.value === 'tox') rt.toxicCount = 0; });
    document.getElementById(`sim-ls-${s}`).checked = rt.leechSeed;
    document.getElementById(`sim-ls-${s}`).addEventListener('change', e => { rt.leechSeed = e.target.checked; });
    for (const stat of ['at','df','sa','sd','sp']) {
      const el = document.getElementById(`sim-bst-${s}-${stat}`);
      if (el) { el.value = rt.boosts[stat]; el.addEventListener('change', e => { rt.boosts[stat] = parseInt(e.target.value); }); }
    }
  }

  // HP adjust
  for (const s of ['a','b']) {
    const rt = getActiveRt(s);
    document.querySelectorAll(`.sim-hp-adj[data-side="${s}"]`).forEach(btn => {
      btn.addEventListener('click', () => {
        const frac = parseFloat(btn.dataset.frac);
        const delta = Math.floor(rt.maxHp * Math.abs(frac)) * Math.sign(frac);
        rt.hp = Math.max(0, Math.min(rt.maxHp, rt.hp + delta));
        addLog(`${s === 'a' ? '自分' : '相手'}: HP${delta >= 0 ? '+' : ''}${delta} → ${rt.hp}/${rt.maxHp}`);
        updateBattleLight();
      });
    });
    document.getElementById(`sim-hp-set-${s}`)?.addEventListener('click', () => {
      const v = parseInt(document.getElementById(`sim-hp-input-${s}`).value);
      if (!isNaN(v)) { rt.hp = Math.max(0, Math.min(rt.maxHp, v)); updateBattleLight(); }
    });
  }

  // Move/switch selection
  for (const s of ['a','b']) {
    document.querySelectorAll(`.sim-act-btn[data-side="${s}"]`).forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`.sim-act-btn[data-side="${s}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (btn.dataset.type === 'move') {
          battle.actions[s] = { type: 'move', move: btn.dataset.move };
        } else if (btn.dataset.type === 'switch') {
          battle.actions[s] = { type: 'switch', to: parseInt(btn.dataset.to) };
        } else {
          battle.actions[s] = null;
        }
      });
    });
  }

  // Mega evolution buttons
  document.querySelectorAll('.sim-mega-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.side;
      const targetForme = btn.dataset.forme;
      if (!targetForme || battle.megaUsed[s]) return;
      const poke = getActive(s);
      applyFormeChange(s, battle.active[s], targetForme);
      battle.megaUsed[s] = true;
      const newAbil = ja('abilities', getActive(s).ability) || getActive(s).ability;
      addLog(`${s === 'a' ? '自分' : '相手'}の${ja('pokemon', poke.name)}がメガシンカ！ → ${ja('pokemon', targetForme)} (${newAbil})`);
      renderBattle();
    });
  });

  // Aegislash forme change buttons
  document.querySelectorAll('.sim-aegis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.side;
      const poke = getActive(s);
      const altForme = getAegislashAlternateForme(poke.name);
      applyFormeChange(s, battle.active[s], altForme);
      const formeLabel = altForme.includes('Blade') ? 'ブレードフォルム' : 'シールドフォルム';
      addLog(`${s === 'a' ? '自分' : '相手'}のギルガルド → ${formeLabel}！`);
      renderBattle();
    });
  });

  document.getElementById('sim-exec').addEventListener('click', executeTurn);
  document.getElementById('sim-eot').addEventListener('click', executeEndOfTurn);
  document.getElementById('sim-end').addEventListener('click', () => { phase = 'setup'; renderSetup(); });
}

function renderBattleSide(side) {
  const poke = getActive(side);
  const rt = getActiveRt(side);
  const label = side === 'a' ? '自分' : '相手';
  const pct = rt.maxHp > 0 ? (rt.hp / rt.maxHp * 100) : 0;
  const hpClass = pct > 50 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';
  const stats = DMG.getStats(poke);
  const moves = poke.moves.filter(m => m && DATA.moves[m]);

  // Mega evolution / Aegislash buttons
  const megaForme = getMegaForme(poke);
  const canMega = megaForme && !isMega(poke.name) && !battle.megaUsed[side];
  const isAegi = isAegislash(poke.name);
  const abilityJa = poke.ability ? (ja('abilities', poke.ability) || poke.ability) : '';

  return `
    <div class="sim-side">
      <div class="sim-poke-header">
        ${spriteImg(poke.name, 40)}
        <div>
          <div style="font-weight:700;font-size:.85rem">${esc(ja('pokemon', poke.name))}</div>
          <div>${DATA.pokemon[poke.name]?.types.map(t => typeBadge(t)).join(' ') || ''}</div>
          <div style="font-size:.6rem;color:var(--fg2)">${esc(abilityJa)}</div>
        </div>
      </div>
      ${canMega ? `<button class="btn btn-sm sim-mega-btn" data-side="${side}" data-forme="${esc(megaForme)}">メガシンカ → ${esc(ja('pokemon', megaForme))}</button>` : ''}
      ${!canMega && !isMega(poke.name) && !battle.megaUsed[side] && getMegaFormes(poke).length > 1 ? getMegaFormes(poke).map(mf => `<button class="btn btn-sm sim-mega-btn" data-side="${side}" data-forme="${esc(mf)}">メガシンカ → ${esc(ja('pokemon', mf))}</button>`).join('') : ''}
      ${isAegi ? `<button class="btn btn-sm sim-aegis-btn" data-side="${side}">${poke.name.includes('Blade') ? 'シールドフォルムへ' : 'ブレードフォルムへ'}</button>` : ''}
      <div class="sim-hp-bar"><div class="sim-hp-fill ${hpClass}" id="sim-hpbar-${side}" style="width:${pct}%"></div></div>
      <div class="sim-hp-text" id="sim-hptext-${side}">${rt.hp} / ${rt.maxHp}</div>
      ${stats ? `<div style="font-size:.65rem;color:var(--fg2);text-align:center">S:${stats.sp} ${poke.item ? '@ ' + esc(ja('items', poke.item)) : ''}</div>` : ''}
      ${rt.disguise ? `<div style="font-size:.7rem;text-align:center;color:var(--accent2);font-weight:700">${poke.ability === 'Disguise' ? 'ばけのかわ' : 'こおりのすがた'} 生存</div>` : ''}
      <div class="sim-hp-btns">
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/16}">+1/16</button>
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/8}">+1/8</button>
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/4}">+1/4</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/16}">-1/16</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/8}">-1/8</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/4}">-1/4</button>
      </div>
      <div class="sim-custom-hp">
        <input type="number" id="sim-hp-input-${side}" placeholder="HP" min="0" max="${rt.maxHp}">
        <button class="btn btn-sm btn-outline" id="sim-hp-set-${side}" style="font-size:.7rem;padding:2px 6px">設定</button>
      </div>
      <div class="sim-move-sel">
        <div style="font-size:.7rem;color:var(--fg2);margin-bottom:2px">${label}の行動:</div>
        ${moves.map(m => {
          const move = DATA.moves[m];
          const sel = battle.actions[side]?.type === 'move' && battle.actions[side]?.move === m;
          const effType = getEffectiveMoveType(m, poke.ability);
          const skinChanged = effType !== move.type;
          const twoTurn = TWO_TURN_MOVES.has(m);
          return `<button class="sim-act-btn sim-move-btn${sel ? ' selected' : ''}" data-side="${side}" data-type="move" data-move="${esc(m)}">
            ${skinChanged ? typeBadge(effType) : typeBadge(move.type)} ${esc(ja('moves', m))} <span style="color:var(--fg2);font-size:.65rem">威力${move.bp || '-'}</span>
            ${skinChanged ? `<span style="font-size:.55rem;color:var(--accent2)">スキン</span>` : ''}
            ${twoTurn ? `<span style="font-size:.55rem;color:var(--fg2)">2T</span>` : ''}
            ${getRecoilFrac(m) ? '<span style="color:var(--danger);font-size:.6rem">反動</span>' : ''}
            ${getDrainFrac(m) ? '<span style="color:var(--ok);font-size:.6rem">吸収</span>' : ''}
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function renderBench(side) {
  const label = side === 'a' ? '自分' : '相手';
  const benched = selection[side]
    .map((pi, i) => ({ pi, i, poke: parties[side][pi], rt: battle.rt[side][i] }))
    .filter(x => x.i !== battle.active[side]);
  if (benched.length === 0) return '';

  return `
    <div style="font-size:.7rem;color:var(--fg2);margin:2px 0">${label}の控え:</div>
    <div style="display:flex;gap:4px;margin-bottom:4px;flex-wrap:wrap">
      ${benched.map(({ poke, rt, i }) => {
        const alive = rt.hp > 0;
        const sel = battle.actions[side]?.type === 'switch' && battle.actions[side]?.to === i;
        return `
          <button class="sim-act-btn btn btn-sm ${sel ? '' : 'btn-outline'}" data-side="${side}" data-type="switch" data-to="${i}"
            style="display:flex;align-items:center;gap:3px;${!alive ? 'opacity:.4;pointer-events:none' : ''};${sel ? 'background:var(--accent2)' : ''}" ${!alive ? 'disabled' : ''}>
            ${spriteImg(poke.name, 22)}
            <span style="font-size:.7rem">${esc(ja('pokemon', poke.name))}</span>
            <span class="sim-bench-hp" data-side="${side}" data-idx="${i}" style="font-size:.6rem;color:var(--fg2)">${rt.hp}/${rt.maxHp}</span>
          </button>`;
      }).join('')}
    </div>`;
}

function renderBoostUI(side) {
  const rt = getActiveRt(side);
  const label = side === 'a' ? '自分' : '相手';
  return `<div>
    <label style="font-size:.65rem">${label}ランク</label>
    <div style="display:flex;gap:2px;flex-wrap:wrap">
      ${['at','df','sa','sd','sp'].map(stat => `
        <div style="display:flex;align-items:center;gap:1px">
          <span style="font-size:.55rem;color:var(--fg2)">${STAT_SHORT[stat]}</span>
          <select id="sim-bst-${side}-${stat}" style="width:40px;font-size:.65rem;padding:0">
            ${[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].map(v => `<option value="${v}"${v===(rt.boosts[stat]||0)?' selected':''}>${v>=0?'+':''}${v}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
  </div>`;
}

// ===== TURN EXECUTION =====
function executeTurn() {
  const actA = battle.actions.a;
  const actB = battle.actions.b;
  if (!actA && !actB) { showToast('行動を選択してください'); return; }

  battle.turnNum++;
  addLog(`--- ターン ${battle.turnNum} ---`, true);

  // Switches always go first
  for (const s of ['a','b']) {
    const act = s === 'a' ? actA : actB;
    if (act?.type === 'switch') doSwitch(s, act.to);
  }

  // Then attacks by speed
  const attackers = [];
  if (actA?.type === 'move' && actA.move) attackers.push({ side: 'a', move: actA.move });
  if (actB?.type === 'move' && actB.move) attackers.push({ side: 'b', move: actB.move });

  if (attackers.length === 2) {
    // Sort by priority then speed
    const prioA = DATA.moves[attackers[0].move]?.priority ? 1 : 0;
    const prioB = DATA.moves[attackers[1].move]?.priority ? 1 : 0;
    if (prioA !== prioB) {
      attackers.sort((a, b) => (DATA.moves[b.move]?.priority ? 1 : 0) - (DATA.moves[a.move]?.priority ? 1 : 0));
    } else {
      const spdA = getEffectiveSpeed('a');
      const spdB = getEffectiveSpeed('b');
      if (spdB > spdA) attackers.reverse();
    }
  }

  for (let i = 0; i < attackers.length; i++) {
    const { side, move } = attackers[i];
    const opp = side === 'a' ? 'b' : 'a';
    if (getActiveRt(side).hp <= 0) continue;
    if (getActiveRt(opp).hp <= 0) continue;
    executeAttack(side, opp, move);
  }

  // Check KO
  for (const s of ['a','b']) {
    if (getActiveRt(s).hp <= 0) {
      addLog(`${s === 'a' ? '自分' : '相手'}の${ja('pokemon', getActive(s).name)}はたおれた！`, false, 'ko-line');
    }
  }

  // Clear actions
  battle.actions = { a: null, b: null };
  updateBattleLight();
}

function getEffectiveSpeed(side) {
  const poke = getActive(side);
  const rt = getActiveRt(side);
  const stats = DMG.getStats(poke);
  let spd = stats?.sp || 0;
  spd = applyBoostVal(spd, rt.boosts.sp);
  if (rt.status === 'par') spd = Math.floor(spd / 2);
  return spd;
}

function applyBoostVal(stat, boost) {
  if (boost >= 0) return Math.floor(stat * (2 + boost) / 2);
  return Math.floor(stat * 2 / (2 - boost));
}

function doSwitch(side, toIdx) {
  const label = side === 'a' ? '自分' : '相手';
  const oldPoke = getActive(side);
  const oldRt = getActiveRt(side);
  // Reset leech seed and boosts on switch out
  oldRt.leechSeed = false;
  oldRt.boosts = { at:0, df:0, sa:0, sd:0, sp:0 };
  oldRt.toxicCount = 0;

  battle.active[side] = toIdx;
  const newPoke = getActive(side);
  addLog(`${label}: ${ja('pokemon', oldPoke.name)} → ${ja('pokemon', newPoke.name)} に交代！`);
}

function executeAttack(atkSide, defSide, moveName) {
  const atkLabel = atkSide === 'a' ? '自分' : '相手';
  const defLabel = defSide === 'a' ? '自分' : '相手';
  const move = DATA.moves[moveName];
  if (!move) return;

  // Aegislash auto forme change
  const atkPokePre = getActive(atkSide);
  if (isAegislash(atkPokePre.name)) {
    if (move.bp && move.bp > 0 && !atkPokePre.name.includes('Blade')) {
      applyFormeChange(atkSide, battle.active[atkSide], 'Aegislash-Blade');
      addLog(`  ${atkLabel}のギルガルド → ブレードフォルム！`);
    } else if ((!move.bp || move.bp === 0) && !atkPokePre.name.includes('Shield') && atkPokePre.name !== 'Aegislash') {
      applyFormeChange(atkSide, battle.active[atkSide], 'Aegislash-Shield');
      addLog(`  ${atkLabel}のギルガルド → シールドフォルム！`);
    }
  }

  if (!move.bp || move.bp === 0) {
    addLog(`${atkLabel}の${ja('moves', moveName)}！`);
    return;
  }

  const atkPoke = getActive(atkSide);
  const defPoke = getActive(defSide);
  const atkRt = getActiveRt(atkSide);
  const defRt = getActiveRt(defSide);

  const atkState = { ...atkPoke, boosts: { ...atkRt.boosts }, currentHP: atkRt.hp, status: atkRt.status };
  const defState = { ...defPoke, boosts: { ...defRt.boosts }, currentHP: defRt.hp, status: defRt.status, disguiseIntact: defRt.disguise };

  const result = DMG.calculate(atkState, defState, moveName, field);
  if (!result) { addLog(`${atkLabel}の${ja('moves', moveName)}！ (計算不可)`); return; }

  if (result.typeEff === 0) { addLog(`${atkLabel}の${ja('moves', moveName)}！ → 効果なし`); return; }

  // Disguise
  if (result.disguiseConsumed) {
    const abilName = defPoke.ability === 'Disguise' ? 'ばけのかわ' : 'こおりのすがた';
    const subDmg = result.minDmg;
    defRt.hp = Math.max(0, defRt.hp - subDmg);
    defRt.disguise = false;
    addLog(`${atkLabel}の${ja('moves', moveName)}！ → ${defLabel}の${abilName}がはがれた！ (${subDmg}ダメージ)`, false, 'dmg-line');
    addLog(`  ${defLabel}: HP ${defRt.hp}/${defRt.maxHp}`);
    return;
  }

  const avgDmg = Math.round((result.minDmg + result.maxDmg) / 2);
  const actualDmg = Math.min(avgDmg, defRt.hp);
  defRt.hp = Math.max(0, defRt.hp - avgDmg);

  let effText = '';
  if (result.typeEff > 1) effText = ' (効果ばつぐん)';
  else if (result.typeEff < 1) effText = ' (いまひとつ)';
  addLog(`${atkLabel}の${ja('moves', moveName)}！ → ${defLabel}に${avgDmg}ダメージ (${result.minDmg}〜${result.maxDmg}, ${result.minPct}%〜${result.maxPct}%)${effText}`, false, 'dmg-line');

  // Recoil
  const recoilFrac = getRecoilFrac(moveName);
  if (recoilFrac > 0) {
    const recoilDmg = Math.floor(actualDmg * recoilFrac);
    if (recoilDmg > 0) { atkRt.hp = Math.max(0, atkRt.hp - recoilDmg); addLog(`  ${atkLabel}: 反動${recoilDmg} → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'dmg-line'); }
  }
  // Life Orb
  if (atkPoke.item === 'Life Orb') {
    const loDmg = Math.floor(atkRt.maxHp / 10);
    atkRt.hp = Math.max(0, atkRt.hp - loDmg);
    addLog(`  ${atkLabel}: LO反動${loDmg} → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'dmg-line');
  }
  // Drain
  const drainFrac = getDrainFrac(moveName);
  if (drainFrac > 0) {
    const heal = Math.floor(actualDmg * drainFrac);
    if (heal > 0) { atkRt.hp = Math.min(atkRt.maxHp, atkRt.hp + heal); addLog(`  ${atkLabel}: ${heal}回復 → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'heal-line'); }
  }
  // Contact damage
  if (move.contact) {
    if (defPoke.ability === 'Rough Skin' || defPoke.ability === 'Iron Barbs') {
      const d = Math.floor(atkRt.maxHp / 8);
      atkRt.hp = Math.max(0, atkRt.hp - d);
      addLog(`  ${atkLabel}: ${ja('abilities', defPoke.ability)}で${d}ダメージ → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'dmg-line');
    }
    if (defPoke.item === 'Rocky Helmet') {
      const d = Math.floor(atkRt.maxHp / 6);
      atkRt.hp = Math.max(0, atkRt.hp - d);
      addLog(`  ${atkLabel}: ゴツメ${d}ダメージ → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'dmg-line');
    }
  }
  addLog(`  ${defLabel}: HP ${defRt.hp}/${defRt.maxHp}`);
}

// ===== END OF TURN =====
function executeEndOfTurn() {
  addLog(`--- EOT ---`, true);
  for (const s of ['a','b']) {
    const poke = getActive(s);
    const rt = getActiveRt(s);
    const opp = s === 'a' ? 'b' : 'a';
    const oppRt = getActiveRt(opp);
    const label = s === 'a' ? '自分' : '相手';
    if (rt.hp <= 0) continue;
    const types = DATA.pokemon[poke.name]?.types || [];

    // Weather
    if (field.weather === 'Sand' && !types.includes('Rock') && !types.includes('Ground') && !types.includes('Steel')) {
      const d = Math.floor(rt.maxHp / 16); rt.hp = Math.max(0, rt.hp - d);
      addLog(`${label}: すなあらし -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
    }
    // Leftovers
    if (poke.item === 'Leftovers' && rt.hp < rt.maxHp) {
      const h = Math.floor(rt.maxHp / 16); rt.hp = Math.min(rt.maxHp, rt.hp + h);
      addLog(`${label}: たべのこし +${h} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
    }
    // Black Sludge
    if (poke.item === 'Black Sludge') {
      if (types.includes('Poison')) { const h = Math.floor(rt.maxHp / 16); rt.hp = Math.min(rt.maxHp, rt.hp + h); addLog(`${label}: くろいヘドロ +${h} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line'); }
      else { const d = Math.floor(rt.maxHp / 8); rt.hp = Math.max(0, rt.hp - d); addLog(`${label}: くろいヘドロ -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line'); }
    }
    // Grassy Terrain
    if (field.terrain === 'Grassy' && !types.includes('Flying')) {
      const h = Math.floor(rt.maxHp / 16); rt.hp = Math.min(rt.maxHp, rt.hp + h);
      addLog(`${label}: グラスフィールド +${h} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
    }
    // Poison
    if (rt.status === 'psn') { const d = Math.floor(rt.maxHp / 8); rt.hp = Math.max(0, rt.hp - d); addLog(`${label}: どく -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line'); }
    // Toxic
    if (rt.status === 'tox') { rt.toxicCount++; const d = Math.floor(rt.maxHp * rt.toxicCount / 16); rt.hp = Math.max(0, rt.hp - d); addLog(`${label}: もうどく(${rt.toxicCount}) -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line'); }
    // Burn
    if (rt.status === 'brn') { const d = Math.floor(rt.maxHp / 16); rt.hp = Math.max(0, rt.hp - d); addLog(`${label}: やけど -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line'); }
    // Leech Seed
    if (rt.leechSeed && oppRt.hp > 0) {
      const d = Math.floor(rt.maxHp / 8); rt.hp = Math.max(0, rt.hp - d);
      const heal = Math.min(d, oppRt.maxHp - oppRt.hp); oppRt.hp += heal;
      addLog(`${label}: やどりぎ -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
      if (heal > 0) addLog(`${opp === 'a' ? '自分' : '相手'}: やどりぎ回復 +${heal} → HP ${oppRt.hp}/${oppRt.maxHp}`, false, 'heal-line');
    }
    // Sitrus Berry
    if (poke.item === 'Sitrus Berry' && rt.hp > 0 && rt.hp <= rt.maxHp / 2) {
      const h = Math.floor(rt.maxHp / 4); rt.hp = Math.min(rt.maxHp, rt.hp + h);
      poke.item = '';
      addLog(`${label}: オボンのみ +${h} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
    }
  }
  for (const s of ['a','b']) {
    if (getActiveRt(s).hp <= 0) addLog(`${s === 'a' ? '自分' : '相手'}の${ja('pokemon', getActive(s).name)}はたおれた！`, false, 'ko-line');
  }
  updateBattleLight();
}

// ===== TARGETED DOM UPDATES (no full rebuild) =====
function updateHpUI(side) {
  const rt = getActiveRt(side);
  const pct = rt.maxHp > 0 ? (rt.hp / rt.maxHp * 100) : 0;
  const hpClass = pct > 50 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';
  const bar = document.getElementById(`sim-hpbar-${side}`);
  const text = document.getElementById(`sim-hptext-${side}`);
  if (bar) { bar.className = `sim-hp-fill ${hpClass}`; bar.style.width = `${pct}%`; }
  if (text) text.textContent = `${rt.hp} / ${rt.maxHp}`;
  // Update bench HP display
  document.querySelectorAll(`.sim-bench-hp[data-side="${side}"]`).forEach(el => {
    const idx = parseInt(el.dataset.idx);
    const brt = battle.rt[side][idx];
    if (brt) el.textContent = `${brt.hp}/${brt.maxHp}`;
  });
}

let _logRendered = 0; // tracks how many log entries are already in DOM
function appendNewLogs() {
  const logEl = document.getElementById('sim-log');
  if (!logEl || !battle) return;
  const entries = battle.log.slice(_logRendered);
  if (entries.length === 0) return;
  let html = '';
  for (const e of entries) {
    html += `<div class="sim-turn-entry${e.isHeader ? ' turn-header' : ''}">${e.cls ? `<span class="${e.cls}">` : ''}${esc(e.text)}${e.cls ? '</span>' : ''}</div>`;
  }
  logEl.insertAdjacentHTML('beforeend', html);
  _logRendered = battle.log.length;
  logEl.scrollTop = logEl.scrollHeight;
}

function updateBattleLight() {
  updateHpUI('a');
  updateHpUI('b');
  appendNewLogs();
}

// ===== LOG =====
function addLog(text, isHeader = false, cls = '') {
  battle.log.push({ text, isHeader, cls });
}
function renderLog() {
  if (!battle) return '';
  _logRendered = battle.log.length;
  const entries = battle.log.length > 100 ? battle.log.slice(-100) : battle.log;
  return entries.map(e =>
    `<div class="sim-turn-entry${e.isHeader ? ' turn-header' : ''}">${e.cls ? `<span class="${e.cls}">` : ''}${esc(e.text)}${e.cls ? '</span>' : ''}</div>`
  ).join('');
}
