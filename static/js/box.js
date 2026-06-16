// Pokemon Champions Calculator - Box Page
import {
  DATA, ja, esc, spriteImg, typeBadge, showdownHTML,
} from './data.js';
import { atkState, currentTeam, makePokemonState, generateUid, markDirty } from './state.js';
import { DB } from './db.js';
import { selectPokemon, initCalcPage } from './calc.js';
import { switchPage, showToast, restoreStateToUI, buildMiniEditor, openEditorModal } from './ui.js';

export async function renderBoxPage() {
  const boxAll = await DB.getAll('box');
  const page = document.getElementById('page-box');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:4px;flex-wrap:wrap">
        <h3 style="flex:1;margin:0">BOX (${boxAll.length}匹)</h3>
        <button class="btn btn-sm" id="box-add-new" style="background:var(--accent2)">＋追加</button>
        <button class="btn btn-sm" id="box-export">エクスポート</button>
        <button class="btn btn-sm btn-outline" id="box-import">インポート</button>
        <input type="file" id="box-import-file" accept=".json" class="hidden">
      </div>
    </div>
    <div id="box-list">
      ${boxAll.length === 0 ? '<div class="card"><p style="text-align:center;color:var(--fg2)">BOXは空です。上の「＋追加」からポケモンを登録できます</p></div>' : ''}
      ${boxAll.map(b => renderBoxSlot(b)).join('')}
    </div>
  `;

  document.getElementById('box-add-new').addEventListener('click', () => openBoxEditor());
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
    entry.querySelector('.box-edit')?.addEventListener('click', e => {
      e.stopPropagation();
      const b = boxAll.find(x => x.id === id);
      if (b) openBoxEditor(b);
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
      markDirty('team');
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
          ${b.nickname ? `<div style="font-size:.95rem;font-weight:700;color:var(--accent);line-height:1.2">${esc(b.nickname)}</div>` : ''}
          ${b.uid ? `<div style="font-size:.55rem;color:var(--fg2);font-family:monospace">ID: ${esc(b.uid.slice(0,8))}</div>` : ''}
          ${showdownHTML(b)}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <button class="btn btn-sm box-to-calc" style="font-size:.6rem;padding:2px 6px">ダメ計</button>
          <button class="btn btn-sm btn-outline box-edit" style="font-size:.6rem;padding:2px 6px">編集</button>
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
                <span style="flex:1">${icon} ${esc(label)} ${esc(c.range)} <strong>${esc(c.ko)}</strong> ${esc(c.detail)}</span>
                <button class="btn btn-sm btn-danger calc-del" data-ci="${ci}" style="font-size:.55rem;padding:1px 4px">×</button>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      <div style="margin-top:4px">
        <label style="display:block;font-size:.65rem;color:var(--fg2);margin-bottom:2px">📝 メモ（調整意図・立ち回り・対面の判断など）</label>
        <textarea class="box-notes" data-id="${b.id}" rows="5" placeholder="例: HB特化で○○の△△確定耐え。先発から起点作り。○○には引く。" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:8px;font-size:.85rem;line-height:1.5;resize:vertical;min-height:5em">${esc(b.notes||'')}</textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:2px">
        <button class="btn btn-sm btn-danger box-del" style="font-size:.6rem;padding:2px 6px">削除</button>
      </div>
    </div>`;
}

// ===== BOX EDITOR MODAL (共通エディタ buildMiniEditor を使用) =====
function openBoxEditor(existingEntry) {
  const page = document.getElementById('page-box');
  const isEdit = !!existingEntry;
  const state = isEdit ? JSON.parse(JSON.stringify(existingEntry)) : makePokemonState();
  const { modal, inner } = openEditorModal('box-editor-modal', page);

  buildMiniEditor(inner, state, 'bed', {
    title: isEdit ? 'ポケモン編集' : 'BOXに追加',
    saveLabel: isEdit ? '保存' : 'BOXに追加',
    onSave: async (s) => {
      delete s._moveEntries;
      if (isEdit) {
        // 既存エントリ更新 (cloneにsavedCalcs/notes/idが含まれるのでput=更新)
        await DB.put('box', { ...s });
        showToast(`${ja('pokemon', s.name)} を更新`);
      } else {
        const entry = JSON.parse(JSON.stringify(s));
        delete entry.id;
        if (!entry.uid) entry.uid = generateUid();
        entry.savedCalcs = [];
        entry.notes = '';
        await DB.add('box', entry);
        showToast(`${ja('pokemon', s.name)} をBOXに追加`);
      }
      modal.remove();
      renderBoxPage();
    },
    onCancel: () => modal.remove(),
  });
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
    const stats = await DB.importAll(data);
    showToast(`インポート完了: ${stats.added}件追加${stats.skipped ? `, ${stats.skipped}件スキップ(重複)` : ''}`);
    renderBoxPage();
  } catch (err) {
    showToast('インポート失敗: ' + err.message);
  }
  e.target.value = '';
}
