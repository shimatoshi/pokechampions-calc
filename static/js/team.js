// Pokemon Champions Calculator - Team & Threats Page

let currentTeam = { id: null, name: '新チーム', members: [], notes: '' };
let teamView = 'list';

function initTeamPage() { renderTeamList(); }

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
    if (team.members[i]) sprites.push(spriteImg(team.members[i].name, 40));
    else sprites.push('<div class="team-empty-slot"></div>');
  }
  return `
    <div class="team-row card" data-id="${team.id}" style="cursor:pointer">
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
        <strong style="flex:1">${esc(team.name)}</strong>
        <button class="btn btn-sm btn-outline tr-export" style="font-size:.6rem;padding:2px 6px">出力</button>
        <button class="btn btn-sm btn-danger tr-del" style="font-size:.6rem;padding:2px 6px">×</button>
      </div>
      <div class="team-sprites">${sprites.join('')}</div>
    </div>`;
}

async function renderTeamDetail() {
  teamView = 'detail';
  const page = document.getElementById('page-team');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:4px">
        <button class="btn btn-sm btn-outline" id="td-back">← 一覧</button>
        <input type="text" id="team-name" value="${esc(currentTeam.name)}" style="font-weight:700;font-size:1rem;flex:1">
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
      <pre class="sd-text" style="max-height:200px;overflow-y:auto;margin-top:4px">${currentTeam.members.length > 0 ? esc(teamToShowdownText(currentTeam)) : '（ポケモンを追加してください）'}</pre>
    </div>
    <div class="card mt">
      <h3>概要・戦略メモ</h3>
      <textarea id="team-notes" rows="4" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:6px;font-size:.85rem" placeholder="チームの戦略、選出パターン、戦績メモ...">${esc(currentTeam.notes || '')}</textarea>
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

  page.querySelectorAll('.ts-sprite[data-idx]').forEach(sp => {
    sp.addEventListener('click', () => {
      const idx = parseInt(sp.dataset.idx);
      const slot = page.querySelector(`.team-detail[data-idx="${idx}"]`);
      if (slot) slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

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

async function renderTeamPage() {
  if (teamView === 'detail') renderTeamDetail();
  else renderTeamList();
}

function renderTeamSlot(member, idx) {
  const p = DATA.pokemon[member.name];
  const types = p ? p.types.map(t => typeBadge(t)).join('') : '';
  return `
    <div class="team-detail" data-idx="${idx}">
      <div class="team-slot" data-idx="${idx}">
        ${spriteImg(member.name, 40)}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${esc(ja('pokemon', member.name))} ${types}</div>
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
          <div style="font-weight:700;font-size:.85rem">${esc(ja('pokemon', t.name))} ${types}</div>
          <div style="font-size:.65rem;color:var(--fg2)">${esc([itemStr, moves].filter(Boolean).join(' | '))}</div>
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
        <div class="name">${esc(ja('pokemon', b.name))}</div>
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
        <input type="text" id="th-search" value="${esc(threat.name ? ja('pokemon', threat.name) : '')}" placeholder="ポケモン名..." autocomplete="off">
        <div class="search-list" id="th-list"></div>
      </div>
      <div id="th-info"></div>
      ${buildNatureUI('th')}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="th-item-search" value="${esc(threat.item ? ja('items', threat.item) : '')}" placeholder="もちもの検索..." autocomplete="off">
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
          <input type="text" id="th-move-${i}" value="${esc(threat.moves[i] ? ja('moves', threat.moves[i]) : '')}" placeholder="わざ${i+1}..." autocomplete="off">
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
        <input type="text" id="te-search" value="${esc(member.name ? ja('pokemon', member.name) : '')}" placeholder="ポケモン名..." autocomplete="off">
        <div class="search-list" id="te-list"></div>
      </div>
      <div id="te-info"></div>
      ${buildNatureUI('te')}
      <label>もちもの</label>
      <div class="search-wrap">
        <input type="text" id="te-item-search" value="${esc(member.item ? ja('items', member.item) : '')}" placeholder="もちもの検索..." autocomplete="off">
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
          <input type="text" id="te-move-${i}" value="${esc(member.moves[i] ? ja('moves', member.moves[i]) : '')}" placeholder="わざ${i+1}..." autocomplete="off">
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

  const teNature = { natureMods: { ...member.natureMods } };
  initNatureUI('te', teNature);
  updateNatureDisplay('te', teNature);

  const teItemEntries = Object.keys(DATA.items).sort().map(k => ({ key: k, ja: ja('items', k) }));
  setupItemSearch(document.getElementById('te-item-search'), document.getElementById('te-item-list'), teItemEntries, name => { member.item = name; });
  if (member.item) document.getElementById('te-item-search').dataset.key = member.item;

  const moveNames = Object.keys(DATA.moves).sort();
  for (let i = 0; i < 4; i++) {
    setupSearch(document.getElementById(`te-move-${i}`), document.getElementById(`te-movelist-${i}`), moveNames, name => { member.moves[i] = name; });
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
        <div class="name" style="flex:1">${esc(t.name)} (${t.members.length}匹)</div>
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
      } else { showToast('無効なチームデータ'); }
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
