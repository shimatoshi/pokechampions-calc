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
      const moveInfo = DATA.moves[name] ? `<span class="type-badge type-${DATA.moves[name].type}">${DATA.moves[name].type}</span>` : '';
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
const fieldState = { weather: '', terrain: '', doubles: false, crit: false };

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
    </div>
    <div class="row mt" style="gap:4px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-sm" id="load-atk-from" title="チーム/対策表から攻撃側に読込">攻撃側に読込</button>
      <button class="btn btn-sm" id="swap-sides" style="background:var(--accent2)">攻守入替</button>
      <button class="btn btn-sm" id="load-def-from" title="チーム/対策表から防御側に読込">防御側に読込</button>
    </div>
    <button class="btn mt" style="width:100%" id="calc-btn">ダメージ計算</button>
    <div class="row mt" style="gap:4px">
      <button class="btn btn-outline btn-sm" id="add-atk-to-team">攻撃側をチームに追加</button>
      <button class="btn btn-outline btn-sm" id="add-def-to-team">防御側をチームに追加</button>
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

  // SP +/- /0/32 buttons (delegated)
  document.addEventListener('click', e => {
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

  document.getElementById('calc-btn').addEventListener('click', runCalc);
  document.getElementById('field-weather').addEventListener('change', e => fieldState.weather = e.target.value);
  document.getElementById('field-terrain').addEventListener('change', e => fieldState.terrain = e.target.value);
  document.getElementById('field-doubles').addEventListener('change', e => fieldState.doubles = e.target.checked);
  document.getElementById('field-crit').addEventListener('change', e => fieldState.crit = e.target.checked);
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

// ===== ADD TO TEAM FROM CALC =====
function addCalcToTeam(side) {
  const state = side === 'atk' ? atkState : defState;
  if (!state.name) { showToast('ポケモンを選択してください'); return; }
  if (currentTeam.members.length >= 6) { showToast('チームは6匹まで'); return; }
  // Check duplicate
  if (currentTeam.members.some(m => m.name === state.name)) {
    showToast(`${ja('pokemon', state.name)} は既にチームにいます`);
    return;
  }
  const member = JSON.parse(JSON.stringify(state));
  currentTeam.members.push(member);
  showToast(`${ja('pokemon', state.name)} をチームに追加しました (${currentTeam.members.length}/6)`);
}

// ===== TEAM BUILDER PAGE =====
let currentTeam = { id: null, name: '新チーム', members: [], notes: '' };

function initTeamPage() { renderTeamPage(); }

async function renderTeamPage() {
  const threats = await DB.getAll('threats');
  const page = document.getElementById('page-team');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center">
        <input type="text" id="team-name" value="${currentTeam.name}" style="font-weight:700;font-size:1rem">
        <button class="btn btn-sm" id="team-save">保存</button>
        <button class="btn btn-sm btn-outline" id="team-load">読込</button>
      </div>
    </div>
    <div id="team-members">
      ${currentTeam.members.map((m, i) => renderTeamSlot(m, i)).join('')}
    </div>
    ${currentTeam.members.length < 6 ? `
    <button class="btn btn-outline mt" style="width:100%" id="team-add">+ ポケモンを追加</button>` : ''}
    <div class="card mt">
      <h3>概要・戦略メモ</h3>
      <textarea id="team-notes" rows="4" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:6px;font-size:.85rem" placeholder="チームの戦略、選出パターン、戦績メモ...">${currentTeam.notes || ''}</textarea>
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
    <div id="team-editor" class="hidden"></div>
    <div id="team-load-modal" class="hidden"></div>
  `;

  document.getElementById('team-name').addEventListener('change', e => currentTeam.name = e.target.value);
  document.getElementById('team-notes').addEventListener('input', e => currentTeam.notes = e.target.value);
  document.getElementById('team-save')?.addEventListener('click', saveTeam);
  document.getElementById('team-load')?.addEventListener('click', loadTeamList);
  document.getElementById('team-add')?.addEventListener('click', () => openTeamEditor(-1));
  document.getElementById('threat-add')?.addEventListener('click', () => openThreatEditor());

  // Team slot events
  page.querySelectorAll('.team-slot[data-idx]').forEach(slot => {
    const idx = parseInt(slot.dataset.idx);
    slot.querySelector('.edit-btn')?.addEventListener('click', e => { e.stopPropagation(); openTeamEditor(idx); });
    slot.querySelector('.del-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      currentTeam.members.splice(idx, 1);
      renderTeamPage();
    });
    slot.addEventListener('click', () => {
      const m = currentTeam.members[idx];
      Object.assign(atkState, JSON.parse(JSON.stringify(m)));
      switchPage('calc');
      initCalcPage();
      selectPokemon('atk', atkState.name);
      restoreStateToUI('atk', atkState);
    });
  });

  // Threat slot events
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
      renderTeamPage();
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
  const jaName = ja('pokemon', member.name);
  const stats = DMG.getStats(member);
  const moves = (member.moves || []).filter(Boolean).map(m => ja('moves', m)).join(', ');
  const itemStr = member.item ? ja('items', member.item) : '';
  const abilStr = member.ability ? (ja('abilities', member.ability) || member.ability) : '';
  const nm = member.natureMods || {};
  const natureStr = nm.plus && nm.minus ? `${STAT_SHORT[nm.plus]}↑${STAT_SHORT[nm.minus]}↓` : '';

  return `
    <div class="team-detail" data-idx="${idx}">
      <div class="team-slot" data-idx="${idx}">
        ${spriteImg(member.name, 40)}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${jaName} ${types}</div>
          <div style="font-size:.7rem;color:var(--fg2)">${[abilStr, itemStr, natureStr].filter(Boolean).join(' / ')}</div>
        </div>
        <button class="btn btn-sm btn-outline edit-btn">編集</button>
        <button class="btn btn-sm btn-danger del-btn">×</button>
      </div>
      ${stats ? `<div class="team-stats">${['hp','at','df','sa','sd','sp'].map(s =>
        `<span class="ts-cell${nm.plus===s?' ts-plus':''}${nm.minus===s?' ts-minus':''}">${STAT_SHORT[s]}${stats[s]}</span>`
      ).join('')}</div>` : ''}
      ${moves ? `<div style="font-size:.7rem;color:var(--fg2);padding:0 4px 4px">${moves}</div>` : ''}
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
  if (teams.length === 0) {
    modal.innerHTML = '<div class="card"><p>保存されたチームはありません</p><button class="btn btn-outline mt" id="modal-close">閉じる</button></div>';
    document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
    return;
  }
  modal.innerHTML = `<div class="card">
    <h3>チーム一覧</h3>
    ${teams.map(t => `
      <div class="team-slot" data-id="${t.id}">
        <div class="name">${t.name} (${t.members.length}匹)</div>
        <button class="btn btn-sm" data-action="load" data-id="${t.id}">読込</button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${t.id}">削除</button>
      </div>
    `).join('')}
    <button class="btn btn-outline mt" id="modal-close">閉じる</button>
  </div>`;

  modal.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    if (btn.dataset.action === 'load') {
      const team = await DB.get('teams', id);
      currentTeam = { id: team.id, name: team.name, members: team.members, notes: team.notes || '' };
      modal.classList.add('hidden');
      renderTeamPage();
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
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      switchPage(page);
      if (page === 'team') renderTeamPage();
      if (page === 'records') renderRecordsPage();
    });
  });
}
init();
