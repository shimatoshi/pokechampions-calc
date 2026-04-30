// Pokemon Champions Calculator - Records Page

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
      <strong style="margin-left:8px">${esc(r.opponent || '不明')}</strong>
      ${r.myTeam ? `<div style="font-size:.75rem;color:var(--fg2);margin-top:2px">自分: ${esc(r.myTeam)}</div>` : ''}
      ${r.oppTeam ? `<div style="font-size:.75rem;color:var(--fg2)">相手: ${esc(r.oppTeam)}</div>` : ''}
      ${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}
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
      <input type="text" id="re-opponent" value="${esc(r.opponent||'')}">
      <label>自分のチーム</label>
      <input type="text" id="re-myteam" value="${esc(r.myTeam||'')}" placeholder="ガブリアス, ミミッキュ...">
      <label>相手のチーム</label>
      <input type="text" id="re-oppteam" value="${esc(r.oppTeam||'')}" placeholder="ドラパルト, キョジオーン...">
      <label>メモ</label>
      <textarea id="re-notes" rows="3" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bg3);border-radius:4px;padding:6px;font-size:.85rem">${esc(r.notes||'')}</textarea>
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
