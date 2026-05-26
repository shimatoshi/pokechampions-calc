// Pokemon Champions - Battle Simulator
import {
  DATA, ja, esc, spriteImg, typeBadge, STAT_JA, STAT_SHORT,
  pokemonNames, buildNatureUI, initNatureUI, updateNatureDisplay,
  setupSearch, setupItemSearch, showToast, makePokemonState,
  scheduleSessionSave,
} from './app.js';
import { DMG } from './damage.js';
import { DB } from './db.js';
import { currentTeam } from './team.js';

// ===== SIM STATE =====
const sides = {
  a: makePokemonState(),
  b: makePokemonState(),
};
const simField = { weather: '', terrain: '', doubles: false, crit: false, stealthRock: false, spikes: 0, pinch: false };
let turnLog = [];
let turnNum = 0;
// Per-side runtime state (resets on new sim)
let runtime = {
  a: { hp: 0, maxHp: 0, toxicCount: 0, leechSeed: false, selectedMove: '' },
  b: { hp: 0, maxHp: 0, toxicCount: 0, leechSeed: false, selectedMove: '' },
};

// ===== RECOIL/DRAIN DATA (hardcoded fallback if not in move data) =====
const RECOIL_MOVES = {
  'Brave Bird': 1/3, 'Double-Edge': 1/3, 'Flare Blitz': 1/3,
  'Head Smash': 1/2, 'Light of Ruin': 1/2,
  'Submission': 1/4, 'Take Down': 1/4,
  'Volt Tackle': 1/3, 'Wild Charge': 1/4, 'Wood Hammer': 1/3,
  'Wave Crash': 1/3, 'Head Charge': 1/4,
};
const DRAIN_MOVES = {
  'Drain Punch': 1/2, 'Giga Drain': 1/2, 'Horn Leech': 1/2,
  'Leech Life': 1/2, 'Parabolic Charge': 1/2, 'Absorb': 1/2, 'Mega Drain': 1/2,
  'Oblivion Wing': 3/4, 'Draining Kiss': 3/4,
};
// Contact-based damage abilities
const CONTACT_DMG_ABILITIES = {
  'Rough Skin': 1/8, 'Iron Barbs': 1/8, 'Rocky Helmet_item': 1/6,
};

function getRecoilFrac(moveName) {
  const m = DATA.moves[moveName];
  return m?.recoil || RECOIL_MOVES[moveName] || 0;
}
function getDrainFrac(moveName) {
  const m = DATA.moves[moveName];
  return m?.drain || DRAIN_MOVES[moveName] || 0;
}

// ===== BUILD UI =====

function buildSimSidePanel(side) {
  const label = side === 'a' ? '自分' : '相手';
  const s = `sim-${side}`;
  return `
    <div class="sim-side" id="${s}-panel">
      <h3>${label}</h3>
      <div class="search-wrap">
        <input type="text" id="${s}-search" placeholder="ポケモン名..." autocomplete="off">
        <div class="search-list" id="${s}-list"></div>
      </div>
      <div id="${s}-info" class="poke-info"></div>
      ${buildNatureUI(s)}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="${s}-item-search" placeholder="もちもの..." autocomplete="off">
        <div class="search-list" id="${s}-item-list"></div>
      </div>
      <div id="${s}-ability-wrap" class="hidden">
        <label>とくせい</label>
        <select id="${s}-ability"></select>
      </div>
      <label>SP配分 <span id="${s}-sp-total" class="sp-total">0/66</span></label>
      <div id="${s}-sp">
        ${['hp','at','df','sa','sd','sp'].map(stat => `
          <div class="sp-row">
            <span class="sp-label">${STAT_SHORT[stat]}</span>
            <button class="sp-btn" data-side="${s}" data-stat="${stat}" data-act="0">0</button>
            <button class="sp-btn" data-side="${s}" data-stat="${stat}" data-act="-">-</button>
            <input type="number" id="${s}-sp-${stat}" min="0" max="32" value="0" data-stat="${stat}">
            <button class="sp-btn" data-side="${s}" data-stat="${stat}" data-act="+">+</button>
            <button class="sp-btn" data-side="${s}" data-stat="${stat}" data-act="32">32</button>
            <span class="sp-val" id="${s}-val-${stat}">-</span>
          </div>
        `).join('')}
      </div>
      <label>わざ</label>
      ${[0,1,2,3].map(i => `
        <div class="search-wrap" style="margin-bottom:4px">
          <input type="text" id="${s}-move-${i}" placeholder="わざ${i+1}..." autocomplete="off">
          <div class="search-list" id="${s}-movelist-${i}"></div>
        </div>
      `).join('')}
    </div>`;
}

export function initSimPage() {
  const page = document.getElementById('page-sim');
  page.innerHTML = `
    <div class="sim-sides">${buildSimSidePanel('a')}${buildSimSidePanel('b')}</div>
    <div class="card" style="margin-top:6px">
      <h3>フィールド</h3>
      <div class="col2">
        <div><label>天候</label><select id="sim-field-weather">
          <option value="">なし</option><option value="Sun">はれ</option><option value="Rain">あめ</option>
          <option value="Sand">すなあらし</option><option value="Snow">ゆき</option>
        </select></div>
        <div><label>フィールド</label><select id="sim-field-terrain">
          <option value="">なし</option><option value="Electric">エレキ</option><option value="Grassy">グラス</option>
          <option value="Psychic">サイコ</option><option value="Misty">ミスト</option>
        </select></div>
      </div>
    </div>
    <div class="sim-actions">
      <button class="btn btn-sm" id="sim-load-a">自分に読込</button>
      <button class="btn btn-sm" id="sim-start" style="background:var(--ok)">対戦開始</button>
      <button class="btn btn-sm" id="sim-load-b">相手に読込</button>
    </div>
    <div id="sim-battle" class="hidden"></div>
  `;

  // Pokemon search
  for (const side of ['a', 'b']) {
    const s = `sim-${side}`;
    const state = sides[side];
    setupSearch(document.getElementById(`${s}-search`), document.getElementById(`${s}-list`), pokemonNames, n => simSelectPokemon(side, n));
    state._moveEntries = [...Object.keys(DATA.moves).sort()];
    for (let i = 0; i < 4; i++) {
      setupSearch(document.getElementById(`${s}-move-${i}`), document.getElementById(`${s}-movelist-${i}`), state._moveEntries, name => { state.moves[i] = name; });
    }
    initNatureUI(s, state);
    const itemEntries = Object.keys(DATA.items).sort().map(k => ({ key: k, ja: ja('items', k) }));
    setupItemSearch(document.getElementById(`${s}-item-search`), document.getElementById(`${s}-item-list`), itemEntries, name => { state.item = name; });
    // SP inputs
    for (const stat of ['hp','at','df','sa','sd','sp']) {
      document.getElementById(`${s}-sp-${stat}`).addEventListener('input', e => {
        state.sp[stat] = Math.max(0, Math.min(32, parseInt(e.target.value) || 0));
        simUpdateStats(side);
      });
    }
  }

  // SP buttons
  page.addEventListener('click', e => {
    const btn = e.target.closest('.sp-btn');
    if (!btn) return;
    const rawSide = btn.dataset.side; // 'sim-a' or 'sim-b'
    const sideKey = rawSide.replace('sim-', '');
    if (sideKey !== 'a' && sideKey !== 'b') return;
    const stat = btn.dataset.stat;
    const act = btn.dataset.act;
    const state = sides[sideKey];
    let val = state.sp[stat] || 0;
    if (act === '+') val = Math.min(32, val + 1);
    else if (act === '-') val = Math.max(0, val - 1);
    else if (act === '0') val = 0;
    else if (act === '32') val = 32;
    state.sp[stat] = val;
    document.getElementById(`${rawSide}-sp-${stat}`).value = val;
    simUpdateStats(sideKey);
  });

  // Field
  document.getElementById('sim-field-weather').addEventListener('change', e => { simField.weather = e.target.value; });
  document.getElementById('sim-field-terrain').addEventListener('change', e => { simField.terrain = e.target.value; });

  // Load from team/threats
  document.getElementById('sim-load-a').addEventListener('click', () => openSimLoadPicker('a'));
  document.getElementById('sim-load-b').addEventListener('click', () => openSimLoadPicker('b'));

  // Start battle
  document.getElementById('sim-start').addEventListener('click', startBattle);
}

function simSelectPokemon(side, name) {
  const state = sides[side];
  state.name = name;
  const data = DATA.pokemon[name];
  if (!data) return;

  const s = `sim-${side}`;
  const info = document.getElementById(`${s}-info`);
  const jaName = ja('pokemon', name);
  info.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
      ${spriteImg(name, 40)}
      <div>
        <div style="font-weight:700">${esc(jaName)}</div>
        <div>${data.types.map(t => typeBadge(t)).join(' ')}</div>
      </div>
    </div>`;

  // Formes
  if (data.formes && data.formes.length > 1) {
    info.innerHTML += `<div style="font-size:.75rem;margin-top:2px">${data.formes.map(f =>
      `<span class="btn btn-sm btn-outline" style="margin:1px;padding:2px 6px;font-size:.7rem;cursor:pointer" data-forme="${esc(f)}">${esc(ja('pokemon', f) || f)}</span>`
    ).join('')}</div>`;
    info.querySelectorAll('[data-forme]').forEach(btn => {
      btn.addEventListener('click', () => {
        const forme = btn.dataset.forme;
        document.getElementById(`${s}-search`).value = ja('pokemon', forme) || forme;
        document.getElementById(`${s}-search`).dataset.key = forme;
        simSelectPokemon(side, forme);
      });
    });
  }

  // Update learnset filter
  if (state._moveEntries && data.learnset) {
    const learnset = new Set(data.learnset);
    state._moveEntries.length = 0;
    for (const m of Object.keys(DATA.moves).sort()) {
      if (learnset.has(m)) state._moveEntries.push(m);
    }
  }

  // Ability
  const abilWrap = document.getElementById(`${s}-ability-wrap`);
  const abilSel = document.getElementById(`${s}-ability`);
  if (data.abilities.length > 0) {
    abilWrap.classList.remove('hidden');
    abilSel.innerHTML = data.abilities.map(a => `<option value="${a}">${ja('abilities', a) || a}</option>`).join('');
    if (!data.abilities.includes(state.ability)) state.ability = data.abilities[0];
    abilSel.value = state.ability;
    abilSel.onchange = e => { state.ability = e.target.value; };
  }

  simUpdateStats(side);
}

function simUpdateStats(side) {
  const state = sides[side];
  if (!state.name) return;
  const stats = DMG.getStats(state);
  if (!stats) return;
  const s = `sim-${side}`;
  let total = 0;
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    const el = document.getElementById(`${s}-val-${stat}`);
    if (el) {
      el.textContent = stats[stat];
      if (state.natureMods?.plus === stat) el.style.color = '#e74c3c';
      else if (state.natureMods?.minus === stat) el.style.color = '#3498db';
      else el.style.color = '';
    }
    total += (state.sp[stat] || 0);
  }
  const totalEl = document.getElementById(`${s}-sp-total`);
  if (totalEl) {
    totalEl.textContent = `${total}/66`;
    totalEl.classList.toggle('over', total > 66);
  }
}

// ===== LOAD PICKER =====
async function openSimLoadPicker(side) {
  const page = document.getElementById('page-sim');
  let picker = document.getElementById('sim-load-picker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'sim-load-picker';
    page.appendChild(picker);
  }
  const members = currentTeam?.members || [];
  const threats = await DB.getAll('threats');
  const boxAll = await DB.getAll('box');

  picker.classList.remove('hidden');
  picker.innerHTML = `
    <div class="card" style="border:2px solid var(--accent);max-height:60vh;overflow-y:auto">
      <h3>${side === 'a' ? '自分' : '相手'}に読込</h3>
      ${members.length > 0 ? `
        <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">チーム</div>
        ${members.map((m, i) => `
          <div class="team-slot pick-slot" data-src="team" data-idx="${i}">
            ${spriteImg(m.name, 28)}
            <div class="name">${esc(ja('pokemon', m.name))}</div>
            ${DATA.pokemon[m.name]?.types.map(t => typeBadge(t)).join('')||''}
          </div>`).join('')}
      ` : ''}
      ${threats.length > 0 ? `
        <hr>
        <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">仮想敵</div>
        ${threats.map(t => `
          <div class="team-slot pick-slot" data-src="threat" data-idx="${t.id}">
            ${spriteImg(t.name, 28)}
            <div class="name">${esc(ja('pokemon', t.name))}</div>
            ${DATA.pokemon[t.name]?.types.map(tp => typeBadge(tp)).join('')||''}
          </div>`).join('')}
      ` : ''}
      ${boxAll.length > 0 ? `
        <hr>
        <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">BOX</div>
        ${boxAll.map(b => `
          <div class="team-slot pick-slot" data-src="box" data-idx="${b.id}">
            ${spriteImg(b.name, 28)}
            <div class="name">${esc(ja('pokemon', b.name))}</div>
            ${DATA.pokemon[b.name]?.types.map(tp => typeBadge(tp)).join('')||''}
          </div>`).join('')}
      ` : ''}
      <button class="btn btn-outline mt" id="sim-pick-close">閉じる</button>
    </div>`;

  picker.querySelector('#sim-pick-close').addEventListener('click', () => picker.classList.add('hidden'));
  picker.querySelectorAll('.pick-slot').forEach(slot => {
    slot.addEventListener('click', async () => {
      let src;
      if (slot.dataset.src === 'team') {
        src = members[parseInt(slot.dataset.idx)];
      } else if (slot.dataset.src === 'threat') {
        src = threats.find(t => t.id === parseInt(slot.dataset.idx));
      } else {
        src = boxAll.find(b => b.id === parseInt(slot.dataset.idx));
      }
      if (!src) return;
      const state = sides[side];
      Object.assign(state, JSON.parse(JSON.stringify(src)));
      picker.classList.add('hidden');

      // Restore UI
      const s = `sim-${side}`;
      const searchEl = document.getElementById(`${s}-search`);
      const jaName = ja('pokemon', state.name);
      searchEl.value = jaName !== state.name ? `${jaName} (${state.name})` : jaName;
      searchEl.dataset.key = state.name;
      simSelectPokemon(side, state.name);
      // Restore SP
      for (const stat of ['hp','at','df','sa','sd','sp']) {
        const input = document.getElementById(`${s}-sp-${stat}`);
        if (input) input.value = state.sp[stat] || 0;
      }
      // Restore moves
      for (let i = 0; i < 4; i++) {
        const input = document.getElementById(`${s}-move-${i}`);
        if (input) {
          const m = state.moves[i];
          input.value = m ? `${ja('moves', m)} (${m})` : '';
          input.dataset.key = m || '';
        }
      }
      // Restore item
      const itemEl = document.getElementById(`${s}-item-search`);
      if (itemEl && state.item) {
        itemEl.value = ja('items', state.item);
        itemEl.dataset.key = state.item;
      }
      // Restore ability
      const abilSel = document.getElementById(`${s}-ability`);
      if (abilSel && state.ability) abilSel.value = state.ability;
      // Restore nature
      updateNatureDisplay(s, state);
      simUpdateStats(side);
      showToast(`${ja('pokemon', src.name)} を読込`);
    });
  });
}

// ===== BATTLE =====

function startBattle() {
  if (!sides.a.name || !sides.b.name) {
    showToast('両方のポケモンを選択してください');
    return;
  }
  const statsA = DMG.getStats(sides.a);
  const statsB = DMG.getStats(sides.b);
  if (!statsA || !statsB) return;

  runtime = {
    a: { hp: statsA.hp, maxHp: statsA.hp, toxicCount: 0, leechSeed: false, selectedMove: '', boosts: { at: 0, df: 0, sa: 0, sd: 0, sp: 0 } },
    b: { hp: statsB.hp, maxHp: statsB.hp, toxicCount: 0, leechSeed: false, selectedMove: '', boosts: { at: 0, df: 0, sa: 0, sd: 0, sp: 0 } },
  };
  turnLog = [];
  turnNum = 0;

  // Copy boosts from setup
  for (const s of ['a','b']) {
    sides[s].boosts = { ...runtime[s].boosts };
    sides[s].status = '';
    sides[s].currentHP = null;
  }

  renderBattle();
}

function renderBattle() {
  const el = document.getElementById('sim-battle');
  el.classList.remove('hidden');

  el.innerHTML = `
    <div class="sim-sides" style="margin-top:6px">
      ${renderBattleSide('a')}
      ${renderBattleSide('b')}
    </div>
    <div class="card" style="margin-top:6px">
      <div class="col2">
        <div>
          <label>自分の状態異常</label>
          <select id="sim-status-a" style="font-size:.75rem">
            <option value="">なし</option><option value="brn">やけど</option>
            <option value="psn">どく</option><option value="tox">もうどく</option>
            <option value="par">まひ</option>
          </select>
        </div>
        <div>
          <label>相手の状態異常</label>
          <select id="sim-status-b" style="font-size:.75rem">
            <option value="">なし</option><option value="brn">やけど</option>
            <option value="psn">どく</option><option value="tox">もうどく</option>
            <option value="par">まひ</option>
          </select>
        </div>
      </div>
      <div class="col2" style="margin-top:4px">
        <label><input type="checkbox" id="sim-leech-a"> 自分にやどりぎ</label>
        <label><input type="checkbox" id="sim-leech-b"> 相手にやどりぎ</label>
      </div>
      <div class="col2" style="margin-top:4px">
        ${renderBoostSelect('a')}
        ${renderBoostSelect('b')}
      </div>
    </div>
    <div class="sim-actions">
      <button class="btn btn-sm" id="sim-exec" style="background:var(--accent);flex:2">ターン実行</button>
      <button class="btn btn-sm btn-outline" id="sim-eot">ターン終了時処理</button>
      <button class="btn btn-sm btn-danger" id="sim-reset">リセット</button>
    </div>
    <div id="sim-log" class="sim-turn-log">
      <h3>ターン履歴</h3>
      ${turnLog.length === 0 ? '<div style="font-size:.8rem;color:var(--fg2)">対戦開始！技を選んでターン実行</div>' : renderLog()}
    </div>
  `;

  // Status selects
  for (const s of ['a','b']) {
    const sel = document.getElementById(`sim-status-${s}`);
    sel.value = sides[s].status || '';
    sel.addEventListener('change', e => {
      sides[s].status = e.target.value;
      if (e.target.value === 'tox') runtime[s].toxicCount = 0;
    });
    // Leech seed
    const lsEl = document.getElementById(`sim-leech-${s}`);
    lsEl.checked = runtime[s].leechSeed;
    lsEl.addEventListener('change', e => { runtime[s].leechSeed = e.target.checked; });
    // Boosts
    for (const stat of ['at','df','sa','sd','sp']) {
      const bel = document.getElementById(`sim-boost-${s}-${stat}`);
      if (bel) {
        bel.value = runtime[s].boosts[stat] || 0;
        bel.addEventListener('change', e => {
          runtime[s].boosts[stat] = parseInt(e.target.value);
          sides[s].boosts[stat] = parseInt(e.target.value);
        });
      }
    }
  }

  // HP adjust buttons
  for (const s of ['a','b']) {
    el.querySelectorAll(`.sim-hp-adj[data-side="${s}"]`).forEach(btn => {
      btn.addEventListener('click', () => {
        const frac = parseFloat(btn.dataset.frac);
        const rt = runtime[s];
        const delta = Math.floor(rt.maxHp * Math.abs(frac)) * Math.sign(frac);
        rt.hp = Math.max(0, Math.min(rt.maxHp, rt.hp + delta));
        const label = frac > 0 ? `+${Math.abs(delta)}` : `${delta}`;
        addLog(`${s === 'a' ? '自分' : '相手'}: HP調整 ${label} → ${rt.hp}/${rt.maxHp}`);
        renderBattle();
      });
    });
    // Custom HP input
    const customBtn = el.querySelector(`#sim-hp-set-${s}`);
    customBtn?.addEventListener('click', () => {
      const input = el.querySelector(`#sim-hp-input-${s}`);
      const v = parseInt(input.value);
      if (isNaN(v)) return;
      runtime[s].hp = Math.max(0, Math.min(runtime[s].maxHp, v));
      renderBattle();
    });
  }

  // Move selection
  for (const s of ['a','b']) {
    el.querySelectorAll(`.sim-move-btn[data-side="${s}"]`).forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll(`.sim-move-btn[data-side="${s}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        runtime[s].selectedMove = btn.dataset.move;
      });
    });
  }

  // Turn execution
  document.getElementById('sim-exec').addEventListener('click', executeTurn);
  document.getElementById('sim-eot').addEventListener('click', executeEndOfTurn);
  document.getElementById('sim-reset').addEventListener('click', () => {
    document.getElementById('sim-battle').classList.add('hidden');
    showToast('リセット');
  });
}

function renderBoostSelect(side) {
  const label = side === 'a' ? '自分' : '相手';
  return `<div>
    <label style="font-size:.7rem">${label}ランク</label>
    <div style="display:flex;gap:2px;flex-wrap:wrap">
      ${['at','df','sa','sd','sp'].map(stat => `
        <div style="display:flex;align-items:center;gap:1px">
          <span style="font-size:.6rem;color:var(--fg2)">${STAT_SHORT[stat]}</span>
          <select id="sim-boost-${side}-${stat}" style="width:42px;font-size:.7rem;padding:1px">
            ${[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].map(v => `<option value="${v}"${v===0?' selected':''}>${v>=0?'+':''}${v}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderBattleSide(side) {
  const state = sides[side];
  const rt = runtime[side];
  const label = side === 'a' ? '自分' : '相手';
  const pct = rt.maxHp > 0 ? (rt.hp / rt.maxHp * 100) : 0;
  const hpClass = pct > 50 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';
  const stats = DMG.getStats(state);

  const moves = state.moves.filter(m => m && DATA.moves[m]);

  return `
    <div class="sim-side">
      <div class="sim-poke-header">
        ${spriteImg(state.name, 40)}
        <div>
          <div style="font-weight:700;font-size:.85rem">${esc(ja('pokemon', state.name))}</div>
          <div>${DATA.pokemon[state.name]?.types.map(t => typeBadge(t)).join(' ') || ''}</div>
        </div>
      </div>
      <div class="sim-hp-bar"><div class="sim-hp-fill ${hpClass}" style="width:${pct}%"></div></div>
      <div class="sim-hp-text">${rt.hp} / ${rt.maxHp}</div>
      ${stats ? `<div style="font-size:.65rem;color:var(--fg2);text-align:center">S: ${stats.sp}</div>` : ''}
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
          const isSel = runtime[side].selectedMove === m;
          const bp = move.bp || '-';
          return `<button class="sim-move-btn${isSel ? ' selected' : ''}" data-side="${side}" data-move="${esc(m)}">
            ${typeBadge(move.type)} ${esc(ja('moves', m))} <span style="color:var(--fg2);font-size:.65rem">威力${bp}</span>
            ${getRecoilFrac(m) ? `<span style="color:var(--danger);font-size:.6rem">反動</span>` : ''}
            ${getDrainFrac(m) ? `<span style="color:var(--ok);font-size:.6rem">吸収</span>` : ''}
          </button>`;
        }).join('')}
        <button class="sim-move-btn" data-side="${side}" data-move="" style="color:var(--fg2)">行動なし</button>
      </div>
    </div>`;
}

// ===== TURN EXECUTION =====

function executeTurn() {
  const moveA = runtime.a.selectedMove;
  const moveB = runtime.b.selectedMove;
  if (!moveA && !moveB) {
    showToast('少なくとも片方の行動を選択してください');
    return;
  }

  turnNum++;
  addLog(`--- ターン ${turnNum} ---`, true);

  // Determine speed
  const statsA = DMG.getStats(sides.a);
  const statsB = DMG.getStats(sides.b);
  let spdA = statsA?.sp || 0;
  let spdB = statsB?.sp || 0;
  // Apply speed boosts
  spdA = applyBoostVal(spdA, runtime.a.boosts.sp);
  spdB = applyBoostVal(spdB, runtime.b.boosts.sp);
  // Paralysis halves speed
  if (sides.a.status === 'par') spdA = Math.floor(spdA / 2);
  if (sides.b.status === 'par') spdB = Math.floor(spdB / 2);

  // Check priority
  const prioA = moveA && DATA.moves[moveA]?.priority ? 1 : 0;
  const prioB = moveB && DATA.moves[moveB]?.priority ? 1 : 0;

  let first, second;
  if (prioA > prioB) {
    first = 'a'; second = 'b';
  } else if (prioB > prioA) {
    first = 'b'; second = 'a';
  } else if (spdA >= spdB) {
    first = 'a'; second = 'b';
  } else {
    first = 'b'; second = 'a';
  }

  // Execute first attack
  const firstMove = first === 'a' ? moveA : moveB;
  if (firstMove) {
    executeAttack(first, second, firstMove);
  }

  // Execute second attack (if alive)
  const secondSide = second;
  const secondMove = secondSide === 'a' ? moveA : moveB;
  if (secondMove && runtime[secondSide].hp > 0 && runtime[first === 'a' ? 'b' : 'a'].hp > 0) {
    executeAttack(secondSide, first, secondMove);
  }

  // Check KO
  for (const s of ['a', 'b']) {
    if (runtime[s].hp <= 0) {
      addLog(`${s === 'a' ? '自分' : '相手'}の${ja('pokemon', sides[s].name)}はたおれた！`, false, 'ko-line');
    }
  }

  renderBattle();
}

function applyBoostVal(stat, boost) {
  if (boost >= 0) return Math.floor(stat * (2 + boost) / 2);
  return Math.floor(stat * 2 / (2 - boost));
}

function executeAttack(atkSide, defSide, moveName) {
  const atkLabel = atkSide === 'a' ? '自分' : '相手';
  const defLabel = defSide === 'a' ? '自分' : '相手';
  const move = DATA.moves[moveName];
  if (!move) return;

  // Status moves - just log
  if (!move.bp || move.bp === 0) {
    addLog(`${atkLabel}の${ja('moves', moveName)}！`);
    return;
  }

  // Set up temp state for DMG.calculate
  const atkState = { ...sides[atkSide], boosts: { ...runtime[atkSide].boosts }, currentHP: runtime[atkSide].hp };
  const defState = { ...sides[defSide], boosts: { ...runtime[defSide].boosts }, currentHP: runtime[defSide].hp };

  const result = DMG.calculate(atkState, defState, moveName, simField);
  if (!result) {
    addLog(`${atkLabel}の${ja('moves', moveName)}！ (計算不可)`);
    return;
  }

  if (result.typeEff === 0) {
    addLog(`${atkLabel}の${ja('moves', moveName)}！ → 効果なし`);
    return;
  }

  // Use average damage (midpoint of 16 rolls)
  const avgDmg = Math.round((result.minDmg + result.maxDmg) / 2);
  const actualDmg = Math.min(avgDmg, runtime[defSide].hp);
  runtime[defSide].hp = Math.max(0, runtime[defSide].hp - avgDmg);

  let effText = '';
  if (result.typeEff > 1) effText = ' (効果ばつぐん)';
  else if (result.typeEff < 1) effText = ' (いまひとつ)';

  addLog(`${atkLabel}の${ja('moves', moveName)}！ → ${defLabel}に${avgDmg}ダメージ (${result.minDmg}〜${result.maxDmg}, ${result.minPct}%〜${result.maxPct}%)${effText}`, false, 'dmg-line');

  // Recoil
  const recoilFrac = getRecoilFrac(moveName);
  if (recoilFrac > 0) {
    const recoilDmg = Math.floor(actualDmg * recoilFrac);
    if (recoilDmg > 0) {
      runtime[atkSide].hp = Math.max(0, runtime[atkSide].hp - recoilDmg);
      addLog(`  ${atkLabel}: 反動${recoilDmg}ダメージ → HP ${runtime[atkSide].hp}/${runtime[atkSide].maxHp}`, false, 'dmg-line');
    }
  }

  // Life Orb recoil
  if (sides[atkSide].item === 'Life Orb') {
    const loDmg = Math.floor(runtime[atkSide].maxHp / 10);
    runtime[atkSide].hp = Math.max(0, runtime[atkSide].hp - loDmg);
    addLog(`  ${atkLabel}: LO反動${loDmg} → HP ${runtime[atkSide].hp}/${runtime[atkSide].maxHp}`, false, 'dmg-line');
  }

  // Drain
  const drainFrac = getDrainFrac(moveName);
  if (drainFrac > 0) {
    const healAmt = Math.floor(actualDmg * drainFrac);
    if (healAmt > 0) {
      runtime[atkSide].hp = Math.min(runtime[atkSide].maxHp, runtime[atkSide].hp + healAmt);
      addLog(`  ${atkLabel}: ${healAmt}回復 → HP ${runtime[atkSide].hp}/${runtime[atkSide].maxHp}`, false, 'heal-line');
    }
  }

  // Contact abilities (Rough Skin, Iron Barbs)
  if (move.contact) {
    const dAbil = sides[defSide].ability;
    if (dAbil === 'Rough Skin' || dAbil === 'Iron Barbs') {
      const contactDmg = Math.floor(runtime[atkSide].maxHp / 8);
      runtime[atkSide].hp = Math.max(0, runtime[atkSide].hp - contactDmg);
      addLog(`  ${atkLabel}: ${ja('abilities', dAbil)}で${contactDmg}ダメージ → HP ${runtime[atkSide].hp}/${runtime[atkSide].maxHp}`, false, 'dmg-line');
    }
    // Rocky Helmet
    if (sides[defSide].item === 'Rocky Helmet') {
      const helmDmg = Math.floor(runtime[atkSide].maxHp / 6);
      runtime[atkSide].hp = Math.max(0, runtime[atkSide].hp - helmDmg);
      addLog(`  ${atkLabel}: ゴツゴツメットで${helmDmg}ダメージ → HP ${runtime[atkSide].hp}/${runtime[atkSide].maxHp}`, false, 'dmg-line');
    }
  }

  // Update remaining HP display
  addLog(`  ${defLabel}: HP ${runtime[defSide].hp}/${runtime[defSide].maxHp}`);
}

// ===== END OF TURN =====

function executeEndOfTurn() {
  addLog(`--- ターン終了時処理 ---`, true);

  for (const s of ['a', 'b']) {
    const label = s === 'a' ? '自分' : '相手';
    const opp = s === 'a' ? 'b' : 'a';
    const rt = runtime[s];
    if (rt.hp <= 0) continue;

    // Weather damage
    if (simField.weather === 'Sand') {
      const types = DATA.pokemon[sides[s].name]?.types || [];
      if (!types.includes('Rock') && !types.includes('Ground') && !types.includes('Steel')) {
        const dmg = Math.floor(rt.maxHp / 16);
        rt.hp = Math.max(0, rt.hp - dmg);
        addLog(`${label}: すなあらし -${dmg} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
      }
    }
    if (simField.weather === 'Snow') {
      // Snow doesn't do chip damage in Gen 9
    }

    // Leftovers
    if (sides[s].item === 'Leftovers') {
      const heal = Math.floor(rt.maxHp / 16);
      rt.hp = Math.min(rt.maxHp, rt.hp + heal);
      addLog(`${label}: たべのこし +${heal} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
    }
    // Black Sludge
    if (sides[s].item === 'Black Sludge') {
      const types = DATA.pokemon[sides[s].name]?.types || [];
      if (types.includes('Poison')) {
        const heal = Math.floor(rt.maxHp / 16);
        rt.hp = Math.min(rt.maxHp, rt.hp + heal);
        addLog(`${label}: くろいヘドロ +${heal} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
      } else {
        const dmg = Math.floor(rt.maxHp / 8);
        rt.hp = Math.max(0, rt.hp - dmg);
        addLog(`${label}: くろいヘドロ -${dmg} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
      }
    }

    // Grassy Terrain
    if (simField.terrain === 'Grassy') {
      const types = DATA.pokemon[sides[s].name]?.types || [];
      if (!types.includes('Flying')) {
        const heal = Math.floor(rt.maxHp / 16);
        rt.hp = Math.min(rt.maxHp, rt.hp + heal);
        addLog(`${label}: グラスフィールド +${heal} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
      }
    }

    // Poison
    if (sides[s].status === 'psn') {
      const dmg = Math.floor(rt.maxHp / 8);
      rt.hp = Math.max(0, rt.hp - dmg);
      addLog(`${label}: どく -${dmg} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
    }
    // Toxic
    if (sides[s].status === 'tox') {
      rt.toxicCount++;
      const dmg = Math.floor(rt.maxHp * rt.toxicCount / 16);
      rt.hp = Math.max(0, rt.hp - dmg);
      addLog(`${label}: もうどく(${rt.toxicCount}段階) -${dmg} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
    }
    // Burn
    if (sides[s].status === 'brn') {
      const dmg = Math.floor(rt.maxHp / 16);
      rt.hp = Math.max(0, rt.hp - dmg);
      addLog(`${label}: やけど -${dmg} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
    }

    // Leech Seed
    if (rt.leechSeed) {
      const dmg = Math.floor(rt.maxHp / 8);
      rt.hp = Math.max(0, rt.hp - dmg);
      const heal = Math.min(dmg, runtime[opp].maxHp - runtime[opp].hp);
      runtime[opp].hp = Math.min(runtime[opp].maxHp, runtime[opp].hp + dmg);
      addLog(`${label}: やどりぎのタネ -${dmg} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
      if (heal > 0) {
        const oppLabel = opp === 'a' ? '自分' : '相手';
        addLog(`${oppLabel}: やどりぎ回復 +${heal} → HP ${runtime[opp].hp}/${runtime[opp].maxHp}`, false, 'heal-line');
      }
    }

    // Sitrus Berry (auto at <=50%)
    if (sides[s].item === 'Sitrus Berry' && rt.hp > 0 && rt.hp <= rt.maxHp / 2) {
      const heal = Math.floor(rt.maxHp / 4);
      rt.hp = Math.min(rt.maxHp, rt.hp + heal);
      sides[s].item = ''; // consumed
      addLog(`${label}: オボンのみ発動 +${heal} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
    }
  }

  // Check KO
  for (const s of ['a', 'b']) {
    if (runtime[s].hp <= 0) {
      addLog(`${s === 'a' ? '自分' : '相手'}の${ja('pokemon', sides[s].name)}はたおれた！`, false, 'ko-line');
    }
  }

  renderBattle();
}

// ===== LOG =====

function addLog(text, isHeader = false, cls = '') {
  turnLog.push({ text, isHeader, cls });
}

function renderLog() {
  return turnLog.map(e =>
    `<div class="sim-turn-entry${e.isHeader ? ' turn-header' : ''}">${e.cls ? `<span class="${e.cls}">` : ''}${esc(e.text)}${e.cls ? '</span>' : ''}</div>`
  ).join('');
}
