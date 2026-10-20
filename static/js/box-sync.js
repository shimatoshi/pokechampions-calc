// 編成 ⇔ BOX 同期 (team.js / sim-setup.js 共通)
import { DB } from './db.js';
import { generateUid, markDirty } from './state.js';

// 編成に入っているポケモンは必ずBOXにも存在する。構成(種族/性格/SP/特性/持ち物/技)が
// 完全一致するBOX個体があればそれを割り当て、1つでも違えば新しい個体としてBOXに追加する。
// 個体メモ(notes)はBOX個体に、パーティ内の役割メモ(roleNote)は編成メンバー側に独立して持つ。
const SP_KEYS = ['hp', 'at', 'df', 'sa', 'sd', 'sp'];
export function buildKey(m) {
  return JSON.stringify([
    m.name, m.item || '', m.ability || '',
    m.natureMods?.plus || '', m.natureMods?.minus || '',
    SP_KEYS.map(k => m.sp?.[k] || 0),
    (m.moves || []).filter(Boolean).sort(),
  ]);
}

export async function syncMembersToBox(members) {
  const boxAll = await DB.getAll('box');
  const byKey = new Map();
  for (const b of boxAll) { const k = buildKey(b); if (!byKey.has(k)) byKey.set(k, b); }
  let added = 0;
  for (const m of members) {
    if (!m.name) continue;
    const key = buildKey(m);
    // 同一構成のBOX個体が複数ある場合は、紐付け済みの個体(uid一致)を優先してメモを取り違えない
    const hit = (m.uid && boxAll.find(b => b.uid === m.uid && buildKey(b) === key)) || byKey.get(key);
    if (hit) {
      let dirty = false;
      if (!hit.uid) { hit.uid = generateUid(); dirty = true; }
      if (m.notes && !hit.notes) { hit.notes = m.notes; dirty = true; }
      if (dirty) await DB.put('box', hit);
      m.uid = hit.uid;
    } else {
      const entry = JSON.parse(JSON.stringify(m));
      delete entry.id; delete entry._moveEntries; delete entry.roleNote;
      entry.uid = generateUid();
      entry.savedCalcs = [];
      entry.notes = m.notes || '';
      await DB.add('box', entry);
      byKey.set(key, entry);
      m.uid = entry.uid;
      added++;
    }
    delete m.notes; delete m.savedCalcs; delete m.id;
  }
  if (added) markDirty('box');
  return { added };
}

// 編成で使用中のBOX個体か (使用中ならBOXから削除させない)
export async function teamsUsingUid(uid) {
  if (!uid) return [];
  return (await DB.getAll('teams')).filter(t => (t.members || []).some(m => m.uid === uid)).map(t => t.name);
}
