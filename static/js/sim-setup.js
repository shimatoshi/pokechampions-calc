// Pokemon Champions - Sim Setup/Editor/Selection phases
import {
  DATA, ja, esc, spriteImg, typeBadge,
} from './data.js';
import { makePokemonState, generateUid, currentTeam, markDirty } from './state.js';
import { DB } from './db.js';
import { parties, selection, field } from './battle-engine.js';
import { startBattle } from './sim.js';
import { showToast, buildMiniEditor, openEditorModal, showPokemonDetailModal } from './ui.js';

// ============================================================
// PHASE 1: SETUP
// ============================================================
export function renderSetup() {
  const page = document.getElementById('page-sim');
  page.innerHTML = `
    ${renderPartySection('a')}
    ${renderPartySection('b')}
    <div class="card" style="margin-top:6px">
      <h3>フィールド</h3>
      <div class="col2">
        <div><label>天候</label><select id="sim-weather">
          <option value="">なし</option><option value="Sun">はれ</option><option value="Rain">あめ</option>
          <option value="Sand">すなあらし</option><option value="Snow">ゆき</option>
        </select></div>
        <div><label>フィールド</label><select id="sim-terrain">
          <option value="">なし</option><option value="Electric">エレキ</option><option value="Grassy">グラス</option>
          <option value="Psychic">サイコ</option><option value="Misty">ミスト</option>
        </select></div>
      </div>
    </div>
    <button class="btn mt" style="width:100%" id="sim-to-select">選出へ進む →</button>
  `;
  document.getElementById('sim-weather').value = field.weather;
  document.getElementById('sim-terrain').value = field.terrain;
  document.getElementById('sim-weather').addEventListener('change', e => { field.weather = e.target.value; });
  document.getElementById('sim-terrain').addEventListener('change', e => { field.terrain = e.target.value; });
  document.getElementById('sim-to-select').addEventListener('click', goToSelect);

  for (const side of ['a','b']) {
    document.getElementById(`sim-party-add-${side}`).addEventListener('click', () => openEditor(side, -1));
    document.getElementById(`sim-party-load-${side}`).addEventListener('click', () => openPartyLoadPicker(side));
    document.getElementById(`sim-party-save-${side}`).addEventListener('click', () => savePartyAsTeam(side));
    document.querySelectorAll(`.sim-party-slot[data-side="${side}"]`).forEach(slot => {
      const idx = parseInt(slot.dataset.idx);
      slot.querySelector('.sim-slot-edit')?.addEventListener('click', e => { e.stopPropagation(); openEditor(side, idx); });
      slot.querySelector('.sim-slot-del')?.addEventListener('click', e => { e.stopPropagation(); parties[side].splice(idx, 1); renderSetup(); });
    });
  }
}

function renderPartySection(side) {
  const label = side === 'a' ? '自分' : '相手';
  const party = parties[side];
  return `
    <div class="card">
      <h3>${label}のパーティ (${party.length}/6)</h3>
      <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
        <button class="btn btn-sm" id="sim-party-load-${side}">読込</button>
        <button class="btn btn-sm btn-outline" id="sim-party-add-${side}" ${party.length >= 6 ? 'disabled' : ''}>+追加</button>
        <button class="btn btn-sm btn-outline" id="sim-party-save-${side}" style="border-color:var(--ok);color:var(--ok)" ${party.length === 0 ? 'disabled' : ''}>チームに保存</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${party.map((p, i) => `
          <div class="sim-party-slot" data-side="${side}" data-idx="${i}" style="background:var(--bg);border-radius:var(--radius);padding:4px 6px;display:flex;align-items:center;gap:4px;border:1px solid var(--bg3);min-width:0">
            ${spriteImg(p.name, 32)}
            <div style="min-width:0;flex:1">
              <div style="font-size:.75rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ja('pokemon', p.name))}</div>
              <div style="font-size:.6rem;color:var(--fg2)">${p.item ? esc(ja('items', p.item)) : ''}</div>
            </div>
            <button class="btn btn-sm btn-outline sim-slot-edit" style="padding:2px 5px;font-size:.6rem">編集</button>
            <button class="btn btn-sm sim-slot-del" style="padding:2px 5px;font-size:.6rem;background:var(--danger)">×</button>
          </div>
        `).join('')}
        ${party.length === 0 ? '<div style="font-size:.8rem;color:var(--fg2)">ポケモンを追加してください</div>' : ''}
      </div>
    </div>`;
}

// ===== EDITOR MODAL (共通エディタ buildMiniEditor を使用) =====
function openEditor(side, idx) {
  const page = document.getElementById('page-sim');
  const isNew = idx < 0;
  const state = isNew ? makePokemonState() : JSON.parse(JSON.stringify(parties[side][idx]));
  const { modal, inner } = openEditorModal('sim-editor-modal', page);

  buildMiniEditor(inner, state, 'ed', {
    title: `${isNew ? 'ポケモン追加' : '編集'} (${side === 'a' ? '自分' : '相手'})`,
    saveLabel: isNew ? '追加' : '保存',
    onSave: (s) => {
      delete s._moveEntries; // 旧データの残骸を念のため除去
      if (isNew) parties[side].push(s);
      else parties[side][idx] = s;
      modal.remove();
      renderSetup();
    },
    onCancel: () => modal.remove(),
    extraButtons: [{
      label: 'BOXに保存',
      style: 'border-color:var(--accent2);color:var(--accent2)',
      handler: async (s) => {
        const entry = JSON.parse(JSON.stringify(s));
        delete entry._moveEntries; delete entry.id;
        if (!entry.uid) entry.uid = generateUid();
        entry.savedCalcs = []; entry.notes = '';
        await DB.add('box', entry);
        markDirty('box');
        showToast(`${ja('pokemon', s.name)} をBOXに追加`);
      },
    }],
  });
}

// ===== LOAD PARTY =====
async function openPartyLoadPicker(side) {
  const page = document.getElementById('page-sim');
  let picker = document.getElementById('sim-party-picker');
  if (!picker) { picker = document.createElement('div'); picker.id = 'sim-party-picker'; page.appendChild(picker); }
  picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;overflow-y:auto;padding:10px';

  const teams = await DB.getAll('teams');
  const threats = await DB.getAll('threats');
  const boxAll = await DB.getAll('box');
  const members = currentTeam?.members || [];

  picker.innerHTML = `
    <div class="card" style="max-width:400px;margin:0 auto;max-height:80vh;overflow-y:auto">
      <h3>${side === 'a' ? '自分' : '相手'}のパーティに読込</h3>
      <div style="font-size:.75rem;color:var(--fg2);margin-bottom:4px">チームを選ぶ���全員読込、個体を選ぶと1匹追加</div>
      ${members.length > 0 ? `
        <div class="team-slot pick-team" data-src="current" style="border:2px solid var(--accent)">
          <div class="name" style="font-weight:700">現在のチーム (${members.length}匹)</div>
          <div style="display:flex;gap:2px">${members.map(m => spriteImg(m.name, 24)).join('')}</div>
        </div>` : ''}
      ${teams.map(t => `
        <div class="team-slot pick-team" data-src="team" data-id="${t.id}">
          <div class="name" style="font-weight:700">${esc(t.name)} (${t.members?.length || 0}匹)</div>
          <div style="display:flex;gap:2px">${(t.members||[]).map(m => spriteImg(m.name, 24)).join('')}</div>
        </div>`).join('')}
      <hr>
      <div style="font-size:.75rem;color:var(--fg2);margin:4px 0">個体追加</div>
      <input type="text" id="sim-pick-search" placeholder="ポケモン名で検索..." autocomplete="off" style="margin-bottom:6px">
      <div id="sim-pick-individuals">
      ${threats.map(t => `
        <div class="team-slot pick-one" data-src="threat" data-id="${t.id}" data-name="${esc(t.name)}" data-ja="${esc(ja('pokemon', t.name))}">
          ${spriteImg(t.name, 28)}<div class="name">${esc(ja('pokemon', t.name))}</div>
          ${DATA.pokemon[t.name]?.types.map(tp => typeBadge(tp)).join('')||''}
        </div>`).join('')}
      ${boxAll.map(b => `
        <div class="team-slot pick-one" data-src="box" data-id="${b.id}" data-name="${esc(b.name)}" data-ja="${esc(ja('pokemon', b.name))}">
          ${spriteImg(b.name, 28)}<div class="name">${esc(ja('pokemon', b.name))}</div>
          ${DATA.pokemon[b.name]?.types.map(tp => typeBadge(tp)).join('')||''}
        </div>`).join('')}
      </div>
      <button class="btn btn-outline mt" id="sim-pick-close">閉じる</button>
    </div>`;

  picker.querySelector('#sim-pick-close').addEventListener('click', () => picker.remove());
  picker.querySelector('#sim-pick-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    picker.querySelectorAll('.pick-one').forEach(slot => {
      const en = (slot.dataset.name || '').toLowerCase();
      const jp = (slot.dataset.ja || '').toLowerCase();
      slot.style.display = (!q || en.includes(q) || jp.includes(q)) ? '' : 'none';
    });
  });
  picker.querySelectorAll('.pick-team').forEach(el => {
    el.addEventListener('click', async () => {
      let teamMembers;
      if (el.dataset.src === 'current') teamMembers = members;
      else { const t = teams.find(t => t.id === parseInt(el.dataset.id)); teamMembers = t?.members || []; }
      parties[side].length = 0;
      teamMembers.forEach(m => parties[side].push(JSON.parse(JSON.stringify(m))));
      picker.remove(); renderSetup();
      showToast(`パーティ読込 (${parties[side].length}匹)`);
    });
  });
  picker.querySelectorAll('.pick-one').forEach(el => {
    el.addEventListener('click', async () => {
      if (parties[side].length >= 6) { showToast('パーティは6匹まで'); return; }
      let src;
      if (el.dataset.src === 'threat') src = threats.find(t => t.id === parseInt(el.dataset.id));
      else src = boxAll.find(b => b.id === parseInt(el.dataset.id));
      if (!src) return;
      parties[side].push(JSON.parse(JSON.stringify(src)));
      picker.remove(); renderSetup();
      showToast(`${ja('pokemon', src.name)} を追加`);
    });
  });
}

async function savePartyAsTeam(side) {
  if (parties[side].length === 0) return;
  const teamName = `SIM_${side === 'a' ? '自分' : '相手'}_${new Date().toLocaleDateString('ja')}`;
  const team = { name: teamName, members: parties[side].map(p => { const c = JSON.parse(JSON.stringify(p)); delete c._moveEntries; if (!c.uid) c.uid = generateUid(); return c; }), notes: '', updatedAt: Date.now() };
  await DB.add('teams', team);
  markDirty('team');
  showToast(`「${teamName}」をチームに保存`);
}

// ============================================================
// PHASE 2: SELECTION
// ============================================================
function goToSelect() {
  if (parties.a.length < 1 || parties.b.length < 1) { showToast('両方に最低1匹は必要です'); return; }
  for (const s of ['a','b']) selection[s] = parties[s].map((_, i) => i).slice(0, 3);
  renderSelect();
}

export function renderSelect() {
  const page = document.getElementById('page-sim');
  page.innerHTML = `
    <div class="card">
      <h3>選出 (最大3匹、タップで選択/解除)</h3>
      ${renderSelectSide('a')}
      <hr>
      ${renderSelectSide('b')}
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="btn btn-outline" id="sim-back-setup" style="flex:1">← 構築に戻る</button>
      <button class="btn" id="sim-start-battle" style="flex:2;background:var(--ok)">バトル開始 !</button>
    </div>
  `;
  document.getElementById('sim-back-setup').addEventListener('click', renderSetup);
  document.getElementById('sim-start-battle').addEventListener('click', startBattle);
  for (const side of ['a','b']) {
    document.querySelectorAll(`.sel-slot[data-side="${side}"]`).forEach(slot => {
      slot.addEventListener('click', () => {
        const idx = parseInt(slot.dataset.idx);
        const pos = selection[side].indexOf(idx);
        if (pos >= 0) selection[side].splice(pos, 1);
        else if (selection[side].length < 3) selection[side].push(idx);
        renderSelect();
      });
    });
    document.querySelectorAll(`.sel-info[data-side="${side}"]`).forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        showPokemonDetailModal(parties[side][parseInt(btn.dataset.idx)]);
      });
    });
  }
}

function renderSelectSide(side) {
  const label = side === 'a' ? '自分' : '相手';
  return `
    <div style="margin:6px 0">
      <div style="font-size:.8rem;font-weight:700;margin-bottom:4px">${label} (${selection[side].length}/3)</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${parties[side].map((p, i) => {
          const sel = selection[side].includes(i);
          const order = sel ? selection[side].indexOf(i) + 1 : '';
          return `<div class="sel-slot${sel ? ' sel-active' : ''}" data-side="${side}" data-idx="${i}" style="position:relative">
              <button class="sel-info" data-side="${side}" data-idx="${i}" title="詳細"
                style="position:absolute;top:1px;right:1px;width:18px;height:18px;padding:0;border-radius:50%;border:none;background:var(--bg3);color:var(--fg);font-size:.7rem;font-weight:700;line-height:1;cursor:pointer">i</button>
              ${spriteImg(p.name, 44)}
              <div style="font-size:.7rem;font-weight:700">${esc(ja('pokemon', p.name))}</div>
              ${sel ? `<div style="font-size:.65rem;color:var(--accent)">${order === 1 ? '先発' : order + '番手'}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>`;
}
