// battle-engine.js のスモークテスト（DOM不要、nodeで実行）
// 用法: node scripts/test-engine.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'static');

// data.js の fetch('data/xxx.json') をローカルファイル読みに差し替え
globalThis.fetch = async (rel) => {
  const p = path.join(staticDir, rel);
  if (!fs.existsSync(p)) return { ok: false, json: async () => ({}) };
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};

const { loadData, DATA } = await import('../static/js/data.js');
await loadData();

const engine = await import('../static/js/battle-engine.js');
const {
  parties, selection, field, fieldTurns, hazards, simOptions,
  initBattle, getActive, getActiveRt, executeTurn, executeEndOfTurn,
  undoBattle, canUndo,
} = engine;

let failed = 0;
function assert(cond, label) {
  if (cond) { console.log(`OK  ${label}`); }
  else { failed++; console.error(`NG  ${label}`); }
}
function mon(name, moves, extra = {}) {
  return {
    name, moves,
    sp: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
    boosts: {}, natureMods: { plus: '', minus: '' },
    item: '', ability: '', status: '',
    ...extra,
  };
}
function setupBattle(aMons, bMons) {
  parties.a.length = 0; parties.b.length = 0;
  aMons.forEach(m => parties.a.push(m));
  bMons.forEach(m => parties.b.push(m));
  selection.a = parties.a.map((_, i) => i);
  selection.b = parties.b.map((_, i) => i);
  field.weather = ''; field.terrain = '';
  initBattle();
}

// 決定論的に: 命中判定オフ・最低乱数
simOptions.autoAccuracy = false;
simOptions.autoCritRate = false;

// ===== 1. 初期化: HPが実数値で入る =====
{
  setupBattle([mon('Garchomp', ['Earthquake'])], [mon('Azumarill', ['Earthquake'])]);
  const rt = getActiveRt('a');
  assert(engine.battle && rt.hp > 100 && rt.hp === rt.maxHp, `initBattle: HP初期化 (Garchomp ${rt.hp}/${rt.maxHp})`);
}

// ===== 2. ダメージ適用: 地震でHPが減る =====
{
  setupBattle([mon('Garchomp', ['Earthquake'])], [mon('Pikachu', ['Earthquake'])]);
  engine.battle.rollMode.a = 'min';
  engine.battle.actions.a = { type: 'move', move: 'Earthquake' };
  engine.battle.actions.b = { type: 'skip' };
  const before = getActiveRt('b').hp;
  executeTurn();
  const after = getActiveRt('b').hp;
  assert(after < before, `executeTurn: ダメージ適用 (Pikachu ${before}→${after})`);
}

// ===== 3. 強制交代: 吹き飛ばされた側は行動せず、actionsがクリアされる =====
{
  // 両者Roar(-1tier同士で素早さ順)。Garchomp(S102)が先 → Pikachu側が吹き飛ばされ行動しない
  setupBattle(
    [mon('Garchomp', ['Roar'])],
    [mon('Pikachu', ['Roar']), mon('Azumarill', ['Earthquake'])],
  );
  engine.battle.actions.a = { type: 'move', move: 'Roar' };
  engine.battle.actions.b = { type: 'move', move: 'Roar' };
  const fullRender = executeTurn();
  const roarCount = engine.battle.log.filter(e => e.text.includes('ほえる') || e.text.includes('Roar')).length;
  assert(getActive('b').name === 'Azumarill', `forceSwitch: 交代先が場に出る (${getActive('b').name})`);
  assert(roarCount === 1, `forceSwitch: 吹き飛ばされた側は行動しない (Roarログ${roarCount}件)`);
  assert(engine.battle.actions.b === null, 'forceSwitch: 被害側のactionsがクリアされる');
  assert(fullRender === true, 'forceSwitch: フル再描画フラグが立つ');
}

// ===== 4. EOT: どくで最大HPの1/8減る =====
{
  setupBattle([mon('Garchomp', ['Earthquake'])], [mon('Azumarill', ['Earthquake'])]);
  const rt = getActiveRt('a');
  rt.status = 'psn';
  const before = rt.hp;
  executeEndOfTurn();
  assert(rt.hp === before - Math.floor(rt.maxHp / 8), `EOT: どくダメージ1/8 (${before}→${rt.hp})`);
}

// ===== 5. undo: 1手戻すとHPが復元される =====
{
  setupBattle([mon('Garchomp', ['Earthquake'])], [mon('Pikachu', ['Earthquake'])]);
  engine.battle.rollMode.a = 'min';
  engine.battle.actions.a = { type: 'move', move: 'Earthquake' };
  const before = getActiveRt('b').hp;
  executeTurn();
  assert(canUndo(), 'undo: スナップショットが積まれる');
  assert(undoBattle() && getActiveRt('b').hp === before, `undo: HP復元 (${getActiveRt('b').hp}===${before})`);
}

// ===== 6. 設置技: ステルスロック着地ダメージ =====
{
  setupBattle(
    [mon('Garchomp', ['Earthquake'])],
    [mon('Pikachu', ['Earthquake']), mon('Azumarill', ['Earthquake'])],
  );
  hazards.b.sr = true;
  engine.battle.actions.a = { type: 'skip' };
  engine.battle.actions.b = { type: 'switch', to: 1 };
  executeTurn();
  const rt = getActiveRt('b');
  assert(getActive('b').name === 'Azumarill' && rt.hp < rt.maxHp, `hazards: ステロ着地ダメージ (${rt.hp}/${rt.maxHp})`);
  hazards.b.sr = false;
}

console.log(failed ? `\n${failed} test(s) FAILED` : '\nall engine tests passed');
process.exit(failed ? 1 : 0);
