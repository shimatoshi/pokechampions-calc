// Pokemon Champions Calculator - Team & Threats Page
import {
  DATA, ja, esc, spriteImg, typeBadge,
  showdownHTML, teamToShowdownText,
} from './data.js';
import {
  atkState, defState, makePokemonState, generateUid,
  currentTeam, setCurrentTeam, markDirty,
} from './state.js';
import { DB } from './db.js';
import { buildKey, syncMembersToBox } from './box-sync.js';
import { openShowdownImport } from './showdown-import.js';
import { selectPokemon, initCalcPage } from './calc.js';
import { restoreStateToUI, showToast, switchPage, buildMiniEditor } from './ui.js';
let teamView = 'list';

export function initTeamPage() { renderTeamList(); }

async function renderTeamList() {
  teamView = 'list';
  const teams = await DB.getAll('teams');
  const threats = await DB.getAll('threats');
  const page = document.getElementById('page-team');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:4px">
        <h3 style="flex:1;margin:0">チーム一覧</h3>
        <button class="btn btn-sm" id="tl-new">+ 自分</button>
        <button class="btn btn-sm" id="tl-new-opp">+ 相手</button>
        <button class="btn btn-sm btn-outline" id="tl-random">🎲 抽選</button>
        <button class="btn btn-sm btn-outline" id="tl-import">インポート</button>
        <button class="btn btn-sm btn-outline" id="tl-sync" title="保存済みの全チームのポケモンをBOXに登録・紐付けします">BOX同期</button>
        <input type="file" id="tl-import-file" accept=".json" class="hidden">
      </div>
    </div>
    <div id="team-rows">
      ${teams.length === 0 ? '<div class="card"><p class="empty-state">チームがありません。「+ 自分」「+ 相手」で作成できます</p></div>' : ''}
      ${renderTeamGroup('自分のチーム', [...teams].reverse().filter(t => t.kind !== 'opponent'))}
      ${renderTeamGroup('相手チーム', [...teams].reverse().filter(t => t.kind === 'opponent'))}
    </div>
    <div class="card mt">
      <h3>対策表（仮想敵）</h3>
      <div id="threat-list">
        ${threats.length === 0 ? '<div style="font-size:.8rem;color:var(--fg2)">仮想敵が未登録です</div>' : ''}
        ${threats.map(t => renderThreatSlot(t)).join('')}
      </div>
      <button class="btn btn-outline mt u-w100" id="threat-add">+ 仮想敵を追加</button>
      <div id="threat-editor" class="hidden"></div>
    </div>
    <div id="team-load-modal" class="hidden"></div>
  `;

  document.getElementById('tl-new').addEventListener('click', () => {
    setCurrentTeam({ id: null, name: '新チーム', kind: 'mine', members: [], notes: '' });
    renderTeamDetail();
  });
  document.getElementById('tl-new-opp').addEventListener('click', () => {
    setCurrentTeam({ id: null, name: '相手チーム', kind: 'opponent', members: [], notes: '' });
    renderTeamDetail();
  });
  document.getElementById('tl-random').addEventListener('click', () => {
    setCurrentTeam(generateRandomTeam());
    renderTeamDetail();
    showToast('6匹を抽選しました（保存するまで未確定）');
  });
  document.getElementById('tl-sync').addEventListener('click', async () => {
    let added = 0;
    for (const t of teams) {
      const r = await syncMembersToBox(t.members || []);
      added += r.added;
      await DB.put('teams', t);
    }
    showToast(added ? `BOXに${added}匹を追加しました` : 'すべてBOXに登録済みです');
    renderTeamList();
  });
  document.getElementById('tl-import').addEventListener('click', () => document.getElementById('tl-import-file').click());
  document.getElementById('tl-import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.name && data.members) {
        delete data.id;
        await syncMembersToBox(data.members);
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
      setCurrentTeam({ id: team.id, name: team.name, kind: team.kind || 'mine', members: team.members, notes: team.notes || '' });
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

// ===== ランダムチーム生成 =====
// メガシンカと戦闘中フォルムチェンジは抽選対象外（実際に選出できる姿のみ）
const RANDOM_EXCLUDE = new Set([
  'Aegislash-Blade', 'Aegislash-Shield',  // ベースのAegislashのみ
  'Morpeko-Hangry', 'Palafin-Hero',       // 戦闘中フォルム
  'Maushold-Four',                        // Mausholdと実質重複
]);

function pickRandom(arr) {
  const i = Math.floor(Math.random() * arr.length);
  return arr.splice(i, 1)[0];
}

function generateRandomTeam() {
  const pool = Object.keys(DATA.pokemon).filter(n => !n.startsWith('Mega ') && !RANDOM_EXCLUDE.has(n));
  const members = [];
  for (let k = 0; k < 6 && pool.length > 0; k++) {
    const name = pickRandom(pool);
    const p = DATA.pokemon[name];
    const m = makePokemonState();
    m.uid = generateUid();
    m.name = name;
    m.ability = p.abilities?.length ? p.abilities[Math.floor(Math.random() * p.abilities.length)] : '';
    // 技: 攻撃技3 + 自由枠1（そのままシミュ/ダメ計で使える構成にする）
    const known = (p.learnset || []).filter(mv => DATA.moves[mv]);
    const attacks = known.filter(mv => (DATA.moves[mv].bp || 0) > 0);
    const others = known.filter(mv => !(DATA.moves[mv].bp > 0));
    let slot = 0;
    while (slot < 3 && attacks.length > 0) m.moves[slot++] = pickRandom(attacks);
    const rest = attacks.concat(others);
    while (slot < 4 && rest.length > 0) m.moves[slot++] = pickRandom(rest);
    members.push(m);
  }
  return { id: null, name: 'ランダムチーム', members, notes: '' };
}

function renderTeamGroup(label, list) {
  if (!list.length) return '';
  return `<div class="u-hint u-my4" style="margin-top:10px">${label} (${list.length})</div>${list.map(t => renderTeamRow(t)).join('')}`;
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
        <strong class="u-flex1">${esc(team.name)}</strong>
        <button class="btn btn-sm btn-outline tr-export u-chip">出力</button>
        <button class="btn btn-sm btn-danger tr-del u-chip">×</button>
      </div>
      <div class="team-sprites">${sprites.join('')}</div>
    </div>`;
}

async function renderTeamDetail() {
  teamView = 'detail';
  const boxByUid = new Map((await DB.getAll('box')).filter(b => b.uid).map(b => [b.uid, b]));
  const page = document.getElementById('page-team');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:4px">
        <button class="btn btn-sm btn-outline" id="td-back">← 一覧</button>
        <input type="text" id="team-name" value="${esc(currentTeam.name)}" style="font-weight:700;font-size:1rem;flex:1" aria-label="チーム名">
        <button class="btn btn-sm" id="team-save">保存</button>
        ${currentTeam.id ? '<button class="btn btn-sm btn-outline" id="team-save-copy" title="現在の内容を別チームとして保存">複製保存</button>' : ''}
      </div>
    </div>
    <div class="card">
      <div class="row" style="align-items:center;gap:8px">
        <select id="team-kind" aria-label="チームの種別" class="u-flex1">
          <option value="mine" ${currentTeam.kind !== 'opponent' ? 'selected' : ''}>自分のチーム</option>
          <option value="opponent" ${currentTeam.kind === 'opponent' ? 'selected' : ''}>相手チーム</option>
        </select>
        <button class="btn btn-sm" id="team-run-a" ${currentTeam.members.length ? '' : 'disabled'}>自分側で回す</button>
        <button class="btn btn-sm btn-outline" id="team-run-b" ${currentTeam.members.length ? '' : 'disabled'}>相手側にセット</button>
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
      ${currentTeam.members.map((m, i) => renderTeamSlot(m, i, boxByUid.get(m.uid))).join('')}
    </div>
    ${currentTeam.members.length < 6 ? `
    <div class="row mt" style="gap:4px">
      <button class="btn btn-outline u-flex1" id="team-add">+ 新規追加</button>
      <button class="btn btn-outline u-flex1" id="team-add-from-box">+ BOXから追加</button>
      <button class="btn btn-outline u-flex1" id="team-add-text">テキスト取込</button>
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
  document.getElementById('team-kind').addEventListener('change', e => { currentTeam.kind = e.target.value; });
  const runInSim = async side => {
    const { loadTeamToSim } = await import('./sim-setup.js');
    loadTeamToSim(side, { id: currentTeam.id, name: currentTeam.name, members: currentTeam.members });
  };
  document.getElementById('team-run-a').addEventListener('click', () => runInSim('a'));
  document.getElementById('team-run-b').addEventListener('click', () => runInSim('b'));
  document.getElementById('team-add-text')?.addEventListener('click', () => openShowdownImport(page, imported => {
    imported.forEach(m => { if (currentTeam.members.length < 6) currentTeam.members.push(m); });
    renderTeamDetail();
  }, 'チームに取り込み'));
  document.getElementById('team-notes').addEventListener('input', e => currentTeam.notes = e.target.value);
  document.getElementById('team-save')?.addEventListener('click', saveTeam);
  document.getElementById('team-save-copy')?.addEventListener('click', saveTeamAsCopy);
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
    const debounce = (fn) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), 500); }; };
    slot.querySelector('.tm-role')?.addEventListener('input', e => { currentTeam.members[idx].roleNote = e.target.value; });
    slot.querySelector('.tm-indiv')?.addEventListener('input', debounce(async e => {
      const m = currentTeam.members[idx];
      const value = e.target.value;
      const b = m.uid ? boxByUid.get(m.uid) : null;
      if (b) { b.notes = value; await DB.put('box', b); }
      else m.notes = value; // 未登録の個体: 保存時にBOX個体のメモとして引き継ぐ
    }));
  });
}

export async function renderTeamPage() {
  if (teamView === 'detail') renderTeamDetail();
  else renderTeamList();
}

function renderTeamSlot(member, idx, boxEntry) {
  const p = DATA.pokemon[member.name];
  const types = p ? p.types.map(t => typeBadge(t)).join('') : '';
  return `
    <div class="team-detail" data-idx="${idx}">
      <div class="team-slot" data-idx="${idx}">
        ${spriteImg(member.name, 40)}
        <div class="u-flex1 u-minw0">
          <div class="u-bold">${esc(ja('pokemon', member.name))} ${types}</div>
        </div>
        <button class="btn btn-sm to-calc-btn u-chip">ダメ計</button>
        <button class="btn btn-sm btn-outline edit-btn">編集</button>
        <button class="btn btn-sm btn-danger del-btn">×</button>
      </div>
      ${showdownHTML(member)}
      <details class="member-memo">
        <summary>メモ <span class="section-state">${esc(memoSummary(member, boxEntry))}</span></summary>
        <label for="tm-role-${idx}">このパーティでの役割 <span class="field-hint">この編成だけのメモ</span></label>
        <textarea id="tm-role-${idx}" class="tm-role" rows="2" placeholder="例: 初手ステロ→後続の起点作り。◯◯には引く">${esc(member.roleNote || '')}</textarea>
        <label for="tm-indiv-${idx}">個体メモ <span class="field-hint">${boxEntry ? 'BOXの同じ個体と共通' : '保存時にBOXへ登録されます'}</span></label>
        <textarea id="tm-indiv-${idx}" class="tm-indiv" rows="2" placeholder="例: HB特化で◯◯確定耐え">${esc(boxEntry ? (boxEntry.notes || '') : (member.notes || ''))}</textarea>
      </details>
    </div>`;
}

function memoSummary(member, boxEntry) {
  const parts = [];
  if (member.roleNote) parts.push('役割あり');
  if (boxEntry ? boxEntry.notes : member.notes) parts.push('個体あり');
  return parts.join('・') || (boxEntry ? 'BOX登録済' : '未登録');
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
        <div class="u-flex1 u-minw0">
          <div style="font-weight:700;font-size:.85rem">${esc(ja('pokemon', t.name))} ${types}</div>
          <div class="u-hint">${esc([itemStr, moves].filter(Boolean).join(' | '))}</div>
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

  const renderSlot = b => `
    <div class="team-slot box-pick" data-id="${b.id}" data-name="${esc(b.name)}" data-ja="${esc(ja('pokemon', b.name))}">
      ${spriteImg(b.name, 28)}
      <div class="name">${esc(ja('pokemon', b.name))}</div>
      ${DATA.pokemon[b.name]?.types.map(t => typeBadge(t)).join('')||''}
    </div>`;

  modal.innerHTML = `<div class="card" style="max-height:70vh;overflow-y:auto">
    <h3>BOXから追加</h3>
    <input type="text" id="box-pick-search" placeholder="ポケモン名で検索..." autocomplete="off" style="margin-bottom:6px">
    <div id="box-pick-list">
      ${boxAll.map(b => renderSlot(b)).join('')}
    </div>
    <button class="btn btn-outline mt" id="box-pick-close">閉じる</button>
  </div>`;

  // Search filter
  modal.querySelector('#box-pick-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    modal.querySelectorAll('.box-pick').forEach(slot => {
      const en = (slot.dataset.name || '').toLowerCase();
      const jp = (slot.dataset.ja || '').toLowerCase();
      slot.style.display = (!q || en.includes(q) || jp.includes(q)) ? '' : 'none';
    });
  });

  modal.querySelector('#box-pick-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.querySelectorAll('.box-pick').forEach(slot => {
    slot.addEventListener('click', () => {
      const b = boxAll.find(x => x.id === parseInt(slot.dataset.id));
      if (!b) return;
      if (currentTeam.members.length >= 6) { showToast('6匹まで'); return; }
      if (b.uid && currentTeam.members.some(m => m.uid === b.uid)) { showToast('同じ個体が既にチームにいます'); return; }
      const copy = JSON.parse(JSON.stringify(b));
      delete copy.id; delete copy.savedCalcs; delete copy.notes; // 個体メモ等はBOX側が正
      currentTeam.members.push(copy);
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
  buildMiniEditor(editor, threat, 'th', {
    title: isNew ? '仮想敵を追加' : '仮想敵を編集',
    onSave: async (t) => {
      if (existing?.id) t.id = existing.id;
      if (!t.uid) t.uid = generateUid();
      await DB.put('threats', t);
      editor.classList.add('hidden');
      renderTeamPage();
      showToast(isNew ? '仮想敵を追加しました' : '仮想敵を更新しました');
    },
    onCancel: () => editor.classList.add('hidden'),
  });
}

function openTeamEditor(idx) {
  const isNew = idx === -1;
  const member = isNew ? makePokemonState() : JSON.parse(JSON.stringify(currentTeam.members[idx]));
  if (!member.natureMods) member.natureMods = { plus: '', minus: '' };
  if (!member.moves) member.moves = ['','','',''];

  const editor = document.getElementById('team-editor');
  editor.classList.remove('hidden');
  buildMiniEditor(editor, member, 'te', {
    title: isNew ? 'ポケモン追加' : '編集',
    onSave: (m) => {
      if (isNew) { m.uid = null; currentTeam.members.push(m); }
      else {
        const prev = currentTeam.members[idx];
        m.roleNote = prev.roleNote || '';
        // 構成が変わったら別個体: 紐付けを外し、保存時にBOXから再検索/新規登録する
        if (buildKey(m) !== buildKey(prev)) { m.uid = null; delete m.notes; }
        else { m.uid = prev.uid; if (prev.notes) m.notes = prev.notes; }
        currentTeam.members[idx] = m;
      }
      editor.classList.add('hidden');
      renderTeamPage();
    },
    onCancel: () => editor.classList.add('hidden'),
  });
}

async function saveTeam() {
  const { added } = await syncMembersToBox(currentTeam.members);
  const team = { name: currentTeam.name, kind: currentTeam.kind || 'mine', members: currentTeam.members, notes: currentTeam.notes || '', updatedAt: Date.now() };
  if (currentTeam.id) team.id = currentTeam.id;
  const id = await DB.put('teams', team);
  if (!currentTeam.id) currentTeam.id = id;
  showToast(added ? `保存しました（BOXに${added}匹を追加）` : '保存しました');
  renderTeamDetail();
}

// 現在の内容を元チームに触れず別チームとして保存（バックアップ用途）
async function saveTeamAsCopy() {
  await syncMembersToBox(currentTeam.members);
  const name = `${currentTeam.name} (複製)`;
  const team = {
    name,
    kind: currentTeam.kind || 'mine',
    members: JSON.parse(JSON.stringify(currentTeam.members)),
    notes: currentTeam.notes || '',
    updatedAt: Date.now(),
  };
  const id = await DB.add('teams', team);
  // 以後の編集は複製側を触る (元チームは保存時点のまま残る)
  setCurrentTeam({ id, name, kind: team.kind, members: team.members, notes: team.notes });
  renderTeamDetail();
  showToast(`「${name}」として保存 (元チームは保持)`);
}
