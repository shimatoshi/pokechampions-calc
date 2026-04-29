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
  function calcEndOfTurn(hp, defItem, defStatus) {
    let eot = 0; // positive = recovery, negative = damage
    // Recovery items
    if (defItem === 'Leftovers') eot += Math.floor(hp / 16);
    if (defItem === 'Black Sludge') eot += Math.floor(hp / 16); // Poison type only, simplified
    // Status damage
    if (defStatus === 'psn') eot -= Math.floor(hp / 8);
    if (defStatus === 'brn') eot -= Math.floor(hp / 16);
    return eot;
  }

  // Toxic damage: 1/16, 2/16, 3/16... per turn
  function calcToxicDmg(hp, turn) {
    return Math.floor(hp * turn / 16);
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

    // Defensive item - stat modifiers
    const dItem = defender.item || '';
    if (dItem === 'Assault Vest' && !isPhysical) def = Math.floor(def * 1.5);

    // Type-resist berry: halves SE damage of matching type
    const resistType = RESIST_BERRY[dItem];
    const berryActive = resistType && (
      (resistType === move.type && typeEff > 1) ||
      (resistType === 'Normal' && move.type === 'Normal') // Chilan Berry works on normal moves
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
      dmg = Math.max(dmg, 1);
      results.push(dmg);
    }

    const hp = defStats.hp;
    const minDmg = results[0];
    const maxDmg = results[results.length - 1];
    const minPct = (minDmg / hp * 100).toFixed(1);
    const maxPct = (maxDmg / hp * 100).toFixed(1);

    // End-of-turn effects for KO calc
    const defStatus = defender.status || '';
    const eot = calcEndOfTurn(hp, dItem, defStatus);
    const isToxic = defStatus === 'tox';

    // Sitrus Berry: heals 25% HP when below 50%
    const hasSitrus = dItem === 'Sitrus Berry';
    const sitrusHeal = hasSitrus ? Math.floor(hp / 4) : 0;

    // Grassy Terrain recovery
    const grassyHeal = (field?.terrain === 'Grassy') ? Math.floor(hp / 16) : 0;

    // KO calc with recovery/chip
    const koInfo = calcKO(results, hp, eot, isToxic, sitrusHeal, grassyHeal);

    // Life Orb recoil info for attacker
    let atkRecoil = '';
    if (item === 'Life Orb') {
      atkRecoil = `(LO反動: ${Math.floor(atkStats.hp / 10)}ダメージ)`;
    }

    return {
      move: moveName,
      moveType: move.type,
      bp,
      minDmg, maxDmg, minPct, maxPct,
      hp,
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

  function calcKO(rolls, hp, eot, isToxic, sitrusHeal, grassyHeal) {
    const min = rolls[0];
    const max = rolls[rolls.length - 1];

    // 1HKO check
    if (min >= hp) return { text: '確定1発', cls: 'ko-guaranteed', detail: '' };
    if (max >= hp) {
      const n = rolls.filter(d => d >= hp).length;
      return { text: `乱数1発 (${(n/16*100).toFixed(1)}%)`, cls: 'ko-possible', detail: '' };
    }

    // Multi-hit KO with end-of-turn effects
    for (let hits = 2; hits <= 6; hits++) {
      let minTotal = 0, maxTotal = 0;
      let sitrusUsed = false;

      for (let h = 0; h < hits; h++) {
        minTotal += min;
        maxTotal += max;

        // After each hit (except last), apply end-of-turn
        if (h < hits - 1) {
          // Sitrus Berry: triggers once when HP drops below 50%
          if (!sitrusUsed && sitrusHeal > 0) {
            if (minTotal >= hp / 2) { minTotal -= sitrusHeal; sitrusUsed = true; }
            if (maxTotal >= hp / 2) { maxTotal -= sitrusHeal; }
          }
          // End-of-turn (Leftovers recovery / status damage)
          minTotal -= eot; // eot is positive for recovery
          maxTotal -= eot;
          // Grassy Terrain
          minTotal -= grassyHeal;
          maxTotal -= grassyHeal;
          // Toxic: increasing damage each turn
          if (isToxic) {
            minTotal += Math.floor(hp * (h + 1) / 16);
            maxTotal += Math.floor(hp * (h + 1) / 16);
          }
        }
      }

      const detail = buildKODetail(hits, hp, eot, isToxic, sitrusHeal, grassyHeal);

      if (minTotal >= hp) {
        return { text: `確定${hits}発`, cls: hits <= 2 ? 'ko-guaranteed' : 'ko-possible', detail };
      }
      if (maxTotal >= hp) {
        return { text: `乱数${hits}発`, cls: 'ko-possible', detail };
      }
    }

    const hitsNeeded = Math.ceil(hp / min);
    return { text: `確定${hitsNeeded}発`, cls: 'ko-safe', detail: '' };
  }

  function buildKODetail(hits, hp, eot, isToxic, sitrusHeal, grassyHeal) {
    const parts = [];
    if (eot > 0) parts.push(`たべのこし+${eot}`);
    if (eot < 0) parts.push(`スリップ${eot}`);
    if (isToxic) parts.push('猛毒');
    if (sitrusHeal > 0) parts.push(`オボン+${sitrusHeal}`);
    if (grassyHeal > 0) parts.push(`グラスフィールド+${grassyHeal}`);
    return parts.length > 0 ? `(${parts.join(', ')}込)` : '';
  }

  return { init, calculate, getStats, calcHP, calcStat, getNatureMods, getTypeEff, findNatureName };
})();
