// Pokemon Champions Calculator - Records Page
import { esc, ja, spriteImg } from './data.js';
import { DB } from './db.js';

let filter = null; // { kind: 'my' | 'opp', name } | null

export function initRecordsPage() { renderRecordsPage(); }

const rate = (w, n) => n ? `${Math.round(w / n * 100)}%` : '-';

// 対戦シミュで蓄積した記録をチーム別に集計 (自分チーム別 / 相手チーム別の勝率)
function summarize(records, kind) {
  const key = kind === 'my' ? 'myTeamName' : 'oppTeamName';
  const map = new Map();
  for (const r of records) {
    if (r.source !== 'sim') continue;
    const name = r[key] || '(未保存のパーティ)';
    const e = map.get(name) || { name, n: 0, w: 0 };
    e.n++; if (r.result === 'win') e.w++;
    map.set(name, e);
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

// 個体別: 自分側は 持込/選出/先発 と選出時の勝率、相手側は 当たった回数 と自分の勝率
function individualStats(records) {
  const my = new Map(), opp = new Map();
  const get = (m, n) => { if (!m.has(n)) m.set(n, { name: n, party: 0, sel: 0, w: 0, lead: 0, leadW: 0 }); return m.get(n); };
  for (const r of records) {
    if (r.source !== 'sim') continue;
    const win = r.result === 'win';
    for (const n of new Set(r.myParty || [])) get(my, n).party++;
    (r.mySel || []).forEach((n, i) => {
      const e = get(my, n); e.sel++; if (win) e.w++;
      if (i === 0) { e.lead++; if (win) e.leadW++; }
    });
    for (const n of new Set(r.oppSel || [])) { const e = get(opp, n); e.sel++; if (win) e.w++; }
  }
  const sort = m => [...m.values()].filter(e => e.sel > 0).sort((a, b) => b.sel - a.sel);
  return { my: sort(my), opp: sort(opp) };
}

function renderIndividuals(records) {
  const { my, opp } = individualStats(records);
  if (!my.length && !opp.length) return '';
  const row = (e, extra) => `<div class="stat-row static">${spriteImg(e.name, 28)}<span class="stat-name">${esc(ja('pokemon', e.name))}</span>
      <span class="stat-n">${extra}</span><strong class="stat-rate">${rate(e.w, e.sel)}</strong></div>`;
  return `<details class="card"${filter ? ' open' : ''}>
    <summary>個体別の成績${filter ? ` <span class="section-state">${esc(filter.name)}で絞り込み中</span>` : ''}</summary>
    <div class="u-hint u-my4" style="margin-top:8px">自分の個体 (選出した試合の勝率 / 選出回数・先発回数 / 持ち込み中の選出率)</div>
    ${my.map(e => row(e, `${e.sel}回選出・先発${e.lead}・選出率${rate(e.sel, e.party)}`)).join('') || '<p class="empty-state">データなし</p>'}
    <div class="u-hint u-my4" style="margin-top:12px">相手の個体 (出てきた試合での自分の勝率。低いほど苦手)</div>
    ${[...opp].sort((a, b) => (a.w / a.sel) - (b.w / b.sel) || b.sel - a.sel).map(e => row(e, `${e.sel}戦 ${e.w}勝${e.sel - e.w}敗`)).join('') || '<p class="empty-state">データなし</p>'}
  </details>`;
}

function renderSummary(records) {
  const sim = records.filter(r => r.source === 'sim');
  if (!sim.length) return '';
  const wins = sim.filter(r => r.result === 'win').length;
  const rows = (kind, label) => {
    const list = summarize(records, kind);
    return `<div class="u-hint u-my4" style="margin-top:8px">${label}</div>` + list.map(e => {
      const on = filter && filter.kind === kind && filter.name === e.name;
      return `<button type="button" class="stat-row${on ? ' on' : ''}" data-kind="${kind}" data-name="${esc(e.name)}" aria-pressed="${on}">
        <span class="stat-name">${esc(e.name)}</span><span class="stat-n">${e.w}勝${e.n - e.w}敗</span><strong class="stat-rate">${rate(e.w, e.n)}</strong></button>`;
    }).join('');
  };
  return `<div class="card">
    <h3>対戦シミュの成績 <span class="section-state">${sim.length}戦 ${wins}勝 / 勝率${rate(wins, sim.length)}</span></h3>
    ${rows('my', '自分のチーム別')}${rows('opp', '相手チーム別')}
    ${filter ? `<button class="btn btn-sm btn-outline mt" id="record-filter-clear">絞り込みを解除 (${esc(filter.name)})</button>` : ''}
  </div>`;
}

export async function renderRecordsPage() {
  const records = await DB.getAll('records');
  records.sort((a, b) => (b.date || 0) - (a.date || 0));
  const shown = filter ? records.filter(r => (filter.kind === 'my' ? r.myTeamName : r.oppTeamName) === filter.name || (r.source === 'sim' && !(filter.kind === 'my' ? r.myTeamName : r.oppTeamName) && filter.name === '(未保存のパーティ)')) : records;
  const page = document.getElementById('page-records');
  page.innerHTML = `
    ${renderSummary(records)}
    ${renderIndividuals(shown)}
    <button class="btn mb u-w100" id="record-add">+ 対戦記録を追加</button>
    <div id="records-list">
      ${records.length === 0 ? '<p class="empty-state">対戦シミュで決着がつくと、ここに自動で記録されます</p>' : ''}
      ${shown.map(r => renderRecord(r)).join('')}
    </div>
    <div id="record-editor" class="hidden"></div>
  `;

  page.querySelectorAll('.stat-row').forEach(btn => btn.addEventListener('click', () => {
    const same = filter && filter.kind === btn.dataset.kind && filter.name === btn.dataset.name;
    filter = same ? null : { kind: btn.dataset.kind, name: btn.dataset.name };
    renderRecordsPage();
  }));
  document.getElementById('record-filter-clear')?.addEventListener('click', () => { filter = null; renderRecordsPage(); });
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
      ${r.source === 'sim' ? '<div class="u-hint">シミュ自動記録</div>' : ''}
      ${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}
      ${r.log ? `
      <details class="u-mt4">
        <summary style="font-size:.7rem;color:var(--fg2);cursor:pointer">バトルログ (${r.log.split('\n').length}行)</summary>
        <pre style="font-size:.72rem;line-height:1.5;white-space:pre-wrap;max-height:300px;overflow-y:auto;background:var(--bg);border-radius:4px;padding:6px;margin-top:4px">${esc(r.log)}</pre>
      </details>` : ''}
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
    // 既存レコードのフィールド(バトルログ等、この画面で編集しないもの)を保持する
    const record = {
      ...(existing || {}),
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
