// Showdown形式(本アプリの出力形式 + 英語標準形式)のテキストからポケモンを取り込む
import { DATA, JA, STAT_SHORT } from './data.js';
import { makePokemonState } from './state.js';
import { showToast, openEditorModal } from './ui.js';

const norm = s => String(s || '').trim().toLowerCase();

// 英名/日本語名どちらでも内部キー(英名)に解決する
function resolve(dict, jaDict, input) {
  const q = norm(input);
  if (!q) return '';
  for (const key of Object.keys(dict || {})) if (norm(key) === q) return key;
  for (const [key, name] of Object.entries(jaDict || {})) if (norm(name) === q) return key;
  return '';
}

const EN_STAT = { hp: 'hp', atk: 'at', def: 'df', spa: 'sa', spd: 'sd', spe: 'sp' };
const SHORT_TO_KEY = Object.fromEntries(Object.entries(STAT_SHORT).map(([k, v]) => [v, k]));
const JA_STAT = { 'HP': 'hp', '攻撃': 'at', '防御': 'df', '特攻': 'sa', '特防': 'sd', '素早': 'sp' };

export function parseShowdown(text) {
  const members = [];
  const warnings = [];
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  for (const block of blocks) {
    if (members.length >= 6) { warnings.push('7匹目以降は無視しました'); break; }
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const m = makePokemonState();
    const [left, itemStr] = lines[0].split(/\s@\s/);
    let species = left.replace(/\s*\((M|F)\)\s*$/i, '').trim();
    const nickMatch = species.match(/^(.*)\(([^()]+)\)\s*$/);
    let nick = '';
    if (nickMatch && resolve(DATA.pokemon, JA.pokemon, nickMatch[2])) { nick = nickMatch[1].trim(); species = nickMatch[2]; }
    m.name = resolve(DATA.pokemon, JA.pokemon, species);
    if (!m.name) { warnings.push(`ポケモン「${species}」が見つかりません`); continue; }
    m.nickname = nick;
    if (itemStr) {
      m.item = resolve(DATA.items, JA.items, itemStr);
      if (!m.item) warnings.push(`${species}: もちもの「${itemStr.trim()}」が不明`);
    }
    const moves = [];
    for (const line of lines.slice(1)) {
      if (/^-/.test(line)) {
        const mv = resolve(DATA.moves, JA.moves, line.replace(/^-\s*/, ''));
        if (mv) moves.push(mv); else warnings.push(`${species}: 技「${line.replace(/^-\s*/, '')}」が不明`);
        continue;
      }
      const natureLine = line.match(/^(\S+)\s+nature$/i); // Showdown標準の "Adamant Nature"
      const kv = natureLine ? ['', 'nature', natureLine[1]] : line.match(/^([^:：]+)[:：]\s*(.*)$/);
      if (!kv) continue;
      const key = norm(kv[1]), val = kv[2].trim();
      if (key === '特性' || key === 'ability') {
        const own = (DATA.pokemon[m.name]?.abilities || []).find(a => norm(a) === norm(val) || norm(JA.abilities?.[a]) === norm(val));
        m.ability = own || resolve(JA.abilities, JA.abilities, val) || '';
        if (!m.ability) warnings.push(`${species}: 特性「${val}」が不明`);
      } else if (key === '性格' || key === 'nature') {
        const name = resolve(DATA.natures, JA.natures, val.replace(/\s*(nature|\(.*\))\s*$/i, '').trim());
        const mods = DATA.natures[name];
        if (mods && mods[0] && mods[1]) m.natureMods = { plus: mods[0], minus: mods[1] };
        else if (!name) warnings.push(`${species}: 性格「${val}」が不明`);
      } else if (key === 'sp') {
        for (const part of val.split('/')) {
          const p = part.trim().match(/^([HABCDS])\s*(\d+)$/i);
          if (p && SHORT_TO_KEY[p[1].toUpperCase()]) m.sp[SHORT_TO_KEY[p[1].toUpperCase()]] = Math.min(32, +p[2]);
        }
      } else if (key === 'evs') {
        // 標準Showdown形式のEV(0-252)は8で割ってSP(0-32)に換算
        for (const part of val.split('/')) {
          const p = part.trim().match(/^(\d+)\s*(\S+)$/);
          const stat = p && (EN_STAT[norm(p[2])] || JA_STAT[p[2]]);
          if (stat) m.sp[stat] = Math.min(32, Math.round(+p[1] / 8));
        }
      }
    }
    m.moves = [...moves, '', '', '', ''].slice(0, 4);
    members.push(m);
  }
  return { members, warnings };
}

// テキスト貼付ダイアログ。取り込めたポケモンを onImport(members) に渡す
export function openShowdownImport(parentEl, onImport, title = 'テキストから取り込み') {
  const { modal, inner } = openEditorModal('showdown-import-modal', parentEl);
  inner.innerHTML = `
    <div class="card" style="margin-top:8vh">
      <h3>${title}</h3>
      <p class="u-hint u-my4">本アプリのテキスト出力、またはShowdown形式を貼り付けてください（最大6匹・空行で区切り）</p>
      <label for="sd-import-text">テキスト</label>
      <textarea id="sd-import-text" rows="12" placeholder="ガブリアス @ こだわりスカーフ&#10;特性: さめはだ&#10;性格: ようき (+素早 -特攻)&#10;SP: A32 / S32&#10;- じしん&#10;- げきりん"></textarea>
      <div class="row mt">
        <button class="btn btn-outline" id="sd-import-close">閉じる</button>
        <button class="btn" id="sd-import-go">取り込む</button>
      </div>
    </div>`;
  inner.querySelector('#sd-import-close').addEventListener('click', () => modal.remove());
  inner.querySelector('#sd-import-go').addEventListener('click', () => {
    const { members, warnings } = parseShowdown(inner.querySelector('#sd-import-text').value);
    if (!members.length) { showToast(warnings[0] || '取り込めるポケモンがありません', 'error'); return; }
    modal.remove();
    onImport(members);
    showToast(`${members.length}匹を取り込みました${warnings.length ? `（注意: ${warnings[0]}${warnings.length > 1 ? ` ほか${warnings.length - 1}件` : ''}）` : ''}`);
  });
}
