// Shared UI components used across calc, sim, team pages
import {
  DATA, ja, esc, spriteImg, typeBadge, STAT_SHORT, STAT_JA,
  pokemonNames, buildNatureUI, initNatureUI, updateNatureDisplay,
  setupSearch, setupItemSearch, showToast,
} from './app.js';
import { DMG } from './damage.js';

// ===== POKEMON INFO DISPLAY =====
export function renderPokemonInfo(name, size = 40) {
  const data = DATA.pokemon[name];
  if (!data) return '';
  const jaName = ja('pokemon', name);
  return `<div style="display:flex;align-items:center;gap:6px;margin:4px 0">
    ${spriteImg(name, size)}
    <div>
      <div style="font-weight:700">${esc(jaName)}</div>
      <div>${data.types.map(t => typeBadge(t)).join(' ')}</div>
    </div>
  </div>`;
}

// ===== POKEMON DETAIL CARD (stats + moves) =====
// rt (optional) = battle runtime: { hp, maxHp, boosts, status } — shows live HP & rank
export function renderPokemonDetailCard(poke, rt = null) {
  const data = DATA.pokemon[poke.name];
  if (!data) return '';
  const stats = DMG.getStats(poke) || {};
  const nm = poke.natureMods || {};
  const natureEn = (nm.plus && nm.minus) ? DMG.findNatureName(nm.plus, nm.minus) : '';
  const sp = poke.sp || {};
  const STATS = ['hp','at','df','sa','sd','sp'];

  const statRows = STATS.map(s => {
    const base = stats[s] ?? '-';
    const isPlus = nm.plus === s, isMinus = nm.minus === s;
    const col = isPlus ? '#e74c3c' : isMinus ? '#3498db' : '';
    const rank = (rt && s !== 'hp') ? (rt.boosts?.[s] || 0) : 0;
    const rankTag = rank ? `<span style="color:${rank>0?'var(--ok)':'var(--danger)'};font-size:.6rem;margin-left:2px">${rank>0?'+':''}${rank}</span>` : '';
    const spv = sp[s] ? `<span style="font-size:.55rem;color:var(--fg2)">SP${sp[s]}</span>` : '';
    return `<div style="display:flex;flex-direction:column;align-items:center;min-width:38px">
      <span style="font-size:.6rem;color:var(--fg2)">${STAT_JA[s]}</span>
      <span style="font-weight:700;color:${col}">${base}${rankTag}</span>
      ${spv}
    </div>`;
  }).join('');

  const moves = (poke.moves || []).filter(Boolean);
  const moveTags = moves.length ? moves.map(m => {
    const md = DATA.moves[m];
    const t = md ? `<span class="type-badge type-${md.type}">${md.type}</span>` : '';
    const cat = md?.cat === 'Status' ? '変化' : md ? `威${md.bp||'-'}` : '';
    return `<div style="display:flex;align-items:center;gap:3px;font-size:.7rem;background:var(--bg);border-radius:4px;padding:2px 5px">
      ${t}<span>${esc(ja('moves', m) || m)}</span><span style="color:var(--fg2);font-size:.6rem">${cat}</span>
    </div>`;
  }).join('') : '<span style="font-size:.7rem;color:var(--fg2)">技未設定</span>';

  const hpLine = rt ? (() => {
    const pct = rt.maxHp > 0 ? (rt.hp / rt.maxHp * 100) : 0;
    const c = pct > 50 ? 'var(--ok)' : pct > 25 ? 'var(--warn)' : 'var(--danger)';
    return `<div style="margin:4px 0">
      <div style="display:flex;justify-content:space-between;font-size:.7rem"><span>HP</span><span>${rt.hp}/${rt.maxHp}${rt.status ? ` (${rt.status})` : ''}</span></div>
      <div style="height:5px;background:var(--bg3);border-radius:3px"><div style="width:${pct}%;height:100%;background:${c};border-radius:3px"></div></div>
    </div>`;
  })() : '';

  return `<div style="background:var(--bg2,var(--bg));border-radius:var(--radius);padding:8px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      ${spriteImg(poke.name, 48)}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700">${esc(ja('pokemon', poke.name))}${poke.item ? `<span style="font-size:.7rem;color:var(--fg2)"> @ ${esc(ja('items', poke.item))}</span>` : ''}</div>
        <div>${data.types.map(t => typeBadge(t)).join(' ')}</div>
        <div style="font-size:.65rem;color:var(--fg2)">
          ${poke.ability ? `特性: ${esc(ja('abilities', poke.ability) || poke.ability)}` : ''}
          ${natureEn ? ` ／ ${esc(ja('natures', natureEn) || natureEn)} (+${STAT_JA[nm.plus]}-${STAT_JA[nm.minus]})` : ''}
        </div>
      </div>
    </div>
    ${hpLine}
    <div style="display:flex;justify-content:space-between;gap:2px;margin:4px 0">${statRows}</div>
    <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">${moveTags}</div>
  </div>`;
}

// Full-screen modal wrapper around the detail card
export function showPokemonDetailModal(poke, rt = null) {
  let modal = document.getElementById('poke-detail-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'poke-detail-modal'; document.body.appendChild(modal); }
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:300;overflow-y:auto;padding:14px;display:flex;align-items:flex-start;justify-content:center';
  modal.innerHTML = `<div class="card" style="max-width:380px;width:100%;margin-top:8vh">
    ${renderPokemonDetailCard(poke, rt)}
    <button class="btn btn-outline mt" style="width:100%" id="poke-detail-close">閉じる</button>
  </div>`;
  const close = () => modal.remove();
  modal.querySelector('#poke-detail-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

// ===== STAT DISPLAY WITH NATURE COLORING =====
// Updates stat value elements and SP total for a given ID prefix (e.g. 'atk', 'def', 'ed')
export function updateStatDisplay(prefix, state) {
  if (!state.name) return;
  const stats = DMG.getStats(state);
  if (!stats) return;
  let total = 0;
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    const el = document.getElementById(`${prefix}-val-${stat}`);
    if (el) {
      el.textContent = stats[stat];
      if (state.natureMods?.plus === stat) el.style.color = '#e74c3c';
      else if (state.natureMods?.minus === stat) el.style.color = '#3498db';
      else el.style.color = '';
    }
    total += (state.sp[stat] || 0);
  }
  const totalEl = document.getElementById(`${prefix}-sp-total`);
  if (totalEl) {
    totalEl.textContent = `${total}/66`;
    totalEl.classList.toggle('over', total > 66);
  }
  return stats;
}

// ===== LEARNSET FILTERING =====
// Returns sorted array of move names the pokemon can learn
let _sortedMoves = null;
export function getFilteredMoves(pokeName) {
  if (!_sortedMoves) _sortedMoves = Object.keys(DATA.moves).sort();
  const data = DATA.pokemon[pokeName];
  if (!data?.learnset) return [..._sortedMoves];
  const ls = new Set(data.learnset);
  return _sortedMoves.filter(m => ls.has(m));
}

// ===== ABILITY DROPDOWN =====
export function setupAbilitySelect(selectEl, wrapEl, state, data) {
  if (!data?.abilities?.length) return;
  if (wrapEl) wrapEl.classList.remove('hidden');
  selectEl.innerHTML = data.abilities.map(a => `<option value="${a}">${ja('abilities', a) || a}</option>`).join('');
  if (!data.abilities.includes(state.ability)) state.ability = data.abilities[0];
  selectEl.value = state.ability;
  selectEl.onchange = e => { state.ability = e.target.value; };
}

// ===== POKEMON EDITOR (shared by team/threat/box/sim) =====
// Renders the editor card into containerEl and wires all events.
// options:
//   title        — heading text
//   saveLabel    — OK button label (default 'OK')
//   onSave(state)   — called with DOM-read-back state on OK
//   onCancel()      — called on cancel
//   extraButtons — [{ label, style, handler(state) }] 追加アクション(BOXに保存等)。
//                  handlerにも読み戻し済みstateが渡る
export function buildMiniEditor(containerEl, state, prefix, { title, saveLabel = 'OK', onSave, onCancel, extraButtons = [] }) {
  // 古いデータはsp/moves/natureModsを持たないことがある
  if (!state.sp) state.sp = { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 };
  if (!state.moves) state.moves = ['', '', '', ''];
  if (!state.natureMods) state.natureMods = { plus: '', minus: '' };
  const moveEntries = getFilteredMoves(state.name);

  containerEl.innerHTML = `
    <div class="card" style="border:2px solid var(--accent)">
      <h3>${esc(title)}</h3>
      <div class="search-wrap">
        <input type="text" id="${prefix}-search" value="${esc(state.name ? `${ja('pokemon', state.name)} (${state.name})` : '')}" placeholder="ポケモン名..." autocomplete="off">
        <div class="search-list" id="${prefix}-list"></div>
      </div>
      <div id="${prefix}-info">${state.name ? renderPokemonInfo(state.name, 48) : ''}</div>
      ${buildNatureUI(prefix)}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="${prefix}-item-search" value="${esc(state.item ? ja('items', state.item) : '')}" placeholder="もちもの検索..." autocomplete="off">
        <div class="search-list" id="${prefix}-item-list"></div>
      </div>
      <div id="${prefix}-ability-wrap" class="${state.name ? '' : 'hidden'}">
        <label>とくせい</label>
        <select id="${prefix}-ability"></select>
      </div>
      <label>SP配分 <span id="${prefix}-sp-total" class="sp-total">0/66</span></label>
      <div id="${prefix}-sp">
        ${['hp','at','df','sa','sd','sp'].map(stat => `
          <div class="sp-row">
            <span class="sp-label">${STAT_SHORT[stat]}</span>
            <button class="sp-btn" data-side="${prefix}" data-stat="${stat}" data-act="0">0</button>
            <button class="sp-btn" data-side="${prefix}" data-stat="${stat}" data-act="-">-</button>
            <input type="number" id="${prefix}-sp-${stat}" min="0" max="32" value="${state.sp?.[stat] || 0}" data-stat="${stat}">
            <button class="sp-btn" data-side="${prefix}" data-stat="${stat}" data-act="+">+</button>
            <button class="sp-btn" data-side="${prefix}" data-stat="${stat}" data-act="32">32</button>
            <span class="sp-val" id="${prefix}-val-${stat}">-</span>
          </div>
        `).join('')}
      </div>
      <label>わざ</label>
      ${[0,1,2,3].map(i => `
        <div class="search-wrap" style="margin-bottom:4px">
          <input type="text" id="${prefix}-move-${i}" value="${esc(state.moves[i] ? `${ja('moves', state.moves[i])} (${state.moves[i]})` : '')}" placeholder="わざ${i+1}..." autocomplete="off">
          <div class="search-list" id="${prefix}-movelist-${i}"></div>
        </div>
      `).join('')}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn" id="${prefix}-ok" style="flex:1">${esc(saveLabel)}</button>
        ${extraButtons.map((b, i) => `<button class="btn btn-outline" id="${prefix}-extra-${i}" style="flex:1;${b.style || ''}">${esc(b.label)}</button>`).join('')}
        <button class="btn btn-outline" id="${prefix}-cancel">キャンセル</button>
      </div>
    </div>`;
  // イベントは毎回作り直されるカード要素に付ける
  // (再利用されるcontainerElに付けると、再renderのたびに古いstateを掴んだ
  //  リスナーが積み重なる)
  const card = containerEl.firstElementChild;

  // Pokemon search
  setupSearch(document.getElementById(`${prefix}-search`), document.getElementById(`${prefix}-list`), pokemonNames, name => {
    state.name = name;
    const p = DATA.pokemon[name];
    if (!p) return;
    document.getElementById(`${prefix}-info`).innerHTML = renderPokemonInfo(name, 48);
    setupAbilitySelect(document.getElementById(`${prefix}-ability`), document.getElementById(`${prefix}-ability-wrap`), state, p);
    // Update move candidates
    moveEntries.length = 0;
    getFilteredMoves(name).forEach(m => moveEntries.push(m));
    updateStatDisplay(prefix, state);
  });

  // Nature
  initNatureUI(prefix, state);
  updateNatureDisplay(prefix, state);

  // Item
  const itemEntries = Object.keys(DATA.items).sort().map(k => ({ key: k, ja: ja('items', k) }));
  const itemInput = document.getElementById(`${prefix}-item-search`);
  itemInput.dataset.key = state.item || '';
  setupItemSearch(itemInput, document.getElementById(`${prefix}-item-list`), itemEntries, name => { state.item = name; });

  // Moves
  for (let i = 0; i < 4; i++) {
    const inp = document.getElementById(`${prefix}-move-${i}`);
    inp.dataset.key = state.moves[i] || '';
    setupSearch(inp, document.getElementById(`${prefix}-movelist-${i}`), moveEntries, name => { state.moves[i] = name; });
  }

  // Ability (pre-existing)
  if (state.name && DATA.pokemon[state.name]) {
    setupAbilitySelect(document.getElementById(`${prefix}-ability`), document.getElementById(`${prefix}-ability-wrap`), state, DATA.pokemon[state.name]);
  }

  // SP inputs + +/-/0/32 buttons
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    document.getElementById(`${prefix}-sp-${stat}`).addEventListener('input', e => {
      state.sp[stat] = Math.max(0, Math.min(32, parseInt(e.target.value) || 0));
      updateStatDisplay(prefix, state);
    });
  }
  card.addEventListener('click', e => {
    const btn = e.target.closest('.sp-btn');
    if (!btn || btn.dataset.side !== prefix) return;
    const { stat, act } = btn.dataset;
    let val = state.sp[stat] || 0;
    if (act === '+') val = Math.min(32, val + 1);
    else if (act === '-') val = Math.max(0, val - 1);
    else if (act === '0') val = 0;
    else if (act === '32') val = 32;
    state.sp[stat] = val;
    document.getElementById(`${prefix}-sp-${stat}`).value = val;
    updateStatDisplay(prefix, state);
  });

  updateStatDisplay(prefix, state);

  // Read back all fields from DOM into state
  const readBack = () => {
    state.item = document.getElementById(`${prefix}-item-search`).dataset.key || '';
    const abilSel = document.getElementById(`${prefix}-ability`);
    if (abilSel && abilSel.value) state.ability = abilSel.value;
    for (const stat of ['hp','at','df','sa','sd','sp'])
      state.sp[stat] = parseInt(document.getElementById(`${prefix}-sp-${stat}`).value) || 0;
    for (let i = 0; i < 4; i++)
      state.moves[i] = document.getElementById(`${prefix}-move-${i}`).dataset.key || '';
    return state;
  };

  document.getElementById(`${prefix}-ok`).addEventListener('click', () => {
    if (!state.name) { showToast('ポケモンを選択してください'); return; }
    onSave(readBack());
  });
  extraButtons.forEach((b, i) => {
    document.getElementById(`${prefix}-extra-${i}`).addEventListener('click', () => {
      if (!state.name) { showToast('ポケモンを選択してください'); return; }
      b.handler(readBack());
    });
  });
  document.getElementById(`${prefix}-cancel`).addEventListener('click', onCancel);
}

// Full-screen modal container for the editor. Returns { modal, inner } —
// buildMiniEditor renders into inner; close with modal.remove().
export function openEditorModal(id, parentEl) {
  let modal = document.getElementById(id);
  if (!modal) { modal = document.createElement('div'); modal.id = id; parentEl.appendChild(modal); }
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;overflow-y:auto;padding:10px';
  modal.innerHTML = '';
  const inner = document.createElement('div');
  inner.style.cssText = 'max-width:400px;margin:0 auto';
  modal.appendChild(inner);
  return { modal, inner };
}
