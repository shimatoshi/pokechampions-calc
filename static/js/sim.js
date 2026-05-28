// Pokemon Champions - Battle Simulator (battle phase + state)
import {
  DATA, ja, esc, spriteImg, typeBadge, STAT_SHORT,
  showToast,
} from './app.js';
import { DMG } from './damage.js';
import {
  TWO_TURN_MOVES, SKIN_ABILITIES, applyBoost,
  getRecoilFrac as _getRecoilFrac, getDrainFrac as _getDrainFrac,
  getEffectiveMoveType as _getEffectiveMoveType,
} from './poke-data.js';

function getRecoilFrac(m) { return _getRecoilFrac(m, DATA.moves[m]); }
function getDrainFrac(m) { return _getDrainFrac(m, DATA.moves[m]); }
function getEffectiveMoveType(m, ability) { return _getEffectiveMoveType(m, DATA.moves[m], ability); }

// Mega evolution helpers
function getMegaFormes(poke) {
  const data = DATA.pokemon[poke.name];
  if (!data?.formes) return [];
  return data.formes.filter(f => (f.startsWith('Mega ') || f.includes('-Mega')) && f !== poke.name);
}
function getMegaForme(poke) {
  const megas = getMegaFormes(poke);
  return megas.length === 1 ? megas[0] : null; // single mega only; multi uses buttons
}
function isMega(name) { return name.startsWith('Mega ') || name.includes('-Mega'); }
function getPreMegaName(name) {
  // "Mega Gardevoir" → "Gardevoir", "Mega Charizard X" → "Charizard"
  if (name.startsWith('Mega ')) {
    const base = name.replace(/^Mega /, '').replace(/ [XY]$/, '');
    return base;
  }
  return null;
}

// Aegislash forme helpers
function isAegislash(name) { return name === 'Aegislash' || name === 'Aegislash-Shield' || name === 'Aegislash-Blade'; }
function getAegislashAlternateForme(name) {
  if (name === 'Aegislash' || name === 'Aegislash-Shield') return 'Aegislash-Blade';
  return 'Aegislash-Shield';
}

// Generic forme change: keep HP ratio, update stats
function applyFormeChange(side, selIdx, newName) {
  const oldPoke = parties[side][selection[side][selIdx]];
  const rt = battle.rt[side][selIdx];
  oldPoke.name = newName;
  // Update ability to new forme's first ability
  const newData = DATA.pokemon[newName];
  if (newData?.abilities?.length > 0) oldPoke.ability = newData.abilities[0];
  // Recalculate stats
  const newStats = DMG.getStats(oldPoke);
  if (newStats) {
    // HP stays same for mega (same HP base), but recalc for safety
    rt.maxHp = newStats.hp;
    rt.hp = Math.min(rt.hp, rt.maxHp); // cap if new max is lower
  }
}

// ===== SHARED STATE (exported for sim-setup.js) =====
export const parties = { a: [], b: [] };
export const selection = { a: [], b: [] };
export const field = { weather: '', terrain: '' };

// Battle state
let battle = null; // initialized on battle start
let _undoStack = []; // snapshots for undo
function makeBattleRuntime(poke) {
  const stats = DMG.getStats(poke);
  return {
    hp: stats?.hp || 1, maxHp: stats?.hp || 1,
    toxicCount: 0, leechSeed: false,
    boosts: { at:0, df:0, sa:0, sd:0, sp:0 },
    disguise: (poke.ability === 'Disguise' || poke.ability === 'Ice Face'),
    status: '',
    typeOverride: null,  // みずびたし等によるタイプ変更 (array or null)
    addedType: null,     // もりののろい/トリックオアトリートで追加されたタイプ
    charged: false,      // じゅうでん状態
    burnedUp: false,     // もえつきるでほのおタイプ消滅
  };
}

// ===== UNDO: snapshot / restore =====
function snapshotBattle() {
  // Deep-clone battle state + parties (forme changes mutate parties)
  const snap = {
    battle: {
      active: { ...battle.active },
      rt: { a: battle.rt.a.map(r => ({ ...r, boosts: { ...r.boosts } })),
             b: battle.rt.b.map(r => ({ ...r, boosts: { ...r.boosts } })) },
      log: battle.log.slice(),
      turnNum: battle.turnNum,
      actions: { a: battle.actions.a ? { ...battle.actions.a } : null,
                 b: battle.actions.b ? { ...battle.actions.b } : null },
      megaUsed: { ...battle.megaUsed },
      rollMode: { ...battle.rollMode },
      crit: { ...battle.crit },
    },
    parties: {
      a: parties.a.map(p => JSON.parse(JSON.stringify(p))),
      b: parties.b.map(p => JSON.parse(JSON.stringify(p))),
    },
  };
  _undoStack.push(snap);
  if (_undoStack.length > 30) _undoStack.shift(); // cap memory
}
function undoBattle() {
  if (_undoStack.length === 0) { showToast('これ以上戻せません'); return; }
  const snap = _undoStack.pop();
  battle.active = snap.battle.active;
  battle.rt = snap.battle.rt;
  battle.log = snap.battle.log;
  battle.turnNum = snap.battle.turnNum;
  battle.actions = snap.battle.actions;
  battle.megaUsed = snap.battle.megaUsed;
  battle.rollMode = snap.battle.rollMode;
  battle.crit = snap.battle.crit;
  // Restore parties (forme changes are written directly to parties)
  for (const s of ['a','b']) {
    parties[s].length = 0;
    snap.parties[s].forEach(p => parties[s].push(p));
  }
  _logRendered = 0; // force full log rebuild
  renderBattle();
  showToast('1手戻しました');
}

// ===== ENTRY =====
// renderSetup is in sim-setup.js (import here creates circular dep, so use lazy import)
export function initSimPage() {
  import('./sim-setup.js').then(m => m.renderSetup());
}

// Setup/Editor/Selection phases are in sim-setup.js


// ============================================================
// PHASE 3: BATTLE
// ============================================================
export function startBattle() {
  if (selection.a.length === 0 || selection.b.length === 0) {
    showToast('両方1匹以上選出してください');
    return;
  }
  battle = {
    active: { a: 0, b: 0 }, // index into selection arrays
    rt: { a: [], b: [] },    // runtime per selected pokemon
    log: [],
    turnNum: 0,
    actions: { a: null, b: null }, // {type:'move',move:''} or {type:'switch',to:idx}
    megaUsed: { a: false, b: false }, // 1回限り
    rollMode: { a: 'avg', b: 'avg' }, // 'avg' | 'min' | 'max'
    crit: { a: false, b: false },
  };
  for (const s of ['a','b']) {
    battle.rt[s] = selection[s].map(pi => makeBattleRuntime(parties[s][pi]));
  }
  battle.log.push({ text: 'バトル開始！', isHeader: true });
  _undoStack = [];
  renderBattle();
}

function getActive(side) {
  return parties[side][selection[side][battle.active[side]]];
}
function getActiveRt(side) {
  return battle.rt[side][battle.active[side]];
}

function renderBattle() {
  const page = document.getElementById('page-sim');
  page.innerHTML = `
    <div class="sim-sides" style="margin-bottom:6px">
      ${renderBattleSide('a')}
      ${renderBattleSide('b')}
    </div>
    ${renderBench('a')}
    ${renderBench('b')}
    <div class="card" style="margin-top:6px">
      <div class="col2">
        <div><label>自分 状態異常</label><select id="sim-st-a" style="font-size:.75rem">
          <option value="">なし</option><option value="brn">やけど</option><option value="psn">どく</option><option value="tox">もうどく</option><option value="par">まひ</option>
        </select></div>
        <div><label>相手 状態異常</label><select id="sim-st-b" style="font-size:.75rem">
          <option value="">なし</option><option value="brn">やけど</option><option value="psn">どく</option><option value="tox">もうどく</option><option value="par">まひ</option>
        </select></div>
      </div>
      <div class="col2" style="margin-top:4px">
        <label><input type="checkbox" id="sim-ls-a"> 自分にやどりぎ</label>
        <label><input type="checkbox" id="sim-ls-b"> 相手にやどりぎ</label>
      </div>
      <div class="col2" style="margin-top:4px">
        ${renderBoostUI('a')}
        ${renderBoostUI('b')}
      </div>
    </div>
    ${renderPartyOverview()}
    <div class="sim-actions">
      <button class="btn btn-sm" id="sim-exec" style="background:var(--accent);flex:2">ターン実行</button>
      <button class="btn btn-sm btn-outline" id="sim-eot">EOT処理</button>
      <button class="btn btn-sm btn-outline" id="sim-undo" ${_undoStack.length === 0 ? 'disabled' : ''} style="color:var(--accent2);border-color:var(--accent2)">↩ 戻す</button>
      <button class="btn btn-sm btn-danger" id="sim-end">終了</button>
    </div>
    <div class="sim-turn-log" id="sim-log">
      <h3>ターン履歴</h3>
      ${renderLog()}
    </div>
  `;

  // Wire events
  for (const s of ['a','b']) {
    const rt = getActiveRt(s);
    document.getElementById(`sim-st-${s}`).value = rt.status;
    document.getElementById(`sim-st-${s}`).addEventListener('change', e => { rt.status = e.target.value; if (e.target.value === 'tox') rt.toxicCount = 0; });
    document.getElementById(`sim-ls-${s}`).checked = rt.leechSeed;
    document.getElementById(`sim-ls-${s}`).addEventListener('change', e => { rt.leechSeed = e.target.checked; });
    for (const stat of ['at','df','sa','sd','sp']) {
      const el = document.getElementById(`sim-bst-${s}-${stat}`);
      if (el) { el.value = rt.boosts[stat]; el.addEventListener('change', e => { rt.boosts[stat] = parseInt(e.target.value); }); }
    }
  }

  // HP adjust
  for (const s of ['a','b']) {
    const rt = getActiveRt(s);
    document.querySelectorAll(`.sim-hp-adj[data-side="${s}"]`).forEach(btn => {
      btn.addEventListener('click', () => {
        const frac = parseFloat(btn.dataset.frac);
        const delta = Math.floor(rt.maxHp * Math.abs(frac)) * Math.sign(frac);
        rt.hp = Math.max(0, Math.min(rt.maxHp, rt.hp + delta));
        addLog(`${s === 'a' ? '自分' : '相手'}: HP${delta >= 0 ? '+' : ''}${delta} → ${rt.hp}/${rt.maxHp}`);
        updateBattleLight();
      });
    });
    document.getElementById(`sim-hp-set-${s}`)?.addEventListener('click', () => {
      const v = parseInt(document.getElementById(`sim-hp-input-${s}`).value);
      if (!isNaN(v)) { rt.hp = Math.max(0, Math.min(rt.maxHp, v)); updateBattleLight(); }
    });
  }

  // Move/switch selection
  for (const s of ['a','b']) {
    document.querySelectorAll(`.sim-act-btn[data-side="${s}"]`).forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`.sim-act-btn[data-side="${s}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (btn.dataset.type === 'move') {
          battle.actions[s] = { type: 'move', move: btn.dataset.move };
        } else if (btn.dataset.type === 'switch') {
          battle.actions[s] = { type: 'switch', to: parseInt(btn.dataset.to) };
        } else {
          battle.actions[s] = null;
        }
      });
    });
  }

  // Crit / roll mode
  document.querySelectorAll('.sim-crit').forEach(el => {
    el.addEventListener('change', () => { battle.crit[el.dataset.side] = el.checked; });
  });
  document.querySelectorAll('.sim-roll').forEach(el => {
    el.addEventListener('change', () => { battle.rollMode[el.dataset.side] = el.value; });
  });

  // Mega evolution buttons
  document.querySelectorAll('.sim-mega-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.side;
      const targetForme = btn.dataset.forme;
      if (!targetForme || battle.megaUsed[s]) return;
      snapshotBattle();
      const poke = getActive(s);
      applyFormeChange(s, battle.active[s], targetForme);
      battle.megaUsed[s] = true;
      const newAbil = ja('abilities', getActive(s).ability) || getActive(s).ability;
      addLog(`${s === 'a' ? '自分' : '相手'}の${ja('pokemon', poke.name)}がメガシンカ！ → ${ja('pokemon', targetForme)} (${newAbil})`);
      renderBattle();
    });
  });

  // Aegislash forme change buttons
  document.querySelectorAll('.sim-aegis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.side;
      snapshotBattle();
      const poke = getActive(s);
      const altForme = getAegislashAlternateForme(poke.name);
      applyFormeChange(s, battle.active[s], altForme);
      const formeLabel = altForme.includes('Blade') ? 'ブレードフォルム' : 'シールドフォルム';
      addLog(`${s === 'a' ? '自分' : '相手'}のギルガルド → ${formeLabel}！`);
      renderBattle();
    });
  });

  document.getElementById('sim-exec').addEventListener('click', executeTurn);
  document.getElementById('sim-eot').addEventListener('click', executeEndOfTurn);
  document.getElementById('sim-undo').addEventListener('click', undoBattle);
  document.getElementById('sim-end').addEventListener('click', () => import('./sim-setup.js').then(m => m.renderSetup()));
}

function renderBattleSide(side) {
  const poke = getActive(side);
  const rt = getActiveRt(side);
  const label = side === 'a' ? '自分' : '相手';
  const pct = rt.maxHp > 0 ? (rt.hp / rt.maxHp * 100) : 0;
  const hpClass = pct > 50 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';
  const stats = DMG.getStats(poke);
  const moves = poke.moves.filter(m => m && DATA.moves[m]);

  // Mega evolution / Aegislash buttons
  const megaForme = getMegaForme(poke);
  const canMega = megaForme && !isMega(poke.name) && !battle.megaUsed[side];
  const isAegi = isAegislash(poke.name);
  const abilityJa = poke.ability ? (ja('abilities', poke.ability) || poke.ability) : '';

  return `
    <div class="sim-side">
      <div class="sim-poke-header">
        ${spriteImg(poke.name, 40)}
        <div>
          <div style="font-weight:700;font-size:.85rem">${esc(ja('pokemon', poke.name))}</div>
          <div>${DATA.pokemon[poke.name]?.types.map(t => typeBadge(t)).join(' ') || ''}</div>
          <div style="font-size:.6rem;color:var(--fg2)">${esc(abilityJa)}</div>
        </div>
      </div>
      ${canMega ? `<button class="btn btn-sm sim-mega-btn" data-side="${side}" data-forme="${esc(megaForme)}">メガシンカ → ${esc(ja('pokemon', megaForme))}</button>` : ''}
      ${!canMega && !isMega(poke.name) && !battle.megaUsed[side] && getMegaFormes(poke).length > 1 ? getMegaFormes(poke).map(mf => `<button class="btn btn-sm sim-mega-btn" data-side="${side}" data-forme="${esc(mf)}">メガシンカ → ${esc(ja('pokemon', mf))}</button>`).join('') : ''}
      ${isAegi ? `<button class="btn btn-sm sim-aegis-btn" data-side="${side}">${poke.name.includes('Blade') ? 'シールドフォルムへ' : 'ブレードフォルムへ'}</button>` : ''}
      <div class="sim-hp-bar"><div class="sim-hp-fill ${hpClass}" id="sim-hpbar-${side}" style="width:${pct}%"></div></div>
      <div class="sim-hp-text" id="sim-hptext-${side}">${rt.hp} / ${rt.maxHp}</div>
      ${stats ? `<div style="font-size:.65rem;color:var(--fg2);text-align:center">S:${stats.sp} ${poke.item ? '@ ' + esc(ja('items', poke.item)) : ''}</div>` : ''}
      ${rt.disguise ? `<div style="font-size:.7rem;text-align:center;color:var(--accent2);font-weight:700">${poke.ability === 'Disguise' ? 'ばけのかわ' : 'こおりのすがた'} 生存</div>` : ''}
      <div class="sim-hp-btns">
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/16}">+1/16</button>
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/8}">+1/8</button>
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/4}">+1/4</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/16}">-1/16</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/8}">-1/8</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/4}">-1/4</button>
      </div>
      <div class="sim-custom-hp">
        <input type="number" id="sim-hp-input-${side}" placeholder="HP" min="0" max="${rt.maxHp}">
        <button class="btn btn-sm btn-outline" id="sim-hp-set-${side}" style="font-size:.7rem;padding:2px 6px">設定</button>
      </div>
      <div class="sim-move-sel">
        <div style="font-size:.7rem;color:var(--fg2);margin-bottom:2px">${label}の行動:</div>
        ${moves.map(m => {
          const move = DATA.moves[m];
          const sel = battle.actions[side]?.type === 'move' && battle.actions[side]?.move === m;
          const effType = getEffectiveMoveType(m, poke.ability);
          const skinChanged = effType !== move.type;
          const twoTurn = TWO_TURN_MOVES.has(m);
          return `<button class="sim-act-btn sim-move-btn${sel ? ' selected' : ''}" data-side="${side}" data-type="move" data-move="${esc(m)}">
            ${skinChanged ? typeBadge(effType) : typeBadge(move.type)} ${esc(ja('moves', m))} <span style="color:var(--fg2);font-size:.65rem">威力${move.bp || '-'}</span>
            ${skinChanged ? `<span style="font-size:.55rem;color:var(--accent2)">スキン</span>` : ''}
            ${twoTurn ? `<span style="font-size:.55rem;color:var(--fg2)">2T</span>` : ''}
            ${getRecoilFrac(m) ? '<span style="color:var(--danger);font-size:.6rem">反動</span>' : ''}
            ${getDrainFrac(m) ? '<span style="color:var(--ok);font-size:.6rem">吸収</span>' : ''}
          </button>`;
        }).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:.7rem">
        <label style="display:flex;align-items:center;gap:2px;white-space:nowrap"><input type="checkbox" class="sim-crit" data-side="${side}" ${battle.crit[side] ? 'checked' : ''}> 急所</label>
        <select class="sim-roll" data-side="${side}" style="font-size:.7rem;padding:1px 2px;flex:1">
          <option value="avg"${battle.rollMode[side]==='avg' ? ' selected' : ''}>通常(平均)</option>
          <option value="min"${battle.rollMode[side]==='min' ? ' selected' : ''}>低乱数</option>
          <option value="max"${battle.rollMode[side]==='max' ? ' selected' : ''}>高乱数</option>
        </select>
      </div>
    </div>`;
}

function renderBench(side) {
  const label = side === 'a' ? '自分' : '相手';
  const benched = selection[side]
    .map((pi, i) => ({ pi, i, poke: parties[side][pi], rt: battle.rt[side][i] }))
    .filter(x => x.i !== battle.active[side]);
  if (benched.length === 0) return '';

  return `
    <div style="font-size:.7rem;color:var(--fg2);margin:2px 0">${label}の控え:</div>
    <div style="display:flex;gap:4px;margin-bottom:4px;flex-wrap:wrap">
      ${benched.map(({ poke, rt, i }) => {
        const alive = rt.hp > 0;
        const sel = battle.actions[side]?.type === 'switch' && battle.actions[side]?.to === i;
        return `
          <button class="sim-act-btn btn btn-sm ${sel ? '' : 'btn-outline'}" data-side="${side}" data-type="switch" data-to="${i}"
            style="display:flex;align-items:center;gap:3px;${!alive ? 'opacity:.4;pointer-events:none' : ''};${sel ? 'background:var(--accent2)' : ''}" ${!alive ? 'disabled' : ''}>
            ${spriteImg(poke.name, 22)}
            <span style="font-size:.7rem">${esc(ja('pokemon', poke.name))}</span>
            <span class="sim-bench-hp" data-side="${side}" data-idx="${i}" style="font-size:.6rem;color:var(--fg2)">${rt.hp}/${rt.maxHp}</span>
          </button>`;
      }).join('')}
    </div>`;
}

function renderPartyOverview() {
  const renderSide = (side) => {
    const label = side === 'a' ? '自分' : '相手';
    const selSet = new Set(selection[side]);
    return `
      <div>
        <div style="font-size:.7rem;font-weight:700;margin-bottom:2px">${label}のパーティ</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          ${parties[side].map((p, i) => {
            const inSel = selSet.has(i);
            const selIdx = selection[side].indexOf(i);
            const rt = selIdx >= 0 ? battle.rt[side][selIdx] : null;
            const isActive = selIdx >= 0 && selIdx === battle.active[side];
            const alive = rt ? rt.hp > 0 : true;
            const hpText = rt ? `${rt.hp}/${rt.maxHp}` : '';
            const pct = rt && rt.maxHp > 0 ? (rt.hp / rt.maxHp * 100) : 100;
            const hpColor = pct > 50 ? 'var(--ok)' : pct > 25 ? 'var(--warn)' : 'var(--danger)';
            return `<div style="text-align:center;padding:3px 4px;border-radius:4px;min-width:48px;
              border:2px solid ${isActive ? 'var(--accent)' : inSel ? 'var(--accent2)' : 'var(--bg3)'};
              background:${isActive ? 'rgba(233,69,96,.1)' : 'var(--bg)'};
              ${!alive ? 'opacity:.4' : ''}">
              ${spriteImg(p.name, 28)}
              <div style="font-size:.6rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52px">${esc(ja('pokemon', p.name))}</div>
              ${rt ? `<div style="height:3px;background:var(--bg3);border-radius:2px;margin-top:1px"><div style="width:${pct}%;height:100%;background:${hpColor};border-radius:2px"></div></div>
              <div style="font-size:.5rem;color:var(--fg2)">${hpText}</div>` : `<div style="font-size:.5rem;color:var(--fg2)">未選出</div>`}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  };
  return `<div class="card" style="margin-top:6px;padding:6px">
    <div class="col2">${renderSide('a')}${renderSide('b')}</div>
  </div>`;
}

function renderBoostUI(side) {
  const rt = getActiveRt(side);
  const label = side === 'a' ? '自分' : '相手';
  return `<div>
    <label style="font-size:.65rem">${label}ランク</label>
    <div style="display:flex;gap:2px;flex-wrap:wrap">
      ${['at','df','sa','sd','sp'].map(stat => `
        <div style="display:flex;align-items:center;gap:1px">
          <span style="font-size:.55rem;color:var(--fg2)">${STAT_SHORT[stat]}</span>
          <select id="sim-bst-${side}-${stat}" style="width:40px;font-size:.65rem;padding:0">
            ${[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].map(v => `<option value="${v}"${v===(rt.boosts[stat]||0)?' selected':''}>${v>=0?'+':''}${v}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
  </div>`;
}

// ===== TURN EXECUTION =====
function executeTurn() {
  const actA = battle.actions.a;
  const actB = battle.actions.b;
  if (!actA && !actB) { showToast('行動を選択してください'); return; }
  snapshotBattle();

  battle.turnNum++;
  addLog(`--- ターン ${battle.turnNum} ---`, true);

  // Switches always go first
  for (const s of ['a','b']) {
    const act = s === 'a' ? actA : actB;
    if (act?.type === 'switch') doSwitch(s, act.to);
  }

  // Then attacks by speed
  const attackers = [];
  if (actA?.type === 'move' && actA.move) attackers.push({ side: 'a', move: actA.move });
  if (actB?.type === 'move' && actB.move) attackers.push({ side: 'b', move: actB.move });

  if (attackers.length === 2) {
    // Sort by priority then speed
    const prioA = DATA.moves[attackers[0].move]?.priority ? 1 : 0;
    const prioB = DATA.moves[attackers[1].move]?.priority ? 1 : 0;
    if (prioA !== prioB) {
      attackers.sort((a, b) => (DATA.moves[b.move]?.priority ? 1 : 0) - (DATA.moves[a.move]?.priority ? 1 : 0));
    } else {
      const spdA = getEffectiveSpeed('a');
      const spdB = getEffectiveSpeed('b');
      if (spdB > spdA) attackers.reverse();
    }
  }

  for (let i = 0; i < attackers.length; i++) {
    const { side, move } = attackers[i];
    const opp = side === 'a' ? 'b' : 'a';
    if (getActiveRt(side).hp <= 0) continue;
    if (getActiveRt(opp).hp <= 0) continue;
    executeAttack(side, opp, move);
  }

  // Check KO
  for (const s of ['a','b']) {
    if (getActiveRt(s).hp <= 0) {
      addLog(`${s === 'a' ? '自分' : '相手'}の${ja('pokemon', getActive(s).name)}はたおれた！`, false, 'ko-line');
    }
  }

  // Keep move actions for next turn, clear switch actions
  battle.actions.a = actA?.type === 'move' ? actA : null;
  battle.actions.b = actB?.type === 'move' ? actB : null;
  const switched = actA?.type === 'switch' || actB?.type === 'switch';
  if (switched) renderBattle();
  else updateBattleLight();
}

function getEffectiveSpeed(side) {
  const poke = getActive(side);
  const rt = getActiveRt(side);
  const stats = DMG.getStats(poke);
  let spd = stats?.sp || 0;
  spd = applyBoost(spd, rt.boosts.sp);
  if (rt.status === 'par') spd = Math.floor(spd / 2);
  return spd;
}


function doSwitch(side, toIdx) {
  const label = side === 'a' ? '自分' : '相手';
  const oldPoke = getActive(side);
  const oldRt = getActiveRt(side);
  // Reset volatile status on switch out
  oldRt.leechSeed = false;
  oldRt.boosts = { at:0, df:0, sa:0, sd:0, sp:0 };
  oldRt.toxicCount = 0;
  oldRt.typeOverride = null;
  oldRt.addedType = null;
  oldRt.charged = false;
  oldRt.burnedUp = false;

  battle.active[side] = toIdx;
  const newPoke = getActive(side);
  addLog(`${label}: ${ja('pokemon', oldPoke.name)} → ${ja('pokemon', newPoke.name)} に交代！`);
}

function executeAttack(atkSide, defSide, moveName) {
  const atkLabel = atkSide === 'a' ? '自分' : '相手';
  const defLabel = defSide === 'a' ? '自分' : '相手';
  const move = DATA.moves[moveName];
  if (!move) return;

  // Aegislash auto forme change
  const atkPokePre = getActive(atkSide);
  if (isAegislash(atkPokePre.name)) {
    if (move.bp && move.bp > 0 && !atkPokePre.name.includes('Blade')) {
      applyFormeChange(atkSide, battle.active[atkSide], 'Aegislash-Blade');
      addLog(`  ${atkLabel}のギルガルド → ブレードフォルム！`);
    } else if ((!move.bp || move.bp === 0) && !atkPokePre.name.includes('Shield') && atkPokePre.name !== 'Aegislash') {
      applyFormeChange(atkSide, battle.active[atkSide], 'Aegislash-Shield');
      addLog(`  ${atkLabel}のギルガルド → シールドフォルム！`);
    }
  }

  if (!move.bp || move.bp === 0) {
    const defRt0 = getActiveRt(defSide);
    const atkRt0 = getActiveRt(atkSide);
    // みずびたし: 相手のタイプをみずに変更
    if (moveName === 'Soak') {
      defRt0.typeOverride = ['Water'];
      addLog(`${atkLabel}の${ja('moves', moveName)}！ → ${defLabel}はみずタイプになった！`);
    // もりののろい: 相手にくさタイプを追加
    } else if (moveName === "Forest's Curse") {
      defRt0.addedType = 'Grass';
      addLog(`${atkLabel}の${ja('moves', moveName)}！ → ${defLabel}にくさタイプが追加された！`);
    // トリックオアトリート: 相手にゴーストタイプを追加
    } else if (moveName === 'Trick-or-Treat') {
      defRt0.addedType = 'Ghost';
      addLog(`${atkLabel}の${ja('moves', moveName)}！ → ${defLabel}にゴーストタイプが追加された！`);
    // じゅうでん: 次の電気技の威力2倍
    } else if (moveName === 'Charge') {
      atkRt0.charged = true;
      addLog(`${atkLabel}の${ja('moves', moveName)}！ → じゅうでん状態になった！`);
    } else {
      addLog(`${atkLabel}の${ja('moves', moveName)}！`);
    }
    return;
  }

  const atkPoke = getActive(atkSide);
  const defPoke = getActive(defSide);
  const atkRt = getActiveRt(atkSide);
  const defRt = getActiveRt(defSide);

  // Build effective types from runtime overrides
  const atkTypes = getEffectiveTypes(atkSide, battle.active[atkSide]);
  const defTypes = getEffectiveTypes(defSide, battle.active[defSide]);
  const atkState = { ...atkPoke, boosts: { ...atkRt.boosts }, currentHP: atkRt.hp, status: atkRt.status, _types: atkTypes };
  const defState = { ...defPoke, boosts: { ...defRt.boosts }, currentHP: defRt.hp, status: defRt.status, disguiseIntact: defRt.disguise, _types: defTypes };

  // Crit + fainted count + charge
  const isCrit = battle.crit[atkSide];
  const faintedCount = battle.rt[atkSide].filter(r => r.hp <= 0).length;
  const calcField = { ...field, ...(isCrit && { crit: true }), ...(faintedCount > 0 && { faintedCount }), ...(atkRt.charged && { charged: true }) };
  const result = DMG.calculate(atkState, defState, moveName, calcField);
  if (!result) { addLog(`${atkLabel}の${ja('moves', moveName)}！ (計算不可)`); return; }

  if (result.typeEff === 0) { addLog(`${atkLabel}の${ja('moves', moveName)}！ → 効果なし`); return; }

  // Disguise
  if (result.disguiseConsumed) {
    const abilName = defPoke.ability === 'Disguise' ? 'ばけのかわ' : 'こおりのすがた';
    const subDmg = result.minDmg;
    defRt.hp = Math.max(0, defRt.hp - subDmg);
    defRt.disguise = false;
    addLog(`${atkLabel}の${ja('moves', moveName)}！ → ${defLabel}の${abilName}がはがれた！ (${subDmg}ダメージ)`, false, 'dmg-line');
    addLog(`  ${defLabel}: HP ${defRt.hp}/${defRt.maxHp}`);
    return;
  }

  // Roll mode: min / avg / max
  const rollMode = battle.rollMode[atkSide];
  const useDmg = rollMode === 'min' ? result.minDmg : rollMode === 'max' ? result.maxDmg : Math.round((result.minDmg + result.maxDmg) / 2);
  const actualDmg = Math.min(useDmg, defRt.hp);
  defRt.hp = Math.max(0, defRt.hp - useDmg);

  let effText = '';
  if (result.typeEff > 1) effText = ' (効果ばつぐん)';
  else if (result.typeEff < 1) effText = ' (いまひとつ)';
  const rollLabel = isCrit ? ' 急所!' : '';
  const rollNote = rollMode === 'min' ? ' [低乱数]' : rollMode === 'max' ? ' [高乱数]' : '';
  addLog(`${atkLabel}の${ja('moves', moveName)}！${rollLabel} → ${defLabel}に${useDmg}ダメージ (${result.minDmg}〜${result.maxDmg}, ${result.minPct}%〜${result.maxPct}%)${effText}${rollNote}`, false, 'dmg-line');

  // Recoil
  const recoilFrac = getRecoilFrac(moveName);
  if (recoilFrac > 0) {
    const recoilDmg = Math.floor(actualDmg * recoilFrac);
    if (recoilDmg > 0) { atkRt.hp = Math.max(0, atkRt.hp - recoilDmg); addLog(`  ${atkLabel}: 反動${recoilDmg} → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'dmg-line'); }
  }
  // Life Orb
  if (atkPoke.item === 'Life Orb') {
    const loDmg = Math.floor(atkRt.maxHp / 10);
    atkRt.hp = Math.max(0, atkRt.hp - loDmg);
    addLog(`  ${atkLabel}: LO反動${loDmg} → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'dmg-line');
  }
  // Drain
  const drainFrac = getDrainFrac(moveName);
  if (drainFrac > 0) {
    const heal = Math.floor(actualDmg * drainFrac);
    if (heal > 0) { atkRt.hp = Math.min(atkRt.maxHp, atkRt.hp + heal); addLog(`  ${atkLabel}: ${heal}回復 → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'heal-line'); }
  }
  // Contact damage
  if (move.contact) {
    if (defPoke.ability === 'Rough Skin' || defPoke.ability === 'Iron Barbs') {
      const d = Math.floor(atkRt.maxHp / 8);
      atkRt.hp = Math.max(0, atkRt.hp - d);
      addLog(`  ${atkLabel}: ${ja('abilities', defPoke.ability)}で${d}ダメージ → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'dmg-line');
    }
    if (defPoke.item === 'Rocky Helmet') {
      const d = Math.floor(atkRt.maxHp / 6);
      atkRt.hp = Math.max(0, atkRt.hp - d);
      addLog(`  ${atkLabel}: ゴツメ${d}ダメージ → HP ${atkRt.hp}/${atkRt.maxHp}`, false, 'dmg-line');
    }
  }
  addLog(`  ${defLabel}: HP ${defRt.hp}/${defRt.maxHp}`);

  // Post-attack effects
  // もえつきる: Fire type removed after use
  if (moveName === 'Burn Up') {
    atkRt.burnedUp = true;
    addLog(`  ${atkLabel}: ほのおタイプが消滅した！`);
  }
  // じゅうでん消費
  if (atkRt.charged && move.type === 'Electric') {
    atkRt.charged = false;
    addLog(`  ${atkLabel}: じゅうでんが消費された`);
  }
}

// Get effective types considering runtime overrides
function getEffectiveTypes(side, selIdx) {
  const poke = parties[side][selection[side][selIdx]];
  const rt = battle.rt[side][selIdx];
  const baseTypes = DATA.pokemon[poke.name]?.types || [];
  // みずびたし等: complete override
  let types = rt.typeOverride ? [...rt.typeOverride] : [...baseTypes];
  // もえつきる: remove Fire
  if (rt.burnedUp) types = types.filter(t => t !== 'Fire');
  // もりののろい / トリックオアトリート: add type
  if (rt.addedType && !types.includes(rt.addedType)) types.push(rt.addedType);
  return types;
}

// ===== END OF TURN =====
function executeEndOfTurn() {
  snapshotBattle();
  addLog(`--- EOT ---`, true);
  for (const s of ['a','b']) {
    const poke = getActive(s);
    const rt = getActiveRt(s);
    const opp = s === 'a' ? 'b' : 'a';
    const oppRt = getActiveRt(opp);
    const label = s === 'a' ? '自分' : '相手';
    if (rt.hp <= 0) continue;
    const types = DATA.pokemon[poke.name]?.types || [];

    // Weather
    if (field.weather === 'Sand' && !types.includes('Rock') && !types.includes('Ground') && !types.includes('Steel')) {
      const d = Math.floor(rt.maxHp / 16); rt.hp = Math.max(0, rt.hp - d);
      addLog(`${label}: すなあらし -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
    }
    // Leftovers
    if (poke.item === 'Leftovers' && rt.hp < rt.maxHp) {
      const h = Math.floor(rt.maxHp / 16); rt.hp = Math.min(rt.maxHp, rt.hp + h);
      addLog(`${label}: たべのこし +${h} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
    }
    // Black Sludge
    if (poke.item === 'Black Sludge') {
      if (types.includes('Poison')) { const h = Math.floor(rt.maxHp / 16); rt.hp = Math.min(rt.maxHp, rt.hp + h); addLog(`${label}: くろいヘドロ +${h} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line'); }
      else { const d = Math.floor(rt.maxHp / 8); rt.hp = Math.max(0, rt.hp - d); addLog(`${label}: くろいヘドロ -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line'); }
    }
    // Grassy Terrain
    if (field.terrain === 'Grassy' && !types.includes('Flying')) {
      const h = Math.floor(rt.maxHp / 16); rt.hp = Math.min(rt.maxHp, rt.hp + h);
      addLog(`${label}: グラスフィールド +${h} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
    }
    // Poison
    if (rt.status === 'psn') { const d = Math.floor(rt.maxHp / 8); rt.hp = Math.max(0, rt.hp - d); addLog(`${label}: どく -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line'); }
    // Toxic
    if (rt.status === 'tox') { rt.toxicCount++; const d = Math.floor(rt.maxHp * rt.toxicCount / 16); rt.hp = Math.max(0, rt.hp - d); addLog(`${label}: もうどく(${rt.toxicCount}) -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line'); }
    // Burn
    if (rt.status === 'brn') { const d = Math.floor(rt.maxHp / 16); rt.hp = Math.max(0, rt.hp - d); addLog(`${label}: やけど -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line'); }
    // Leech Seed
    if (rt.leechSeed && oppRt.hp > 0) {
      const d = Math.floor(rt.maxHp / 8); rt.hp = Math.max(0, rt.hp - d);
      const heal = Math.min(d, oppRt.maxHp - oppRt.hp); oppRt.hp += heal;
      addLog(`${label}: やどりぎ -${d} → HP ${rt.hp}/${rt.maxHp}`, false, 'dmg-line');
      if (heal > 0) addLog(`${opp === 'a' ? '自分' : '相手'}: やどりぎ回復 +${heal} → HP ${oppRt.hp}/${oppRt.maxHp}`, false, 'heal-line');
    }
    // Sitrus Berry
    if (poke.item === 'Sitrus Berry' && rt.hp > 0 && rt.hp <= rt.maxHp / 2) {
      const h = Math.floor(rt.maxHp / 4); rt.hp = Math.min(rt.maxHp, rt.hp + h);
      poke.item = '';
      addLog(`${label}: オボンのみ +${h} → HP ${rt.hp}/${rt.maxHp}`, false, 'heal-line');
    }
  }
  for (const s of ['a','b']) {
    if (getActiveRt(s).hp <= 0) addLog(`${s === 'a' ? '自分' : '相手'}の${ja('pokemon', getActive(s).name)}はたおれた！`, false, 'ko-line');
  }
  updateBattleLight();
}

// ===== TARGETED DOM UPDATES (no full rebuild) =====
function updateHpUI(side) {
  const rt = getActiveRt(side);
  const pct = rt.maxHp > 0 ? (rt.hp / rt.maxHp * 100) : 0;
  const hpClass = pct > 50 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';
  const bar = document.getElementById(`sim-hpbar-${side}`);
  const text = document.getElementById(`sim-hptext-${side}`);
  if (bar) { bar.className = `sim-hp-fill ${hpClass}`; bar.style.width = `${pct}%`; }
  if (text) text.textContent = `${rt.hp} / ${rt.maxHp}`;
  // Update bench HP display
  document.querySelectorAll(`.sim-bench-hp[data-side="${side}"]`).forEach(el => {
    const idx = parseInt(el.dataset.idx);
    const brt = battle.rt[side][idx];
    if (brt) el.textContent = `${brt.hp}/${brt.maxHp}`;
  });
}

let _logRendered = 0; // tracks how many log entries are already in DOM
function appendNewLogs() {
  const logEl = document.getElementById('sim-log');
  if (!logEl || !battle) return;
  const entries = battle.log.slice(_logRendered);
  if (entries.length === 0) return;
  let html = '';
  for (const e of entries) {
    html += `<div class="sim-turn-entry${e.isHeader ? ' turn-header' : ''}">${e.cls ? `<span class="${e.cls}">` : ''}${esc(e.text)}${e.cls ? '</span>' : ''}</div>`;
  }
  logEl.insertAdjacentHTML('beforeend', html);
  _logRendered = battle.log.length;
  logEl.scrollTop = logEl.scrollHeight;
}

function updateBattleLight() {
  updateHpUI('a');
  updateHpUI('b');
  appendNewLogs();
  const undoBtn = document.getElementById('sim-undo');
  if (undoBtn) undoBtn.disabled = _undoStack.length === 0;
}

// ===== LOG =====
function addLog(text, isHeader = false, cls = '') {
  battle.log.push({ text, isHeader, cls });
}
function renderLog() {
  if (!battle) return '';
  _logRendered = battle.log.length;
  const entries = battle.log.length > 100 ? battle.log.slice(-100) : battle.log;
  return entries.map(e =>
    `<div class="sim-turn-entry${e.isHeader ? ' turn-header' : ''}">${e.cls ? `<span class="${e.cls}">` : ''}${esc(e.text)}${e.cls ? '</span>' : ''}</div>`
  ).join('');
}
