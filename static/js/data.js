// Data layer: game data stores, loading, names, formatting helpers
// 依存: damage.js / poke-data.js のみ（循環なし・最下層）
import { DMG } from './damage.js';
import { TYPE_JA } from './poke-data.js';

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
  return `<span class="type-badge type-${t}">${TYPE_JA[t]||t}</span>`;
}

export const STAT_JA = {hp:'HP',at:'攻撃',df:'防御',sa:'特攻',sd:'特防',sp:'素早'};
export const STAT_SHORT = {hp:'H',at:'A',df:'B',sa:'C',sd:'D',sp:'S'};

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
  // 習得技データはバックグラウンドで取得（起動をブロックしない）
  fetch('data/data_learnsets.json').then(r => r.json()).then(ls => {
    for (const [name, moves] of Object.entries(ls)) {
      if (DATA.pokemon[name]) DATA.pokemon[name].learnset = moves;
    }
  }).catch(() => {});
}

// ===== SHOWDOWN-STYLE TEXT FORMAT =====
export function toShowdownText(poke) {
  const p = DATA.pokemon[poke.name];
  if (!p) return '';
  const jaName = ja('pokemon', poke.name);
  const itemStr = poke.item ? ` @ ${ja('items', poke.item)}` : '';
  // Showdown標準の "ニックネーム (種族名)" 形式。ニックが無い/種族名と同じなら種族名のみ
  const nick = (poke.nickname || '').trim();
  const head = nick && nick !== jaName ? `${nick} (${jaName})` : jaName;
  const lines = [`${head}${itemStr}`];

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
