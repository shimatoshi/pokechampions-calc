// Pokemon Champions - Battle Engine (DOM非依存の対戦ロジック)
// sim.js(UI)から呼ばれる。document/windowに触れないことでnodeテスト可能に保つ。
import { DATA, ja } from './data.js';
import { DMG } from './damage.js';
import {
  applyBoost, FORCE_SWITCH_MOVES, WEATHER_ROCK, TERRAIN_EXTENDER, getMoveAccuracy,
  getRecoilFrac as _getRecoilFrac, getDrainFrac as _getDrainFrac,
  getEffectiveMoveType as _getEffectiveMoveType,
} from './poke-data.js';
import { MOVE_EFFECTS } from './move-effects.js';

export function getRecoilFrac(m) { return _getRecoilFrac(m, DATA.moves[m]); }
export function getDrainFrac(m) { return _getDrainFrac(m, DATA.moves[m]); }
export function getEffectiveMoveType(m, ability) { return _getEffectiveMoveType(m, DATA.moves[m], ability); }

// ===== Mega evolution / forme helpers =====
export function getMegaFormes(poke) {
  const data = DATA.pokemon[poke.name];
  if (!data?.formes) return [];
  return data.formes.filter(f => (f.startsWith('Mega ') || f.includes('-Mega')) && f !== poke.name);
}
export function getMegaForme(poke) {
  const megas = getMegaFormes(poke);
  return megas.length === 1 ? megas[0] : null; // single mega only; multi uses buttons
}
export function isMega(name) { return name.startsWith('Mega ') || name.includes('-Mega'); }

export function isAegislash(name) { return name === 'Aegislash' || name === 'Aegislash-Shield' || name === 'Aegislash-Blade'; }
export function getAegislashAlternateForme(name) {
  if (name === 'Aegislash' || name === 'Aegislash-Shield') return 'Aegislash-Blade';
  return 'Aegislash-Shield';
}

// Generic forme change: keep HP ratio, update stats
export function applyFormeChange(side, selIdx, newName) {
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

// ===== SHARED STATE =====
export const parties = { a: [], b: [] };
export const selection = { a: [], b: [] };
export const field = { weather: '', terrain: '' };

// 天候/フィールド/特殊フィールドのターン管理（バトル中のみ有効）
// 各カウンタ = 残りターン数（0で解除）。発動ターン自体も1消費する。
export const fieldTurns = {
  weather: 0, terrain: 0, trickRoom: 0, gravity: 0,
  tailwind: { a: 0, b: 0 },
};
// 設置技（hazards[side] = side が交代で着地したとき発動するもの）
export const hazards = {
  a: { sr: false, spikes: 0, tspikes: 0 },
  b: { sr: false, spikes: 0, tspikes: 0 },
};
function resetHazards() {
  for (const s of ['a','b']) { hazards[s].sr = false; hazards[s].spikes = 0; hazards[s].tspikes = 0; }
}

// ===== Battle state =====
export let battle = null; // initialized by initBattle()
let _undoStack = []; // snapshots for undo
let _preBattleParties = null; // parties snapshot before battle (for restoring on end)

// 自動判定オプション（UIのチェックボックスから設定）
export const simOptions = {
  autoAccuracy: true,   // 命中判定を行う
  autoCritRate: false,  // 抽選に急所率(1/24)を含める
};

function makeBattleRuntime(poke) {
  const stats = DMG.getStats(poke);
  return {
    hp: stats?.hp || 1, maxHp: stats?.hp || 1,
    toxicCount: 0, leechSeed: false, cursed: false,
    boosts: { at:0, df:0, sa:0, sd:0, sp:0 },
    disguise: (poke.ability === 'Disguise' || poke.ability === 'Ice Face'),
    status: '',
    typeOverride: null,  // みずびたし等によるタイプ変更 (array or null)
    addedType: null,     // もりののろい/トリックオアトリートで追加されたタイプ
    charged: false,      // じゅうでん状態
    burnedUp: false,     // もえつきるでほのおタイプ消滅
  };
}

// ===== UNDO: snapshot / restore =====
export function snapshotBattle() {
  // Deep-clone battle state + parties (forme changes mutate parties)
  const snap = {
    battle: {
      active: { ...battle.active },
      rt: { a: battle.rt.a.map(r => ({ ...r, boosts: { ...r.boosts } })),
             b: battle.rt.b.map(r => ({ ...r, boosts: { ...r.boosts } })) },
      log: battle.log.slice(),
      turnNum: battle.turnNum,
      actions: { a: battle.actions.a ? { ...battle.actions.a } : null,
                 b: battle.actions.b ? { ...battle.actions.b } : null },
      megaUsed: { ...battle.megaUsed },
      rollMode: { ...battle.rollMode },
      crit: { ...battle.crit },
      mod: { a: { ...battle.mod.a }, b: { ...battle.mod.b } },
    },
    field: { weather: field.weather, terrain: field.terrain },
    fieldTurns: { weather: fieldTurns.weather, terrain: fieldTurns.terrain, trickRoom: fieldTurns.trickRoom, gravity: fieldTurns.gravity, tailwind: { ...fieldTurns.tailwind } },
    hazards: { a: { ...hazards.a }, b: { ...hazards.b } },
    parties: {
      a: parties.a.map(p => JSON.parse(JSON.stringify(p))),
      b: parties.b.map(p => JSON.parse(JSON.stringify(p))),
    },
  };
  _undoStack.push(snap);
  if (_undoStack.length > 30) _undoStack.shift(); // cap memory
}

export function canUndo() { return _undoStack.length > 0; }

// 1手戻す。戻せたらtrue（描画はUI側の責務）
export function undoBattle() {
  if (_undoStack.length === 0) return false;
  const snap = _undoStack.pop();
  battle.active = snap.battle.active;
  battle.rt = snap.battle.rt;
  battle.log = snap.battle.log;
  battle.turnNum = snap.battle.turnNum;
  battle.actions = snap.battle.actions;
  battle.megaUsed = snap.battle.megaUsed;
  battle.rollMode = snap.battle.rollMode;
  battle.crit = snap.battle.crit;
  battle.mod = snap.battle.mod;
  // Restore field / fieldTurns / hazards
  if (snap.field) { field.weather = snap.field.weather; field.terrain = snap.field.terrain; }
  if (snap.fieldTurns) { Object.assign(fieldTurns, { weather: snap.fieldTurns.weather, terrain: snap.fieldTurns.terrain, trickRoom: snap.fieldTurns.trickRoom, gravity: snap.fieldTurns.gravity }); fieldTurns.tailwind.a = snap.fieldTurns.tailwind.a; fieldTurns.tailwind.b = snap.fieldTurns.tailwind.b; }
  if (snap.hazards) { hazards.a = { ...snap.hazards.a }; hazards.b = { ...snap.hazards.b }; }
  // Restore parties (forme changes are written directly to parties)
  for (const s of ['a','b']) {
    parties[s].length = 0;
    snap.parties[s].forEach(p => parties[s].push(p));
  }
  return true;
}

// ===== BATTLE INIT =====
// 検証(選出0匹)とレンダリングはUI側。ここでは状態構築のみ。
export function initBattle() {
  battle = {
    active: { a: 0, b: 0 }, // index into selection arrays
    rt: { a: [], b: [] },    // runtime per selected pokemon
    log: [],
    turnNum: 0,
    actions: { a: null, b: null }, // {type:'move',move:''} or {type:'switch',to:idx}
    megaUsed: { a: false, b: false }, // 1回限り
    rollMode: { a: 'random', b: 'random' }, // 'random' | 'min' | 'max' | 'avg'
    crit: { a: false, b: false },
    mod: { a: { bp: null, moveType: null, stab2x: false, hits: null },
           b: { bp: null, moveType: null, stab2x: false, hits: null } },
  };
  for (const s of ['a','b']) {
    battle.rt[s] = selection[s].map(pi => makeBattleRuntime(parties[s][pi]));
  }
  resetHazards();
  // 天候/フィールドが設定済みなら開始時から5ターン計測（延長アイテムは交代/着地で再評価しないので簡易に5固定）
  fieldTurns.weather = field.weather ? 5 : 0;
  fieldTurns.terrain = field.terrain ? 5 : 0;
  fieldTurns.trickRoom = 0; fieldTurns.gravity = 0;
  fieldTurns.tailwind.a = 0; fieldTurns.tailwind.b = 0;
  battle.log.push({ text: 'バトル開始！', isHeader: true });
  _undoStack = [];
  _preBattleParties = { a: parties.a.map(p => JSON.parse(JSON.stringify(p))),
                         b: parties.b.map(p => JSON.parse(JSON.stringify(p))) };
}

export function getActive(side) {
  return parties[side][selection[side][battle.active[side]]];
}
export function getActiveRt(side) {
  return battle.rt[side][battle.active[side]];
}

// Restore parties to pre-battle state (undo mega evolutions etc.)
export function restorePreBattleParties() {
  if (!_preBattleParties) return;
  for (const s of ['a','b']) {
    parties[s].length = 0;
    _preBattleParties[s].forEach(p => parties[s].push(p));
  }
  _preBattleParties = null;
}

// 延長アイテム(各種ロック/グラウンドコート)持ちがいれば8T、なければ5T
export function weatherRockTurns(kind) {
  for (const s of ['a','b']) {
    const poke = getActive(s);
    if (kind === 'weather' && field.weather && poke.item === WEATHER_ROCK[field.weather]) return 8;
    if (kind === 'terrain' && poke.item === TERRAIN_EXTENDER) return 8;
  }
  return 5;
}

// ===== LOG =====
export function addLog(text, isHeader = false, cls = '') {
  battle.log.push({ text, isHeader, cls });
}

// ===== TURN EXECUTION =====
// 戻り値: フル再描画が必要ならtrue（交代/強制交代があった場合）。
// 行動未選択の検証(toast)はUI側で行う。
export function executeTurn() {
  const actA = battle.actions.a;
  const actB = battle.actions.b;
  snapshotBattle();
  const forcedSides = new Set(); // このターン強制交代が発生した側
  // ターン中の被ダメージ記録 (カウンター/ミラーコート/メタルバースト用)
  const turnDmg = { a: { Physical: 0, Special: 0 }, b: { Physical: 0, Special: 0 } };

  battle.turnNum++;
  addLog(`--- ターン ${battle.turnNum} ---`, true);

  // Switches always go first
  for (const s of ['a','b']) {
    const act = s === 'a' ? actA : actB;
    if (act?.type === 'switch') doSwitch(s, act.to);
  }

  // Skip (flinch / miss / unable to move)
  for (const s of ['a','b']) {
    const act = s === 'a' ? actA : actB;
    if (act?.type === 'skip') addLog(`${s === 'a' ? '自分' : '相手'}は行動しなかった`);
  }

  // Then attacks by speed
  const attackers = [];
  if (actA?.type === 'move' && actA.move) attackers.push({ side: 'a', move: actA.move });
  if (actB?.type === 'move' && actB.move) attackers.push({ side: 'b', move: actB.move });

  if (attackers.length === 2) {
    // Sort by priority then speed
    // データのpriorityはboolean(先制技のみtrue)。強制交代技は実機では-6priorityで
    // 最後に行動するため、-1tierとして扱う
    const prioOf = (m) => DATA.moves[m]?.priority ? 1 : FORCE_SWITCH_MOVES.has(m) ? -1 : 0;
    const prioA = prioOf(attackers[0].move);
    const prioB = prioOf(attackers[1].move);
    if (prioA !== prioB) {
      attackers.sort((a, b) => prioOf(b.move) - prioOf(a.move));
    } else {
      const spdA = getEffectiveSpeed('a');
      const spdB = getEffectiveSpeed('b');
      const tr = fieldTurns.trickRoom > 0;
      // 通常は速い方が先攻。トリックルーム中は遅い方が先攻。
      if (!tr && spdB > spdA) attackers.reverse();
      else if (tr && spdB < spdA) attackers.reverse();
    }
  }

  for (let i = 0; i < attackers.length; i++) {
    const { side, move } = attackers[i];
    const opp = side === 'a' ? 'b' : 'a';
    if (getActiveRt(side).hp <= 0) continue;
    if (getActiveRt(opp).hp <= 0) continue;
    // 強制交代させられた側: 元の個体の行動は失われ、交代先も行動しない
    if (forcedSides.has(side)) continue;
    executeAttack(side, opp, move, forcedSides, turnDmg);
  }

  // Check KO
  for (const s of ['a','b']) {
    if (getActiveRt(s).hp <= 0) {
      addLog(`${s === 'a' ? '自分' : '相手'}の${ja('pokemon', getActive(s).name)}はたおれた！`, false, 'ko-line');
    }
  }

  // Keep move actions for next turn (強制交代された側は別個体になるためクリア)
  battle.actions.a = (actA?.type === 'move' && !forcedSides.has('a')) ? actA : null;
  battle.actions.b = (actB?.type === 'move' && !forcedSides.has('b')) ? actB : null;
  const switched = actA?.type === 'switch' || actB?.type === 'switch';
  return switched || forcedSides.size > 0;
}

export function getEffectiveSpeed(side) {
  const poke = getActive(side);
  const rt = getActiveRt(side);
  const stats = DMG.getStats(poke);
  let spd = stats?.sp || 0;
  spd = applyBoost(spd, rt.boosts.sp);
  if (rt.status === 'par') spd = Math.floor(spd / 2);
  if (poke.item === 'Choice Scarf') spd = Math.floor(spd * 1.5);
  if (fieldTurns.tailwind[side] > 0) spd *= 2;
  return spd;
}

function doSwitch(side, toIdx) {
  const label = side === 'a' ? '自分' : '相手';
  const oldPoke = getActive(side);
  const oldRt = getActiveRt(side);
  // Reset volatile status on switch out
  oldRt.leechSeed = false;
  oldRt.cursed = false;
  oldRt.boosts = { at:0, df:0, sa:0, sd:0, sp:0 };
  oldRt.toxicCount = 0;
  oldRt.typeOverride = null;
  oldRt.addedType = null;
  oldRt.charged = false;
  oldRt.burnedUp = false;

  battle.active[side] = toIdx;
  const newPoke = getActive(side);
  addLog(`${label}: ${ja('pokemon', oldPoke.name)} → ${ja('pokemon', newPoke.name)} に交代！`);
  applyHazardsOnSwitch(side);
}

// 交代着地時の設置技ダメージ／状態異常を適用
function applyHazardsOnSwitch(side) {
  const rt = getActiveRt(side);
  if (rt.hp <= 0) return;
  const poke = getActive(side);
  const label = side === 'a' ? '自分' : '相手';
  if (poke.item === 'Heavy-Duty Boots') return; // あつぞこブーツで全無効
  const h = hazards[side];
  const types = getEffectiveTypes(side, battle.active[side]);
  const grounded = !types.includes('Flying') && poke.ability !== 'Levitate' && poke.item !== 'Air Balloon';

  // ステルスロック（接地問わず、いわ相性）
  if (h.sr) {
    const eff = DMG.getTypeEff('Rock', types);
    const d = Math.floor(rt.maxHp * eff / 8);
    if (d > 0) { rt.hp = Math.max(0, rt.hp - d); addLog(`  ${label}: ステルスロック -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line'); }
  }
  // まきびし（接地のみ）
  if (h.spikes > 0 && grounded && rt.hp > 0) {
    const layers = Math.min(3, h.spikes);
    const d = layers === 1 ? Math.floor(rt.maxHp / 8) : layers === 2 ? Math.floor(rt.maxHp / 6) : Math.floor(rt.maxHp / 4);
    rt.hp = Math.max(0, rt.hp - d); addLog(`  ${label}: まきびし -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
  }
  // どくびし（接地のみ。どくタイプは吸収して除去、はがね/既に状態異常は無効）
  if (h.tspikes > 0 && grounded && rt.hp > 0) {
    if (types.includes('Poison')) {
      h.tspikes = 0; addLog(`  ${label}: どくびしを吸収して除去した`);
    } else if (!types.includes('Steel') && poke.ability !== 'Immunity' && !rt.status) {
      if (h.tspikes >= 2) { rt.status = 'tox'; rt.toxicCount = 0; addLog(`  ${label}: どくびしでもうどく状態になった`, false, 'dmg-line'); }
      else { rt.status = 'psn'; addLog(`  ${label}: どくびしでどく状態になった`, false, 'dmg-line'); }
    }
  }
  if (rt.hp <= 0) addLog(`${label}の${ja('pokemon', poke.name)}はたおれた！`, false, 'ko-line');
}

// 連続技の発数を決定。modHits(手動指定)が最優先
function rollHitCount(move, modHits, rollMode, atkPoke) {
  if (modHits != null) return modHits;
  if (!move.hits) return 1;
  if (typeof move.hits === 'number') return move.hits;
  const [a, b] = move.hits;
  if (atkPoke.ability === 'Skill Link') return b; // スキルリンク: 常に最大
  if (atkPoke.item === 'Loaded Dice') return Math.random() < 0.5 ? b - 1 : b; // いかさまダイス: 上位2つ
  if (rollMode === 'min') return a;
  if (rollMode === 'max') return b;
  if (rollMode === 'avg') return Math.round((a + b) / 2);
  if (a === 2 && b === 5) {
    // 本家準拠: 2発35% / 3発35% / 4発15% / 5発15%
    const r = Math.random();
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
  }
  return a + Math.floor(Math.random() * (b - a + 1)); // その他は一様
}

// 連続技の合計ダメージ。randomは1発ごとに個別乱数
function rollMultiHitDamage(result, count, rollMode) {
  const per = result.perHitDamages || [result.minDmg];
  const n = per.length;
  if (result.fixed || rollMode === 'min') return per[0] * count;
  if (rollMode === 'max') return per[n - 1] * count;
  if (rollMode === 'avg') return Math.round(per.reduce((s, d) => s + d, 0) / n * count);
  let total = 0;
  for (let i = 0; i < count; i++) total += per[Math.floor(Math.random() * n)];
  return total;
}

function executeAttack(atkSide, defSide, moveName, forcedSides, turnDmg) {
  const atkLabel = atkSide === 'a' ? '自分' : '相手';
  const defLabel = defSide === 'a' ? '自分' : '相手';
  const move = DATA.moves[moveName];
  if (!move) return;

  // 命中判定
  if (simOptions.autoAccuracy) {
    let acc = getMoveAccuracy(moveName, move);
    if (acc > 0 && acc < 100) {
      const shown = acc;
      if (fieldTurns.gravity > 0) acc = Math.floor(acc * 5 / 3);
      if (Math.random() * 100 >= acc) {
        addLog(`${atkLabel}の${ja('moves', moveName)}！ → 外した (命中${shown}%${fieldTurns.gravity>0?'/じゅうりょく補正':''})`);
        return;
      }
    }
  }

  // 強制交代技（Roar/Whirlwind/Dragon Tail/Circle Throw）
  // ※ダメージを伴うもの(Dragon Tail等)はダメージ処理後に交代させるため、ここではbp0のもののみ
  if (FORCE_SWITCH_MOVES.has(moveName) && (!move.bp || move.bp === 0)) {
    addLog(`${atkLabel}の${ja('moves', moveName)}！`);
    forceSwitch(defSide, forcedSides);
    return;
  }

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
    // 変化技のシミュ内効果はレジストリ(move-effects.js)から
    const fx = MOVE_EFFECTS[moveName];
    if (fx?.statusMove) {
      fx.statusMove({
        atkRt: getActiveRt(atkSide), defRt: getActiveRt(defSide),
        atkLabel, defLabel, moveJa: ja('moves', moveName),
        log: (text, cls) => addLog(text, false, cls || ''),
        atkTypes: getEffectiveTypes(atkSide, battle.active[atkSide]),
      });
    } else {
      addLog(`${atkLabel}の${ja('moves', moveName)}！`);
    }
    return;
  }

  const atkPoke = getActive(atkSide);
  const defPoke = getActive(defSide);
  const atkRt = getActiveRt(atkSide);
  const defRt = getActiveRt(defSide);

  // Build effective types from runtime overrides
  const atkTypes = getEffectiveTypes(atkSide, battle.active[atkSide]);
  const defTypes = getEffectiveTypes(defSide, battle.active[defSide]);
  const atkState = { ...atkPoke, boosts: { ...atkRt.boosts }, currentHP: atkRt.hp, status: atkRt.status, _types: atkTypes };
  const defState = { ...defPoke, boosts: { ...defRt.boosts }, currentHP: defRt.hp, status: defRt.status, disguiseIntact: defRt.disguise, _types: defTypes };

  // Crit: 手動チェック、または急所率(1/24)抽選（ランダム時のみ）
  let isCrit = battle.crit[atkSide];
  if (!isCrit && simOptions.autoCritRate && battle.rollMode[atkSide] === 'random' && Math.random() < 1/24) isCrit = true;
  const mod = battle.mod[atkSide];
  const faintedCount = battle.rt[atkSide].filter(r => r.hp <= 0).length;
  const calcField = { ...field,
    ...(isCrit && { crit: true }),
    ...(faintedCount > 0 && { faintedCount }),
    ...(atkRt.charged && { charged: true }),
    // ピンチ特性(もうか/げきりゅう等): HP1/3以下で自動発動
    ...(atkRt.hp * 3 <= atkRt.maxHp && { pinch: true }),
    ...(mod.bp != null && { bpOverride: mod.bp }),
    ...(mod.moveType && { moveTypeOverride: mod.moveType }),
    ...(mod.stab2x && { stab2x: true }),
    ...(mod.hits != null && { hitsOverride: mod.hits }),
  };
  const result = DMG.calculate(atkState, defState, moveName, calcField);
  if (!result) { addLog(`${atkLabel}の${ja('moves', moveName)}！ (計算不可)`); return; }

  if (result.typeEff === 0) { addLog(`${atkLabel}の${ja('moves', moveName)}！ → 効果なし`); return; }

  // カウンター/ミラーコート/メタルバースト: ターン中の被ダメから反射
  if (result.counter) {
    const taken = result.counter.cat === 'any'
      ? turnDmg[atkSide].Physical + turnDmg[atkSide].Special
      : turnDmg[atkSide][result.counter.cat];
    if (taken <= 0) {
      addLog(`${atkLabel}の${ja('moves', moveName)}！ → しかし失敗した (このターン被ダメージなし)`);
      return;
    }
    const d = Math.floor(taken * result.counter.mult);
    defRt.hp = Math.max(0, defRt.hp - d);
    if (move.cat === 'Physical' || move.cat === 'Special') turnDmg[defSide][move.cat] += Math.min(d, defRt.maxHp);
    addLog(`${atkLabel}の${ja('moves', moveName)}！ → ${defLabel}に${d}ダメージ (被ダメ${taken}×${result.counter.mult})`, false, 'dmg-line');
    addLog(`  ${defLabel}: HP ${defRt.hp}/${defRt.maxHp}`);
    return;
  }

  // 連続技: 発数を抽選(2-5発: 35/35/15/15%)、ダメージは1発ごとに個別乱数
  const hitCount = rollHitCount(move, battle.mod[atkSide].hits, battle.rollMode[atkSide], atkPoke);

  // Disguise (連続技は1発目だけ吸収し、残りは通る)
  if (result.disguiseConsumed) {
    const abilName = defPoke.ability === 'Disguise' ? 'ばけのかわ' : 'こおりのすがた';
    const subDmg = result.minDmg;
    defRt.hp = Math.max(0, defRt.hp - subDmg);
    defRt.disguise = false;
    addLog(`${atkLabel}の${ja('moves', moveName)}！ → ${defLabel}の${abilName}がはがれた！ (${subDmg}ダメージ)`, false, 'dmg-line');
    if (move.hits && hitCount > 1 && defRt.hp > 0) {
      const defState2 = { ...defState, currentHP: defRt.hp, disguiseIntact: false };
      const r2 = DMG.calculate(atkState, defState2, moveName, calcField);
      if (r2 && !r2.counter && r2.typeEff !== 0) {
        const rest = rollMultiHitDamage(r2, hitCount - 1, battle.rollMode[atkSide]);
        defRt.hp = Math.max(0, defRt.hp - rest);
        if (move.cat === 'Physical' || move.cat === 'Special') turnDmg[defSide][move.cat] += rest;
        addLog(`  残り${hitCount - 1}発 → ${defLabel}に${rest}ダメージ`, false, 'dmg-line');
      }
    }
    addLog(`  ${defLabel}: HP ${defRt.hp}/${defRt.maxHp}`);
    return;
  }

  // Roll mode: min / avg / max
  const rollMode = battle.rollMode[atkSide];
  let useDmg, rollNote;
  if (move.hits) {
    // 連続技: 1発ごとに個別乱数で合計
    useDmg = rollMultiHitDamage(result, hitCount, rollMode);
    rollNote = ` [${hitCount}発]`;
  } else if (result.fixed) {
    // 定数ダメージ: 乱数なし
    useDmg = result.minDmg;
    rollNote = '';
  } else {
    const rolls = result.damages || [result.minDmg, result.maxDmg];
    if (rollMode === 'min') { useDmg = result.minDmg; rollNote = ' [最低乱数]'; }
    else if (rollMode === 'max') { useDmg = result.maxDmg; rollNote = ' [最高乱数]'; }
    else if (rollMode === 'avg') { useDmg = Math.round(rolls.reduce((a, b) => a + b, 0) / rolls.length); rollNote = ' [平均]'; }
    else { const idx = Math.floor(Math.random() * rolls.length); useDmg = rolls[idx]; rollNote = ` [抽選 ${85 + idx}%]`; }
  }

  // きあいのタスキ / がんじょう: 満タンから瀕死になる一撃を1で耐える
  // (連続技は2発目以降で落ちるため発動しても無意味 → 1発技のみ判定)
  let survivor = '';
  if (!move.hits && defRt.hp === defRt.maxHp && useDmg >= defRt.hp) {
    if (defPoke.item === 'Focus Sash') { useDmg = defRt.hp - 1; defPoke.item = ''; survivor = 'きあいのタスキ'; }
    else if (defPoke.ability === 'Sturdy') { useDmg = defRt.hp - 1; survivor = 'がんじょう'; }
  }
  const actualDmg = Math.min(useDmg, defRt.hp);
  defRt.hp = Math.max(0, defRt.hp - useDmg);
  if (move.cat === 'Physical' || move.cat === 'Special') turnDmg[defSide][move.cat] += actualDmg;

  let effText = '';
  if (result.typeEff > 1) effText = ' (効果ばつぐん)';
  else if (result.typeEff < 1) effText = ' (いまひとつ)';
  const rollLabel = isCrit ? ' 急所!' : '';
  addLog(`${atkLabel}の${ja('moves', moveName)}！${rollLabel} → ${defLabel}に${useDmg}ダメージ (${result.minDmg}〜${result.maxDmg}, ${result.minPct}%〜${result.maxPct}%)${effText}${rollNote}`, false, 'dmg-line');
  if (survivor) addLog(`  ${defLabel}: ${survivor}で耐えた！ (HP1)`, false, 'heal-line');

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

  // Post-attack effects (もえつきる等はレジストリのafterHitから)
  const fxAfter = MOVE_EFFECTS[moveName];
  if (fxAfter?.afterHit) {
    fxAfter.afterHit({ atkRt, defRt, atkLabel, defLabel, log: (text, cls) => addLog(text, false, cls || '') });
  }
  // いのちがけ: 命中後に自分は瀕死
  if (fxAfter?.selfFaintOnHit) {
    atkRt.hp = 0;
    addLog(`  ${atkLabel}: 力尽きた！`, false, 'ko-line');
  }
  // じゅうでん消費
  if (atkRt.charged && move.type === 'Electric') {
    atkRt.charged = false;
    addLog(`  ${atkLabel}: じゅうでんが消費された`);
  }

  // 強制交代技（ダメージ後、相手が生存していれば控えへ）
  if (FORCE_SWITCH_MOVES.has(moveName) && defRt.hp > 0) forceSwitch(defSide, forcedSides);
}

// 強制交代: 控えの生存個体からランダムに繰り出す
function forceSwitch(side, forcedSides) {
  const aliveBench = selection[side]
    .map((pi, i) => ({ i, rt: battle.rt[side][i] }))
    .filter(x => x.i !== battle.active[side] && x.rt.hp > 0);
  const label = side === 'a' ? '自分' : '相手';
  if (aliveBench.length === 0) { addLog(`  ${label}: 交代できる控えがいない`); return; }
  const pick = aliveBench[Math.floor(Math.random() * aliveBench.length)];
  addLog(`  ${label}: 強制的に交代させられた！`);
  doSwitch(side, pick.i);
  battle.actions[side] = null;
  forcedSides?.add(side);
}

// Get effective types considering runtime overrides
export function getEffectiveTypes(side, selIdx) {
  const poke = parties[side][selection[side][selIdx]];
  const rt = battle.rt[side][selIdx];
  const baseTypes = DATA.pokemon[poke.name]?.types || [];
  // みずびたし等: complete override
  let types = rt.typeOverride ? [...rt.typeOverride] : [...baseTypes];
  // もえつきる: remove Fire
  if (rt.burnedUp) types = types.filter(t => t !== 'Fire');
  // もりののろい / トリックオアトリート: add type
  if (rt.addedType && !types.includes(rt.addedType)) types.push(rt.addedType);
  return types;
}

// ===== END OF TURN =====
export function executeEndOfTurn() {
  snapshotBattle();
  addLog(`--- EOT ---`, true);
  for (const s of ['a','b']) {
    const poke = getActive(s);
    const rt = getActiveRt(s);
    const opp = s === 'a' ? 'b' : 'a';
    const oppRt = getActiveRt(opp);
    const label = s === 'a' ? '自分' : '相手';
    if (rt.hp <= 0) continue;
    // みずびたし/もえつきる等のタイプ変化を天候・地形ダメージにも反映
    const types = getEffectiveTypes(s, battle.active[s]);

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
    // Curse (のろい): 1/4 max HP per turn
    if (rt.cursed) {
      const d = Math.floor(rt.maxHp / 4); rt.hp = Math.max(0, rt.hp - d);
      addLog(`${label}: のろい -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
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
}
