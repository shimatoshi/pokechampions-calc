// Shared UI components used across calc, sim, team pages
import {
  DATA, ja, esc, spriteImg, typeBadge, STAT_SHORT,
  pokemonNames, buildNatureUI, initNatureUI, updateNatureDisplay,
  setupSearch, setupItemSearch,
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

// ===== MINI POKEMON EDITOR =====
// Compact editor used in team/threat editing. Renders HTML into containerEl, wires events.
// Returns nothing; calls onSave(state) when user clicks OK.
export function buildMiniEditor(containerEl, state, prefix, { title, onSave, onCancel }) {
  const moveEntries = getFilteredMoves(state.name);

  containerEl.innerHTML = `
    <div class="card" style="border:2px solid var(--accent)">
      <h3>${esc(title)}</h3>
      <div class="search-wrap">
        <input type="text" id="${prefix}-search" value="${esc(state.name ? ja('pokemon', state.name) : '')}" placeholder="ポケモン名..." autocomplete="off">
        <div class="search-list" id="${prefix}-list"></div>
      </div>
      <div id="${prefix}-info">${state.name ? renderPokemonInfo(state.name, 48) : ''}</div>
      ${buildNatureUI(prefix)}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="${prefix}-item-search" value="${esc(state.item ? ja('items', state.item) : '')}" placeholder="もちもの検索..." autocomplete="off">
        <div class="search-list" id="${prefix}-item-list"></div>
      </div>
      <label>とくせい</label>
      <select id="${prefix}-ability"></select>
      <label>SP配分</label>
      ${['hp','at','df','sa','sd','sp'].map(stat => `
        <div class="sp-row">
          <span class="sp-label">${STAT_SHORT[stat]}</span>
          <input type="number" id="${prefix}-sp-${stat}" min="0" max="32" value="${state.sp?.[stat] || 0}">
        </div>
      `).join('')}
      <label>わざ</label>
      ${[0,1,2,3].map(i => `
        <div class="search-wrap" style="margin-bottom:4px">
          <input type="text" id="${prefix}-move-${i}" value="${esc(state.moves[i] ? ja('moves', state.moves[i]) : '')}" placeholder="わざ${i+1}..." autocomplete="off">
          <div class="search-list" id="${prefix}-movelist-${i}"></div>
        </div>
      `).join('')}
      <div class="row mt">
        <button class="btn" id="${prefix}-ok">OK</button>
        <button class="btn btn-outline" id="${prefix}-cancel">キャンセル</button>
      </div>
    </div>`;

  // Pokemon search
  setupSearch(document.getElementById(`${prefix}-search`), document.getElementById(`${prefix}-list`), pokemonNames, name => {
    state.name = name;
    const p = DATA.pokemon[name];
    if (!p) return;
    document.getElementById(`${prefix}-info`).innerHTML = renderPokemonInfo(name, 48);
    setupAbilitySelect(document.getElementById(`${prefix}-ability`), null, state, p);
    // Update move candidates
    moveEntries.length = 0;
    getFilteredMoves(name).forEach(m => moveEntries.push(m));
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
    setupAbilitySelect(document.getElementById(`${prefix}-ability`), null, state, DATA.pokemon[state.name]);
  }

  // Save: read back all fields from DOM
  document.getElementById(`${prefix}-ok`).addEventListener('click', () => {
    if (!state.name) return;
    state.item = document.getElementById(`${prefix}-item-search`).dataset?.key || '';
    state.ability = document.getElementById(`${prefix}-ability`).value;
    for (const stat of ['hp','at','df','sa','sd','sp'])
      state.sp[stat] = parseInt(document.getElementById(`${prefix}-sp-${stat}`).value) || 0;
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`${prefix}-move-${i}`);
      state.moves[i] = el.dataset?.key || el.value || '';
    }
    onSave(state);
  });
  document.getElementById(`${prefix}-cancel`).addEventListener('click', onCancel);
}
