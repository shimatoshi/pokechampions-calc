// State layer: app-wide mutable state + session persistence
// 依存なし（最下層）
export const pageDirty = { box: true, team: true, records: true };
export function markDirty(page) { pageDirty[page] = true; }

// currentTeam: calc/box/sim-setup/team が参照する「現在編集中のチーム」
export const currentTeam = { id: null, name: '新チーム', members: [], notes: '' };
export function setCurrentTeam(obj) {
  for (const k of Object.keys(currentTeam)) delete currentTeam[k];
  Object.assign(currentTeam, obj);
}

// ===== POKEMON STATE =====
export function generateUid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function makePokemonState() {
  return {
    uid: null,        // 個体ID: BOX登録時に発行、チーム・ダメ計で一貫参照
    name: '',
    natureMods: { plus: '', minus: '' },
    sp: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
    boosts: { at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
    item: '',
    ability: '',
    status: '',
    moves: ['', '', '', ''],
    currentHP: null,  // null = 満タン (実数値max)、それ以外は具体的なHP値
    disguiseIntact: false,  // ばけのかわ/Ice Face: 1発無効化が残っているか
    hpDist: null,  // 全乱数連鎖モード: 取りうるHP値の集合 (null=単一HPモード)
    chainHits: 0   // 連鎖累積回数 (表示用)
  };
}

export const atkState = makePokemonState();
export const defState = makePokemonState();
export const fieldState = { weather: '', terrain: '', doubles: false, crit: false, stealthRock: false, spikes: 0, pinch: false };

// ===== CALC SESSION PERSISTENCE =====
const SESSION_KEY = 'pokechamp_calc_session';
export function saveCalcSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ atk: atkState, def: defState, field: fieldState }));
  } catch (_) {}
}
let _saveTimer = null;
export function scheduleSessionSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveCalcSession, 500);
}
export function restoreCalcSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const { atk, def, field } = JSON.parse(raw);
    if (atk) Object.assign(atkState, atk);
    if (def) Object.assign(defState, def);
    if (field) Object.assign(fieldState, field);
  } catch (_) {}
}
