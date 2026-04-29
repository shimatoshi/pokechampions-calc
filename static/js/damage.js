// Pokemon Champions Damage Calculator Engine
const DMG = (() => {
  // Type effectiveness chart (loaded from data)
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

  function getNatureMods(nature) {
    const n = natureDB[nature];
    if (!n) return { at: 1, df: 1, sa: 1, sd: 1, sp: 1 };
    const mods = { at: 1, df: 1, sa: 1, sd: 1, sp: 1 };
    // Format: [plusStat, minusStat] e.g. ["at", "sa"]
    const plus = Array.isArray(n) ? n[0] : n.plus;
    const minus = Array.isArray(n) ? n[1] : n.minus;
    if (plus) mods[plus] = 1.1;
    if (minus) mods[minus] = 0.9;
    return mods;
  }

  function getStats(poke) {
    const base = pokeDB[poke.name]?.bs;
    if (!base) return null;
    const nm = getNatureMods(poke.nature);
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
    let atk = isPhysical ? atkStats.at : atkStats.sa;
    let def = isPhysical ? defStats.df : defStats.sd;

    // Apply boosts
    const atkBoost = isPhysical ? (attacker.boosts?.at || 0) : (attacker.boosts?.sa || 0);
    const defBoost = isPhysical ? (defender.boosts?.df || 0) : (defender.boosts?.sd || 0);
    atk = applyBoost(atk, atkBoost);
    def = applyBoost(def, defBoost);

    let bp = move.bp;

    // STAB
    const atkTypes = atkData.types;
    const isSTAB = atkTypes.includes(move.type);
    const stabMod = isSTAB ? (attacker.ability === 'Adaptability' ? 2 : 1.5) : 1;

    // Type effectiveness
    const defTypes = defData.types;
    const typeEff = getTypeEff(move.type, defTypes);

    // Weather
    let weatherMod = 1;
    if (field?.weather === 'Sun') {
      if (move.type === 'Fire') weatherMod = 1.5;
      if (move.type === 'Water') weatherMod = 0.5;
    } else if (field?.weather === 'Rain') {
      if (move.type === 'Water') weatherMod = 1.5;
      if (move.type === 'Fire') weatherMod = 0.5;
    }

    // Terrain
    let terrainMod = 1;
    if (field?.terrain === 'Electric' && move.type === 'Electric') terrainMod = 1.3;
    if (field?.terrain === 'Grassy' && move.type === 'Grass') terrainMod = 1.3;
    if (field?.terrain === 'Psychic' && move.type === 'Psychic') terrainMod = 1.3;
    if (field?.terrain === 'Misty' && move.type === 'Dragon') terrainMod = 0.5;

    // Burn
    const burnMod = (attacker.status === 'brn' && isPhysical && attacker.ability !== 'Guts') ? 0.5 : 1;

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
    let defItemMod = 1;
    const dItem = defender.item || '';
    if (dItem === 'Assault Vest' && !isPhysical) def = Math.floor(def * 1.5);
    if (dItem === 'Eviolite') { /* Champions doesn't use eviolite much */ }

    atk = Math.floor(atk * itemAtkMod);

    // Critical hit
    const critMod = field?.crit ? 1.5 : 1;

    // Base damage: floor(floor((floor(2*50/5+2) * bp * atk) / def) / 50 + 2)
    const baseDmg = Math.floor(Math.floor((Math.floor(2 * 50 / 5 + 2) * bp * atk) / def) / 50 + 2);

    // Apply modifiers
    const results = [];
    for (let roll = 85; roll <= 100; roll++) {
      let dmg = baseDmg;
      dmg = Math.floor(dmg * spreadMod);
      dmg = Math.floor(dmg * weatherMod);
      // Critical
      dmg = Math.floor(dmg * critMod);
      // Random
      dmg = Math.floor(dmg * roll / 100);
      // STAB
      dmg = Math.floor(dmg * stabMod);
      // Type effectiveness
      dmg = Math.floor(dmg * typeEff);
      // Burn
      dmg = Math.floor(dmg * burnMod);
      // Terrain
      dmg = Math.floor(dmg * terrainMod);
      // Item
      dmg = Math.floor(dmg * itemMod);
      // Defender item
      dmg = Math.floor(dmg * defItemMod);

      dmg = Math.max(dmg, 1);
      results.push(dmg);
    }

    const hp = defStats.hp;
    const minDmg = results[0];
    const maxDmg = results[results.length - 1];
    const minPct = (minDmg / hp * 100).toFixed(1);
    const maxPct = (maxDmg / hp * 100).toFixed(1);

    // KO calc
    let koText = '';
    let koClass = '';
    if (minDmg >= hp) {
      koText = '確定1発';
      koClass = 'ko-guaranteed';
    } else if (maxDmg >= hp) {
      const koRolls = results.filter(d => d >= hp).length;
      koText = `乱数1発 (${(koRolls / 16 * 100).toFixed(1)}%)`;
      koClass = 'ko-possible';
    } else {
      // Check 2HKO
      const min2 = minDmg * 2;
      const max2 = maxDmg * 2;
      if (min2 >= hp) {
        koText = '確定2発';
        koClass = 'ko-guaranteed';
      } else if (max2 >= hp) {
        koText = '乱数2発';
        koClass = 'ko-possible';
      } else {
        const hitsNeeded = Math.ceil(hp / minDmg);
        koText = `確定${hitsNeeded}発`;
        koClass = 'ko-safe';
      }
    }

    return {
      move: moveName,
      moveType: move.type,
      bp,
      minDmg, maxDmg, minPct, maxPct,
      hp,
      koText, koClass,
      typeEff,
      isSTAB,
      atkStats, defStats
    };
  }

  return { init, calculate, getStats, calcHP, calcStat, getNatureMods, getTypeEff };
})();
