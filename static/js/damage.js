// Pokemon Champions Damage Calculator Engine
import {
  PUNCH_MOVES, BITE_MOVES, SLICE_MOVES, PULSE_MOVES, BULLET_MOVES, SOUND_MOVES,
  SKIN_ABILITIES, RESIST_BERRY, TYPE_BOOST_ITEM,
  applyBoost,
} from './poke-data.js';
import { MOVE_EFFECTS } from './move-effects.js';

export const DMG = (() => {
  let typeChart = {};
  let moveDB = {};
  let pokeDB = {};
  let natureDB = {};

  function init(types, moves, pokemon, natures) {
    typeChart = types;
    moveDB = moves;
    pokeDB = pokemon;
    natureDB = natures;
  }

  // ===== STAT CALCULATION =====

  function calcHP(base, sp) {
    if (base === 1) return 1; // Shedinja
    return Math.floor((base * 2 + 31) * 50 / 100) + 50 + 10 + sp;
  }

  function calcStat(base, sp, natureMod) {
    return Math.floor((Math.floor((base * 2 + 31) * 50 / 100) + 5 + sp) * natureMod);
  }

  function getNatureMods(nature, natureMods) {
    if (natureMods && (natureMods.plus || natureMods.minus)) {
      const mods = { at: 1, df: 1, sa: 1, sd: 1, sp: 1 };
      if (natureMods.plus) mods[natureMods.plus] = 1.1;
      if (natureMods.minus) mods[natureMods.minus] = 0.9;
      return mods;
    }
    const n = natureDB[nature];
    if (!n) return { at: 1, df: 1, sa: 1, sd: 1, sp: 1 };
    const mods = { at: 1, df: 1, sa: 1, sd: 1, sp: 1 };
    const plus = Array.isArray(n) ? n[0] : n.plus;
    const minus = Array.isArray(n) ? n[1] : n.minus;
    if (plus) mods[plus] = 1.1;
    if (minus) mods[minus] = 0.9;
    return mods;
  }

  function findNatureName(plus, minus) {
    for (const [name, val] of Object.entries(natureDB)) {
      const p = Array.isArray(val) ? val[0] : val.plus;
      const m = Array.isArray(val) ? val[1] : val.minus;
      if (p === plus && m === minus) return name;
    }
    return 'Hardy';
  }

  function getStats(poke) {
    const base = pokeDB[poke.name]?.bs;
    if (!base) return null;
    const nm = getNatureMods(poke.nature, poke.natureMods);
    return {
      hp: calcHP(base.hp, poke.sp?.hp || 0),
      at: calcStat(base.at, poke.sp?.at || 0, nm.at),
      df: calcStat(base.df, poke.sp?.df || 0, nm.df),
      sa: calcStat(base.sa || base.sl, poke.sp?.sa || 0, nm.sa),
      sd: calcStat(base.sd || base.sl, poke.sp?.sd || 0, nm.sd),
      sp: calcStat(base.sp, poke.sp?.sp || 0, nm.sp)
    };
  }

  // ===== TYPE CHART =====

  function getTypeEff(atkType, defTypes) {
    let eff = 1;
    for (const dt of defTypes) {
      const chart = typeChart[atkType];
      if (!chart) continue;
      if (chart[dt] !== undefined) eff *= chart[dt];
    }
    return eff;
  }

  // applyBoost imported from poke-data.js

  // Game constants imported from poke-data.js

  // ===== ABILITY IMMUNITY RESULT =====

  function makeImmune(moveName, moveType, bp, atkStats, defStats, abil) {
    return {
      move: moveName, moveType, bp,
      minDmg: 0, maxDmg: 0, minPct: '0.0', maxPct: '0.0',
      hp: defStats.hp,
      koText: '無効', koClass: 'ko-safe', koDetail: '',
      typeEff: 0, isSTAB: false,
      atkStats, defStats,
      atkRecoil: '',
      berryActive: false, berryItem: '',
      statNote: `${abil}で無効`
    };
  }

  // ===== PHASE 1: Resolve attacker/defender stats for this move =====

  function resolveAtkDef(moveName, move, attacker, defender, atkStats, defStats, aAbil, dAbil, crit) {
    const isPhysical = move.cat === 'Physical';
    // 参照ステータスの差し替え(Body Press/イカサマ/サイコショック系)はレジストリから
    const st = MOVE_EFFECTS[moveName]?.stats || {};
    const atkSrc = st.atkSide === 'defender' ? defender : attacker;
    const atkSrcStats = st.atkSide === 'defender' ? defStats : atkStats;
    const atkKey = st.atkStat || (isPhysical ? 'at' : 'sa');
    const defKey = st.defStat || (isPhysical ? 'df' : 'sd');
    let atk = atkSrcStats[atkKey];
    let atkBoost = atkSrc.boosts?.[atkKey] || 0;
    let def = defStats[defKey];
    let defBoost = defender.boosts?.[defKey] || 0;

    // Critical hit: ignore attacker's offensive drops and defender's defensive boosts
    if (crit) {
      atkBoost = Math.max(0, atkBoost);
      defBoost = Math.min(0, defBoost);
    }

    // Unaware
    atk = dAbil === 'Unaware'
      ? applyBoost(atk, Math.min(0, atkBoost))
      : applyBoost(atk, atkBoost);
    def = aAbil === 'Unaware'
      ? applyBoost(def, Math.min(0, defBoost))
      : applyBoost(def, defBoost);

    return { atk, def, isPhysical };
  }

  // ===== PHASE 2: Resolve BP (move-specific + ability modifiers) =====

  function resolveBP(moveName, move, bp, aAbil, attacker, defender, field) {
    // Move-specific (レジストリから)
    const fx = MOVE_EFFECTS[moveName];
    if (fx?.bp) bp = fx.bp(bp, { attacker, defender, field });
    // じゅうでん: Electric move 2x
    if (field?.charged && move.type === 'Electric') bp *= 2;

    // Ability BP mods
    if (aAbil === 'Technician' && bp <= 60) bp = Math.floor(bp * 1.5);
    if (aAbil === 'Iron Fist' && PUNCH_MOVES.has(moveName)) bp = Math.floor(bp * 1.2);
    if (aAbil === 'Strong Jaw' && BITE_MOVES.has(moveName)) bp = Math.floor(bp * 1.5);
    if (aAbil === 'Sharpness' && SLICE_MOVES.has(moveName)) bp = Math.floor(bp * 1.5);
    if (aAbil === 'Mega Launcher' && PULSE_MOVES.has(moveName)) bp = Math.floor(bp * 1.5);
    if (aAbil === 'Reckless' && move.recoilHP) bp = Math.floor(bp * 1.2);
    if (aAbil === 'Sheer Force' && move.secondary) bp = Math.floor(bp * 1.3);
    if (aAbil === 'Tough Claws' && move.contact) bp = Math.floor(bp * 1.3);

    // Pinch abilities
    if (field?.pinch) {
      if (aAbil === 'Overgrow' && move.type === 'Grass') bp = Math.floor(bp * 1.5);
      if (aAbil === 'Blaze' && move.type === 'Fire') bp = Math.floor(bp * 1.5);
      if (aAbil === 'Torrent' && move.type === 'Water') bp = Math.floor(bp * 1.5);
      if (aAbil === 'Swarm' && move.type === 'Bug') bp = Math.floor(bp * 1.5);
    }

    return bp;
  }

  // ===== PHASE 3: Resolve atk stat modifiers from abilities =====

  function resolveAtkAbilMods(atk, aAbil, attacker, isPhysical, field) {
    if ((aAbil === 'Huge Power' || aAbil === 'Pure Power') && isPhysical) atk = Math.floor(atk * 2);
    if (aAbil === 'Hustle' && isPhysical) atk = Math.floor(atk * 1.5);
    if (aAbil === 'Solar Power' && !isPhysical && field?.weather === 'Sun') atk = Math.floor(atk * 1.5);
    if (aAbil === 'Guts' && attacker.status && isPhysical) atk = Math.floor(atk * 1.5);
    if (aAbil === 'Toxic Boost' && (attacker.status === 'psn' || attacker.status === 'tox') && isPhysical) atk = Math.floor(atk * 1.5);
    if (aAbil === 'Flare Boost' && attacker.status === 'brn' && !isPhysical) atk = Math.floor(atk * 1.5);
    if (aAbil === 'Gorilla Tactics' && isPhysical) atk = Math.floor(atk * 1.5);
    return atk;
  }

  // ===== PHASE 4: Resolve type, STAB, type effectiveness =====

  function resolveType(moveName, move, aAbil, atkTypes, defTypes) {
    const ateType = (move.type === 'Normal' && SKIN_ABILITIES[aAbil]) ? SKIN_ABILITIES[aAbil] : '';

    const effectiveMoveType = ateType || move.type;
    const isSTAB = atkTypes.includes(effectiveMoveType);
    let stabMod = isSTAB ? (aAbil === 'Adaptability' ? 2 : 1.5) : 1;
    if (ateType) stabMod *= 1.2;
    if ((aAbil === 'Protean' || aAbil === 'Libero') && !isSTAB) stabMod = 1.5;

    // Type effectiveness
    let typeEff = getTypeEff(effectiveMoveType, defTypes);
    // きもったま / Scrappy: Normal/Fighting hits Ghost
    if ((aAbil === 'Scrappy') && (effectiveMoveType === 'Normal' || effectiveMoveType === 'Fighting') && defTypes.includes('Ghost') && typeEff === 0) {
      typeEff = 1;
      for (const dt of defTypes) {
        if (dt === 'Ghost') continue;
        const chart = typeChart[effectiveMoveType];
        if (chart && chart[dt] !== undefined) typeEff *= chart[dt];
      }
    }
    // 技固有の相性補正(Freeze-Dry等)はレジストリから
    const fx = MOVE_EFFECTS[moveName];
    if (fx?.typeEff) typeEff = fx.typeEff(typeEff, { defTypes });

    return { effectiveMoveType, isSTAB, stabMod, typeEff };
  }

  // ===== PHASE 5: Check defender ability immunities =====
  // Returns immune result or null if not immune

  function checkImmunity(dAbil, moveName, effectiveMoveType, isPhysical, bp, atkStats, defStats, hasHazards) {
    const args = [moveName, effectiveMoveType, bp, atkStats, defStats, dAbil];
    if (dAbil === 'Levitate' && effectiveMoveType === 'Ground') return makeImmune(...args);
    if (dAbil === 'Flash Fire' && effectiveMoveType === 'Fire') return makeImmune(...args);
    if ((dAbil === 'Water Absorb' || dAbil === 'Storm Drain') && effectiveMoveType === 'Water') return makeImmune(...args);
    if ((dAbil === 'Volt Absorb' || dAbil === 'Lightning Rod' || dAbil === 'Motor Drive') && effectiveMoveType === 'Electric') return makeImmune(...args);
    if (dAbil === 'Sap Sipper' && effectiveMoveType === 'Grass') return makeImmune(...args);
    if (dAbil === 'Dry Skin' && effectiveMoveType === 'Water') return makeImmune(...args);
    if (dAbil === 'Earth Eater' && effectiveMoveType === 'Ground') return makeImmune(...args);
    if (dAbil === 'Bulletproof' && BULLET_MOVES.has(moveName)) return makeImmune(...args);
    if (dAbil === 'Soundproof' && SOUND_MOVES.has(moveName)) return makeImmune(...args);
    if (dAbil === 'Ice Face' && isPhysical && !hasHazards) return makeImmune(...args);
    return null;
  }

  // ===== PHASE 6: Defender ability/field damage modifiers + def stat adjustments =====

  function resolveDefMods(def, dAbil, defender, move, effectiveMoveType, typeEff, isPhysical, defTypes, field, hasHazards) {
    let defAbilMod = 1;

    if ((dAbil === 'Multiscale' || dAbil === 'Shadow Shield') && !hasHazards) defAbilMod = 0.5;
    if ((dAbil === 'Solid Rock' || dAbil === 'Filter' || dAbil === 'Prism Armor') && typeEff > 1) defAbilMod = 0.75;
    if (dAbil === 'Thick Fat' && (effectiveMoveType === 'Fire' || effectiveMoveType === 'Ice')) defAbilMod = 0.5;
    if (dAbil === 'Fur Coat' && isPhysical) defAbilMod = 0.5;
    if (dAbil === 'Fluffy') {
      let fluffy = 1;
      if (move.contact) fluffy *= 0.5;
      if (effectiveMoveType === 'Fire') fluffy *= 2;
      defAbilMod = fluffy;
    }
    if (dAbil === 'Ice Scales' && !isPhysical) defAbilMod = 0.5;
    if (dAbil === 'Heatproof' && effectiveMoveType === 'Fire') defAbilMod = 0.5;
    if (dAbil === 'Dry Skin' && effectiveMoveType === 'Fire') defAbilMod = 1.25;
    if (dAbil === 'Purifying Salt' && effectiveMoveType === 'Ghost') defAbilMod = 0.5;
    if (dAbil === 'Marvel Scale' && defender.status && isPhysical) def = Math.floor(def * 1.5);
    if (dAbil === 'Grass Pelt' && field?.terrain === 'Grassy' && isPhysical) def = Math.floor(def * 1.5);

    // Weather def boosts
    if (field?.weather === 'Sand' && !isPhysical && defTypes.includes('Rock')) def = Math.floor(def * 1.5);
    if (field?.weather === 'Snow' && isPhysical && defTypes.includes('Ice')) def = Math.floor(def * 1.5);

    // Defensive items
    const dItem = defender.item || '';
    if (dItem === 'Assault Vest' && !isPhysical) def = Math.floor(def * 1.5);
    if (dItem === 'Eviolite' && pokeDB[defender.name]?.nfe) def = Math.floor(def * 1.5);

    return { def, defAbilMod };
  }

  // ===== PHASE 7: Field modifiers (weather, terrain, burn, spread) =====

  function resolveFieldMods(effectiveMoveType, isPhysical, attacker, aAbil, move, field) {
    let weatherMod = 1;
    if (field?.weather === 'Sun') {
      if (effectiveMoveType === 'Fire') weatherMod = 1.5;
      if (effectiveMoveType === 'Water') weatherMod = 0.5;
    } else if (field?.weather === 'Rain') {
      if (effectiveMoveType === 'Water') weatherMod = 1.5;
      if (effectiveMoveType === 'Fire') weatherMod = 0.5;
    }

    let terrainMod = 1;
    if (field?.terrain === 'Electric' && effectiveMoveType === 'Electric') terrainMod = 1.3;
    if (field?.terrain === 'Grassy' && effectiveMoveType === 'Grass') terrainMod = 1.3;
    if (field?.terrain === 'Psychic' && effectiveMoveType === 'Psychic') terrainMod = 1.3;
    if (field?.terrain === 'Misty' && effectiveMoveType === 'Dragon') terrainMod = 0.5;

    const burnMod = (attacker.status === 'brn' && isPhysical && aAbil !== 'Guts') ? 0.5 : 1;
    const spreadMod = (field?.doubles && move.spread) ? 0.75 : 1;

    return { weatherMod, terrainMod, burnMod, spreadMod };
  }

  // ===== PHASE 8: Item modifiers =====

  function resolveItemMods(attacker, defender, effectiveMoveType, typeEff) {
    const item = attacker.item || '';
    const dItem = defender.item || '';

    let itemMod = 1;
    if (item === 'Life Orb') itemMod = 1.3;
    else if (item === 'Expert Belt' && typeEff > 1) itemMod = 1.2;
    else if (TYPE_BOOST_ITEM[item] === effectiveMoveType) itemMod = 1.2;

    // Type-resist berry
    const resistType = RESIST_BERRY[dItem];
    const berryActive = resistType && (
      (resistType === effectiveMoveType && typeEff > 1) ||
      (resistType === 'Normal' && effectiveMoveType === 'Normal')
    );
    const berryMod = berryActive ? 0.5 : 1;

    return { item, dItem, itemMod, berryActive, berryMod };
  }

  // ===== HAZARD DAMAGE =====

  function calcHazardDmg(maxHp, defTypes, field) {
    let srDmg = 0;
    if (field?.stealthRock) {
      let srEff = 1;
      for (const dt of defTypes) {
        const chart = typeChart['Rock'];
        if (chart && chart[dt] !== undefined) srEff *= chart[dt];
      }
      srDmg = Math.floor(maxHp * srEff / 8);
    }

    let spikesDmg = 0;
    if (field?.spikes && !defTypes.includes('Flying')) {
      const layers = Math.min(3, field.spikes);
      if (layers === 1) spikesDmg = Math.floor(maxHp / 8);
      else if (layers === 2) spikesDmg = Math.floor(maxHp / 6);
      else if (layers === 3) spikesDmg = Math.floor(maxHp / 4);
    }

    return srDmg + spikesDmg;
  }

  // ===== END-OF-TURN EFFECTS =====

  function calcEndOfTurn(hp, defItem, defStatus, defTypes) {
    let eot = 0;
    if (defItem === 'Leftovers') eot += Math.floor(hp / 16);
    if (defItem === 'Black Sludge') {
      if (defTypes && defTypes.includes('Poison')) eot += Math.floor(hp / 16);
      else eot -= Math.floor(hp / 8);
    }
    if (defStatus === 'psn') eot -= Math.floor(hp / 8);
    if (defStatus === 'brn') eot -= Math.floor(hp / 16);
    return eot;
  }

  // ===== MULTI-HIT =====

  function resolveHits(move) {
    let hits = 1;
    let hitsLabel = '';
    if (move.hits) {
      if (typeof move.hits === 'number') {
        hits = move.hits;
        hitsLabel = `${hits}回ヒット`;
      } else if (Array.isArray(move.hits)) {
        const [a, b] = move.hits;
        hits = Math.round((a + b) / 2);
        hitsLabel = `${a}〜${b}回ヒット (約${hits}回で計算)`;
      }
    }
    return { hits, hitsLabel };
  }

  // ===== STAT NOTE =====

  function buildStatNote(moveName, defender, dAbil, defTypes, field) {
    // 技の説明文はレジストリのnoteから(以前はここに同じ条件式が二重に書かれていた)
    const fx = MOVE_EFFECTS[moveName];
    let note = '';
    if (fx?.note) note = typeof fx.note === 'function' ? fx.note({ defender, defTypes, field }) : fx.note;
    if (dAbil === 'Unaware') note += (note ? ' / ' : '') + 'てんねん(ランク無視)';
    return note;
  }

  // ===== MAIN DAMAGE CALCULATION =====

  function calculate(attacker, defender, moveName, field) {
    const move = moveDB[moveName];
    if (!move || !move.bp) return null;

    const atkData = pokeDB[attacker.name];
    const defData = pokeDB[defender.name];
    if (!atkData || !defData) return null;

    const atkStats = getStats(attacker);
    const defStats = getStats(defender);
    const aAbil = attacker.ability || '';
    const dAbil = defender.ability || '';
    // Type overrides from battle runtime (Soak, Forest's Curse, Burn Up, etc.)
    let atkTypes = attacker._types || atkData.types;
    let defTypes = defender._types || defData.types;
    const hasHazards = field?.stealthRock || (field?.spikes && !defTypes.includes('Flying'));

    // Phase 1: Atk/Def stats (move-specific overrides + Unaware)
    let { atk, def, isPhysical } = resolveAtkDef(moveName, move, attacker, defender, atkStats, defStats, aAbil, dAbil, field?.crit);

    // Phase 2: BP modifiers
    let bp = field?.bpOverride != null ? field.bpOverride : resolveBP(moveName, move, move.bp, aAbil, attacker, defender, field);

    // Phase 3: Atk ability modifiers
    atk = resolveAtkAbilMods(atk, aAbil, attacker, isPhysical, field);

    // Phase 4: Type, STAB, effectiveness
    const moveForType = field?.moveTypeOverride ? { ...move, type: field.moveTypeOverride } : move;
    let { effectiveMoveType, isSTAB, stabMod, typeEff } = resolveType(moveName, moveForType, aAbil, atkTypes, defTypes);
    if (field?.stab2x && isSTAB) stabMod = 2;

    // Phase 5: Defender immunity check
    const immune = checkImmunity(dAbil, moveName, effectiveMoveType, isPhysical, bp, atkStats, defStats, hasHazards);
    if (immune) return immune;

    // 被ダメ依存技(カウンター等): ダメ計では数値が出せない。
    // シミュ側はresult.counterを見てターン中の被ダメから計算する
    const fx = MOVE_EFFECTS[moveName];
    if (fx?.counter) {
      const maxHp0 = defStats.hp;
      const curHp0 = defender.currentHP == null ? maxHp0 : Math.max(0, Math.min(maxHp0, defender.currentHP));
      return {
        move: moveName, moveType: effectiveMoveType, bp: 0, hits: 1, hitsLabel: '',
        minDmg: 0, maxDmg: 0, minPct: '-', maxPct: '-', damages: [0], perHitDamages: [0],
        hp: maxHp0, curHp: curHp0,
        koText: '被ダメ依存', koClass: 'ko-safe', koDetail: '',
        typeEff, isSTAB: false, atkStats, defStats, atkRecoil: '',
        berryActive: false, berryItem: '',
        statNote: buildStatNote(moveName, defender, dAbil, defTypes, field),
        counter: fx.counter,
      };
    }

    // Phase 6: Defender ability/field def modifiers
    const defMods = resolveDefMods(def, dAbil, defender, move, effectiveMoveType, typeEff, isPhysical, defTypes, field, hasHazards);
    def = defMods.def;
    const defAbilMod = defMods.defAbilMod;

    // Phase 7: Field modifiers
    const { weatherMod, terrainMod, burnMod, spreadMod } = resolveFieldMods(effectiveMoveType, isPhysical, attacker, aAbil, move, field);

    // Phase 8: Item modifiers
    const items = resolveItemMods(attacker, defender, effectiveMoveType, typeEff);
    // Choice Band/Specs: only apply for correct category
    let itemAtkMod = 1;
    if (items.item === 'Choice Band' && isPhysical) itemAtkMod = 1.5;
    else if (items.item === 'Choice Specs' && !isPhysical) itemAtkMod = 1.5;
    atk = Math.floor(atk * itemAtkMod);

    // Critical hit
    const critMod = field?.crit ? 1.5 : 1;

    // Base damage formula
    const baseDmg = Math.floor(Math.floor((Math.floor(2 * 50 / 5 + 2) * bp * atk) / def) / 50 + 2);

    // Multi-hit
    let { hits, hitsLabel } = resolveHits(move);
    if (field?.hitsOverride != null) { hits = field.hitsOverride; hitsLabel = `${hits}回ヒット`; }

    // おやこあい: 1発目100% + 2発目25% (連続技/定数ダメージには乗らない)
    const parentalBond = aAbil === 'Parental Bond' && hits === 1 && !move.hits && !fx?.fixedDamage;

    // 16 damage rolls (85%~100%)
    // perHit = 1発分の乱数16通り(シミュの1発毎抽選用)、results = 表示用合計(同一乱数×発数)
    const perHit = [];
    const results = [];
    for (let roll = 85; roll <= 100; roll++) {
      let dmg = baseDmg;
      dmg = Math.floor(dmg * spreadMod);
      dmg = Math.floor(dmg * weatherMod);
      dmg = Math.floor(dmg * critMod);
      dmg = Math.floor(dmg * roll / 100);
      dmg = Math.floor(dmg * stabMod);
      dmg = Math.floor(dmg * typeEff);
      dmg = Math.floor(dmg * items.berryMod);
      dmg = Math.floor(dmg * burnMod);
      dmg = Math.floor(dmg * terrainMod);
      dmg = Math.floor(dmg * items.itemMod);
      dmg = Math.floor(dmg * defAbilMod);
      dmg = Math.max(dmg, 1);
      perHit.push(dmg);
      results.push(parentalBond ? dmg + Math.floor(dmg * 0.25) : dmg * hits);
    }

    const maxHp = defStats.hp;
    const curHp = defender.currentHP == null
      ? maxHp
      : Math.max(0, Math.min(maxHp, defender.currentHP));

    // 定数ダメージ技 (ちきゅうなげ/がむしゃら等): 通常式の結果を固定値で置換
    // ※データ上bp:1のため、以前は通常式に流れてデタラメな数値が出ていた
    let fixed = false;
    if (fx?.fixedDamage) {
      const atkCurHP = attacker.currentHP == null ? atkStats.hp : Math.max(0, Math.min(atkStats.hp, attacker.currentHP));
      const d = typeEff === 0 ? 0 : Math.max(0, fx.fixedDamage({ attacker, defender, atkStats, defStats, atkCurHP, defCurHP: curHp }));
      perHit.length = 0; results.length = 0;
      for (let i = 0; i < 16; i++) { perHit.push(d); results.push(d); }
      fixed = true;
    }

    // Disguise / Ice Face check
    const disguiseHit = defender.disguiseIntact && (
      dAbil === 'Disguise' || (dAbil === 'Ice Face' && isPhysical)
    );
    if (disguiseHit) {
      const subDmg = Math.floor(maxHp / 8);
      return {
        move: moveName, moveType: effectiveMoveType, bp,
        hits: 1, hitsLabel: '',
        minDmg: subDmg, maxDmg: subDmg,
        minPct: (subDmg / maxHp * 100).toFixed(1),
        maxPct: (subDmg / maxHp * 100).toFixed(1),
        damages: [subDmg],
        hp: maxHp, curHp: Math.max(0, curHp - subDmg),
        koText: `${dAbil}発動 (1/8ダメで身代わり)`, koClass: 'ko-safe', koDetail: '',
        typeEff: 1, isSTAB: false,
        atkStats, defStats, atkRecoil: '',
        berryActive: false, berryItem: '',
        statNote: `${dAbil}で1発無効化、代わりに最大HPの1/8ダメージ`,
        disguiseConsumed: true
      };
    }

    // KO calculation
    const hazardDmg = calcHazardDmg(maxHp, defTypes, field);
    const defStatus = defender.status || '';
    const eot = calcEndOfTurn(maxHp, items.dItem, defStatus, defTypes);
    const isToxic = defStatus === 'tox';
    const hasSitrus = items.dItem === 'Sitrus Berry' && !items.berryActive;
    const sitrusHeal = hasSitrus ? Math.floor(maxHp / 4) : 0;
    const grassyHeal = (field?.terrain === 'Grassy') ? Math.floor(maxHp / 16) : 0;

    let koInfo = calcKO(results, curHp, eot, isToxic, sitrusHeal, grassyHeal, hazardDmg, maxHp);

    // Sturdy override
    if (dAbil === 'Sturdy' && !hasHazards && curHp === maxHp && koInfo.text.includes('1発')) {
      koInfo = { text: 'がんじょうで耐え (HP1)', cls: 'ko-safe', detail: koInfo.detail };
    }

    const minDmg = results[0];
    const maxDmg = results[results.length - 1];

    let statNote = buildStatNote(moveName, defender, dAbil, defTypes, field);
    if (parentalBond) statNote += (statNote ? ' / ' : '') + 'おやこあい(2発目25%)';

    return {
      move: moveName,
      moveType: effectiveMoveType,
      bp, hits, hitsLabel,
      minDmg, maxDmg,
      minPct: (minDmg / maxHp * 100).toFixed(1),
      maxPct: (maxDmg / maxHp * 100).toFixed(1),
      damages: results,
      perHitDamages: perHit,   // 1発分の乱数16通り(シミュの1発毎抽選用)
      fixed,                   // 定数ダメージ(乱数なし)
      parentalBond,
      hp: maxHp, curHp,
      koText: koInfo.text, koClass: koInfo.cls,
      koDetail: koInfo.detail,
      typeEff, isSTAB,
      atkStats, defStats,
      atkRecoil: items.item === 'Life Orb' ? `(LO反動: ${Math.floor(atkStats.hp / 10)}ダメージ)` : '',
      berryActive: items.berryActive, berryItem: items.berryActive ? items.dItem : '',
      statNote
    };
  }

  // ===== KO CALCULATION =====

  function calcKO(rolls, hp, eot, isToxic, sitrusHeal, grassyHeal, hazardDmg, maxHp) {
    const n = rolls.length;
    const effectiveHP = hp - hazardDmg;

    // 1HKO
    const ko1 = rolls.filter(d => d >= effectiveHP).length;
    if (ko1 === n) return { text: '確定1発', cls: 'ko-guaranteed', detail: buildDetail(hazardDmg, 0, 0, 0, 0) };
    if (ko1 > 0) return { text: `乱数1発 (${(ko1/n*100).toFixed(1)}%)`, cls: 'ko-possible', detail: buildDetail(hazardDmg, 0, 0, 0, 0) };

    // 2~6 HKO
    for (let hits = 2; hits <= 6; hits++) {
      let koCount = 0;
      if (hits === 2) {
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            let total = rolls[i] + rolls[j];
            total = applyBetweenHits(total, effectiveHP, 1, eot, isToxic, sitrusHeal, grassyHeal, maxHp);
            if (total >= effectiveHP) koCount++;
          }
        }
        const pct = (koCount / (n * n) * 100).toFixed(1);
        const detail = buildDetail(hazardDmg, eot, isToxic, sitrusHeal, grassyHeal);
        if (koCount === n * n) return { text: '確定2発', cls: 'ko-guaranteed', detail };
        if (koCount > 0) return { text: `乱数2発 (${pct}%)`, cls: 'ko-possible', detail };
      } else {
        let minTotal = 0, maxTotal = 0;
        for (let h = 0; h < hits; h++) {
          minTotal += rolls[0];
          maxTotal += rolls[n - 1];
          if (h < hits - 1) {
            minTotal = applyBetweenHits(minTotal, effectiveHP, h + 1, eot, isToxic, sitrusHeal, grassyHeal, maxHp);
            maxTotal = applyBetweenHits(maxTotal, effectiveHP, h + 1, eot, isToxic, sitrusHeal, grassyHeal, maxHp);
          }
        }
        const detail = buildDetail(hazardDmg, eot, isToxic, sitrusHeal, grassyHeal);
        if (minTotal >= effectiveHP) return { text: `確定${hits}発`, cls: hits <= 3 ? 'ko-guaranteed' : 'ko-safe', detail };
        if (maxTotal >= effectiveHP) {
          const range = maxTotal - minTotal;
          const needed = effectiveHP - minTotal;
          const pct = range > 0 ? Math.min(100, Math.max(0, (1 - needed / range) * 100)).toFixed(1) : '50.0';
          return { text: `乱数${hits}発 (${pct}%)`, cls: 'ko-possible', detail };
        }
      }
    }

    const hitsNeeded = rolls[0] > 0 ? Math.ceil(effectiveHP / rolls[0]) : 999;
    return { text: `確定${hitsNeeded}発`, cls: 'ko-safe', detail: '' };
  }

  function applyBetweenHits(totalDmg, effectiveHP, turnNum, eot, isToxic, sitrusHeal, grassyHeal, realHP) {
    if (sitrusHeal > 0 && totalDmg >= realHP / 2 && turnNum === 1) {
      totalDmg -= sitrusHeal;
    }
    totalDmg -= eot;
    totalDmg -= grassyHeal;
    if (isToxic) totalDmg += Math.floor(realHP * turnNum / 16);
    return totalDmg;
  }

  function buildDetail(hazardDmg, eot, isToxic, sitrusHeal, grassyHeal) {
    const parts = [];
    if (hazardDmg > 0) parts.push(`ステロ等-${hazardDmg}`);
    if (eot > 0) parts.push(`たべのこし+${eot}`);
    if (eot < 0) parts.push(`スリップ${eot}`);
    if (isToxic) parts.push('猛毒');
    if (sitrusHeal > 0) parts.push(`オボン+${sitrusHeal}`);
    if (grassyHeal > 0) parts.push(`グラスフィールド+${grassyHeal}`);
    return parts.length > 0 ? `(${parts.join(', ')}込)` : '';
  }

  return { init, calculate, getStats, calcHP, calcStat, getNatureMods, getTypeEff, findNatureName };
})();
