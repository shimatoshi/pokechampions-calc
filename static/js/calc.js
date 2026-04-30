// Pokemon Champions Calculator - Calc Page

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
      ${s === 'def' ? `
      <label>現在HP <span style="font-size:.7rem;color:var(--fg2)">(連続攻撃シミュ用、空欄=満タン)</span></label>
      <div class="row" style="gap:4px;align-items:center">
        <input type="number" id="def-current-hp" min="0" placeholder="満タン" style="flex:1">
        <span id="def-hp-max-display" style="font-size:.85rem;color:var(--fg2);white-space:nowrap">/-</span>
        <button class="btn btn-sm btn-outline" id="def-hp-reset" style="font-size:.7rem;padding:2px 8px">満タン</button>
      </div>
      ` : ''}
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

  // 現在HP入力 (defのみ)
  const hpInput = document.getElementById('def-current-hp');
  hpInput?.addEventListener('input', e => {
    const v = e.target.value.trim();
    defState.currentHP = v === '' ? null : Math.max(0, parseInt(v) || 0);
    updateHpDisplay();
  });
  document.getElementById('def-hp-reset')?.addEventListener('click', () => {
    defState.currentHP = null;
    if (hpInput) hpInput.value = '';
    updateHpDisplay();
  });

  // SP +/- /0/32 buttons
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

  // Restore field UI from state
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
  const isNewPokemon = state.name !== name;
  state.name = name;
  // ポケモン変更時は currentHP をリセット (満タン扱い)
  if (side === 'def' && isNewPokemon) state.currentHP = null;
  const data = DATA.pokemon[name];
  if (!data) return;

  const info = document.getElementById(`${side}-info`);
  const jaName = ja('pokemon', name);
  info.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
      ${spriteImg(name, 48)}
      <div>
        <div style="font-weight:700">${esc(jaName)}</div>
        <div style="font-size:.7rem;color:var(--fg2)">${esc(name)}</div>
        <div>${data.types.map(t => typeBadge(t)).join(' ')}</div>
      </div>
    </div>`;

  // Formes
  if (data.formes && data.formes.length > 1) {
    info.innerHTML += `<div style="font-size:.75rem;margin-top:2px">${data.formes.map(f =>
      `<span class="btn btn-sm btn-outline" style="margin:1px;padding:2px 6px;font-size:.7rem;cursor:pointer" data-forme="${esc(f)}">${esc(ja('pokemon', f) || f)}</span>`
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
  if (side === 'def') {
    // SP変更でmaxHpが変わるので currentHP を clamp
    if (state.currentHP != null && state.currentHP > stats.hp) state.currentHP = stats.hp;
    updateHpDisplay();
  }
}

function updateHpDisplay() {
  const stats = defState.name ? DMG.getStats(defState) : null;
  const maxEl = document.getElementById('def-hp-max-display');
  const inputEl = document.getElementById('def-current-hp');
  if (!stats) {
    if (maxEl) maxEl.textContent = '/-';
    return;
  }
  if (maxEl) maxEl.textContent = `/${stats.hp}`;
  if (inputEl) {
    inputEl.max = stats.hp;
    if (defState.currentHP != null && document.activeElement !== inputEl) {
      inputEl.value = defState.currentHP;
    }
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
    const avgDmg = Math.floor((r.minDmg + r.maxDmg) / 2);
    const remaining = r.curHp < r.hp ? `<span style="color:var(--warn)">残${r.curHp}/${r.hp}</span> ` : '';
    html += `
      <div class="dmg-result">
        <div style="font-size:.8rem;margin-bottom:4px">
          ${typeBadge(r.moveType)}
          <strong>${jaMove}</strong> <span style="color:var(--fg2);font-size:.7rem">${moveName}</span> (威力${r.bp}${r.hits > 1 ? `×${r.hits}` : ''})
          ${r.isSTAB ? '<span style="color:var(--warn);font-size:.7rem">STAB</span>' : ''}
          ${r.hitsLabel ? `<span style="font-size:.7rem;color:var(--accent2);margin-left:4px">${esc(r.hitsLabel)}</span>` : ''}
        </div>
        <div class="pct">${r.minPct}% ~ ${r.maxPct}%</div>
        <div class="range">${remaining}${r.minDmg} ~ ${r.maxDmg} / ${r.hp} HP</div>
        <div class="ko ${r.koClass}">${r.koText} ${r.koDetail || ''}</div>
        ${r.statNote ? `<div style="font-size:.7rem;color:var(--accent2)">${r.statNote}</div>` : ''}
        ${r.berryActive ? `<div style="font-size:.75rem;color:var(--ok)">${ja('items', r.berryItem)}で半減</div>` : ''}
        ${r.atkRecoil ? `<div style="font-size:.75rem;color:var(--fg2)">${r.atkRecoil}</div>` : ''}
        <div class="effectiveness">${effText}</div>
        <div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-sm btn-outline next-hit" data-dmg="${r.minDmg}" style="font-size:.7rem;padding:3px 8px">最小(-${r.minDmg})</button>
          <button class="btn btn-sm btn-outline next-hit" data-dmg="${avgDmg}" style="font-size:.7rem;padding:3px 8px">平均(-${avgDmg})</button>
          <button class="btn btn-sm btn-outline next-hit" data-dmg="${r.maxDmg}" style="font-size:.7rem;padding:3px 8px;border-color:var(--warn);color:var(--warn)">最大(-${r.maxDmg})</button>
        </div>
      </div>`;
  }
  results.innerHTML = html;
  // 次の攻撃へボタン: 残HP更新→再計算
  results.querySelectorAll('.next-hit').forEach(btn => {
    btn.addEventListener('click', () => {
      const dmg = parseInt(btn.dataset.dmg);
      const stats = DMG.getStats(defState);
      const cur = defState.currentHP != null ? defState.currentHP : (stats?.hp || 0);
      defState.currentHP = Math.max(0, cur - dmg);
      const hpInput = document.getElementById('def-current-hp');
      if (hpInput) hpInput.value = defState.currentHP;
      updateHpDisplay();
      runCalc();
    });
  });
}

function swapSides() {
  const tmp = JSON.parse(JSON.stringify(atkState));
  Object.assign(atkState, JSON.parse(JSON.stringify(defState)));
  Object.assign(defState, tmp);
  // movesは攻撃側専用: 入替後はどちらも一度クリア (新atkで改めて選択)
  atkState.moves = ['', '', '', ''];
  defState.moves = ['', '', '', ''];
  // currentHPもリセット (前のdef側残HPは無関係になる)
  defState.currentHP = null;
  atkState.currentHP = null;
  initCalcPage();
  if (atkState.name) { selectPokemon('atk', atkState.name); restoreStateToUI('atk', atkState); }
  if (defState.name) { selectPokemon('def', defState.name); restoreStateToUI('def', defState); }
  showToast('攻守入替');
}

async function openLoadPicker(side) {
  const picker = document.getElementById('load-picker');
  const members = currentTeam.members || [];
  const threats = await DB.getAll('threats');

  picker.classList.remove('hidden');
  picker.innerHTML = `
    <div class="card" style="border:2px solid var(--accent);max-height:60vh;overflow-y:auto">
      <h3>${side === 'atk' ? '攻撃側' : '防御側'}に読込</h3>
      ${members.length > 0 ? `
        <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">チーム: ${esc(currentTeam.name)}</div>
        ${members.map((m, i) => `
          <div class="team-slot pick-slot" data-src="team" data-idx="${i}">
            ${spriteImg(m.name, 28)}
            <div class="name">${esc(ja('pokemon', m.name))}</div>
            ${DATA.pokemon[m.name]?.types.map(t => typeBadge(t)).join('')||''}
          </div>`).join('')}
      ` : '<div style="font-size:.8rem;color:var(--fg2);margin:4px 0">チームなし</div>'}
      <hr>
      <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">対策表</div>
      ${threats.length > 0 ? threats.map(t => `
        <div class="team-slot pick-slot" data-src="threat" data-idx="${t.id}">
          ${spriteImg(t.name, 28)}
          <div class="name">${esc(ja('pokemon', t.name))}</div>
          ${DATA.pokemon[t.name]?.types.map(tp => typeBadge(tp)).join('')||''}
          ${t.item ? `<span style="font-size:.65rem;color:var(--fg2)">${esc(ja('items',t.item))}</span>` : ''}
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
  delete entry.id;
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

  const atkCalcs = [];
  for (const moveName of activeMoves) {
    const r = DMG.calculate(atkState, defState, moveName, fieldState);
    if (!r) continue;
    atkCalcs.push({ dir: 'atk', vs: defState.name, move: moveName, range: `${r.minPct}%~${r.maxPct}%`, ko: r.koText, detail: r.koDetail || '' });
  }

  const defCalcs = [];
  for (const moveName of activeMoves) {
    const r = DMG.calculate(atkState, defState, moveName, fieldState);
    if (!r) continue;
    defCalcs.push({ dir: 'def', vs: atkState.name, move: moveName, range: `${r.minPct}%~${r.maxPct}%`, ko: r.koText, detail: r.koDetail || '' });
  }

  const boxAll = await DB.getAll('box');
  let saved = 0;

  if (atkCalcs.length > 0) {
    let atkBox = findBoxMatch(boxAll, atkState);
    if (!atkBox) { atkBox = JSON.parse(JSON.stringify(atkState)); delete atkBox.id; atkBox.savedCalcs = []; atkBox.notes = ''; }
    if (!atkBox.savedCalcs) atkBox.savedCalcs = [];
    for (const cr of atkCalcs) {
      if (!atkBox.savedCalcs.some(s => s.dir === cr.dir && s.vs === cr.vs && s.move === cr.move && s.range === cr.range)) { atkBox.savedCalcs.push(cr); saved++; }
    }
    await DB.put('box', atkBox);
    if (!atkBox.id) boxAll.push(atkBox);
  }

  if (defCalcs.length > 0) {
    let defBox = findBoxMatch(boxAll, defState);
    if (!defBox) { defBox = JSON.parse(JSON.stringify(defState)); delete defBox.id; defBox.savedCalcs = []; defBox.notes = ''; }
    if (!defBox.savedCalcs) defBox.savedCalcs = [];
    for (const cr of defCalcs) {
      if (!defBox.savedCalcs.some(s => s.dir === cr.dir && s.vs === cr.vs && s.move === cr.move && s.range === cr.range)) { defBox.savedCalcs.push(cr); saved++; }
    }
    await DB.put('box', defBox);
  }

  showToast(`ダメ計結果をBOXに保存 (${saved}件)`);
}

function addCalcToTeam(side) {
  const state = side === 'atk' ? atkState : defState;
  if (!state.name) { showToast('ポケモンを選択してください'); return; }
  if (currentTeam.members.length >= 6) { showToast('チームは6匹まで'); return; }
  const fp = buildFingerprint(state);
  if (currentTeam.members.some(m => buildFingerprint(m) === fp)) { showToast(`同じ個体が既にチームにいます`); return; }
  const member = JSON.parse(JSON.stringify(state));
  currentTeam.members.push(member);
  showToast(`${ja('pokemon', state.name)} をチームに追加しました (${currentTeam.members.length}/6)`);
}
