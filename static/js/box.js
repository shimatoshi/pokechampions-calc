// Pokemon Champions Calculator - Box Page
import {
  DATA, ja, esc, spriteImg, typeBadge, showdownHTML,
} from './data.js';
import { atkState, currentTeam, makePokemonState, generateUid, markDirty } from './state.js';
import { DB } from './db.js';
import { DMG } from './damage.js';
import { selectPokemon, initCalcPage } from './calc.js';
import { switchPage, showToast, restoreStateToUI, buildMiniEditor, openEditorModal, showPokemonDetailModal } from './ui.js';

// 表示モード: 'list' | 'grid' (実際のゲームのボックス風 6列×5行)
const BOX_VIEW_KEY = 'pokechamp_box_view';

export async function renderBoxPage() {
  const boxAll = await DB.getAll('box');
  const view = localStorage.getItem(BOX_VIEW_KEY) || 'list';
  const page = document.getElementById('page-box');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:4px;flex-wrap:wrap">
        <h3 style="flex:1;margin:0">BOX (${boxAll.length}匹)</h3>
        <button class="btn btn-sm btn-outline" id="box-view-toggle">${view === 'grid' ? '📃 リスト' : '🗃 グリッド'}</button>
        <button class="btn btn-sm" id="box-add-new" style="background:var(--accent2)">＋追加</button>
        <button class="btn btn-sm" id="box-export">エクスポート</button>
        <button class="btn btn-sm btn-outline" id="box-import">インポート</button>
        <input type="file" id="box-import-file" accept=".json" class="hidden">
      </div>
      <div class="row" style="align-items:center;gap:4px;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:.65rem;color:var(--fg2);flex:1">🌐 みんなの共有データ</span>
        <button class="btn btn-sm" id="box-publish" style="background:var(--accent)">📤 サーバーへ公開</button>
        <button class="btn btn-sm btn-outline" id="box-fetch">📥 サーバーから取得</button>
      </div>
    </div>
    <div id="box-list">
      ${boxAll.length === 0 ? '<div class="card"><p style="text-align:center;color:var(--fg2)">BOXは空です。上の「＋追加」からポケモンを登録できます</p></div>' : ''}
      ${view === 'grid' ? renderBoxGrid(boxAll) : boxAll.map(b => renderBoxSlot(b)).join('')}
    </div>
  `;

  document.getElementById('box-view-toggle').addEventListener('click', () => {
    localStorage.setItem(BOX_VIEW_KEY, view === 'grid' ? 'list' : 'grid');
    renderBoxPage();
  });
  document.getElementById('box-add-new').addEventListener('click', () => openBoxEditor());
  document.getElementById('box-export').addEventListener('click', exportData);
  document.getElementById('box-import').addEventListener('click', () => document.getElementById('box-import-file').click());
  document.getElementById('box-import-file').addEventListener('change', importData);
  document.getElementById('box-publish').addEventListener('click', openPublishModal);
  document.getElementById('box-fetch').addEventListener('click', openServerBrowseModal);

  if (view === 'grid') {
    page.querySelectorAll('.box-grid-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const b = boxAll.find(x => x.id === parseInt(cell.dataset.id));
        if (!b) return;
        showPokemonDetailModal(b, null, [
          { label: '✏ 編集', handler: (p, close) => { close(); openBoxEditor(b); } },
          {
            label: '⚔ ダメ計へ',
            handler: (p, close) => {
              close();
              Object.assign(atkState, JSON.parse(JSON.stringify(b)));
              switchPage('calc');
              initCalcPage();
              selectPokemon('atk', atkState.name);
              restoreStateToUI('atk', atkState);
            },
          },
        ]);
      });
    });
    return; // グリッド表示ではリスト用の配線は不要
  }

  page.querySelectorAll('.box-entry').forEach(entry => {
    const id = parseInt(entry.dataset.id);
    entry.querySelector('.box-detail-toggle')?.addEventListener('click', e => {
      e.stopPropagation();
      const detail = entry.querySelector('.box-detail');
      detail?.classList.toggle('hidden');
    });
    // メガ前後の実数値切替タブ
    entry.querySelectorAll('.box-forme-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        e.stopPropagation();
        const b = boxAll.find(x => x.id === id);
        if (!b) return;
        const st = DMG.getStats({ ...b, name: tab.dataset.forme }) || {};
        const L = [['hp','H'],['at','A'],['df','B'],['sa','C'],['sd','D'],['sp','S']];
        const line = entry.querySelector('.box-forme-stats');
        if (line) line.innerHTML = L.map(([k, l]) => `<span style="white-space:nowrap"><span style="color:var(--fg2)">${l}</span>${st[k] ?? '-'}</span>`).join(' ');
        entry.querySelectorAll('.box-forme-tab').forEach(t => { t.style.background = 'var(--bg)'; t.style.color = 'var(--fg2)'; });
        tab.style.background = 'var(--accent2)';
        tab.style.color = '#fff';
      });
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

// ===== グリッド表示 (実ゲームのボックス風: 1ボックス=6列×5行=30匹) =====
function renderBoxGrid(boxAll) {
  if (boxAll.length === 0) return '';
  const chunks = [];
  for (let i = 0; i < boxAll.length; i += 30) chunks.push(boxAll.slice(i, i + 30));
  return chunks.map((chunk, ci) => `
    <div class="card" style="padding:6px">
      <div style="font-size:.75rem;font-weight:700;color:var(--fg2);margin-bottom:4px">ボックス ${ci + 1}</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px">
        ${chunk.map(b => `
          <div class="box-grid-cell" data-id="${b.id}" style="text-align:center;background:var(--bg);border:1px solid var(--bg3);border-radius:6px;padding:3px 1px;cursor:pointer">
            ${spriteImg(b.name, 40)}
            <div style="font-size:.5rem;color:var(--fg2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.nickname || ja('pokemon', b.name))}</div>
          </div>`).join('')}
        ${Array.from({ length: 30 - chunk.length }, () => '<div style="background:var(--bg);border:1px dashed var(--bg3);border-radius:6px;min-height:52px;opacity:.4"></div>').join('')}
      </div>
    </div>`).join('');
}

// 実数値行: メガ前後をタブで切替できる
function renderStatLine(b) {
  const data = DATA.pokemon[b.name];
  if (!data) return '';
  const formes = (data.formes || []).length > 1 ? data.formes : [b.name];
  const statsFor = name => DMG.getStats({ ...b, name }) || {};
  const STAT_LABELS = [['hp','H'],['at','A'],['df','B'],['sa','C'],['sd','D'],['sp','S']];
  const row = name => {
    const st = statsFor(name);
    return STAT_LABELS.map(([k, l]) => `<span style="white-space:nowrap"><span style="color:var(--fg2)">${l}</span>${st[k] ?? '-'}</span>`).join(' ');
  };
  if (formes.length === 1) {
    return `<div class="box-statline" style="font-size:.7rem;font-family:monospace;margin-top:2px">${row(b.name)}</div>`;
  }
  return `
    <div class="box-statline" style="margin-top:2px" data-id="${b.id}">
      <div style="display:flex;gap:2px;margin-bottom:1px">
        ${formes.map((f, i) => `<button class="box-forme-tab" data-forme="${esc(f)}" style="font-size:.55rem;padding:1px 6px;border-radius:3px;border:1px solid var(--bg3);background:${i === 0 ? 'var(--accent2)' : 'var(--bg)'};color:${i === 0 ? '#fff' : 'var(--fg2)'}">${esc(ja('pokemon', f))}</button>`).join('')}
      </div>
      <div class="box-forme-stats" style="font-size:.7rem;font-family:monospace">${row(formes[0])}</div>
    </div>`;
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
          ${renderStatLine(b)}
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

// ===== コミュニティ共有 (pixel5 backend / url-board の固定URLで解決) =====
// url-board が project-urls/urls.json を見て、現在の動的エンドポイント(Cloudflare Tunnel)へ誘導する。
// クライアントは固定の resolve URL だけ知っていればよい。
const RESOLVE_URL = 'https://url-board.vercel.app/api/resolve/pokechamp';
let _shareBase = null;
async function shareBase() {
  if (_shareBase) return _shareBase;
  const res = await fetch(RESOLVE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('サーバーURL解決に失敗 (' + res.status + ')');
  const j = await res.json();
  if (!j.url) throw new Error('サーバーが起動していません');
  _shareBase = j.url.replace(/\/+$/, '');
  return _shareBase;
}

// 投稿: タイトル/説明を入力 → exportAll() を {backend}/shares へ POST
function openPublishModal() {
  const page = document.getElementById('page-box');
  const { modal, inner } = openEditorModal('box-publish-modal', page);
  inner.innerHTML = `
    <div class="card" style="margin-top:20px">
      <h3 style="margin:0 0 8px">📤 サーバーへ公開</h3>
      <p style="font-size:.7rem;color:var(--fg2);margin:0 0 10px">
        現在のBOX・編成・脅威・記録をまとめて公開します。公開先は誰でも閲覧・取得できます。
      </p>
      <label style="display:block;font-size:.7rem;color:var(--fg2);margin-bottom:2px">タイトル（必須・80字まで）</label>
      <input id="pub-title" maxlength="80" placeholder="例: 〇〇杯 上位構築まとめ"
        style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:8px;font-size:.9rem;margin-bottom:8px">
      <label style="display:block;font-size:.7rem;color:var(--fg2);margin-bottom:2px">説明（任意）</label>
      <textarea id="pub-desc" maxlength="500" rows="3" placeholder="構築の狙いや出典など"
        style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:8px;font-size:.85rem;resize:vertical;margin-bottom:10px"></textarea>
      <div id="pub-summary" style="font-size:.7rem;color:var(--fg2);margin-bottom:10px"></div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button class="btn btn-sm btn-outline" id="pub-cancel">キャンセル</button>
        <button class="btn btn-sm" id="pub-go" style="background:var(--accent)">公開する</button>
      </div>
    </div>`;

  DB.exportAll().then(d => {
    const total = ['box','teams','threats','records'].reduce((n,s)=>n+((d[s]||[]).length),0);
    const el = inner.querySelector('#pub-summary');
    el.textContent = `公開内容: BOX ${d.box?.length||0} / 編成 ${d.teams?.length||0} / 脅威 ${d.threats?.length||0} / 記録 ${d.records?.length||0}（計${total}件）`;
  });

  inner.querySelector('#pub-cancel').addEventListener('click', () => modal.remove());
  inner.querySelector('#pub-go').addEventListener('click', async () => {
    const title = inner.querySelector('#pub-title').value.trim();
    const description = inner.querySelector('#pub-desc').value.trim();
    if (!title) { showToast('タイトルを入力してください'); return; }
    const data = await DB.exportAll();
    const total = ['box','teams','threats','records'].reduce((n,s)=>n+((data[s]||[]).length),0);
    if (total === 0) { showToast('公開できるデータがありません'); return; }
    const btn = inner.querySelector('#pub-go');
    btn.disabled = true; btn.textContent = '公開中...';
    try {
      const base = await shareBase();
      const res = await fetch(`${base}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, data }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        showToast('公開しました 🎉');
        modal.remove();
      } else {
        showToast('公開失敗: ' + (j.error || res.status));
        btn.disabled = false; btn.textContent = '公開する';
      }
    } catch (err) {
      showToast('公開失敗: ' + err.message);
      btn.disabled = false; btn.textContent = '公開する';
    }
  });
}

// 取得: {backend}/shares 一覧を取得して選択 → {backend}/shares/<id> を importAll()
async function openServerBrowseModal() {
  const page = document.getElementById('page-box');
  const { modal, inner } = openEditorModal('box-browse-modal', page);
  inner.innerHTML = `
    <div class="card" style="margin-top:20px">
      <div class="row" style="align-items:center;margin-bottom:8px">
        <h3 style="flex:1;margin:0">📥 サーバーから取得</h3>
        <button class="btn btn-sm btn-outline" id="brw-close">閉じる</button>
      </div>
      <div id="brw-list"><p style="text-align:center;color:var(--fg2)">読み込み中...</p></div>
    </div>`;
  inner.querySelector('#brw-close').addEventListener('click', () => modal.remove());
  const list = inner.querySelector('#brw-list');

  let items;
  try {
    const base = await shareBase();
    const res = await fetch(`${base}/shares`, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    items = await res.json();
  } catch (err) {
    list.innerHTML = `<p style="text-align:center;color:var(--danger,#e5484d)">取得失敗: ${esc(err.message)}</p>`;
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--fg2)">まだ公開データがありません</p>';
    return;
  }

  list.innerHTML = items.map((it, i) => {
    const date = (it.created_at || '').slice(0, 10);
    const c = it.counts || {};
    const summary = `BOX ${c.box||0} / 編成 ${c.teams||0} / 脅威 ${c.threats||0} / 記録 ${c.records||0}`;
    return `
      <div class="card" data-i="${i}" style="padding:8px;margin-bottom:6px">
        <div style="font-weight:700;font-size:.9rem">${esc(it.title || '(無題)')}</div>
        <div style="font-size:.65rem;color:var(--fg2);margin:2px 0">${esc(date)}　${esc(summary)}</div>
        ${it.description ? `<div style="font-size:.7rem;color:var(--fg2);white-space:pre-wrap;margin-bottom:4px">${esc(it.description)}</div>` : ''}
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-sm brw-import" data-i="${i}" style="font-size:.7rem">取り込む</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.brw-import').forEach(btn => {
    btn.addEventListener('click', async () => {
      const it = items[parseInt(btn.dataset.i)];
      btn.disabled = true; btn.textContent = '取込中...';
      try {
        const base = await shareBase();
        const res = await fetch(`${base}/shares/${it.id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        const stats = await DB.importAll(j.data || {});
        showToast(`取り込み完了: ${stats.added}件追加${stats.skipped ? `, ${stats.skipped}件スキップ(重複)` : ''}`);
        renderBoxPage();
      } catch (err) {
        showToast('取り込み失敗: ' + err.message);
        btn.disabled = false; btn.textContent = '取り込む';
      }
    });
  });
}
