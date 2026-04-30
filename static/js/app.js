// Pokemon Champions Calculator - Core (entry point)
import { DB } from './db.js';
import { DMG } from './damage.js';
import { initCalcPage, updateStatDisplay } from './calc.js';
import { initTeamPage, renderTeamPage } from './team.js';
import { renderBoxPage } from './box.js';
import { initRecordsPage, renderRecordsPage } from './records.js';

export let DATA = { pokemon: {}, moves: {}, types: {}, natures: {}, items: {} };
export let JA = { pokemon: {}, moves: {}, natures: {}, items: {}, abilities: {} };
export let pokemonNames = [];

// ===== HELPERS =====
export function ja(type, en) {
  return JA[type]?.[en] || en;
}

// HTML escape for user-controlled strings inserted into innerHTML
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function spriteUrl(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `img/${slug}.webp`;
}

export function spriteImg(name, size = 40) {
  return `<img src="${spriteUrl(name)}" alt="${esc(ja('pokemon', name))}" width="${size}" height="${size}" style="image-rendering:pixelated" onerror="this.style.display='none'">`;
}

export function typeBadge(t) {
  const typeJa = {Normal:'ノーマル',Fire:'ほのお',Water:'みず',Grass:'くさ',Electric:'でんき',Ice:'こおり',Fighting:'かくとう',Poison:'どく',Ground:'じめん',Flying:'ひこう',Psychic:'エスパー',Bug:'むし',Rock:'いわ',Ghost:'ゴースト',Dragon:'ドラゴン',Dark:'あく',Steel:'はがね',Fairy:'フェアリー',Stellar:'ステラ'};
  return `<span class="type-badge type-${t}">${typeJa[t]||t}</span>`;
}

export const STAT_JA = {hp:'HP',at:'攻撃',df:'防御',sa:'特攻',sd:'特防',sp:'素早'};
export const STAT_SHORT = {hp:'H',at:'A',df:'B',sa:'C',sd:'D',sp:'S'};

// ===== SHOWDOWN-STYLE TEXT FORMAT =====
export function toShowdownText(poke) {
  const p = DATA.pokemon[poke.name];
  if (!p) return '';
  const jaName = ja('pokemon', poke.name);
  const itemStr = poke.item ? ` @ ${ja('items', poke.item)}` : '';
  const lines = [`${jaName}${itemStr}`];

  // Ability
  if (poke.ability) lines.push(`特性: ${ja('abilities', poke.ability) || poke.ability}`);

  // Nature
  const nm = poke.natureMods || {};
  if (nm.plus && nm.minus) {
    const en = DMG.findNatureName(nm.plus, nm.minus);
    lines.push(`性格: ${ja('natures', en)} (+${STAT_JA[nm.plus]} -${STAT_JA[nm.minus]})`);
  }

  // SP
  const sp = poke.sp || {};
  const spParts = ['hp','at','df','sa','sd','sp'].filter(s => sp[s]).map(s => `${STAT_SHORT[s]}${sp[s]}`);
  if (spParts.length > 0) lines.push(`SP: ${spParts.join(' / ')}`);

  // Real stats
  const stats = DMG.getStats(poke);
  if (stats) {
    lines.push(`実数値: ${stats.hp}-${stats.at}-${stats.df}-${stats.sa}-${stats.sd}-${stats.sp}`);
  }

  // Moves
  const moves = (poke.moves || []).filter(Boolean);
  for (const m of moves) lines.push(`- ${ja('moves', m) || m}`);

  return lines.join('\n');
}

export function showdownHTML(poke) {
  const text = toShowdownText(poke);
  return `<pre class="sd-text">${esc(text)}</pre>`;
}

export function teamToShowdownText(team) {
  return team.members.map(m => toShowdownText(m)).join('\n\n');
}

// ===== DATA LOADING =====
export async function loadData() {
  const keys = ['data_pokemon','data_moves','data_types','data_natures','data_items',
                'names_pokemon_ja','names_moves_ja','names_natures_ja','names_items_ja','names_abilities_ja'];
  const fetches = keys.map(k => fetch(`data/${k}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})));
  const [pokemon, moves, types, natures, items, jaPoke, jaMoves, jaNatures, jaItems, jaAbilities] = await Promise.all(fetches);
  DATA = { pokemon, moves, types, natures, items };
  JA.pokemon = jaPoke; JA.moves = jaMoves; JA.natures = jaNatures; JA.items = jaItems; JA.abilities = jaAbilities;
  pokemonNames = Object.keys(pokemon).sort();
  DMG.init(types, moves, pokemon, natures);
}

// ===== NAVIGATION =====
export function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('show');
  document.querySelector(`nav button[data-page="${page}"]`).classList.add('active');
}

// ===== AUTOCOMPLETE SEARCH =====
export function setupSearch(inputEl, listEl, entries, onSelect) {
  inputEl.addEventListener('input', () => {
    const q = inputEl.value.toLowerCase();
    if (q.length < 1) { listEl.classList.remove('open'); return; }
    const matches = entries.filter(e => {
      const name = typeof e === 'string' ? e : e.key;
      const jaName = typeof e === 'string' ? (JA.pokemon[e] || JA.moves[e] || '') : (e.ja || '');
      return name.toLowerCase().includes(q) || jaName.includes(q);
    }).slice(0, 30);
    listEl.innerHTML = matches.map(e => {
      const name = typeof e === 'string' ? e : e.key;
      const jaName = typeof e === 'string' ? (JA.pokemon[name] || JA.moves[name] || '') : (e.ja || '');
      const p = DATA.pokemon[name];
      const types = p ? p.types.map(t => typeBadge(t)).join('') : '';
      const moveInfo = DATA.moves[name] ? `<span class="type-badge type-${DATA.moves[name].type}">${DATA.moves[name].type}</span>${DATA.moves[name].cat === 'Status' ? '<span style="font-size:.6rem;color:var(--fg2);margin-left:2px">変化</span>' : ''}` : '';
      const display = jaName ? `${jaName} <span style="color:var(--fg2);font-size:.7rem">${name}</span>` : name;
      return `<div class="item" data-name="${name}">${p ? spriteImg(name, 28) : ''}<span>${display}</span>${types}${moveInfo}</div>`;
    }).join('');
    listEl.classList.add('open');
  });
  // pointerdown で blur を抑止: tap中に input が blur → setTimeout(150ms) で list が閉じ、
  // 後続 click が item に届かない競合を防ぐ
  listEl.addEventListener('pointerdown', e => e.preventDefault());
  listEl.addEventListener('click', e => {
    const item = e.target.closest('.item');
    if (!item) return;
    const name = item.dataset.name;
    const jaName = JA.pokemon[name] || JA.moves[name] || name;
    inputEl.value = jaName !== name ? `${jaName} (${name})` : name;
    inputEl.dataset.key = name;
    listEl.classList.remove('open');
    inputEl.blur();
    onSelect(name);
  });
  inputEl.addEventListener('blur', () => {
    setTimeout(() => {
      listEl.classList.remove('open');
      if (!inputEl.dataset.key && inputEl.value.trim()) {
        inputEl.dataset.key = inputEl.value.trim();
        onSelect(inputEl.value.trim());
      }
    }, 150);
  });
}

// ===== ITEM SEARCH =====
export function setupItemSearch(inputEl, listEl, entries, onSelect) {
  inputEl.addEventListener('input', () => {
    const q = inputEl.value.toLowerCase();
    if (q.length < 1) { listEl.classList.remove('open'); return; }
    const matches = entries.filter(e =>
      e.key.toLowerCase().includes(q) || e.ja.toLowerCase().includes(q)
    ).slice(0, 20);
    listEl.innerHTML = matches.map(e => {
      const display = e.ja !== e.key ? `${e.ja} <span style="color:var(--fg2);font-size:.7rem">${e.key}</span>` : e.key;
      return `<div class="item" data-name="${e.key}"><span>${display}</span></div>`;
    }).join('');
    if (matches.length === 0) {
      listEl.innerHTML = '<div class="item" style="color:var(--fg2)">該当なし</div>';
    }
    listEl.classList.add('open');
  });
  // Clear item on empty input
  inputEl.addEventListener('change', () => {
    if (!inputEl.value.trim()) { inputEl.dataset.key = ''; onSelect(''); }
  });
  listEl.addEventListener('pointerdown', e => e.preventDefault());
  listEl.addEventListener('click', e => {
    const item = e.target.closest('.item');
    if (!item || !item.dataset.name) return;
    const name = item.dataset.name;
    const jaName = ja('items', name);
    inputEl.value = jaName !== name ? `${jaName}` : name;
    inputEl.dataset.key = name;
    listEl.classList.remove('open');
    inputEl.blur();
    onSelect(name);
  });
  inputEl.addEventListener('blur', () => {
    setTimeout(() => listEl.classList.remove('open'), 150);
  });
}

// ===== POKEMON STATE =====
export function makePokemonState() {
  return {
    name: '',
    natureMods: { plus: '', minus: '' },
    sp: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
    boosts: { at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
    item: '',
    ability: '',
    status: '',
    moves: ['', '', '', ''],
    currentHP: null,  // null = 満タン (実数値max)、それ以外は具体的なHP値
    disguiseIntact: false  // ばけのかわ/Ice Face: 1発無効化が残っているか
  };
}

export const atkState = makePokemonState();
export const defState = makePokemonState();
export const fieldState = { weather: '', terrain: '', doubles: false, crit: false, stealthRock: false, spikes: 0, pinch: false };

// ===== NATURE UI =====
export function buildNatureUI(side) {
  const stats = ['at','df','sa','sd','sp'];
  return `
    <div class="nature-grid" id="${side}-nature-grid">
      <div style="font-size:.7rem;color:var(--fg2);margin-bottom:2px">性格補正（タップで+/-切替）</div>
      ${stats.map(s => `
        <div class="nature-btn" data-stat="${s}" id="${side}-nbtn-${s}">
          <span class="nature-mark" id="${side}-nmark-${s}"></span>
          <span>${STAT_JA[s]}</span>
        </div>
      `).join('')}
      <div class="nature-name" id="${side}-nature-name" style="font-size:.7rem;color:var(--fg2);margin-top:2px"></div>
    </div>`;
}

export function initNatureUI(side, state) {
  const stats = ['at','df','sa','sd','sp'];
  for (const s of stats) {
    const btn = document.getElementById(`${side}-nbtn-${s}`);
    btn.addEventListener('click', () => {
      if (state.natureMods.plus === s) {
        state.natureMods.plus = '';
      } else if (state.natureMods.minus === s) {
        state.natureMods.minus = '';
      } else if (!state.natureMods.plus) {
        state.natureMods.plus = s;
      } else if (!state.natureMods.minus) {
        if (s !== state.natureMods.plus) state.natureMods.minus = s;
      } else {
        if (s !== state.natureMods.plus) state.natureMods.minus = s;
      }
      updateNatureDisplay(side, state);
      updateStatDisplay(side, state);
    });
  }
  updateNatureDisplay(side, state);
}

export function updateNatureDisplay(side, state) {
  const stats = ['at','df','sa','sd','sp'];
  for (const s of stats) {
    const mark = document.getElementById(`${side}-nmark-${s}`);
    const btn = document.getElementById(`${side}-nbtn-${s}`);
    if (state.natureMods.plus === s) {
      mark.textContent = '+'; mark.style.color = '#e74c3c';
      btn.classList.add('nature-plus'); btn.classList.remove('nature-minus');
    } else if (state.natureMods.minus === s) {
      mark.textContent = '-'; mark.style.color = '#3498db';
      btn.classList.remove('nature-plus'); btn.classList.add('nature-minus');
    } else {
      mark.textContent = ''; btn.classList.remove('nature-plus','nature-minus');
    }
  }
  const nameEl = document.getElementById(`${side}-nature-name`);
  if (state.natureMods.plus && state.natureMods.minus) {
    const en = DMG.findNatureName(state.natureMods.plus, state.natureMods.minus);
    nameEl.textContent = `${ja('natures', en)} (${en})`;
  } else if (!state.natureMods.plus && !state.natureMods.minus) {
    nameEl.textContent = '補正なし';
  } else {
    nameEl.textContent = '（+と-を1つずつ選択）';
  }
}

// ===== RESTORE STATE TO UI (shared by calc & team) =====
export function restoreStateToUI(side, state) {
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    const input = document.getElementById(`${side}-sp-${stat}`);
    if (input) input.value = state.sp[stat] || 0;
  }
  if (side === 'atk') {
    for (let i = 0; i < 4; i++) {
      const input = document.getElementById(`${side}-move-${i}`);
      if (input) {
        const m = state.moves[i];
        input.value = m ? `${ja('moves', m)} (${m})` : '';
        input.dataset.key = m || '';
      }
    }
  }
  const itemEl = document.getElementById(`${side}-item-search`);
  if (itemEl && state.item) {
    itemEl.value = ja('items', state.item);
    itemEl.dataset.key = state.item;
  } else if (itemEl) {
    itemEl.value = '';
    itemEl.dataset.key = '';
  }
  if (side === 'def') {
    const hpInput = document.getElementById('def-current-hp');
    if (hpInput) hpInput.value = state.currentHP != null ? state.currentHP : '';
  }
  updateNatureDisplay(side, state);
  updateStatDisplay(side, state);
}

// ===== TOAST =====
export function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:8px 20px;border-radius:20px;font-size:.85rem;z-index:999;opacity:0;transition:opacity .3s';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.style.opacity = '1');
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2000);
}

// ===== INIT =====
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  DB.persist();
  await loadData();
  initCalcPage();
  initTeamPage();
  initRecordsPage();
  renderBoxPage();
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      switchPage(page);
      if (page === 'box') renderBoxPage();
      if (page === 'team') renderTeamPage();
      if (page === 'records') renderRecordsPage();
    });
  });
}
init();
