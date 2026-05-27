// Shared UI components used across calc, sim, team pages
import { DATA, ja, esc, spriteImg, typeBadge, STAT_SHORT } from './app.js';
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
  wrapEl.classList.remove('hidden');
  selectEl.innerHTML = data.abilities.map(a => `<option value="${a}">${ja('abilities', a) || a}</option>`).join('');
  if (!data.abilities.includes(state.ability)) state.ability = data.abilities[0];
  selectEl.value = state.ability;
  selectEl.onchange = e => { state.ability = e.target.value; };
}
