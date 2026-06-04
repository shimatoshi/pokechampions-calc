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

// ===== 7. 定数ダメージ: ちきゅうなげ=50固定 =====
{
  const { DMG } = await import('../static/js/damage.js');
  const r = DMG.calculate(mon('Garchomp', ['Seismic Toss']), mon('Azumarill', []), 'Seismic Toss', {});
  assert(r.fixed && r.minDmg === 50 && r.maxDmg === 50, `fixedDamage: ちきゅうなげ50固定 (${r.minDmg}〜${r.maxDmg})`);
  // いかりのまえば: 残HP半分
  const r2 = DMG.calculate(mon('Garchomp', []), { ...mon('Azumarill', []), currentHP: 101 }, 'Super Fang', {});
  assert(r2.fixed && r2.minDmg === 50, `fixedDamage: いかりのまえば=残HP半分 (101→${r2.minDmg})`);
  // ゴーストには無効(かくとう技)
  const r3 = DMG.calculate(mon('Garchomp', []), mon('Gengar', []), 'Seismic Toss', {});
  assert(!r3 || r3.typeEff === 0 || r3.minDmg === 0, 'fixedDamage: タイプ無効は0');
}

// ===== 8. カウンター: 被物理ダメージの2倍を反射 =====
{
  setupBattle([mon('Garchomp', ['Earthquake'])], [mon('Azumarill', ['Counter'])]);
  engine.battle.rollMode.a = 'min'; engine.battle.rollMode.b = 'min';
  engine.battle.actions.a = { type: 'move', move: 'Earthquake' };
  engine.battle.actions.b = { type: 'move', move: 'Counter' };
  const aBefore = getActiveRt('a').hp, bBefore = getActiveRt('b').hp;
  executeTurn();
  const taken = bBefore - getActiveRt('b').hp;
  const reflected = aBefore - getActiveRt('a').hp;
  assert(taken > 0 && reflected === Math.floor(taken * 2), `counter: 被ダメ${taken}の2倍=${reflected}を反射`);
}

// ===== 9. おやこあい: 2発目25%が乗る =====
{
  const { DMG } = await import('../static/js/damage.js');
  const kanga = mon('Mega Kangaskhan', [], { ability: 'Parental Bond' });
  const r = DMG.calculate(kanga, mon('Azumarill', []), 'Earthquake', {});
  const single = r.perHitDamages[r.perHitDamages.length - 1];
  assert(r.parentalBond && r.maxDmg === single + Math.floor(single * 0.25),
    `parentalBond: ${single}+floor(${single}*0.25)=${r.maxDmg}`);
  // 連続技には乗らない
  const r2 = DMG.calculate(kanga, mon('Azumarill', []), 'Icicle Spear', {});
  assert(!r2.parentalBond, 'parentalBond: 連続技には乗らない');
}

// ===== 10. 連続技: 最低乱数なら2発、スキルリンクなら5発 =====
{
  setupBattle([mon('Garchomp', ['Icicle Spear'])], [mon('Azumarill', ['Earthquake'])]);
  engine.battle.rollMode.a = 'min';
  engine.battle.actions.a = { type: 'move', move: 'Icicle Spear' };
  engine.battle.actions.b = { type: 'skip' };
  executeTurn();
  const log2 = engine.battle.log.map(e => e.text).join('\n');
  assert(log2.includes('[2発]'), `multihit: 最低乱数=2発 (ログ: ${log2.match(/\[\d発\]/)?.[0]})`);

  setupBattle([mon('Garchomp', ['Icicle Spear'], { ability: 'Skill Link' })], [mon('Azumarill', ['Earthquake'])]);
  engine.battle.rollMode.a = 'random';
  engine.battle.actions.a = { type: 'move', move: 'Icicle Spear' };
  engine.battle.actions.b = { type: 'skip' };
  executeTurn();
  const log3 = engine.battle.log.map(e => e.text).join('\n');
  assert(log3.includes('[5発]'), `multihit: スキルリンク=5発 (ログ: ${log3.match(/\[\d発\]/)?.[0]})`);
}

// ===== 11. レジストリ変化技: みずびたしでタイプ変更 =====
{
  setupBattle([mon('Garchomp', ['Soak'])], [mon('Gengar', ['Earthquake'])]);
  engine.battle.actions.a = { type: 'move', move: 'Soak' };
  engine.battle.actions.b = { type: 'skip' };
  executeTurn();
  const types = engine.getEffectiveTypes('b', engine.battle.active.b);
  assert(types.length === 1 && types[0] === 'Water', `statusMove: みずびたし→みず単タイプ (${types})`);
}

// ===== 12. 追加効果: chance100のランクダウンが自動適用される =====
{
  // かみくだく: 20%防御-1 → Math.random固定で必ず発動させる
  const origRandom = Math.random;
  Math.random = () => 0; // 抽選必ず成功 / 乱数ロール最低
  setupBattle([mon('Garchomp', ['Crunch'])], [mon('Azumarill', ['Earthquake'])]);
  engine.battle.actions.a = { type: 'move', move: 'Crunch' };
  engine.battle.actions.b = { type: 'skip' };
  executeTurn();
  Math.random = origRandom;
  assert(getActiveRt('b').boosts.df === -1, `secondary: かみくだく→防御-1 (df=${getActiveRt('b').boosts.df})`);
}

// ===== 13. 追加効果: ひるみで後攻が行動できない =====
{
  const origRandom = Math.random;
  Math.random = () => 0;
  // Garchomp(S102)が先攻でエアスラ(30%ひるみ)→Azumarill(S50)は行動不能
  setupBattle([mon('Garchomp', ['Air Slash'])], [mon('Azumarill', ['Earthquake'])]);
  engine.battle.actions.a = { type: 'move', move: 'Air Slash' };
  engine.battle.actions.b = { type: 'move', move: 'Earthquake' };
  const aBefore = getActiveRt('a').hp;
  executeTurn();
  Math.random = origRandom;
  const log = engine.battle.log.map(e => e.text).join('\n');
  assert(log.includes('ひるんで動けない'), 'secondary: ひるみで後攻スキップ');
  assert(getActiveRt('a').hp === aBefore, 'secondary: ひるんだ側のダメージが入らない');
}

// ===== 14. 追加効果: タイプ免疫(ほのおタイプはやけどしない) =====
{
  const origRandom = Math.random;
  Math.random = () => 0;
  setupBattle([mon('Garchomp', ['Flamethrower'])], [mon('Charizard', ['Earthquake'])]);
  engine.battle.actions.a = { type: 'move', move: 'Flamethrower' };
  engine.battle.actions.b = { type: 'skip' };
  executeTurn();
  Math.random = origRandom;
  assert(getActiveRt('b').status === '', `secondary: ほのおタイプはやけど免疫 (status='${getActiveRt('b').status}')`);
}

// ===== 15. 確定自己効果: インファイトで防御特防-1 =====
{
  setupBattle([mon('Garchomp', ['Close Combat'])], [mon('Azumarill', ['Earthquake'])]);
  engine.battle.rollMode.a = 'min';
  engine.battle.actions.a = { type: 'move', move: 'Close Combat' };
  engine.battle.actions.b = { type: 'skip' };
  executeTurn();
  const b = getActiveRt('a').boosts;
  assert(b.df === -1 && b.sd === -1, `selfEffect: インファイト→自分の防御/特防-1 (df=${b.df}, sd=${b.sd})`);
}

// ===== 16. ちからずく: 追加効果が消失する =====
{
  const origRandom = Math.random;
  Math.random = () => 0;
  setupBattle([mon('Garchomp', ['Crunch'], { ability: 'Sheer Force' })], [mon('Azumarill', ['Earthquake'])]);
  engine.battle.actions.a = { type: 'move', move: 'Crunch' };
  engine.battle.actions.b = { type: 'skip' };
  executeTurn();
  Math.random = origRandom;
  assert((getActiveRt('b').boosts.df || 0) === 0, 'secondary: ちからずくで追加効果消失');
}

// ===== 17. 連続技の急所: 1発ごとに1/24抽選される =====
{
  const origRandom = Math.random;
  // Math.random=0: 発数2(r<0.35)、各ヒットの急所判定 0<1/24 → 全ヒット急所、ロールは最低
  Math.random = () => 0;
  setupBattle([mon('Garchomp', ['Icicle Spear'])], [mon('Azumarill', ['Earthquake'])]);
  engine.simOptions.autoCritRate = true;
  engine.battle.rollMode.a = 'random';
  engine.battle.actions.a = { type: 'move', move: 'Icicle Spear' };
  engine.battle.actions.b = { type: 'skip' };
  const before = getActiveRt('b').hp;
  executeTurn();
  Math.random = origRandom;
  engine.simOptions.autoCritRate = false;
  const log = engine.battle.log.map(e => e.text).join('\n');
  assert(log.includes('[2発, 急所2発!]'), `multihit-crit: 全ヒット急所 (${log.match(/\[.*?\]/)?.[0]})`);
  // 急所(1.5倍)が乗っている = 非急所最低ロール×2発より大きい
  const { DMG } = await import('../static/js/damage.js');
  const rNorm = DMG.calculate(mon('Garchomp', []), mon('Azumarill', []), 'Icicle Spear', {});
  const dealt = before - getActiveRt('b').hp;
  assert(dealt > rNorm.perHitDamages[0] * 2, `multihit-crit: 急所倍率が乗る (${dealt} > ${rNorm.perHitDamages[0] * 2})`);
}

console.log(failed ? `\n${failed} test(s) FAILED` : '\nall engine tests passed');
process.exit(failed ? 1 : 0);
