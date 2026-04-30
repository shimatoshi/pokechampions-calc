// Pokemon Champions Calculator - Main App
let DATA = { pokemon: {}, moves: {}, types: {}, natures: {}, items: {} };
let JA = { pokemon: {}, moves: {}, natures: {}, items: {}, abilities: {} };
let pokemonNames = [];

// ===== HELPERS =====
function ja(type, en) {
  return JA[type]?.[en] || en;
}

function spriteUrl(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `img/${slug}.webp`;
}

function spriteImg(name, size = 40) {
  return `<img src="${spriteUrl(name)}" alt="${ja('pokemon', name)}" width="${size}" height="${size}" style="image-rendering:pixelated" onerror="this.style.display='none'">`;
}

function typeBadge(t) {
  const typeJa = {Normal:'ノーマル',Fire:'ほのお',Water:'みず',Grass:'くさ',Electric:'でんき',Ice:'こおり',Fighting:'かくとう',Poison:'どく',Ground:'じめん',Flying:'ひこう',Psychic:'エスパー',Bug:'むし',Rock:'いわ',Ghost:'ゴースト',Dragon:'ドラゴン',Dark:'あく',Steel:'はがね',Fairy:'フェアリー',Stellar:'ステラ'};
  return `<span class="type-badge type-${t}">${typeJa[t]||t}</span>`;
}

const STAT_JA = {hp:'HP',at:'攻撃',df:'防御',sa:'特攻',sd:'特防',sp:'素早'};
const STAT_SHORT = {hp:'H',at:'A',df:'B',sa:'C',sd:'D',sp:'S'};

// ===== SHOWDOWN-STYLE TEXT FORMAT =====
function toShowdownText(poke) {
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

function showdownHTML(poke) {
  const text = toShowdownText(poke);
  return `<pre class="sd-text">${text}</pre>`;
}

function teamToShowdownText(team) {
  return team.members.map(m => toShowdownText(m)).join('\n\n');
}

// ===== DATA LOADING =====
async function loadData() {
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
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('show');
  document.querySelector(`nav button[data-page="${page}"]`).classList.add('active');
}

// ===== AUTOCOMPLETE SEARCH =====
function setupSearch(inputEl, listEl, entries, onSelect) {
  // entries: [{key, label, extra}] or just string[] for pokemon/moves
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
  listEl.addEventListener('click', e => {
    const item = e.target.closest('.item');
    if (!item) return;
    const name = item.dataset.name;
    const jaName = JA.pokemon[name] || JA.moves[name] || name;
    inputEl.value = jaName !== name ? `${jaName} (${name})` : name;
    inputEl.dataset.key = name;
    listEl.classList.remove('open');
    onSelect(name);
  });
  // Allow free text (for status moves etc) - save raw text as key on blur
  inputEl.addEventListener('blur', () => {
    if (!inputEl.dataset.key && inputEl.value.trim()) {
      inputEl.dataset.key = inputEl.value.trim();
      onSelect(inputEl.value.trim());
    }
  });
  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !listEl.contains(e.target))
      listEl.classList.remove('open');
  });
}

// ===== ITEM SEARCH =====
function setupItemSearch(inputEl, listEl, entries, onSelect) {
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
  listEl.addEventListener('click', e => {
    const item = e.target.closest('.item');
    if (!item || !item.dataset.name) return;
    const name = item.dataset.name;
    const jaName = ja('items', name);
    inputEl.value = jaName !== name ? `${jaName}` : name;
    inputEl.dataset.key = name;
    listEl.classList.remove('open');
    onSelect(name);
  });
  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !listEl.contains(e.target))
      listEl.classList.remove('open');
  });
}

// ===== POKEMON STATE =====
function makePokemonState() {
  return {
    name: '',
    natureMods: { plus: '', minus: '' }, // Showdown-style
    sp: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
    boosts: { at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
    item: '',
    ability: '',
    status: '',
    moves: ['', '', '', '']
  };
}

const atkState = makePokemonState();
const defState = makePokemonState();
const fieldState = { weather: '', terrain: '', doubles: false, crit: false, stealthRock: false, spikes: 0, pinch: false };

// ===== NATURE UI (Showdown-style +/- on stats) =====
function buildNatureUI(side) {
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

function initNatureUI(side, state) {
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
        // Both set: replace minus
        if (s !== state.natureMods.plus) state.natureMods.minus = s;
      }
      updateNatureDisplay(side, state);
      updateStatDisplay(side, state);
    });
  }
  updateNatureDisplay(side, state);
}

function updateNatureDisplay(side, state) {
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
  // Show nature name
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

// ===== BUILD SIDE PANEL =====
function buildSidePanel(side) {
  const s = side;
  const label = s === 'atk' ? '攻撃側' : '防御側';

  return `
    <div class="card">
      <h3>${label}</h3>
      <div class="search-wrap">
        <input type="text" id="${s}-search" placeholder="ポケモン名 / 日本語..." autocomplete="off">
        <div class="search-list" id="${s}-list"></div>
      </div>
      <div id="${s}-info" class="poke-info"></div>
      ${buildNatureUI(s)}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="${s}-item-search" placeholder="もちもの検索..." autocomplete="off">
        <div class="search-list" id="${s}-item-list"></div>
      </div>
      <div id="${s}-ability-wrap" class="hidden">
        <label>とくせい</label>
        <select id="${s}-ability"></select>
      </div>
      <label>状態異常</label>
      <select id="${s}-status">
        <option value="">なし</option>
        <option value="brn">やけど</option>
        <option value="psn">どく (1/8)</option>
        <option value="tox">もうどく</option>
        <option value="par">まひ</option>
      </select>
      <label>SP配分 <span id="${s}-sp-total" class="sp-total">0/66</span></label>
      <div id="${s}-sp">
        ${['hp','at','df','sa','sd','sp'].map(stat => `
          <div class="sp-row">
            <span class="sp-label">${STAT_SHORT[stat]}</span>
            <button class="sp-btn" data-side="${s}" data-stat="${stat}" data-act="0">0</button>
            <button class="sp-btn" data-side="${s}" data-stat="${stat}" data-act="-">-</button>
            <input type="number" id="${s}-sp-${stat}" min="0" max="32" value="0" data-stat="${stat}">
            <button class="sp-btn" data-side="${s}" data-stat="${stat}" data-act="+">+</button>
            <button class="sp-btn" data-side="${s}" data-stat="${stat}" data-act="32">32</button>
            <span class="sp-val" id="${s}-val-${stat}">-</span>
          </div>
        `).join('')}
      </div>
      <label>ランク補正</label>
      <div class="col3">
        ${(s === 'atk' ? ['at','sa','sp'] : ['df','sd','sp']).map(stat => `
          <div class="boost-sel">
            <span style="font-size:.7rem">${STAT_SHORT[stat]}</span>
            <select id="${s}-boost-${stat}" style="width:50px">
              ${[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].map(v => `<option value="${v}"${v===0?' selected':''}>${v>=0?'+':''}${v}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
      ${s === 'atk' ? `
      <label>わざ</label>
      ${[0,1,2,3].map(i => `
        <div class="search-wrap" style="margin-bottom:4px">
          <input type="text" id="${s}-move-${i}" placeholder="わざ${i+1}..." autocomplete="off">
          <div class="search-list" id="${s}-movelist-${i}"></div>
        </div>
      `).join('')}` : ''}
    </div>`;
}

// ===== INIT CALC PAGE =====
function initCalcPage() {
  const page = document.getElementById('page-calc');
  page.innerHTML = `
    <div class="row">
      <div>${buildSidePanel('atk')}</div>
      <div>${buildSidePanel('def')}</div>
    </div>
    <div class="card">
      <h3>フィールド</h3>
      <div class="col2">
        <div>
          <label>天候</label>
          <select id="field-weather">
            <option value="">なし</option>
            <option value="Sun">はれ</option><option value="Rain">あめ</option>
            <option value="Sand">すなあらし</option><option value="Snow">ゆき</option>
          </select>
        </div>
        <div>
          <label>フィールド</label>
          <select id="field-terrain">
            <option value="">なし</option>
            <option value="Electric">エレキ</option><option value="Grassy">グラス</option>
            <option value="Psychic">サイコ</option><option value="Misty">ミスト</option>
          </select>
        </div>
      </div>
      <div class="col2 mt">
        <label><input type="checkbox" id="field-doubles"> ダブル</label>
        <label><input type="checkbox" id="field-crit"> 急所</label>
      </div>
      <div class="col2 mt">
        <label><input type="checkbox" id="field-pinch"> HP1/3以下</label>
        <label><input type="checkbox" id="field-sr"> ステルスロック</label>
        <div>
          <label>まきびし</label>
          <select id="field-spikes" style="width:60px">
            <option value="0">なし</option>
            <option value="1">1層</option>
            <option value="2">2層</option>
            <option value="3">3層</option>
          </select>
        </div>
      </div>
    </div>
    <div class="row mt" style="gap:4px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-sm" id="load-atk-from" title="チーム/対策表から攻撃側に読込">攻撃側に読込</button>
      <button class="btn btn-sm" id="swap-sides" style="background:var(--accent2)">攻守入替</button>
      <button class="btn btn-sm" id="load-def-from" title="チーム/対策表から防御側に読込">防御側に読込</button>
    </div>
    <button class="btn mt" style="width:100%" id="calc-btn">ダメージ計算</button>
    <div class="row mt" style="gap:4px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" id="add-atk-to-team">攻→チーム</button>
      <button class="btn btn-outline btn-sm" id="add-def-to-team">防→チーム</button>
      <button class="btn btn-outline btn-sm" id="add-atk-to-box">攻→BOX</button>
      <button class="btn btn-outline btn-sm" id="add-def-to-box">防→BOX</button>
      <button class="btn btn-outline btn-sm" style="border-color:var(--warn);color:var(--warn)" id="add-atk-to-threat">攻→仮想敵</button>
      <button class="btn btn-outline btn-sm" style="border-color:var(--warn);color:var(--warn)" id="add-def-to-threat">防→仮想敵</button>
    </div>
    <div class="row mt" style="gap:4px">
      <button class="btn btn-sm btn-outline" id="save-calc-result" style="width:100%;border-color:var(--accent2);color:var(--accent2)">ダメ計結果をBOXに保存</button>
    </div>
    <div id="calc-results"></div>
    <div id="load-picker" class="hidden"></div>
  `;

  // Pokemon search
  setupSearch(document.getElementById('atk-search'), document.getElementById('atk-list'), pokemonNames, n => selectPokemon('atk', n));
  setupSearch(document.getElementById('def-search'), document.getElementById('def-list'), pokemonNames, n => selectPokemon('def', n));

  // Move search
  const moveNames = Object.keys(DATA.moves).sort();
  for (let i = 0; i < 4; i++) {
    setupSearch(document.getElementById(`atk-move-${i}`), document.getElementById(`atk-movelist-${i}`), moveNames, name => { atkState.moves[i] = name; });
  }

  // Nature UI
  initNatureUI('atk', atkState);
  initNatureUI('def', defState);

  // Item search setup
  const itemNames = Object.keys(DATA.items).sort();
  const itemEntries = itemNames.map(k => ({ key: k, ja: ja('items', k) }));
  for (const side of ['atk', 'def']) {
    const state = side === 'atk' ? atkState : defState;
    setupItemSearch(
      document.getElementById(`${side}-item-search`),
      document.getElementById(`${side}-item-list`),
      itemEntries,
      name => { state.item = name; }
    );
  }

  // SP inputs + buttons, status, boosts
  for (const side of ['atk', 'def']) {
    const state = side === 'atk' ? atkState : defState;
    for (const stat of ['hp','at','df','sa','sd','sp']) {
      document.getElementById(`${side}-sp-${stat}`).addEventListener('input', e => {
        state.sp[stat] = Math.max(0, Math.min(32, parseInt(e.target.value) || 0));
        updateStatDisplay(side, state);
      });
    }
    document.getElementById(`${side}-status`).addEventListener('change', e => state.status = e.target.value);
    const boostStats = side === 'atk' ? ['at','sa','sp'] : ['df','sd','sp'];
    for (const stat of boostStats) {
      document.getElementById(`${side}-boost-${stat}`).addEventListener('change', e => state.boosts[stat] = parseInt(e.target.value));
    }
  }

  // SP +/- /0/32 buttons (scoped to page, not document)
  page.addEventListener('click', e => {
    const btn = e.target.closest('.sp-btn');
    if (!btn) return;
    const { side, stat, act } = btn.dataset;
    const state = side === 'atk' ? atkState : defState;
    const input = document.getElementById(`${side}-sp-${stat}`);
    let val = state.sp[stat] || 0;
    if (act === '+') val = Math.min(32, val + 1);
    else if (act === '-') val = Math.max(0, val - 1);
    else if (act === '0') val = 0;
    else if (act === '32') val = 32;
    state.sp[stat] = val;
    input.value = val;
    updateStatDisplay(side, state);
  });

  // Add to team buttons
  document.getElementById('add-atk-to-team').addEventListener('click', () => addCalcToTeam('atk'));
  document.getElementById('add-def-to-team').addEventListener('click', () => addCalcToTeam('def'));

  // Swap attacker/defender
  document.getElementById('swap-sides').addEventListener('click', swapSides);

  // Load from team/threats
  document.getElementById('load-atk-from').addEventListener('click', () => openLoadPicker('atk'));
  document.getElementById('load-def-from').addEventListener('click', () => openLoadPicker('def'));

  // Add to box
  document.getElementById('add-atk-to-box').addEventListener('click', () => addCalcToBox('atk'));
  document.getElementById('add-def-to-box').addEventListener('click', () => addCalcToBox('def'));

  // Add to threats
  document.getElementById('add-atk-to-threat').addEventListener('click', () => addToThreat('atk'));
  document.getElementById('add-def-to-threat').addEventListener('click', () => addToThreat('def'));

  // Save calc result to box
  document.getElementById('save-calc-result').addEventListener('click', saveCalcToBox);

  document.getElementById('calc-btn').addEventListener('click', runCalc);
  document.getElementById('field-weather').addEventListener('change', e => fieldState.weather = e.target.value);
  document.getElementById('field-terrain').addEventListener('change', e => fieldState.terrain = e.target.value);
  document.getElementById('field-doubles').addEventListener('change', e => fieldState.doubles = e.target.checked);
  document.getElementById('field-crit').addEventListener('change', e => fieldState.crit = e.target.checked);
  document.getElementById('field-pinch').addEventListener('change', e => fieldState.pinch = e.target.checked);
  document.getElementById('field-sr').addEventListener('change', e => fieldState.stealthRock = e.target.checked);
  document.getElementById('field-spikes').addEventListener('change', e => fieldState.spikes = parseInt(e.target.value));

  // Restore field UI from state (survives initCalcPage re-calls)
  document.getElementById('field-weather').value = fieldState.weather;
  document.getElementById('field-terrain').value = fieldState.terrain;
  document.getElementById('field-doubles').checked = fieldState.doubles;
  document.getElementById('field-crit').checked = fieldState.crit;
  document.getElementById('field-pinch').checked = fieldState.pinch;
  document.getElementById('field-sr').checked = fieldState.stealthRock;
  document.getElementById('field-spikes').value = fieldState.spikes;
}

function selectPokemon(side, name) {
  const state = side === 'atk' ? atkState : defState;
  state.name = name;
  const data = DATA.pokemon[name];
  if (!data) return;

  const info = document.getElementById(`${side}-info`);
  const jaName = ja('pokemon', name);
  info.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
      ${spriteImg(name, 48)}
      <div>
        <div style="font-weight:700">${jaName}</div>
        <div style="font-size:.7rem;color:var(--fg2)">${name}</div>
        <div>${data.types.map(t => typeBadge(t)).join(' ')}</div>
      </div>
    </div>`;

  // Formes
  if (data.formes && data.formes.length > 1) {
    info.innerHTML += `<div style="font-size:.75rem;margin-top:2px">${data.formes.map(f =>
      `<span class="btn btn-sm btn-outline" style="margin:1px;padding:2px 6px;font-size:.7rem;cursor:pointer" data-forme="${f}">${ja('pokemon', f) || f}</span>`
    ).join('')}</div>`;
    info.querySelectorAll('[data-forme]').forEach(btn => {
      btn.addEventListener('click', () => {
        const searchEl = document.getElementById(`${side}-search`);
        const forme = btn.dataset.forme;
        searchEl.value = ja('pokemon', forme) || forme;
        searchEl.dataset.key = forme;
        selectPokemon(side, forme);
      });
    });
  }

  // Ability
  const abilWrap = document.getElementById(`${side}-ability-wrap`);
  const abilSel = document.getElementById(`${side}-ability`);
  if (data.abilities.length > 0) {
    abilWrap.classList.remove('hidden');
    abilSel.innerHTML = data.abilities.map(a => `<option value="${a}">${ja('abilities', a) || a}</option>`).join('');
    state.ability = data.abilities[0];
    abilSel.onchange = e => state.ability = e.target.value;
  }

  updateStatDisplay(side, state);
}

function updateStatDisplay(side, state) {
  if (!state.name) return;
  const stats = DMG.getStats(state);
  if (!stats) return;
  let total = 0;
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    const el = document.getElementById(`${side}-val-${stat}`);
    if (el) {
      el.textContent = stats[stat];
      // Color based on nature
      if (state.natureMods?.plus === stat) el.style.color = '#e74c3c';
      else if (state.natureMods?.minus === stat) el.style.color = '#3498db';
      else el.style.color = '';
    }
    total += (state.sp[stat] || 0);
  }
  const totalEl = document.getElementById(`${side}-sp-total`);
  if (totalEl) {
    totalEl.textContent = `${total}/66`;
    totalEl.classList.toggle('over', total > 66);
  }
}

function runCalc() {
  if (!atkState.name || !defState.name) return;
  const results = document.getElementById('calc-results');
  let html = '';

  const activeMoves = atkState.moves.filter(m => m && DATA.moves[m]);
  if (activeMoves.length === 0) {
    results.innerHTML = '<div class="dmg-result">わざを1つ以上選択してください</div>';
    return;
  }

  // Check if all selected moves are status moves
  const damageMoves = activeMoves.filter(m => DATA.moves[m]?.bp > 0);
  if (damageMoves.length === 0) {
    results.innerHTML = '<div class="dmg-result" style="font-size:.85rem">変化技のみ選択されています（ダメージ計算対象なし）</div>';
    return;
  }

  for (const moveName of activeMoves) {
    const r = DMG.calculate(atkState, defState, moveName, fieldState);
    if (!r) continue;

    let effText = '';
    if (r.typeEff > 1) effText = `<span class="eff-2">効果ばつぐん (×${r.typeEff})</span>`;
    else if (r.typeEff < 1 && r.typeEff > 0) effText = `<span class="eff-05">いまひとつ (×${r.typeEff})</span>`;
    else if (r.typeEff === 0) effText = `<span class="eff-0">効果なし</span>`;

    const jaMove = ja('moves', moveName);
    html += `
      <div class="dmg-result">
        <div style="font-size:.8rem;margin-bottom:4px">
          ${typeBadge(r.moveType)}
          <strong>${jaMove}</strong> <span style="color:var(--fg2);font-size:.7rem">${moveName}</span> (威力${r.bp})
          ${r.isSTAB ? '<span style="color:var(--warn);font-size:.7rem">STAB</span>' : ''}
        </div>
        <div class="pct">${r.minPct}% ~ ${r.maxPct}%</div>
        <div class="range">${r.minDmg} ~ ${r.maxDmg} / ${r.hp} HP</div>
        <div class="ko ${r.koClass}">${r.koText} ${r.koDetail || ''}</div>
        ${r.statNote ? `<div style="font-size:.7rem;color:var(--accent2)">${r.statNote}</div>` : ''}
        ${r.berryActive ? `<div style="font-size:.75rem;color:var(--ok)">${ja('items', r.berryItem)}で半減</div>` : ''}
        ${r.atkRecoil ? `<div style="font-size:.75rem;color:var(--fg2)">${r.atkRecoil}</div>` : ''}
        <div class="effectiveness">${effText}</div>
      </div>`;
  }
  results.innerHTML = html;
}

// ===== SWAP ATTACKER/DEFENDER =====
function swapSides() {
  const tmp = JSON.parse(JSON.stringify(atkState));
  Object.assign(atkState, JSON.parse(JSON.stringify(defState)));
  Object.assign(defState, tmp);
  // Re-render both sides
  initCalcPage();
  if (atkState.name) { selectPokemon('atk', atkState.name); restoreStateToUI('atk', atkState); }
  if (defState.name) { selectPokemon('def', defState.name); restoreStateToUI('def', defState); }
  showToast('攻守入替');
}

// ===== LOAD FROM TEAM / THREATS =====
async function openLoadPicker(side) {
  const picker = document.getElementById('load-picker');
  const members = currentTeam.members || [];
  const threats = await DB.getAll('threats');

  picker.classList.remove('hidden');
  picker.innerHTML = `
    <div class="card" style="border:2px solid var(--accent);max-height:60vh;overflow-y:auto">
      <h3>${side === 'atk' ? '攻撃側' : '防御側'}に読込</h3>
      ${members.length > 0 ? `
        <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">チーム: ${currentTeam.name}</div>
        ${members.map((m, i) => `
          <div class="team-slot pick-slot" data-src="team" data-idx="${i}">
            ${spriteImg(m.name, 28)}
            <div class="name">${ja('pokemon', m.name)}</div>
            ${DATA.pokemon[m.name]?.types.map(t => typeBadge(t)).join('')||''}
          </div>`).join('')}
      ` : '<div style="font-size:.8rem;color:var(--fg2);margin:4px 0">チームなし</div>'}
      <hr>
      <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">対策表</div>
      ${threats.length > 0 ? threats.map(t => `
        <div class="team-slot pick-slot" data-src="threat" data-idx="${t.id}">
          ${spriteImg(t.name, 28)}
          <div class="name">${ja('pokemon', t.name)}</div>
          ${DATA.pokemon[t.name]?.types.map(tp => typeBadge(tp)).join('')||''}
          ${t.item ? `<span style="font-size:.65rem;color:var(--fg2)">${ja('items',t.item)}</span>` : ''}
        </div>`).join('') : '<div style="font-size:.8rem;color:var(--fg2)">対策表が空です（編成タブで追加）</div>'}
      <button class="btn btn-outline mt" id="pick-close">閉じる</button>
    </div>`;

  picker.querySelector('#pick-close').addEventListener('click', () => picker.classList.add('hidden'));
  picker.querySelectorAll('.pick-slot').forEach(slot => {
    slot.addEventListener('click', () => {
      const state = side === 'atk' ? atkState : defState;
      let src;
      if (slot.dataset.src === 'team') {
        src = currentTeam.members[parseInt(slot.dataset.idx)];
      } else {
        src = threats.find(t => t.id === parseInt(slot.dataset.idx));
      }
      if (!src) return;
      Object.assign(state, JSON.parse(JSON.stringify(src)));
      picker.classList.add('hidden');
      initCalcPage();
      if (atkState.name) { selectPokemon('atk', atkState.name); restoreStateToUI('atk', atkState); }
      if (defState.name) { selectPokemon('def', defState.name); restoreStateToUI('def', defState); }
      showToast(`${ja('pokemon', src.name)} を${side === 'atk' ? '攻撃側' : '防御側'}に読込`);
    });
  });
}

// ===== INDIVIDUAL IDENTITY =====
// Same species + same SP + same nature + same moves + same item = same individual
function buildFingerprint(state) {
  const sp = state.sp || {};
  const nm = state.natureMods || {};
  const moves = (state.moves || []).filter(Boolean).sort().join(',');
  return `${state.name}|${sp.hp||0},${sp.at||0},${sp.df||0},${sp.sa||0},${sp.sd||0},${sp.sp||0}|${nm.plus||''},${nm.minus||''}|${moves}|${state.item||''}`;
}

function findBoxMatch(boxAll, state) {
  const fp = buildFingerprint(state);
  return boxAll.find(b => buildFingerprint(b) === fp);
}

// ===== ADD TO BOX / THREATS FROM CALC =====
async function addCalcToBox(side) {
  const state = side === 'atk' ? atkState : defState;
  if (!state.name) { showToast('ポケモンを選択してください'); return; }
  const boxAll = await DB.getAll('box');
  if (findBoxMatch(boxAll, state)) { showToast('同じ個体がBOXに存在します'); return; }
  const entry = JSON.parse(JSON.stringify(state));
  delete entry.id; // remove any stale id
  entry.savedCalcs = [];
  entry.notes = '';
  await DB.add('box', entry);
  showToast(`${ja('pokemon', state.name)} をBOXに追加`);
}

async function addToThreat(side) {
  const state = side === 'atk' ? atkState : defState;
  if (!state.name) { showToast('ポケモンを選択してください'); return; }
  const entry = JSON.parse(JSON.stringify(state));
  delete entry.id;
  await DB.add('threats', entry);
  showToast(`${ja('pokemon', state.name)} を仮想敵に追加`);
}

async function saveCalcToBox() {
  if (!atkState.name || !defState.name) { showToast('攻守両方を選択してください'); return; }
  const activeMoves = atkState.moves.filter(m => m && DATA.moves[m]);
  if (activeMoves.length === 0) { showToast('わざを選択してください'); return; }

  // Build calc summary for ATTACKER (attacking calcs)
  const atkCalcs = [];
  for (const moveName of activeMoves) {
    const r = DMG.calculate(atkState, defState, moveName, fieldState);
    if (!r) continue;
    atkCalcs.push({
      dir: 'atk', // attacking
      vs: defState.name,
      move: moveName,
      range: `${r.minPct}%~${r.maxPct}%`,
      ko: r.koText,
      detail: r.koDetail || ''
    });
  }

  // Build calc summary for DEFENDER (receiving calcs)
  const defCalcs = [];
  for (const moveName of activeMoves) {
    const r = DMG.calculate(atkState, defState, moveName, fieldState);
    if (!r) continue;
    defCalcs.push({
      dir: 'def', // defending
      vs: atkState.name,
      move: moveName,
      range: `${r.minPct}%~${r.maxPct}%`,
      ko: r.koText,
      detail: r.koDetail || ''
    });
  }

  const boxAll = await DB.getAll('box');
  let saved = 0;

  // Save attacker's calcs
  if (atkCalcs.length > 0) {
    let atkBox = findBoxMatch(boxAll, atkState);
    if (!atkBox) {
      atkBox = JSON.parse(JSON.stringify(atkState));
      delete atkBox.id;
      atkBox.savedCalcs = [];
      atkBox.notes = '';
    }
    if (!atkBox.savedCalcs) atkBox.savedCalcs = [];
    for (const cr of atkCalcs) {
      if (!atkBox.savedCalcs.some(s => s.dir === cr.dir && s.vs === cr.vs && s.move === cr.move && s.range === cr.range)) {
        atkBox.savedCalcs.push(cr);
        saved++;
      }
    }
    await DB.put('box', atkBox);
    // Update boxAll for defender lookup
    if (!atkBox.id) boxAll.push(atkBox);
  }

  // Save defender's calcs
  if (defCalcs.length > 0) {
    let defBox = findBoxMatch(boxAll, defState);
    if (!defBox) {
      defBox = JSON.parse(JSON.stringify(defState));
      delete defBox.id;
      defBox.savedCalcs = [];
      defBox.notes = '';
    }
    if (!defBox.savedCalcs) defBox.savedCalcs = [];
    for (const cr of defCalcs) {
      if (!defBox.savedCalcs.some(s => s.dir === cr.dir && s.vs === cr.vs && s.move === cr.move && s.range === cr.range)) {
        defBox.savedCalcs.push(cr);
        saved++;
      }
    }
    await DB.put('box', defBox);
  }

  showToast(`ダメ計結果をBOXに保存 (${saved}件)`);
}

// ===== ADD TO TEAM FROM CALC =====
function addCalcToTeam(side) {
  const state = side === 'atk' ? atkState : defState;
  if (!state.name) { showToast('ポケモンを選択してください'); return; }
  if (currentTeam.members.length >= 6) { showToast('チームは6匹まで'); return; }
  // Check duplicate by fingerprint (same species + different build = OK)
  const fp = buildFingerprint(state);
  if (currentTeam.members.some(m => buildFingerprint(m) === fp)) {
    showToast(`同じ個体が既にチームにいます`);
    return;
  }
  const member = JSON.parse(JSON.stringify(state));
  currentTeam.members.push(member);
  showToast(`${ja('pokemon', state.name)} をチームに追加しました (${currentTeam.members.length}/6)`);
}

// ===== TEAM PAGE (2-screen: list → detail) =====
let currentTeam = { id: null, name: '新チーム', members: [], notes: '' };
let teamView = 'list'; // 'list' or 'detail'

function initTeamPage() { renderTeamList(); }

// ===== TEAM LIST (main view) =====
async function renderTeamList() {
  teamView = 'list';
  const teams = await DB.getAll('teams');
  const threats = await DB.getAll('threats');
  const page = document.getElementById('page-team');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:4px">
        <h3 style="flex:1;margin:0">チーム一覧</h3>
        <button class="btn btn-sm" id="tl-new">+ 新規</button>
        <button class="btn btn-sm btn-outline" id="tl-import">インポート</button>
        <input type="file" id="tl-import-file" accept=".json" class="hidden">
      </div>
    </div>
    <div id="team-rows">
      ${teams.length === 0 ? '<div class="card"><p style="text-align:center;color:var(--fg2)">チームがありません</p></div>' : ''}
      ${teams.map(t => renderTeamRow(t)).join('')}
    </div>
    <div class="card mt">
      <h3>対策表（仮想敵）</h3>
      <div id="threat-list">
        ${threats.length === 0 ? '<div style="font-size:.8rem;color:var(--fg2)">仮想敵が未登録です</div>' : ''}
        ${threats.map(t => renderThreatSlot(t)).join('')}
      </div>
      <button class="btn btn-outline mt" style="width:100%" id="threat-add">+ 仮想敵を追加</button>
      <div id="threat-editor" class="hidden"></div>
    </div>
    <div id="team-load-modal" class="hidden"></div>
  `;

  document.getElementById('tl-new').addEventListener('click', () => {
    currentTeam = { id: null, name: '新チーム', members: [], notes: '' };
    renderTeamDetail();
  });
  document.getElementById('tl-import').addEventListener('click', () => document.getElementById('tl-import-file').click());
  document.getElementById('tl-import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.name && data.members) {
        delete data.id;
        await DB.add('teams', data);
        showToast(`チーム「${data.name}」をインポート`);
        renderTeamList();
      } else { showToast('無効なチームデータ'); }
    } catch (err) { showToast('読込失敗: ' + err.message); }
    e.target.value = '';
  });
  document.getElementById('threat-add')?.addEventListener('click', () => openThreatEditor());

  // Team row click → open detail
  page.querySelectorAll('.team-row').forEach(row => {
    const id = parseInt(row.dataset.id);
    row.querySelector('.tr-del')?.addEventListener('click', async e => {
      e.stopPropagation();
      await DB.del('teams', id);
      renderTeamList();
    });
    row.querySelector('.tr-export')?.addEventListener('click', async e => {
      e.stopPropagation();
      const team = await DB.get('teams', id);
      const blob = new Blob([JSON.stringify(team, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `team_${team.name}.json`; a.click();
      URL.revokeObjectURL(url);
      showToast('エクスポート');
    });
    row.addEventListener('click', async () => {
      const team = await DB.get('teams', id);
      currentTeam = { id: team.id, name: team.name, members: team.members, notes: team.notes || '' };
      renderTeamDetail();
    });
  });

  // Threat events
  page.querySelectorAll('.threat-slot').forEach(slot => {
    const id = parseInt(slot.dataset.id);
    slot.querySelector('.threat-edit')?.addEventListener('click', e => {
      e.stopPropagation();
      const t = threats.find(x => x.id === id);
      if (t) openThreatEditor(t);
    });
    slot.querySelector('.threat-del')?.addEventListener('click', async e => {
      e.stopPropagation();
      await DB.del('threats', id);
      renderTeamList();
    });
    slot.addEventListener('click', () => {
      const t = threats.find(x => x.id === id);
      if (!t) return;
      Object.assign(defState, JSON.parse(JSON.stringify(t)));
      switchPage('calc');
      initCalcPage();
      if (atkState.name) { selectPokemon('atk', atkState.name); restoreStateToUI('atk', atkState); }
      selectPokemon('def', defState.name);
      restoreStateToUI('def', defState);
    });
  });
}

function renderTeamRow(team) {
  const sprites = [];
  for (let i = 0; i < 6; i++) {
    if (team.members[i]) {
      sprites.push(spriteImg(team.members[i].name, 40));
    } else {
      sprites.push('<div class="team-empty-slot"></div>');
    }
  }
  return `
    <div class="team-row card" data-id="${team.id}" style="cursor:pointer">
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
        <strong style="flex:1">${team.name}</strong>
        <button class="btn btn-sm btn-outline tr-export" style="font-size:.6rem;padding:2px 6px">出力</button>
        <button class="btn btn-sm btn-danger tr-del" style="font-size:.6rem;padding:2px 6px">×</button>
      </div>
      <div class="team-sprites">${sprites.join('')}</div>
    </div>`;
}

// ===== TEAM DETAIL (after tapping a team row) =====
async function renderTeamDetail() {
  teamView = 'detail';
  const page = document.getElementById('page-team');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:4px">
        <button class="btn btn-sm btn-outline" id="td-back">← 一覧</button>
        <input type="text" id="team-name" value="${currentTeam.name}" style="font-weight:700;font-size:1rem;flex:1">
        <button class="btn btn-sm" id="team-save">保存</button>
      </div>
    </div>
    <div class="team-sprites-bar">
      ${[0,1,2,3,4,5].map(i => {
        const m = currentTeam.members[i];
        return m
          ? `<div class="ts-sprite" data-idx="${i}">${spriteImg(m.name, 44)}</div>`
          : `<div class="ts-sprite ts-empty" data-idx="${i}"></div>`;
      }).join('')}
    </div>
    <div id="team-members">
      ${currentTeam.members.map((m, i) => renderTeamSlot(m, i)).join('')}
    </div>
    ${currentTeam.members.length < 6 ? `
    <div class="row mt" style="gap:4px">
      <button class="btn btn-outline" style="flex:1" id="team-add">+ 新規追加</button>
      <button class="btn btn-outline" style="flex:1" id="team-add-from-box">+ BOXから追加</button>
    </div>` : ''}
    <div class="card mt">
      <div class="row" style="align-items:center;gap:4px">
        <h3 style="flex:1;margin:0">テキスト</h3>
        <button class="btn btn-sm btn-outline" id="team-copy-sd">コピー</button>
      </div>
      <pre class="sd-text" style="max-height:200px;overflow-y:auto;margin-top:4px">${currentTeam.members.length > 0 ? teamToShowdownText(currentTeam) : '（ポケモンを追加してください）'}</pre>
    </div>
    <div class="card mt">
      <h3>概要・戦略メモ</h3>
      <textarea id="team-notes" rows="4" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:6px;font-size:.85rem" placeholder="チームの戦略、選出パターン、戦績メモ...">${currentTeam.notes || ''}</textarea>
    </div>
    <div id="team-editor" class="hidden"></div>
    <div id="team-load-modal" class="hidden"></div>
  `;

  document.getElementById('td-back').addEventListener('click', renderTeamList);
  document.getElementById('team-name').addEventListener('change', e => currentTeam.name = e.target.value);
  document.getElementById('team-notes').addEventListener('input', e => currentTeam.notes = e.target.value);
  document.getElementById('team-save')?.addEventListener('click', saveTeam);
  document.getElementById('team-add')?.addEventListener('click', () => openTeamEditor(-1));
  document.getElementById('team-add-from-box')?.addEventListener('click', openAddFromBox);
  document.getElementById('team-copy-sd')?.addEventListener('click', () => {
    const text = teamToShowdownText(currentTeam);
    navigator.clipboard.writeText(text).then(() => showToast('コピーしました')).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      showToast('コピーしました');
    });
  });

  // Sprite bar scroll-to
  page.querySelectorAll('.ts-sprite[data-idx]').forEach(sp => {
    sp.addEventListener('click', () => {
      const idx = parseInt(sp.dataset.idx);
      const slot = page.querySelector(`.team-detail[data-idx="${idx}"]`);
      if (slot) slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Team slot events
  page.querySelectorAll('.team-detail[data-idx]').forEach(slot => {
    const idx = parseInt(slot.dataset.idx);
    slot.querySelector('.edit-btn')?.addEventListener('click', e => { e.stopPropagation(); openTeamEditor(idx); });
    slot.querySelector('.del-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      currentTeam.members.splice(idx, 1);
      renderTeamDetail();
    });
    slot.querySelector('.to-calc-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const m = currentTeam.members[idx];
      Object.assign(atkState, JSON.parse(JSON.stringify(m)));
      switchPage('calc');
      initCalcPage();
      selectPokemon('atk', atkState.name);
      restoreStateToUI('atk', atkState);
    });
  });
}

// Keep renderTeamPage as alias for current view
async function renderTeamPage() {
  if (teamView === 'detail') renderTeamDetail();
  else renderTeamList();
}

function restoreStateToUI(side, state) {
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
  updateNatureDisplay(side, state);
  updateStatDisplay(side, state);
}

function renderTeamSlot(member, idx) {
  const p = DATA.pokemon[member.name];
  const types = p ? p.types.map(t => typeBadge(t)).join('') : '';
  return `
    <div class="team-detail" data-idx="${idx}">
      <div class="team-slot" data-idx="${idx}">
        ${spriteImg(member.name, 40)}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${ja('pokemon', member.name)} ${types}</div>
        </div>
        <button class="btn btn-sm to-calc-btn" style="font-size:.6rem;padding:2px 6px">ダメ計</button>
        <button class="btn btn-sm btn-outline edit-btn">編集</button>
        <button class="btn btn-sm btn-danger del-btn">×</button>
      </div>
      ${showdownHTML(member)}
    </div>`;
}

function renderThreatSlot(t) {
  const p = DATA.pokemon[t.name];
  const types = p ? p.types.map(tp => typeBadge(tp)).join('') : '';
  const itemStr = t.item ? ja('items', t.item) : '';
  const moves = (t.moves || []).filter(Boolean).map(m => ja('moves', m)).join(', ');
  return `
    <div class="threat-slot" data-id="${t.id}" style="cursor:pointer">
      <div class="team-slot">
        ${spriteImg(t.name, 32)}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.85rem">${ja('pokemon', t.name)} ${types}</div>
          <div style="font-size:.65rem;color:var(--fg2)">${[itemStr, moves].filter(Boolean).join(' | ')}</div>
        </div>
        <button class="btn btn-sm btn-outline threat-edit">編集</button>
        <button class="btn btn-sm btn-danger threat-del">×</button>
      </div>
    </div>`;
}

async function openAddFromBox() {
  const boxAll = await DB.getAll('box');
  if (boxAll.length === 0) { showToast('BOXが空です'); return; }
  const modal = document.getElementById('team-load-modal');
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="card" style="max-height:70vh;overflow-y:auto">
    <h3>BOXから追加</h3>
    ${boxAll.map(b => `
      <div class="team-slot box-pick" data-id="${b.id}">
        ${spriteImg(b.name, 28)}
        <div class="name">${ja('pokemon', b.name)}</div>
        ${DATA.pokemon[b.name]?.types.map(t => typeBadge(t)).join('')||''}
      </div>`).join('')}
    <button class="btn btn-outline mt" id="box-pick-close">閉じる</button>
  </div>`;
  modal.querySelector('#box-pick-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.querySelectorAll('.box-pick').forEach(slot => {
    slot.addEventListener('click', () => {
      const b = boxAll.find(x => x.id === parseInt(slot.dataset.id));
      if (!b) return;
      if (currentTeam.members.length >= 6) { showToast('6匹まで'); return; }
      currentTeam.members.push(JSON.parse(JSON.stringify(b)));
      modal.classList.add('hidden');
      renderTeamPage();
      showToast(`${ja('pokemon', b.name)} をチームに追加`);
    });
  });
}

async function openThreatEditor(existing) {
  const isNew = !existing;
  const threat = existing ? JSON.parse(JSON.stringify(existing)) : makePokemonState();
  if (!threat.natureMods) threat.natureMods = { plus: '', minus: '' };
  if (!threat.moves) threat.moves = ['','','',''];

  const editor = document.getElementById('threat-editor');
  editor.classList.remove('hidden');
  editor.innerHTML = `
    <div class="card" style="border:2px solid var(--warn)">
      <h3>${isNew ? '仮想敵を追加' : '仮想敵を編集'}</h3>
      <div class="search-wrap">
        <input type="text" id="th-search" value="${threat.name ? ja('pokemon', threat.name) : ''}" placeholder="ポケモン名..." autocomplete="off">
        <div class="search-list" id="th-list"></div>
      </div>
      <div id="th-info"></div>
      ${buildNatureUI('th')}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="th-item-search" value="${threat.item ? ja('items', threat.item) : ''}" placeholder="もちもの検索..." autocomplete="off">
        <div class="search-list" id="th-item-list"></div>
      </div>
      <label>とくせい</label>
      <select id="th-ability"></select>
      <label>SP配分</label>
      ${['hp','at','df','sa','sd','sp'].map(stat => `
        <div class="sp-row">
          <span class="sp-label">${STAT_SHORT[stat]}</span>
          <input type="number" id="th-sp-${stat}" min="0" max="32" value="${threat.sp?.[stat] || 0}">
        </div>
      `).join('')}
      <label>わざ</label>
      ${[0,1,2,3].map(i => `
        <div class="search-wrap" style="margin-bottom:4px">
          <input type="text" id="th-move-${i}" value="${threat.moves[i] ? ja('moves', threat.moves[i]) : ''}" placeholder="わざ${i+1}..." autocomplete="off">
          <div class="search-list" id="th-movelist-${i}"></div>
        </div>
      `).join('')}
      <div class="row mt">
        <button class="btn" id="th-ok">${isNew ? '追加' : '更新'}</button>
        <button class="btn btn-outline" id="th-cancel">キャンセル</button>
      </div>
    </div>`;

  setupSearch(document.getElementById('th-search'), document.getElementById('th-list'), pokemonNames, name => {
    threat.name = name;
    const p = DATA.pokemon[name];
    if (p) {
      document.getElementById('th-info').innerHTML = `${spriteImg(name,48)} ${p.types.map(t => typeBadge(t)).join(' ')}`;
      const abilSel = document.getElementById('th-ability');
      abilSel.innerHTML = p.abilities.map(a => `<option value="${a}">${ja('abilities',a)||a}</option>`).join('');
      threat.ability = p.abilities[0];
    }
  });

  const thNature = { natureMods: { ...threat.natureMods } };
  initNatureUI('th', thNature);
  updateNatureDisplay('th', thNature);

  const thItemEntries = Object.keys(DATA.items).sort().map(k => ({ key: k, ja: ja('items', k) }));
  setupItemSearch(document.getElementById('th-item-search'), document.getElementById('th-item-list'), thItemEntries, name => { threat.item = name; });
  if (threat.item) document.getElementById('th-item-search').dataset.key = threat.item;

  const moveNames = Object.keys(DATA.moves).sort();
  for (let i = 0; i < 4; i++) {
    setupSearch(document.getElementById(`th-move-${i}`), document.getElementById(`th-movelist-${i}`), moveNames, name => { threat.moves[i] = name; });
  }

  if (threat.name && DATA.pokemon[threat.name]) {
    const p = DATA.pokemon[threat.name];
    document.getElementById('th-info').innerHTML = `${spriteImg(threat.name,48)} ${p.types.map(t => typeBadge(t)).join(' ')}`;
    const abilSel = document.getElementById('th-ability');
    abilSel.innerHTML = p.abilities.map(a => `<option value="${a}"${a===threat.ability?' selected':''}>${ja('abilities',a)||a}</option>`).join('');
  }

  document.getElementById('th-ok').addEventListener('click', async () => {
    if (!threat.name) return;
    threat.natureMods = { ...thNature.natureMods };
    threat.item = document.getElementById('th-item-search').dataset?.key || '';
    threat.ability = document.getElementById('th-ability').value;
    for (const stat of ['hp','at','df','sa','sd','sp'])
      threat.sp[stat] = parseInt(document.getElementById(`th-sp-${stat}`).value) || 0;
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`th-move-${i}`);
      threat.moves[i] = el.dataset?.key || el.value || '';
    }
    if (existing?.id) threat.id = existing.id;
    await DB.put('threats', threat);
    editor.classList.add('hidden');
    renderTeamPage();
    showToast(isNew ? '仮想敵を追加しました' : '仮想敵を更新しました');
  });
  document.getElementById('th-cancel').addEventListener('click', () => editor.classList.add('hidden'));
}

function openTeamEditor(idx) {
  const isNew = idx === -1;
  const member = isNew ? makePokemonState() : JSON.parse(JSON.stringify(currentTeam.members[idx]));
  if (!member.natureMods) member.natureMods = { plus: '', minus: '' };
  if (!member.moves) member.moves = ['','','',''];

  const editor = document.getElementById('team-editor');
  editor.classList.remove('hidden');
  editor.innerHTML = `
    <div class="card" style="border:2px solid var(--accent)">
      <h3>${isNew ? 'ポケモン追加' : '編集'}</h3>
      <div class="search-wrap">
        <input type="text" id="te-search" value="${member.name ? ja('pokemon', member.name) : ''}" placeholder="ポケモン名..." autocomplete="off">
        <div class="search-list" id="te-list"></div>
      </div>
      <div id="te-info"></div>
      ${buildNatureUI('te')}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="te-item-search" value="${member.item ? ja('items', member.item) : ''}" placeholder="もちもの検索..." autocomplete="off">
        <div class="search-list" id="te-item-list"></div>
      </div>
      <label>とくせい</label>
      <select id="te-ability"></select>
      <label>SP配分</label>
      ${['hp','at','df','sa','sd','sp'].map(stat => `
        <div class="sp-row">
          <span class="sp-label">${STAT_SHORT[stat]}</span>
          <input type="number" id="te-sp-${stat}" min="0" max="32" value="${member.sp?.[stat] || 0}">
        </div>
      `).join('')}
      <label>わざ</label>
      ${[0,1,2,3].map(i => `
        <div class="search-wrap" style="margin-bottom:4px">
          <input type="text" id="te-move-${i}" value="${member.moves[i] ? ja('moves', member.moves[i]) : ''}" placeholder="わざ${i+1}..." autocomplete="off">
          <div class="search-list" id="te-movelist-${i}"></div>
        </div>
      `).join('')}
      <div class="row mt">
        <button class="btn" id="te-ok">${isNew ? '追加' : '更新'}</button>
        <button class="btn btn-outline" id="te-cancel">キャンセル</button>
      </div>
    </div>
  `;

  setupSearch(document.getElementById('te-search'), document.getElementById('te-list'), pokemonNames, name => {
    member.name = name;
    const p = DATA.pokemon[name];
    if (p) {
      document.getElementById('te-info').innerHTML = `${spriteImg(name,48)} ${p.types.map(t => typeBadge(t)).join(' ')}`;
      const abilSel = document.getElementById('te-ability');
      abilSel.innerHTML = p.abilities.map(a => `<option value="${a}">${ja('abilities',a)||a}</option>`).join('');
      member.ability = p.abilities[0];
    }
  });

  // Init nature UI for team editor
  // Copy member's natureMods to a temp state for the UI
  const teNature = { natureMods: { ...member.natureMods } };
  initNatureUI('te', teNature);
  updateNatureDisplay('te', teNature);

  // Item search in team editor
  const teItemEntries = Object.keys(DATA.items).sort().map(k => ({ key: k, ja: ja('items', k) }));
  setupItemSearch(
    document.getElementById('te-item-search'),
    document.getElementById('te-item-list'),
    teItemEntries,
    name => { member.item = name; }
  );
  if (member.item) {
    document.getElementById('te-item-search').dataset.key = member.item;
  }

  const moveNames = Object.keys(DATA.moves).sort();
  for (let i = 0; i < 4; i++) {
    setupSearch(document.getElementById(`te-move-${i}`), document.getElementById(`te-movelist-${i}`), moveNames, name => {
      member.moves[i] = name;
    });
  }

  if (member.name && DATA.pokemon[member.name]) {
    const p = DATA.pokemon[member.name];
    document.getElementById('te-info').innerHTML = `${spriteImg(member.name,48)} ${p.types.map(t => typeBadge(t)).join(' ')}`;
    const abilSel = document.getElementById('te-ability');
    abilSel.innerHTML = p.abilities.map(a => `<option value="${a}"${a===member.ability?' selected':''}>${ja('abilities',a)||a}</option>`).join('');
  }

  document.getElementById('te-ok').addEventListener('click', () => {
    if (!member.name) return;
    member.natureMods = { ...teNature.natureMods };
    member.item = document.getElementById('te-item-search').dataset?.key || '';
    member.ability = document.getElementById('te-ability').value;
    for (const stat of ['hp','at','df','sa','sd','sp'])
      member.sp[stat] = parseInt(document.getElementById(`te-sp-${stat}`).value) || 0;
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`te-move-${i}`);
      member.moves[i] = el.dataset?.key || el.value || '';
    }
    if (isNew) currentTeam.members.push(member);
    else currentTeam.members[idx] = member;
    editor.classList.add('hidden');
    renderTeamPage();
  });
  document.getElementById('te-cancel').addEventListener('click', () => editor.classList.add('hidden'));
}

async function saveTeam() {
  const team = { name: currentTeam.name, members: currentTeam.members, notes: currentTeam.notes || '', updatedAt: Date.now() };
  if (currentTeam.id) team.id = currentTeam.id;
  const id = await DB.put('teams', team);
  if (!currentTeam.id) currentTeam.id = id;
  showToast('保存しました');
}

async function loadTeamList() {
  const teams = await DB.getAll('teams');
  const modal = document.getElementById('team-load-modal');
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="card" style="max-height:70vh;overflow-y:auto">
    <h3>チーム一覧</h3>
    ${teams.length === 0 ? '<p style="color:var(--fg2)">保存されたチームはありません</p>' : ''}
    ${teams.map(t => `
      <div class="team-slot" data-id="${t.id}">
        <div class="name" style="flex:1">${t.name} (${t.members.length}匹)</div>
        <button class="btn btn-sm" data-action="load" data-id="${t.id}">読込</button>
        <button class="btn btn-sm btn-outline" data-action="export" data-id="${t.id}">出力</button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${t.id}">削除</button>
      </div>
    `).join('')}
    <hr>
    <div class="row" style="gap:4px">
      <button class="btn btn-sm" id="modal-new-team">新規チーム</button>
      <button class="btn btn-sm btn-outline" id="modal-import-team">チームインポート</button>
      <input type="file" id="team-import-file" accept=".json" class="hidden">
    </div>
    <button class="btn btn-outline mt" id="modal-close">閉じる</button>
  </div>`;

  document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('modal-new-team').addEventListener('click', () => {
    currentTeam = { id: null, name: '新チーム', members: [], notes: '' };
    modal.classList.add('hidden');
    renderTeamPage();
  });
  document.getElementById('modal-import-team').addEventListener('click', () => document.getElementById('team-import-file').click());
  document.getElementById('team-import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.name && data.members) {
        delete data.id;
        const id = await DB.add('teams', data);
        currentTeam = { id, name: data.name, members: data.members, notes: data.notes || '' };
        modal.classList.add('hidden');
        renderTeamPage();
        showToast(`チーム「${data.name}」をインポート`);
      } else {
        showToast('無効なチームデータ');
      }
    } catch (err) { showToast('読込失敗: ' + err.message); }
    e.target.value = '';
  });

  modal.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    if (btn.dataset.action === 'load') {
      const team = await DB.get('teams', id);
      currentTeam = { id: team.id, name: team.name, members: team.members, notes: team.notes || '' };
      modal.classList.add('hidden');
      renderTeamPage();
    } else if (btn.dataset.action === 'export') {
      const team = await DB.get('teams', id);
      const blob = new Blob([JSON.stringify(team, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `team_${team.name}.json`; a.click();
      URL.revokeObjectURL(url);
      showToast(`チーム「${team.name}」をエクスポート`);
    } else if (btn.dataset.action === 'delete') {
      await DB.del('teams', id);
      loadTeamList();
    }
  });
  document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
}

// ===== RECORDS PAGE =====
function initRecordsPage() { renderRecordsPage(); }

async function renderRecordsPage() {
  const records = await DB.getAll('records');
  records.sort((a, b) => (b.date || 0) - (a.date || 0));
  const page = document.getElementById('page-records');
  page.innerHTML = `
    <button class="btn mb" style="width:100%" id="record-add">+ 対戦記録を追加</button>
    <div id="records-list">
      ${records.length === 0 ? '<p style="text-align:center;color:var(--fg2)">記録はまだありません</p>' : ''}
      ${records.map(r => renderRecord(r)).join('')}
    </div>
    <div id="record-editor" class="hidden"></div>
  `;

  document.getElementById('record-add').addEventListener('click', () => openRecordEditor());
  page.querySelectorAll('.record [data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      if (btn.dataset.action === 'delete') { await DB.del('records', id); renderRecordsPage(); }
      else if (btn.dataset.action === 'edit') { openRecordEditor(await DB.get('records', id)); }
    });
  });
}

function renderRecord(r) {
  const date = r.date ? new Date(r.date).toLocaleDateString('ja-JP') : '';
  return `
    <div class="record">
      <div class="meta">${date}</div>
      <span class="result-tag ${r.result==='win'?'result-win':'result-lose'}">${r.result==='win'?'勝ち':'負け'}</span>
      <strong style="margin-left:8px">${r.opponent || '不明'}</strong>
      ${r.myTeam ? `<div style="font-size:.75rem;color:var(--fg2);margin-top:2px">自分: ${r.myTeam}</div>` : ''}
      ${r.oppTeam ? `<div style="font-size:.75rem;color:var(--fg2)">相手: ${r.oppTeam}</div>` : ''}
      ${r.notes ? `<div class="notes">${r.notes}</div>` : ''}
      <div class="record-actions">
        <button class="btn btn-sm btn-outline" data-action="edit" data-id="${r.id}">編集</button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${r.id}">削除</button>
      </div>
    </div>`;
}

function openRecordEditor(existing) {
  const editor = document.getElementById('record-editor');
  editor.classList.remove('hidden');
  const r = existing || { result: 'win', opponent: '', myTeam: '', oppTeam: '', notes: '', date: Date.now() };
  editor.innerHTML = `
    <div class="card" style="border:2px solid var(--accent)">
      <h3>${existing ? '記録編集' : '新しい記録'}</h3>
      <label>結果</label>
      <select id="re-result">
        <option value="win"${r.result==='win'?' selected':''}>勝ち</option>
        <option value="lose"${r.result==='lose'?' selected':''}>負け</option>
      </select>
      <label>相手</label>
      <input type="text" id="re-opponent" value="${r.opponent||''}">
      <label>自分のチーム</label>
      <input type="text" id="re-myteam" value="${r.myTeam||''}" placeholder="ガブリアス, ミミッキュ...">
      <label>相手のチーム</label>
      <input type="text" id="re-oppteam" value="${r.oppTeam||''}" placeholder="ドラパルト, キョジオーン...">
      <label>メモ</label>
      <textarea id="re-notes" rows="3" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:6px;font-size:.85rem">${r.notes||''}</textarea>
      <div class="row mt">
        <button class="btn" id="re-save">保存</button>
        <button class="btn btn-outline" id="re-cancel">キャンセル</button>
      </div>
    </div>`;
  document.getElementById('re-save').addEventListener('click', async () => {
    const record = {
      result: document.getElementById('re-result').value,
      opponent: document.getElementById('re-opponent').value,
      myTeam: document.getElementById('re-myteam').value,
      oppTeam: document.getElementById('re-oppteam').value,
      notes: document.getElementById('re-notes').value,
      date: r.date || Date.now()
    };
    if (existing?.id) record.id = existing.id;
    await DB.put('records', record);
    editor.classList.add('hidden');
    renderRecordsPage();
  });
  document.getElementById('re-cancel').addEventListener('click', () => editor.classList.add('hidden'));
}

// ===== BOX PAGE =====
async function renderBoxPage() {
  const boxAll = await DB.getAll('box');
  const page = document.getElementById('page-box');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:4px;flex-wrap:wrap">
        <h3 style="flex:1;margin:0">BOX (${boxAll.length}匹)</h3>
        <button class="btn btn-sm" id="box-export">エクスポート</button>
        <button class="btn btn-sm btn-outline" id="box-import">インポート</button>
        <input type="file" id="box-import-file" accept=".json" class="hidden">
      </div>
    </div>
    <div id="box-list">
      ${boxAll.length === 0 ? '<div class="card"><p style="text-align:center;color:var(--fg2)">BOXは空です。ダメ計から追加してください</p></div>' : ''}
      ${boxAll.map(b => renderBoxSlot(b)).join('')}
    </div>
  `;

  document.getElementById('box-export').addEventListener('click', exportData);
  document.getElementById('box-import').addEventListener('click', () => document.getElementById('box-import-file').click());
  document.getElementById('box-import-file').addEventListener('change', importData);

  page.querySelectorAll('.box-entry').forEach(entry => {
    const id = parseInt(entry.dataset.id);
    entry.querySelector('.box-detail-toggle')?.addEventListener('click', e => {
      e.stopPropagation();
      const detail = entry.querySelector('.box-detail');
      detail?.classList.toggle('hidden');
    });
    entry.querySelector('.box-del')?.addEventListener('click', async e => {
      e.stopPropagation();
      await DB.del('box', id);
      renderBoxPage();
    });
    entry.querySelector('.box-to-team')?.addEventListener('click', e => {
      e.stopPropagation();
      const b = boxAll.find(x => x.id === id);
      if (!b) return;
      if (currentTeam.members.length >= 6) { showToast('チームは6匹まで'); return; }
      currentTeam.members.push(JSON.parse(JSON.stringify(b)));
      showToast(`${ja('pokemon', b.name)} をチームに追加`);
    });
    entry.querySelector('.box-to-calc')?.addEventListener('click', e => {
      e.stopPropagation();
      const b = boxAll.find(x => x.id === id);
      if (!b) return;
      Object.assign(atkState, JSON.parse(JSON.stringify(b)));
      switchPage('calc');
      initCalcPage();
      selectPokemon('atk', atkState.name);
      restoreStateToUI('atk', atkState);
    });
    // Delete individual calc
    entry.querySelectorAll('.calc-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ci = parseInt(btn.dataset.ci);
        const b = boxAll.find(x => x.id === id);
        if (!b || !b.savedCalcs) return;
        b.savedCalcs.splice(ci, 1);
        await DB.put('box', b);
        renderBoxPage();
      });
    });
    // Save notes on change
    const notesEl = entry.querySelector('.box-notes');
    if (notesEl) {
      let saveTimer;
      notesEl.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          const b = await DB.get('box', id);
          if (b) { b.notes = notesEl.value; await DB.put('box', b); }
        }, 500);
      });
    }
  });
}

function renderBoxSlot(b) {
  const p = DATA.pokemon[b.name];
  const types = p ? p.types.map(t => typeBadge(t)).join('') : '';
  const calcs = b.savedCalcs || [];

  return `
    <div class="box-entry card" data-id="${b.id}" style="padding:6px">
      <div style="display:flex;align-items:flex-start;gap:6px">
        ${spriteImg(b.name, 40)}
        <div style="flex:1;min-width:0">
          ${showdownHTML(b)}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <button class="btn btn-sm box-to-calc" style="font-size:.6rem;padding:2px 6px">ダメ計</button>
          <button class="btn btn-sm btn-outline box-to-team" style="font-size:.6rem;padding:2px 6px">チーム</button>
        </div>
      </div>
      ${calcs.length > 0 ? `
        <div style="margin-top:4px">
          <button class="btn btn-sm btn-outline box-detail-toggle" style="font-size:.65rem;width:100%;padding:2px">ダメ計結果 (${calcs.length}件)</button>
          <div class="box-detail hidden" style="margin-top:4px">
            ${calcs.map((c, ci) => {
              const icon = c.dir === 'def' ? '🛡' : '⚔';
              const label = c.dir === 'def'
                ? `${ja('pokemon', c.vs)}の${ja('moves', c.move)}→自分`
                : `自分の${ja('moves', c.move)}→${ja('pokemon', c.vs)}`;
              return `
              <div style="font-size:.7rem;padding:2px 0;display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--bg3)">
                <span style="flex:1">${icon} ${label} ${c.range} <strong>${c.ko}</strong> ${c.detail}</span>
                <button class="btn btn-sm btn-danger calc-del" data-ci="${ci}" style="font-size:.55rem;padding:1px 4px">×</button>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      <div style="margin-top:4px">
        <textarea class="box-notes" data-id="${b.id}" rows="2" placeholder="メモ（調整意図、立ち回り等）" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:4px;font-size:.7rem;resize:vertical">${b.notes||''}</textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:2px">
        <button class="btn btn-sm btn-danger box-del" style="font-size:.6rem;padding:2px 6px">削除</button>
      </div>
    </div>`;
}

// ===== JSON IMPORT / EXPORT =====
async function exportData() {
  const data = await DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pokechamp_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('エクスポート完了');
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await DB.importAll(data);
    showToast(`インポート完了 (BOX:${data.box?.length||0}, チーム:${data.teams?.length||0})`);
    renderBoxPage();
  } catch (err) {
    showToast('インポート失敗: ' + err.message);
  }
  e.target.value = '';
}

// ===== TOAST =====
function showToast(msg) {
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
