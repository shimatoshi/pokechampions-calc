// Pokemon Champions Damage Calculator Engine
const DMG = (() => {
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

  // Champions stat calc: Lv50, IV=31 fixed
  function calcHP(base, sp) {
    if (base === 1) return 1; // Shedinja
    return Math.floor((base * 2 + 31) * 50 / 100) + 50 + 10 + sp;
  }

  function calcStat(base, sp, natureMod) {
    return Math.floor((Math.floor((base * 2 + 31) * 50 / 100) + 5 + sp) * natureMod);
  }

  // Nature from +/- stat markers (Showdown style)
  // poke.natureMods = { plus: 'at', minus: 'sa' } or null
  function getNatureMods(nature, natureMods) {
    // Priority: explicit +/- markers (Showdown-style)
    if (natureMods && (natureMods.plus || natureMods.minus)) {
      const mods = { at: 1, df: 1, sa: 1, sd: 1, sp: 1 };
      if (natureMods.plus) mods[natureMods.plus] = 1.1;
      if (natureMods.minus) mods[natureMods.minus] = 0.9;
      return mods;
    }
    // Fallback: nature name lookup
    const n = natureDB[nature];
    if (!n) return { at: 1, df: 1, sa: 1, sd: 1, sp: 1 };
    const mods = { at: 1, df: 1, sa: 1, sd: 1, sp: 1 };
    const plus = Array.isArray(n) ? n[0] : n.plus;
    const minus = Array.isArray(n) ? n[1] : n.minus;
    if (plus) mods[plus] = 1.1;
    if (minus) mods[minus] = 0.9;
    return mods;
  }

  // Find nature name from +/- stat combo
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

  function getTypeEff(atkType, defTypes) {
    let eff = 1;
    for (const dt of defTypes) {
      const chart = typeChart[atkType];
      if (!chart) continue;
      if (chart[dt] !== undefined) eff *= chart[dt];
    }
    return eff;
  }

  function applyBoost(stat, boost) {
    if (boost >= 0) return Math.floor(stat * (2 + boost) / 2);
    return Math.floor(stat * 2 / (2 - boost));
  }

  // Type-resist berries: halve super-effective damage of a specific type (consumed)
  const RESIST_BERRY = {
    'Occa Berry':'Fire','Passho Berry':'Water','Wacan Berry':'Electric',
    'Rindo Berry':'Grass','Yache Berry':'Ice','Chople Berry':'Fighting',
    'Kebia Berry':'Poison','Shuca Berry':'Ground','Coba Berry':'Flying',
    'Payapa Berry':'Psychic','Tanga Berry':'Bug','Charti Berry':'Rock',
    'Kasib Berry':'Ghost','Haban Berry':'Dragon','Colbur Berry':'Dark',
    'Babiri Berry':'Steel','Roseli Berry':'Fairy','Chilan Berry':'Normal'
  };

  // Per-turn recovery/damage for KO calculation
  // defTypes is needed for Black Sludge (heals Poison type, damages others)
  function calcEndOfTurn(hp, defItem, defStatus, defTypes) {
    let eot = 0; // positive = recovery, negative = damage
    // Recovery items
    if (defItem === 'Leftovers') eot += Math.floor(hp / 16);
    if (defItem === 'Black Sludge') {
      if (defTypes && defTypes.includes('Poison')) eot += Math.floor(hp / 16);
      else eot -= Math.floor(hp / 8);
    }
    // Status damage
    if (defStatus === 'psn') eot -= Math.floor(hp / 8);
    if (defStatus === 'brn') eot -= Math.floor(hp / 16);
    return eot;
  }

  // Toxic damage: 1/16, 2/16, 3/16... per turn
  function calcToxicDmg(hp, turn) {
    return Math.floor(hp * turn / 16);
  }

  // Ability immunity result
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

  // Main damage calculation
  function calculate(attacker, defender, moveName, field) {
    const move = moveDB[moveName];
    if (!move || !move.bp) return null;

    const atkData = pokeDB[attacker.name];
    const defData = pokeDB[defender.name];
    if (!atkData || !defData) return null;

    const atkStats = getStats(attacker);
    const defStats = getStats(defender);

    const isPhysical = move.cat === 'Physical';

    // Special stat-overriding moves
    let atk, def, atkBoost, defBoost;
    if (moveName === 'Body Press') {
      // Uses attacker's Defense (and Def boosts) instead of Attack
      atk = atkStats.df;
      atkBoost = attacker.boosts?.df || 0;
      def = defStats.df;
      defBoost = defender.boosts?.df || 0;
    } else if (moveName === 'Foul Play') {
      // Uses defender's Attack (and Atk boosts) for damage
      atk = defStats.at;
      atkBoost = defender.boosts?.at || 0;
      def = defStats.df;
      defBoost = defender.boosts?.df || 0;
    } else if (moveName === 'Psyshock' || moveName === 'Psystrike' || moveName === 'Secret Sword') {
      // Special move that targets physical Defense
      atk = atkStats.sa;
      atkBoost = attacker.boosts?.sa || 0;
      def = defStats.df;
      defBoost = defender.boosts?.df || 0;
    } else {
      atk = isPhysical ? atkStats.at : atkStats.sa;
      atkBoost = isPhysical ? (attacker.boosts?.at || 0) : (attacker.boosts?.sa || 0);
      def = isPhysical ? defStats.df : defStats.sd;
      defBoost = isPhysical ? (defender.boosts?.df || 0) : (defender.boosts?.sd || 0);
    }
    atk = applyBoost(atk, atkBoost);
    def = applyBoost(def, defBoost);

    let bp = move.bp;
    const aAbil = attacker.ability || '';
    const dAbil = defender.ability || '';

    // ===== ATTACKER ABILITY: BP modifiers =====
    // Technician: moves with bp<=60 get 1.5x
    if (aAbil === 'Technician' && bp <= 60) bp = Math.floor(bp * 1.5);
    // Iron Fist: punch moves 1.2x
    const punchMoves = ['Bullet Punch','Drain Punch','Dynamic Punch','Fire Punch','Focus Punch','Ice Punch','Mach Punch','Mega Punch','Meteor Mash','Power-Up Punch','Shadow Punch','Sky Uppercut','Thunder Punch','Jet Punch'];
    if (aAbil === 'Iron Fist' && punchMoves.includes(moveName)) bp = Math.floor(bp * 1.2);
    // Strong Jaw: biting moves 1.5x
    const biteMoves = ['Bite','Crunch','Fire Fang','Fishious Rend','Hyper Fang','Ice Fang','Jaw Lock','Poison Fang','Psychic Fangs','Thunder Fang'];
    if (aAbil === 'Strong Jaw' && biteMoves.includes(moveName)) bp = Math.floor(bp * 1.5);
    // Sharpness: slicing moves 1.5x
    const sliceMoves = ['Aerial Ace','Air Cutter','Air Slash','Aqua Cutter','Behemoth Blade','Bitter Blade','Ceaseless Edge','Cross Poison','Cut','Fury Cutter','Kowtow Cleave','Leaf Blade','Night Slash','Psycho Cut','Razor Leaf','Razor Shell','Sacred Sword','Secret Sword','Slash','Solar Blade','Stone Axe','X-Scissor'];
    if (aAbil === 'Sharpness' && sliceMoves.includes(moveName)) bp = Math.floor(bp * 1.5);
    // Mega Launcher: pulse/aura moves 1.5x
    const pulseMoves = ['Aura Sphere','Dark Pulse','Dragon Pulse','Heal Pulse','Origin Pulse','Terrain Pulse','Water Pulse'];
    if (aAbil === 'Mega Launcher' && pulseMoves.includes(moveName)) bp = Math.floor(bp * 1.5);
    // Reckless: recoil moves 1.2x
    if (aAbil === 'Reckless' && move.recoilHP) bp = Math.floor(bp * 1.2);
    // Sheer Force: moves with secondary effects 1.3x (but removes the effect)
    if (aAbil === 'Sheer Force' && move.secondary) bp = Math.floor(bp * 1.3);
    // Tough Claws: contact moves 1.3x
    if (aAbil === 'Tough Claws' && move.contact) bp = Math.floor(bp * 1.3);

    // ===== ATTACKER ABILITY: Atk stat modifiers =====
    // Huge Power / Pure Power: doubles Attack
    if ((aAbil === 'Huge Power' || aAbil === 'Pure Power') && isPhysical) atk = Math.floor(atk * 2);
    // Hustle: 1.5x physical attack
    if (aAbil === 'Hustle' && isPhysical) atk = Math.floor(atk * 1.5);
    // Solar Power: 1.5x SpA in Sun
    if (aAbil === 'Solar Power' && !isPhysical && field?.weather === 'Sun') atk = Math.floor(atk * 1.5);
    // Guts: 1.5x Attack when statused (already handles burn bypass)
    if (aAbil === 'Guts' && attacker.status && isPhysical) atk = Math.floor(atk * 1.5);
    // Toxic Boost: 1.5x Attack when poisoned
    if (aAbil === 'Toxic Boost' && (attacker.status === 'psn' || attacker.status === 'tox') && isPhysical) atk = Math.floor(atk * 1.5);
    // Flare Boost: 1.5x SpA when burned
    if (aAbil === 'Flare Boost' && attacker.status === 'brn' && !isPhysical) atk = Math.floor(atk * 1.5);
    // Gorilla Tactics: 1.5x Attack (like choice band)
    if (aAbil === 'Gorilla Tactics' && isPhysical) atk = Math.floor(atk * 1.5);
    // Overgrow/Blaze/Torrent/Swarm: 1.5x when HP<=1/3
    // Pinch abilities — user sets via field checkbox
    if (field?.pinch) {
      if (aAbil === 'Overgrow' && move.type === 'Grass') bp = Math.floor(bp * 1.5);
      if (aAbil === 'Blaze' && move.type === 'Fire') bp = Math.floor(bp * 1.5);
      if (aAbil === 'Torrent' && move.type === 'Water') bp = Math.floor(bp * 1.5);
      if (aAbil === 'Swarm' && move.type === 'Bug') bp = Math.floor(bp * 1.5);
    }

    // ===== ATTACKER ABILITY: -ate abilities (type change + 1.2x) =====
    let ateType = '';
    if (aAbil === 'Pixilate' && move.type === 'Normal') ateType = 'Fairy';
    if (aAbil === 'Aerilate' && move.type === 'Normal') ateType = 'Flying';
    if (aAbil === 'Refrigerate' && move.type === 'Normal') ateType = 'Ice';
    if (aAbil === 'Galvanize' && move.type === 'Normal') ateType = 'Electric';
    if (aAbil === 'Dragonize' && move.type === 'Normal') ateType = 'Dragon';

    // STAB
    const atkTypes = atkData.types;
    const effectiveMoveType = ateType || move.type;
    const isSTAB = atkTypes.includes(effectiveMoveType);
    let stabMod = isSTAB ? (aAbil === 'Adaptability' ? 2 : 1.5) : 1;
    if (ateType) stabMod *= 1.2; // -ate bonus

    // Protean/Libero: always STAB
    if ((aAbil === 'Protean' || aAbil === 'Libero') && !isSTAB) stabMod = 1.5;

    // Type effectiveness (use effective move type for -ate)
    const defTypes = defData.types;
    const typeEff = getTypeEff(effectiveMoveType, defTypes);

    // ===== DEFENDER ABILITY: Immunities =====
    // Levitate: immune to Ground
    if (dAbil === 'Levitate' && effectiveMoveType === 'Ground') return makeImmune(moveName, effectiveMoveType, bp, atkStats, defStats, dAbil);
    // Flash Fire: immune to Fire
    if (dAbil === 'Flash Fire' && effectiveMoveType === 'Fire') return makeImmune(moveName, effectiveMoveType, bp, atkStats, defStats, dAbil);
    // Water Absorb / Storm Drain: immune to Water
    if ((dAbil === 'Water Absorb' || dAbil === 'Storm Drain') && effectiveMoveType === 'Water') return makeImmune(moveName, effectiveMoveType, bp, atkStats, defStats, dAbil);
    // Volt Absorb / Lightning Rod / Motor Drive: immune to Electric
    if ((dAbil === 'Volt Absorb' || dAbil === 'Lightning Rod' || dAbil === 'Motor Drive') && effectiveMoveType === 'Electric') return makeImmune(moveName, effectiveMoveType, bp, atkStats, defStats, dAbil);
    // Sap Sipper: immune to Grass
    if (dAbil === 'Sap Sipper' && effectiveMoveType === 'Grass') return makeImmune(moveName, effectiveMoveType, bp, atkStats, defStats, dAbil);
    // Dry Skin: immune to Water, weak to Fire 1.25x
    if (dAbil === 'Dry Skin' && effectiveMoveType === 'Water') return makeImmune(moveName, effectiveMoveType, bp, atkStats, defStats, dAbil);
    // Earth Eater: immune to Ground
    if (dAbil === 'Earth Eater' && effectiveMoveType === 'Ground') return makeImmune(moveName, effectiveMoveType, bp, atkStats, defStats, dAbil);
    // Bulletproof: immune to ball/bomb moves
    const bulletMoves = ['Acid Spray','Aura Sphere','Barrage','Bullet Seed','Egg Bomb','Electro Ball','Energy Ball','Focus Blast','Gyro Ball','Ice Ball','Mist Ball','Mud Bomb','Octazooka','Pollen Puff','Pyro Ball','Rock Blast','Rock Wrecker','Searing Shot','Seed Bomb','Shadow Ball','Sludge Bomb','Weather Ball','Zap Cannon'];
    if (dAbil === 'Bulletproof' && bulletMoves.includes(moveName)) return makeImmune(moveName, effectiveMoveType, bp, atkStats, defStats, dAbil);
    // Soundproof: immune to sound moves
    const soundMoves = ['Alluring Voice','Boomburst','Bug Buzz','Chatter','Clanging Scales','Clangorous Soulblaze','Disarming Voice','Echoed Voice','Eerie Spell','Grass Whistle','Growl','Heal Bell','Howl','Hyper Voice','Metal Sound','Noble Roar','Overdrive','Perish Song','Relic Song','Roar','Round','Screech','Sing','Snarl','Snore','Sparkling Aria','Supersonic','Torch Song','Uproar'];
    if (dAbil === 'Soundproof' && soundMoves.includes(moveName)) return makeImmune(moveName, effectiveMoveType, bp, atkStats, defStats, dAbil);

    // ===== DEFENDER ABILITY: Damage reduction =====
    let defAbilMod = 1;
    // Multiscale / Shadow Shield: halves damage at full HP
    // Broken if hazards are set (defender takes damage on switch-in)
    const hasHazards = field?.stealthRock || (field?.spikes && !defTypes.includes('Flying'));
    if ((dAbil === 'Multiscale' || dAbil === 'Shadow Shield') && !hasHazards) defAbilMod = 0.5;
    // Solid Rock / Filter / Prism Armor: SE damage ×0.75
    if ((dAbil === 'Solid Rock' || dAbil === 'Filter' || dAbil === 'Prism Armor') && typeEff > 1) defAbilMod = 0.75;
    // Thick Fat: halves Fire and Ice damage
    if (dAbil === 'Thick Fat' && (effectiveMoveType === 'Fire' || effectiveMoveType === 'Ice')) defAbilMod = 0.5;
    // Fur Coat: halves physical damage
    if (dAbil === 'Fur Coat' && isPhysical) defAbilMod = 0.5;
    // Fluffy: halves contact damage, doubles Fire damage (重複時はFire+contactで0.5*2=1.0)
    if (dAbil === 'Fluffy') {
      let fluffy = 1;
      if (move.contact) fluffy *= 0.5;
      if (effectiveMoveType === 'Fire') fluffy *= 2;
      defAbilMod = fluffy;
    }
    // Ice Scales: halves special damage
    if (dAbil === 'Ice Scales' && !isPhysical) defAbilMod = 0.5;
    // Heatproof: halves Fire damage
    if (dAbil === 'Heatproof' && effectiveMoveType === 'Fire') defAbilMod = 0.5;
    // Dry Skin: Fire damage 1.25x
    if (dAbil === 'Dry Skin' && effectiveMoveType === 'Fire') defAbilMod = 1.25;
    // Purifying Salt: halves Ghost damage
    if (dAbil === 'Purifying Salt' && effectiveMoveType === 'Ghost') defAbilMod = 0.5;

    // ===== DEFENDER ABILITY: Intimidate (Atk -1 on switch-in, simplified) =====
    // Intimidate is a switch-in effect; the user should set Atk -1 boost manually.
    // But we note it in the UI.

    // Weather
    let weatherMod = 1;
    if (field?.weather === 'Sun') {
      if (effectiveMoveType === 'Fire') weatherMod = 1.5;
      if (effectiveMoveType === 'Water') weatherMod = 0.5;
    } else if (field?.weather === 'Rain') {
      if (effectiveMoveType === 'Water') weatherMod = 1.5;
      if (effectiveMoveType === 'Fire') weatherMod = 0.5;
    }
    // Sand: Rock SpD 1.5x
    if (field?.weather === 'Sand' && !isPhysical && defTypes.includes('Rock')) def = Math.floor(def * 1.5);
    // Snow: Ice Def 1.5x
    if (field?.weather === 'Snow' && isPhysical && defTypes.includes('Ice')) def = Math.floor(def * 1.5);

    // Terrain
    let terrainMod = 1;
    if (field?.terrain === 'Electric' && effectiveMoveType === 'Electric') terrainMod = 1.3;
    if (field?.terrain === 'Grassy' && effectiveMoveType === 'Grass') terrainMod = 1.3;
    if (field?.terrain === 'Psychic' && effectiveMoveType === 'Psychic') terrainMod = 1.3;
    if (field?.terrain === 'Misty' && effectiveMoveType === 'Dragon') terrainMod = 0.5;

    // Burn
    const burnMod = (attacker.status === 'brn' && isPhysical && aAbil !== 'Guts') ? 0.5 : 1;

    // Spread move in doubles
    const spreadMod = (field?.doubles && move.spread) ? 0.75 : 1;

    // Item modifiers
    let itemAtkMod = 1;
    let itemMod = 1;
    const item = attacker.item || '';
    if (item === 'Choice Band' && isPhysical) itemAtkMod = 1.5;
    if (item === 'Choice Specs' && !isPhysical) itemAtkMod = 1.5;
    if (item === 'Life Orb') itemMod = 1.3;
    if (item === 'Expert Belt' && typeEff > 1) itemMod = 1.2;

    // Defensive item
    const dItem = defender.item || '';
    if (dItem === 'Assault Vest' && !isPhysical) def = Math.floor(def * 1.5);
    // Eviolite: NFEのみ。Phys/SpDef両方に1.5x
    if (dItem === 'Eviolite' && defData.nfe) {
      def = Math.floor(def * 1.5);
    }

    // Type-resist berry
    const resistType = RESIST_BERRY[dItem];
    const berryActive = resistType && (
      (resistType === effectiveMoveType && typeEff > 1) ||
      (resistType === 'Normal' && effectiveMoveType === 'Normal')
    );
    const berryMod = berryActive ? 0.5 : 1;

    atk = Math.floor(atk * itemAtkMod);

    // Critical hit
    const critMod = field?.crit ? 1.5 : 1;

    // Base damage
    const baseDmg = Math.floor(Math.floor((Math.floor(2 * 50 / 5 + 2) * bp * atk) / def) / 50 + 2);

    // Apply modifiers for each roll
    const results = [];
    for (let roll = 85; roll <= 100; roll++) {
      let dmg = baseDmg;
      dmg = Math.floor(dmg * spreadMod);
      dmg = Math.floor(dmg * weatherMod);
      dmg = Math.floor(dmg * critMod);
      dmg = Math.floor(dmg * roll / 100);
      dmg = Math.floor(dmg * stabMod);
      dmg = Math.floor(dmg * typeEff);
      dmg = Math.floor(dmg * berryMod);
      dmg = Math.floor(dmg * burnMod);
      dmg = Math.floor(dmg * terrainMod);
      dmg = Math.floor(dmg * itemMod);
      dmg = Math.floor(dmg * defAbilMod);
      dmg = Math.max(dmg, 1);
      results.push(dmg);
    }

    const maxHp = defStats.hp;
    // currentHP: nullなら満タン。範囲を [0, maxHp] に clamp
    const curHp = defender.currentHP == null
      ? maxHp
      : Math.max(0, Math.min(maxHp, defender.currentHP));
    const minDmg = results[0];
    const maxDmg = results[results.length - 1];
    // %は実数値MAX基準 (Smogon等の慣習)
    const minPct = (minDmg / maxHp * 100).toFixed(1);
    const maxPct = (maxDmg / maxHp * 100).toFixed(1);

    // Stealth Rock damage (max基準で計算: 場に出たときのダメージなので)
    let srDmg = 0;
    if (field?.stealthRock) {
      let srEff = 1;
      for (const dt of defTypes) {
        const chart = typeChart['Rock'];
        if (chart && chart[dt] !== undefined) srEff *= chart[dt];
      }
      srDmg = Math.floor(maxHp * srEff / 8);
    }

    // Spikes damage (1 layer = 1/8, 2 = 1/6, 3 = 1/4)
    let spikesDmg = 0;
    if (field?.spikes && !defTypes.includes('Flying')) {
      const layers = Math.min(3, field.spikes);
      if (layers === 1) spikesDmg = Math.floor(maxHp / 8);
      else if (layers === 2) spikesDmg = Math.floor(maxHp / 6);
      else if (layers === 3) spikesDmg = Math.floor(maxHp / 4);
    }

    const hazardDmg = srDmg + spikesDmg;

    // End-of-turn effects for KO calc (max基準: 例 たべのこし は実数値の1/16)
    const defStatus = defender.status || '';
    const eot = calcEndOfTurn(maxHp, dItem, defStatus, defTypes);
    const isToxic = defStatus === 'tox';

    const hasSitrus = dItem === 'Sitrus Berry' && !berryActive; // not if berry used for type resist
    const sitrusHeal = hasSitrus ? Math.floor(maxHp / 4) : 0;

    const grassyHeal = (field?.terrain === 'Grassy') ? Math.floor(maxHp / 16) : 0;

    // KO calc は curHp 基準。sitrus 50%閾値は maxHp 基準なので別途渡す
    const koInfo = calcKO(results, curHp, eot, isToxic, sitrusHeal, grassyHeal, hazardDmg, maxHp);

    // Life Orb recoil info for attacker
    let atkRecoil = '';
    if (item === 'Life Orb') {
      atkRecoil = `(LO反動: ${Math.floor(atkStats.hp / 10)}ダメージ)`;
    }

    return {
      move: moveName,
      moveType: effectiveMoveType,
      bp,
      minDmg, maxDmg, minPct, maxPct,
      hp: maxHp, curHp,
      koText: koInfo.text, koClass: koInfo.cls,
      koDetail: koInfo.detail,
      typeEff,
      isSTAB,
      atkStats, defStats,
      atkRecoil,
      berryActive, berryItem: berryActive ? dItem : '',
      statNote: moveName === 'Body Press' ? '防御でダメージ計算'
        : moveName === 'Foul Play' ? '相手の攻撃でダメージ計算'
        : (moveName === 'Psyshock' || moveName === 'Psystrike' || moveName === 'Secret Sword') ? '相手の防御にダメージ'
        : ''
    };
  }

  // hp = 現在HP (curHp), maxHp = 実数値MAX (sitrus閾値とtoxic用)
  function calcKO(rolls, hp, eot, isToxic, sitrusHeal, grassyHeal, hazardDmg, maxHp) {
    const n = rolls.length; // 16 rolls
    const effectiveHP = hp - hazardDmg; // HP after hazards on switch-in

    // 1HKO check
    const ko1 = rolls.filter(d => d >= effectiveHP).length;
    if (ko1 === n) return { text: '確定1発', cls: 'ko-guaranteed', detail: buildDetail(hazardDmg, 0, 0, 0, 0) };
    if (ko1 > 0) return { text: `乱数1発 (${(ko1/n*100).toFixed(1)}%)`, cls: 'ko-possible', detail: buildDetail(hazardDmg, 0, 0, 0, 0) };

    // Multi-hit KO (2~6 hits) with full probability simulation
    for (let hits = 2; hits <= 6; hits++) {
      let koCount = 0;
      if (hits === 2) {
        // Exact: 16×16 = 256 combos
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            let total = rolls[i] + rolls[j];
            total = applyBetweenHits(total, effectiveHP, 1, eot, isToxic, sitrusHeal, grassyHeal, maxHp);
            if (total >= effectiveHP) koCount++;
          }
        }
        const pct = (koCount / (n * n) * 100).toFixed(1);
        const detail = buildDetail(hazardDmg, eot, isToxic, sitrusHeal, grassyHeal);
        if (koCount === n * n) return { text: `確定2発`, cls: 'ko-guaranteed', detail };
        if (koCount > 0) return { text: `乱数2発 (${pct}%)`, cls: 'ko-possible', detail };
      } else {
        // Approximate with min/max
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

  // Apply between-hits effects (after hit h, before hit h+1). realHP = maxHp
  function applyBetweenHits(totalDmg, effectiveHP, turnNum, eot, isToxic, sitrusHeal, grassyHeal, realHP) {
    // Sitrus Berry: triggers once when damage exceeds 50% of real HP
    // (simplified: just subtract once)
    if (sitrusHeal > 0 && totalDmg >= realHP / 2 && turnNum === 1) {
      totalDmg -= sitrusHeal;
    }
    // End-of-turn recovery/damage
    totalDmg -= eot;
    totalDmg -= grassyHeal;
    // Toxic
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
