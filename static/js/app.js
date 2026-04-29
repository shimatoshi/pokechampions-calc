// Pokemon Champions Calculator - Main App
let DATA = { pokemon: {}, moves: {}, types: {}, natures: {}, items: {} };
let pokemonNames = [];

// ===== DATA LOADING =====
async function loadData() {
  const [pokemon, moves, types, natures, items] = await Promise.all([
    fetch('/data/data_pokemon.json').then(r => r.json()),
    fetch('/data/data_moves.json').then(r => r.json()),
    fetch('/data/data_types.json').then(r => r.json()),
    fetch('/data/data_natures.json').then(r => r.json()),
    fetch('/data/data_items.json').then(r => r.json())
  ]);
  DATA = { pokemon, moves, types, natures, items };
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
function setupSearch(inputEl, listEl, items, onSelect) {
  inputEl.addEventListener('input', () => {
    const q = inputEl.value.toLowerCase();
    if (q.length < 1) { listEl.classList.remove('open'); return; }
    const matches = items.filter(n => n.toLowerCase().includes(q)).slice(0, 30);
    listEl.innerHTML = matches.map(n => {
      const p = DATA.pokemon[n];
      const types = p ? p.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('') : '';
      return `<div class="item" data-name="${n}"><span>${n}</span>${types}</div>`;
    }).join('');
    listEl.classList.add('open');
  });
  listEl.addEventListener('click', e => {
    const item = e.target.closest('.item');
    if (!item) return;
    const name = item.dataset.name;
    inputEl.value = name;
    listEl.classList.remove('open');
    onSelect(name);
  });
  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !listEl.contains(e.target))
      listEl.classList.remove('open');
  });
}

// ===== DAMAGE CALC PAGE =====
function makePokemonState(prefix) {
  return {
    name: '',
    nature: 'Adamant',
    sp: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
    boosts: { at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
    item: '',
    ability: '',
    status: '',
    moves: ['', '', '', '']
  };
}

const atkState = makePokemonState('atk');
const defState = makePokemonState('def');
const fieldState = { weather: '', terrain: '', doubles: false, crit: false };

function buildSidePanel(side, state) {
  const s = side; // 'atk' or 'def'
  const label = s === 'atk' ? '攻撃側' : '防御側';

  return `
    <div class="card">
      <h3>${label}</h3>
      <div class="search-wrap">
        <input type="text" id="${s}-search" placeholder="ポケモン名..." autocomplete="off">
        <div class="search-list" id="${s}-list"></div>
      </div>
      <div id="${s}-info"></div>
      <label>性格</label>
      <select id="${s}-nature">
        ${Object.keys(DATA.natures).map(n => `<option${n === state.nature ? ' selected' : ''}>${n}</option>`).join('')}
      </select>
      <label>もちもの</label>
      <select id="${s}-item">
        <option value="">なし</option>
        ${Object.keys(DATA.items).sort().map(i => `<option>${i}</option>`).join('')}
      </select>
      <div id="${s}-ability-wrap" class="hidden">
        <label>とくせい</label>
        <select id="${s}-ability"></select>
      </div>
      ${s === 'atk' ? `<label>状態</label>
      <select id="${s}-status">
        <option value="">なし</option>
        <option value="brn">やけど</option>
      </select>` : ''}
      <label>SP配分 <span id="${s}-sp-total" class="sp-total">0/66</span></label>
      <div id="${s}-sp">
        ${['hp','at','df','sa','sd','sp'].map(stat => `
          <div class="sp-row">
            <span class="sp-label">${{hp:'HP',at:'攻撃',df:'防御',sa:'特攻',sd:'特防',sp:'素早'}[stat]}</span>
            <input type="number" id="${s}-sp-${stat}" min="0" max="32" value="0" data-stat="${stat}">
            <span class="sp-val" id="${s}-val-${stat}">-</span>
          </div>
        `).join('')}
      </div>
      ${s === 'atk' ? `
      <label>ランク補正</label>
      <div class="col3">
        ${['at','sa','sp'].map(stat => `
          <div class="boost-sel">
            <span style="font-size:.7rem">${{at:'攻',sa:'特攻',sp:'素早'}[stat]}</span>
            <select id="${s}-boost-${stat}" style="width:50px">
              ${[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].map(v => `<option value="${v}"${v===0?' selected':''}>${v>=0?'+':''}${v}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>` : `
      <label>ランク補正</label>
      <div class="col3">
        ${['df','sd','sp'].map(stat => `
          <div class="boost-sel">
            <span style="font-size:.7rem">${{df:'防',sd:'特防',sp:'素早'}[stat]}</span>
            <select id="${s}-boost-${stat}" style="width:50px">
              ${[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].map(v => `<option value="${v}"${v===0?' selected':''}>${v>=0?'+':''}${v}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>`}
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

function initCalcPage() {
  const page = document.getElementById('page-calc');
  page.innerHTML = `
    <div class="row">
      <div>${buildSidePanel('atk', atkState)}</div>
      <div>${buildSidePanel('def', defState)}</div>
    </div>
    <div class="card">
      <h3>フィールド</h3>
      <div class="col2">
        <div>
          <label>天候</label>
          <select id="field-weather">
            <option value="">なし</option>
            <option>Sun</option><option>Rain</option><option>Sand</option><option>Hail</option><option>Snow</option>
          </select>
        </div>
        <div>
          <label>フィールド</label>
          <select id="field-terrain">
            <option value="">なし</option>
            <option>Electric</option><option>Grassy</option><option>Psychic</option><option>Misty</option>
          </select>
        </div>
      </div>
      <div class="col2 mt">
        <label><input type="checkbox" id="field-doubles"> ダブル</label>
        <label><input type="checkbox" id="field-crit"> 急所</label>
      </div>
    </div>
    <button class="btn" style="width:100%" id="calc-btn">ダメージ計算</button>
    <div id="calc-results"></div>
  `;

  // Setup search
  setupSearch(
    document.getElementById('atk-search'),
    document.getElementById('atk-list'),
    pokemonNames,
    name => selectPokemon('atk', name)
  );
  setupSearch(
    document.getElementById('def-search'),
    document.getElementById('def-list'),
    pokemonNames,
    name => selectPokemon('def', name)
  );

  // Setup move searches
  const moveNames = Object.keys(DATA.moves).sort();
  for (let i = 0; i < 4; i++) {
    setupSearch(
      document.getElementById(`atk-move-${i}`),
      document.getElementById(`atk-movelist-${i}`),
      moveNames,
      name => { atkState.moves[i] = name; }
    );
  }

  // SP inputs
  for (const side of ['atk', 'def']) {
    const state = side === 'atk' ? atkState : defState;
    for (const stat of ['hp','at','df','sa','sd','sp']) {
      const input = document.getElementById(`${side}-sp-${stat}`);
      input.addEventListener('input', () => {
        state.sp[stat] = parseInt(input.value) || 0;
        updateStatDisplay(side, state);
      });
    }
    // Nature
    document.getElementById(`${side}-nature`).addEventListener('change', e => {
      state.nature = e.target.value;
      updateStatDisplay(side, state);
    });
    // Item
    document.getElementById(`${side}-item`).addEventListener('change', e => {
      state.item = e.target.value;
    });
    // Status
    if (side === 'atk') {
      document.getElementById(`${side}-status`).addEventListener('change', e => {
        state.status = e.target.value;
      });
    }
    // Boosts
    const boostStats = side === 'atk' ? ['at','sa','sp'] : ['df','sd','sp'];
    for (const stat of boostStats) {
      document.getElementById(`${side}-boost-${stat}`).addEventListener('change', e => {
        state.boosts[stat] = parseInt(e.target.value);
      });
    }
  }

  // Calc button
  document.getElementById('calc-btn').addEventListener('click', runCalc);

  // Field
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

  // Show info
  const info = document.getElementById(`${side}-info`);
  info.innerHTML = data.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join(' ');

  // Ability
  const abilWrap = document.getElementById(`${side}-ability-wrap`);
  const abilSel = document.getElementById(`${side}-ability`);
  if (data.abilities.length > 0) {
    abilWrap.classList.remove('hidden');
    abilSel.innerHTML = data.abilities.map(a => `<option>${a}</option>`).join('');
    state.ability = data.abilities[0];
    abilSel.onchange = e => state.ability = e.target.value;
  }

  // Formes
  if (data.formes) {
    info.innerHTML += `<br><span style="font-size:.75rem;color:var(--fg2)">フォルム: ${data.formes.join(', ')}</span>`;
  }

  updateStatDisplay(side, state);
}

function updateStatDisplay(side, state) {
  if (!state.name) return;
  const stats = DMG.getStats(state);
  if (!stats) return;
  let total = 0;
  for (const stat of ['hp','at','df','sa','sd','sp']) {
    document.getElementById(`${side}-val-${stat}`).textContent = stats[stat];
    total += state.sp[stat];
  }
  const totalEl = document.getElementById(`${side}-sp-total`);
  totalEl.textContent = `${total}/66`;
  totalEl.classList.toggle('over', total > 66);
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

    html += `
      <div class="dmg-result">
        <div style="font-size:.8rem;margin-bottom:4px">
          <span class="type-badge type-${r.moveType}">${r.moveType}</span>
          <strong>${moveName}</strong> (威力${r.bp})
          ${r.isSTAB ? '<span style="color:var(--warn);font-size:.7rem">STAB</span>' : ''}
        </div>
        <div class="pct">${r.minPct}% ~ ${r.maxPct}%</div>
        <div class="range">${r.minDmg} ~ ${r.maxDmg} / ${r.hp} HP</div>
        <div class="ko ${r.koClass}">${r.koText}</div>
        <div class="effectiveness">${effText}</div>
      </div>`;
  }
  results.innerHTML = html;
}

// ===== TEAM BUILDER PAGE =====
let currentTeam = { id: null, name: '新チーム', members: [] };

function initTeamPage() {
  renderTeamPage();
}

function renderTeamPage() {
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
    <div id="team-editor" class="hidden"></div>
    <div id="team-load-modal" class="hidden"></div>
  `;

  document.getElementById('team-name').addEventListener('change', e => currentTeam.name = e.target.value);
  document.getElementById('team-save')?.addEventListener('click', saveTeam);
  document.getElementById('team-load')?.addEventListener('click', loadTeamList);
  document.getElementById('team-add')?.addEventListener('click', () => openTeamEditor(-1));

  page.querySelectorAll('.team-slot').forEach(slot => {
    const idx = parseInt(slot.dataset.idx);
    slot.querySelector('.edit-btn')?.addEventListener('click', e => { e.stopPropagation(); openTeamEditor(idx); });
    slot.querySelector('.del-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      currentTeam.members.splice(idx, 1);
      renderTeamPage();
    });
    slot.addEventListener('click', () => {
      // Send to damage calc
      atkState.name = currentTeam.members[idx].name;
      atkState.nature = currentTeam.members[idx].nature;
      atkState.sp = { ...currentTeam.members[idx].sp };
      atkState.item = currentTeam.members[idx].item || '';
      atkState.ability = currentTeam.members[idx].ability || '';
      atkState.moves = [...(currentTeam.members[idx].moves || ['','','',''])];
      switchPage('calc');
      initCalcPage();
      selectPokemon('atk', atkState.name);
      // Restore SP and moves
      for (const stat of ['hp','at','df','sa','sd','sp']) {
        const input = document.getElementById(`atk-sp-${stat}`);
        if (input) input.value = atkState.sp[stat];
      }
      for (let i = 0; i < 4; i++) {
        const input = document.getElementById(`atk-move-${i}`);
        if (input) input.value = atkState.moves[i] || '';
      }
      document.getElementById('atk-nature').value = atkState.nature;
      document.getElementById('atk-item').value = atkState.item;
      updateStatDisplay('atk', atkState);
    });
  });
}

function renderTeamSlot(member, idx) {
  const p = DATA.pokemon[member.name];
  const types = p ? p.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('') : '';
  return `
    <div class="team-slot" data-idx="${idx}">
      <div class="name">${member.name}</div>
      <div class="types">${types}</div>
      <button class="btn btn-sm btn-outline edit-btn">編集</button>
      <button class="btn btn-sm btn-danger del-btn">×</button>
    </div>`;
}

function openTeamEditor(idx) {
  const isNew = idx === -1;
  const member = isNew ? makePokemonState() : { ...currentTeam.members[idx] };
  if (isNew) member.sp = { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 };
  if (!member.moves) member.moves = ['','','',''];

  const editor = document.getElementById('team-editor');
  editor.classList.remove('hidden');
  editor.innerHTML = `
    <div class="card" style="border:2px solid var(--accent)">
      <h3>${isNew ? 'ポケモン追加' : '編集'}</h3>
      <div class="search-wrap">
        <input type="text" id="te-search" value="${member.name}" placeholder="ポケモン名..." autocomplete="off">
        <div class="search-list" id="te-list"></div>
      </div>
      <div id="te-info"></div>
      <label>性格</label>
      <select id="te-nature">
        ${Object.keys(DATA.natures).map(n => `<option${n === member.nature ? ' selected' : ''}>${n}</option>`).join('')}
      </select>
      <label>もちもの</label>
      <select id="te-item">
        <option value="">なし</option>
        ${Object.keys(DATA.items).sort().map(i => `<option${i === member.item ? ' selected' : ''}>${i}</option>`).join('')}
      </select>
      <label>とくせい</label>
      <select id="te-ability"></select>
      <label>SP配分</label>
      ${['hp','at','df','sa','sd','sp'].map(stat => `
        <div class="sp-row">
          <span class="sp-label">${{hp:'HP',at:'攻撃',df:'防御',sa:'特攻',sd:'特防',sp:'素早'}[stat]}</span>
          <input type="number" id="te-sp-${stat}" min="0" max="32" value="${member.sp[stat] || 0}">
        </div>
      `).join('')}
      <label>わざ</label>
      ${[0,1,2,3].map(i => `
        <div class="search-wrap" style="margin-bottom:4px">
          <input type="text" id="te-move-${i}" value="${member.moves[i] || ''}" placeholder="わざ${i+1}..." autocomplete="off">
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
      document.getElementById('te-info').innerHTML = p.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join(' ');
      const abilSel = document.getElementById('te-ability');
      abilSel.innerHTML = p.abilities.map(a => `<option>${a}</option>`).join('');
      member.ability = p.abilities[0];
    }
  });

  const moveNames = Object.keys(DATA.moves).sort();
  for (let i = 0; i < 4; i++) {
    setupSearch(document.getElementById(`te-move-${i}`), document.getElementById(`te-movelist-${i}`), moveNames, name => {
      member.moves[i] = name;
    });
  }

  if (member.name && DATA.pokemon[member.name]) {
    const p = DATA.pokemon[member.name];
    document.getElementById('te-info').innerHTML = p.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join(' ');
    const abilSel = document.getElementById('te-ability');
    abilSel.innerHTML = p.abilities.map(a => `<option${a === member.ability ? ' selected' : ''}>${a}</option>`).join('');
  }

  document.getElementById('te-ok').addEventListener('click', () => {
    if (!member.name) return;
    member.nature = document.getElementById('te-nature').value;
    member.item = document.getElementById('te-item').value;
    member.ability = document.getElementById('te-ability').value;
    for (const stat of ['hp','at','df','sa','sd','sp']) {
      member.sp[stat] = parseInt(document.getElementById(`te-sp-${stat}`).value) || 0;
    }
    for (let i = 0; i < 4; i++) {
      member.moves[i] = document.getElementById(`te-move-${i}`).value || '';
    }
    if (isNew) currentTeam.members.push(member);
    else currentTeam.members[idx] = member;
    editor.classList.add('hidden');
    renderTeamPage();
  });
  document.getElementById('te-cancel').addEventListener('click', () => editor.classList.add('hidden'));
}

async function saveTeam() {
  const team = {
    name: currentTeam.name,
    members: currentTeam.members,
    updatedAt: Date.now()
  };
  if (currentTeam.id) team.id = currentTeam.id;
  const id = await DB.put('teams', team);
  if (!currentTeam.id) currentTeam.id = id;
  alert('保存しました');
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
      currentTeam = { id: team.id, name: team.name, members: team.members };
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
function initRecordsPage() {
  renderRecordsPage();
}

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
      if (btn.dataset.action === 'delete') {
        await DB.del('records', id);
        renderRecordsPage();
      } else if (btn.dataset.action === 'edit') {
        const rec = await DB.get('records', id);
        openRecordEditor(rec);
      }
    });
  });
}

function renderRecord(r) {
  const date = r.date ? new Date(r.date).toLocaleDateString('ja-JP') : '';
  const resultClass = r.result === 'win' ? 'result-win' : 'result-lose';
  const resultText = r.result === 'win' ? '勝ち' : '負け';
  return `
    <div class="record">
      <div class="meta">${date}</div>
      <span class="result-tag ${resultClass}">${resultText}</span>
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
        <option value="win"${r.result === 'win' ? ' selected' : ''}>勝ち</option>
        <option value="lose"${r.result === 'lose' ? ' selected' : ''}>負け</option>
      </select>
      <label>相手プレイヤー</label>
      <input type="text" id="re-opponent" value="${r.opponent || ''}">
      <label>自分のチーム</label>
      <input type="text" id="re-myteam" value="${r.myTeam || ''}" placeholder="ガブリアス, ミミッキュ...">
      <label>相手のチーム</label>
      <input type="text" id="re-oppteam" value="${r.oppTeam || ''}" placeholder="ドラパルト, キョジオーン...">
      <label>メモ</label>
      <textarea id="re-notes" rows="3" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:6px;font-size:.85rem">${r.notes || ''}</textarea>
      <div class="row mt">
        <button class="btn" id="re-save">保存</button>
        <button class="btn btn-outline" id="re-cancel">キャンセル</button>
      </div>
    </div>
  `;

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

// ===== INIT =====
async function init() {
  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
  // Persist storage
  DB.persist();

  await loadData();
  initCalcPage();
  initTeamPage();
  initRecordsPage();

  // Nav
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
