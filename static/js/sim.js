// Pokemon Champions - Battle Simulator UI (battle phase rendering)
// 対戦ロジックは battle-engine.js。ここはDOM描画とイベント配線のみ。
import {
  DATA, ja, esc, spriteImg, typeBadge, STAT_SHORT,
} from './data.js';
import { DMG } from './damage.js';
import { DB } from './db.js';
import { generateUid, markDirty } from './state.js';
import { showToast, showPokemonDetailModal } from './ui.js';
import { TWO_TURN_MOVES, ALL_TYPES, TYPE_JA } from './poke-data.js';
import {
  parties, selection, field, fieldTurns, hazards, battle, simOptions, SCREEN_JA,
  initBattle, getActive, getActiveRt, restorePreBattleParties,
  executeTurn as engineExecuteTurn, executeEndOfTurn as engineExecuteEndOfTurn,
  resolvePivot, hasAliveBench,
  undoBattle as engineUndoBattle, canUndo, snapshotBattle, addLog, weatherRockTurns,
  getMegaFormes, getMegaForme, isMega, isAegislash, getAegislashAlternateForme, applyFormeChange,
  getRecoilFrac, getDrainFrac, getEffectiveMoveType,
} from './battle-engine.js';

// ===== ENTRY =====
// renderSetup is in sim-setup.js (import here creates circular dep, so use lazy import)
export function initSimPage() {
  import('./sim-setup.js').then(m => m.renderSetup());
}

// ============================================================
// PHASE 3: BATTLE
// ============================================================
export function startBattle() {
  if (selection.a.length === 0 || selection.b.length === 0) {
    showToast('両方1匹以上選出してください');
    return;
  }
  initBattle();
  renderBattle();
}

// 手動調整パネルの開閉状態 (renderBattleは頻繁に呼ばれるため、閉じ直されないよう保持)
let manualPanelOpen = false;
let sideDetailOpen = { a: false, b: false }; // HP調整・威力補正の折りたたみ
let partyOvOpen = false;

function renderBattle() {
  const page = document.getElementById('page-sim');
  page.innerHTML = `
    ${renderPivotPrompt()}
    <div class="sim-hud">
      ${renderSideHud('a')}
      ${renderSideHud('b')}
    </div>
    <div class="sim-decide">
      <div class="sim-decide-col">
        <div class="sim-decide-label">自分の技</div>
        ${renderSideMoves('a')}
      </div>
      <div class="sim-decide-col">
        <div class="sim-decide-label">相手の技</div>
        ${renderSideMoves('b')}
      </div>
    </div>
    <div class="sim-result" id="sim-result">${renderLastTurn()}</div>
    <div class="sim-actions">
      <button class="btn btn-sm" id="sim-exec" style="background:var(--accent);flex:2">ターン実行</button>
      <button class="btn btn-sm btn-outline" id="sim-eot">EOT処理</button>
      <button class="btn btn-sm btn-outline" id="sim-undo" ${canUndo() ? '' : 'disabled'} style="color:var(--accent2);border-color:var(--accent2)">↩ 戻す</button>
      <button class="btn btn-sm btn-outline" id="sim-savelog" style="color:var(--ok);border-color:var(--ok)">📝 ログ保存</button>
      <button class="btn btn-sm btn-outline" id="sim-reselect">選出に戻る</button>
      <button class="btn btn-sm btn-danger" id="sim-end">終了</button>
    </div>
    <details class="card" id="sim-manual-panel" style="margin-top:6px;padding:6px" ${manualPanelOpen ? 'open' : ''}>
      <summary style="cursor:pointer;font-size:.8rem;font-weight:700;color:var(--fg2)">⚙ 手動調整（状態異常・フィールド・設置技・ランク）</summary>
      <div class="col2" style="margin-top:4px">
        <div><label>自分 状態異常</label><select id="sim-st-a" style="font-size:.75rem">
          <option value="">なし</option><option value="brn">やけど</option><option value="psn">どく</option><option value="tox">もうどく</option><option value="par">まひ</option><option value="frz">こおり</option><option value="slp">ねむり</option>
        </select></div>
        <div><label>相手 状態異常</label><select id="sim-st-b" style="font-size:.75rem">
          <option value="">なし</option><option value="brn">やけど</option><option value="psn">どく</option><option value="tox">もうどく</option><option value="par">まひ</option><option value="frz">こおり</option><option value="slp">ねむり</option>
        </select></div>
      </div>
      <div class="col2" style="margin-top:4px">
        <label><input type="checkbox" id="sim-ls-a"> 自分にやどりぎ</label>
        <label><input type="checkbox" id="sim-ls-b"> 相手にやどりぎ</label>
      </div>
      <div class="col2" style="margin-top:4px">
        <label><input type="checkbox" id="sim-cs-a"> 自分にのろい</label>
        <label><input type="checkbox" id="sim-cs-b"> 相手にのろい</label>
      </div>
      ${renderFieldPanel()}
      ${renderHazardPanel()}
      <div class="col2" style="margin-top:4px">
        ${renderBoostUI('a')}
        ${renderBoostUI('b')}
      </div>
    </details>
    ${renderPartyOverview()}
    <div class="sim-turn-log" id="sim-log">
      <h3>ターン履歴</h3>
      ${renderLog()}
    </div>
  `;

  // Pivot prompt (とんぼ返り等の後続選択)
  document.querySelectorAll('.sim-pivot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      handleTurnResult(resolvePivot(parseInt(btn.dataset.to)));
    });
  });

  // Wire events
  for (const s of ['a','b']) {
    const rt = getActiveRt(s);
    document.getElementById(`sim-st-${s}`).value = rt.status;
    document.getElementById(`sim-st-${s}`).addEventListener('change', e => { rt.status = e.target.value; if (e.target.value === 'tox') rt.toxicCount = 0; });
    document.getElementById(`sim-ls-${s}`).checked = rt.leechSeed;
    document.getElementById(`sim-ls-${s}`).addEventListener('change', e => { rt.leechSeed = e.target.checked; });
    document.getElementById(`sim-cs-${s}`).checked = rt.cursed;
    document.getElementById(`sim-cs-${s}`).addEventListener('change', e => { rt.cursed = e.target.checked; });
  }

  // Boost +/- buttons
  document.querySelectorAll('.sim-bst-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.side, stat = btn.dataset.stat;
      const rt = getActiveRt(s);
      rt.boosts[stat] = Math.max(-6, Math.min(6, (rt.boosts[stat] || 0) + parseInt(btn.dataset.dir)));
      const v = rt.boosts[stat];
      const span = document.getElementById(`sim-bst-${s}-${stat}`);
      if (span) { span.textContent = `${v > 0 ? '+' : ''}${v}`; span.style.color = v > 0 ? 'var(--ok)' : v < 0 ? 'var(--danger)' : ''; }
    });
  });

  // In-battle field effects (weather / terrain / trick room / gravity / tailwind)
  wireFieldPanel();
  wireHazardPanel();

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
        // 選択済みの技を再タップ → 行動なしに戻す（トグル）
        const cur = battle.actions[s];
        if (btn.dataset.type === 'move' && cur?.type === 'move' && cur.move === btn.dataset.move) {
          battle.actions[s] = { type: 'skip' };
          document.querySelectorAll(`.sim-act-btn[data-side="${s}"]`).forEach(b => b.classList.remove('selected'));
          document.querySelector(`.sim-act-btn[data-side="${s}"][data-type="skip"]`)?.classList.add('selected');
          return;
        }
        document.querySelectorAll(`.sim-act-btn[data-side="${s}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (btn.dataset.type === 'move') {
          battle.actions[s] = { type: 'move', move: btn.dataset.move };
          // Update BP field to selected move's base BP (reset override)
          const md = DATA.moves[btn.dataset.move];
          battle.mod[s].bp = null;
          battle.mod[s].hits = null;
          const bpEl = document.querySelector(`.sim-mod-bp[data-side="${s}"]`);
          if (bpEl) bpEl.value = md?.bp || 0;
        } else if (btn.dataset.type === 'switch') {
          battle.actions[s] = { type: 'switch', to: parseInt(btn.dataset.to) };
        } else if (btn.dataset.type === 'skip') {
          battle.actions[s] = { type: 'skip' };
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

  // Modifier panel
  document.querySelectorAll('.sim-mod-bp').forEach(el => {
    el.addEventListener('input', () => {
      const v = parseInt(el.value);
      battle.mod[el.dataset.side].bp = isNaN(v) ? null : v;
    });
  });
  document.querySelectorAll('.sim-mod-mul').forEach(el => {
    el.addEventListener('click', () => {
      const s = el.dataset.side;
      const bpEl = document.querySelector(`.sim-mod-bp[data-side="${s}"]`);
      const cur = parseInt(bpEl.value) || 0;
      const newBP = Math.floor(cur * parseFloat(el.dataset.mul));
      bpEl.value = newBP;
      battle.mod[s].bp = newBP;
    });
  });
  document.querySelectorAll('.sim-mod-reset').forEach(el => {
    el.addEventListener('click', () => {
      const s = el.dataset.side;
      battle.mod[s] = { bp: null, moveType: null, stab2x: false, hits: null };
      renderBattle();
    });
  });
  document.querySelectorAll('.sim-mod-stab2x').forEach(el => {
    el.addEventListener('change', () => { battle.mod[el.dataset.side].stab2x = el.checked; });
  });
  document.querySelectorAll('.sim-mod-type').forEach(el => {
    el.addEventListener('change', () => { battle.mod[el.dataset.side].moveType = el.value || null; });
  });
  document.querySelectorAll('.sim-mod-hits').forEach(el => {
    el.addEventListener('change', () => { battle.mod[el.dataset.side].hits = parseInt(el.value); });
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

  document.getElementById('sim-exec').addEventListener('click', () => {
    if (battle.pendingPivot) { showToast('後続を選択してください'); return; }
    if (!battle.actions.a && !battle.actions.b) { showToast('行動を選択してください'); return; }
    handleTurnResult(engineExecuteTurn());
  });
  document.getElementById('sim-eot').addEventListener('click', () => {
    engineExecuteEndOfTurn();
    updateBattleLight();
  });
  document.getElementById('sim-undo').addEventListener('click', () => {
    if (!engineUndoBattle()) { showToast('これ以上戻せません'); return; }
    _logRendered = 0; // force full log rebuild
    renderBattle();
    showToast('1手戻しました');
  });
  document.getElementById('sim-reselect').addEventListener('click', () => {
    restorePreBattleParties();
    import('./sim-setup.js').then(m => m.renderSelect());
  });
  document.getElementById('sim-end').addEventListener('click', () => {
    restorePreBattleParties();
    import('./sim-setup.js').then(m => m.renderSetup());
  });
  // 手動調整パネルの開閉を保持
  document.getElementById('sim-manual-panel')?.addEventListener('toggle', e => {
    manualPanelOpen = e.target.open;
  });
  // サイド別 HP調整・威力補正 / パーティ概観の開閉を保持
  document.querySelectorAll('.sim-side-detail').forEach(d => {
    d.addEventListener('toggle', e => { sideDetailOpen[d.dataset.side] = e.target.open; });
  });
  document.getElementById('sim-party-ov')?.addEventListener('toggle', e => {
    partyOvOpen = e.target.open;
  });
  // バトルログを記録タブに保存
  document.getElementById('sim-savelog').addEventListener('click', saveBattleLog);
  // パーティ概観: タップで個体詳細（選出済みなら現在HP/ランクも表示）＋BOX保存導線
  document.querySelectorAll('.sim-ov-poke').forEach(box => {
    box.addEventListener('click', () => {
      const side = box.dataset.side, pi = parseInt(box.dataset.pi);
      const selIdx = selection[side].indexOf(pi);
      const rt = selIdx >= 0 ? battle.rt[side][selIdx] : null;
      showPokemonDetailModal(parties[side][pi], rt, [{
        label: '📦 BOXに保存',
        style: 'border-color:var(--accent2);color:var(--accent2)',
        handler: (p, close) => savePokeToBox(p, close),
      }]);
    });
  });
}

// 対戦中の個体をそのままBOXへ (「シミュ回してこいつ欲しい」→即保存の導線)
async function savePokeToBox(poke, close) {
  const boxAll = await DB.getAll('box');
  if (poke.uid && boxAll.find(b => b.uid === poke.uid)) { showToast('同じ個体がBOXに存在します'); return; }
  const entry = JSON.parse(JSON.stringify(poke));
  delete entry.id; delete entry._moveEntries;
  if (!entry.uid) entry.uid = generateUid();
  entry.savedCalcs = entry.savedCalcs || [];
  entry.notes = entry.notes || '';
  await DB.add('box', entry);
  markDirty('box');
  showToast(`${ja('pokemon', poke.name)} をBOXに追加`);
  close?.();
}

async function saveBattleLog() {
  if (!battle?.log?.length) { showToast('ログがまだありません'); return; }
  const teamStr = s => selection[s].map(i => ja('pokemon', parties[s][i].name)).join(', ');
  const aliveA = battle.rt.a.filter(r => r.hp > 0).length;
  const aliveB = battle.rt.b.filter(r => r.hp > 0).length;
  await DB.add('records', {
    result: aliveA >= aliveB ? 'win' : 'lose',
    opponent: 'シミュレーション',
    myTeam: teamStr('a'),
    oppTeam: teamStr('b'),
    notes: `残数 自分${aliveA} - 相手${aliveB}`,
    log: battle.log.map(e => e.text).join('\n'),
    date: Date.now(),
  });
  markDirty('records');
  showToast('バトルログを記録タブに保存した');
}

// ターン実行/再開の結果を描画に反映
function handleTurnResult(res) {
  if (!res) { updateBattleLight(); return; }
  if (res.pivot || res.needRender) renderBattle(); // pendingPivot中はrenderPivotPromptが出る
  else updateBattleLight();
}

// とんぼ返り等で中断中: 後続選択パネル
function renderPivotPrompt() {
  if (!battle?.pendingPivot) return '';
  const side = battle.pendingPivot;
  const label = side === 'a' ? '自分' : '相手';
  const bench = selection[side]
    .map((pi, i) => ({ pi, i, poke: parties[side][pi], rt: battle.rt[side][i] }))
    .filter(x => x.i !== battle.active[side] && x.rt.hp > 0);
  return `
    <div class="card" style="border:2px solid var(--accent);padding:8px;margin-bottom:6px">
      <div style="font-weight:700;font-size:.85rem;margin-bottom:4px">🔄 交代技: ${label}の後続を選択</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${bench.map(({ poke, rt, i }) => `
          <button class="sim-pivot-btn btn btn-sm btn-outline" data-to="${i}" style="display:flex;align-items:center;gap:3px">
            ${spriteImg(poke.name, 22)}
            <span style="font-size:.7rem">${esc(ja('pokemon', poke.name))}</span>
            <span style="font-size:.6rem;color:var(--fg2)">${rt.hp}/${rt.maxHp}</span>
          </button>`).join('')}
        <button class="sim-pivot-btn btn btn-sm btn-outline" data-to="-1" style="color:var(--fg2)">交代しない</button>
      </div>
    </div>`;
}

// 上部固定HUD: 両者の状態(画像/名前/HP/すばやさ/メガ)をコンパクトに
function renderSideHud(side) {
  const poke = getActive(side);
  const rt = getActiveRt(side);
  const label = side === 'a' ? '自分' : '相手';
  const pct = rt.maxHp > 0 ? (rt.hp / rt.maxHp * 100) : 0;
  const hpClass = pct > 50 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';
  const stats = DMG.getStats(poke);
  const abilityJa = poke.ability ? (ja('abilities', poke.ability) || poke.ability) : '';

  // Mega evolution / Aegislash buttons
  const megaForme = getMegaForme(poke);
  const canMega = megaForme && !isMega(poke.name) && !battle.megaUsed[side];
  const isAegi = isAegislash(poke.name);
  const megaBtns = canMega
    ? `<button class="btn btn-sm sim-mega-btn" data-side="${side}" data-forme="${esc(megaForme)}">メガ → ${esc(ja('pokemon', megaForme))}</button>`
    : (!isMega(poke.name) && !battle.megaUsed[side] && getMegaFormes(poke).length > 1
        ? getMegaFormes(poke).map(mf => `<button class="btn btn-sm sim-mega-btn" data-side="${side}" data-forme="${esc(mf)}">メガ → ${esc(ja('pokemon', mf))}</button>`).join('')
        : '');
  const aegisBtn = isAegi ? `<button class="btn btn-sm sim-aegis-btn" data-side="${side}">${poke.name.includes('Blade') ? 'シールドへ' : 'ブレードへ'}</button>` : '';

  return `
    <div class="sim-hud-row sim-hud-${side}">
      <div class="sim-hud-side">${side === 'a' ? '自' : '相'}</div>
      ${spriteImg(poke.name, 40)}
      <div class="sim-hud-info">
        <div class="sim-hud-name">${esc(ja('pokemon', poke.name))}
          <span class="sim-hud-types">${DATA.pokemon[poke.name]?.types.map(t => typeBadge(t)).join('') || ''}</span>
        </div>
        <div class="sim-hud-sub">${esc(abilityJa)}${stats ? ` · S${stats.sp}` : ''}${poke.item ? ` · @${esc(ja('items', poke.item))}` : ''}</div>
      </div>
      <div class="sim-hud-hp">
        <div class="sim-hp-bar"><div class="sim-hp-fill ${hpClass}" id="sim-hpbar-${side}" style="width:${pct}%"></div></div>
        <div class="sim-hp-text" id="sim-hptext-${side}">${rt.hp} / ${rt.maxHp}</div>
      </div>
      ${(megaBtns || aegisBtn || rt.disguise) ? `<div class="sim-hud-actions">
        ${megaBtns}${aegisBtn}
        ${rt.disguise ? `<span class="sim-hud-tag">${poke.ability === 'Disguise' ? 'ばけのかわ' : 'こおりのすがた'}生存</span>` : ''}
      </div>` : ''}
    </div>`;
}

// 行動選択: 技(2×2)/交代/急所・乱数/🔧調整
function renderSideMoves(side) {
  const poke = getActive(side);
  const rt = getActiveRt(side);
  const moves = poke.moves.filter(m => m && DATA.moves[m]);

  return `
    <div class="sim-moves-grid">
      ${moves.map(m => {
        const move = DATA.moves[m];
        const sel = battle.actions[side]?.type === 'move' && battle.actions[side]?.move === m;
        const effType = getEffectiveMoveType(m, poke.ability);
        const skinChanged = effType !== move.type;
        const twoTurn = TWO_TURN_MOVES.has(m);
        return `<button class="sim-act-btn sim-move-btn${sel ? ' selected' : ''}" data-side="${side}" data-type="move" data-move="${esc(m)}">
          <span class="sim-move-top">${skinChanged ? typeBadge(effType) : typeBadge(move.type)}<span class="sim-move-name">${esc(ja('moves', m))}</span></span>
          <span class="sim-move-meta">威${move.bp || '-'}${skinChanged ? '<span style="color:var(--accent2)">・スキン</span>' : ''}${twoTurn ? '・2T' : ''}${getRecoilFrac(m) ? '<span style="color:var(--danger)">・反動</span>' : ''}${getDrainFrac(m) ? '<span style="color:var(--ok)">・吸収</span>' : ''}</span>
        </button>`;
      }).join('')}
      <button class="sim-act-btn sim-move-btn sim-move-skip${battle.actions[side]?.type === 'skip' ? ' selected' : ''}" data-side="${side}" data-type="skip">
        — 行動なし <span style="font-size:.55rem">(怯み/外し等)</span>
      </button>
    </div>
    ${renderBench(side)}
    <div class="sim-crit-row">
      <label><input type="checkbox" class="sim-crit" data-side="${side}" ${battle.crit[side] ? 'checked' : ''}> 急所</label>
      <select class="sim-roll" data-side="${side}">
        <option value="random"${battle.rollMode[side]==='random' ? ' selected' : ''}>抽選</option>
        <option value="min"${battle.rollMode[side]==='min' ? ' selected' : ''}>最低</option>
        <option value="max"${battle.rollMode[side]==='max' ? ' selected' : ''}>最高</option>
        <option value="avg"${battle.rollMode[side]==='avg' ? ' selected' : ''}>平均</option>
      </select>
    </div>
    <details class="sim-side-detail" data-side="${side}" ${sideDetailOpen[side] ? 'open' : ''}>
      <summary class="sim-detail-sum">🔧 HP調整・威力補正</summary>
      <div class="sim-hp-btns">
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/16}">+1/16</button>
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/8}">+1/8</button>
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/4}">+1/4</button>
        <button class="sim-hp-adj hp-heal" data-side="${side}" data-frac="${1/2}">+1/2</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/16}">-1/16</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/8}">-1/8</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/4}">-1/4</button>
        <button class="sim-hp-adj hp-dmg" data-side="${side}" data-frac="${-1/2}">-1/2</button>
      </div>
      <div class="sim-custom-hp">
        <input type="number" id="sim-hp-input-${side}" placeholder="HP" min="0" max="${rt.maxHp}">
        <button class="btn btn-sm btn-outline" id="sim-hp-set-${side}" style="font-size:.7rem;padding:2px 6px">設定</button>
      </div>
      ${renderModPanel(side, poke)}
    </details>`;
}

// 実行ボタン直上に出す「直前ターンの結果」(最後のターンヘッダ以降のログ)
function renderLastTurn() {
  if (!battle?.log?.length) return '<span class="sim-result-empty">技を選んで「ターン実行」</span>';
  let start = 0;
  for (let i = battle.log.length - 1; i >= 0; i--) {
    if (battle.log[i].isHeader) { start = i; break; }
  }
  const entries = battle.log.slice(start);
  return entries.map(e =>
    `<div class="sim-result-line${e.isHeader ? ' res-header' : ''}">${e.cls ? `<span class="${e.cls}">` : ''}${esc(e.text)}${e.cls ? '</span>' : ''}</div>`
  ).join('');
}

function renderModPanel(side, poke) {
  const mod = battle.mod[side];
  const selMove = battle.actions[side]?.type === 'move' ? battle.actions[side].move : null;
  const moveData = selMove ? DATA.moves[selMove] : null;
  const baseBP = moveData?.bp || 0;
  const curBP = mod.bp != null ? mod.bp : baseBP;
  const isMultiHit = moveData?.hits && (Array.isArray(moveData.hits) || moveData.hits > 1);
  const maxHits = moveData?.hits ? (Array.isArray(moveData.hits) ? moveData.hits[1] : moveData.hits) : 1;
  const minHits = moveData?.hits ? (Array.isArray(moveData.hits) ? moveData.hits[0] : moveData.hits) : 1;

  return `<div style="margin-top:4px;padding:4px;background:var(--bg);border:1px solid var(--bg3);border-radius:4px;font-size:.65rem">
    <div style="display:flex;align-items:center;gap:3px;flex-wrap:wrap">
      <span style="color:var(--fg2)">威力</span>
      <input type="number" class="sim-mod-bp" data-side="${side}" value="${curBP}" min="0" max="999" style="width:45px;font-size:.7rem;padding:1px 3px">
      <button class="sim-mod-mul btn btn-sm btn-outline" data-side="${side}" data-mul="1.3" style="padding:1px 4px;font-size:.6rem">×1.3</button>
      <button class="sim-mod-mul btn btn-sm btn-outline" data-side="${side}" data-mul="1.5" style="padding:1px 4px;font-size:.6rem">×1.5</button>
      <button class="sim-mod-mul btn btn-sm btn-outline" data-side="${side}" data-mul="2" style="padding:1px 4px;font-size:.6rem">×2</button>
      <button class="sim-mod-reset btn btn-sm btn-outline" data-side="${side}" style="padding:1px 4px;font-size:.6rem;color:var(--fg2)">↺</button>
    </div>
    <div style="display:flex;align-items:center;gap:3px;margin-top:3px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:2px;white-space:nowrap"><input type="checkbox" class="sim-mod-stab2x" data-side="${side}" ${mod.stab2x ? 'checked' : ''}> 一致2倍</label>
      <span style="color:var(--fg2)">タイプ</span>
      <select class="sim-mod-type" data-side="${side}" style="font-size:.65rem;padding:0 2px">
        <option value="">自動</option>
        ${ALL_TYPES.map(t => `<option value="${t}"${mod.moveType===t?' selected':''}>${TYPE_JA[t]}</option>`).join('')}
      </select>
      ${isMultiHit ? `<span style="color:var(--fg2)">連続</span>
      <select class="sim-mod-hits" data-side="${side}" style="font-size:.65rem;padding:0 2px;width:40px">
        ${Array.from({length: maxHits - minHits + 1}, (_, i) => minHits + i).map(h =>
          `<option value="${h}"${mod.hits===h?' selected':''}>${h}発</option>`).join('')}
      </select>` : ''}
    </div>
  </div>`;
}

function renderBench(side) {
  const benched = selection[side]
    .map((pi, i) => ({ pi, i, poke: parties[side][pi], rt: battle.rt[side][i] }))
    .filter(x => x.i !== battle.active[side]);
  if (benched.length === 0) return '';

  return `
    <div style="font-size:.65rem;color:var(--fg2);margin:2px 0">控え(交代):</div>
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
            return `<div class="sim-ov-poke" data-side="${side}" data-pi="${i}" style="text-align:center;padding:3px 4px;border-radius:4px;min-width:48px;cursor:pointer;
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
  return `<details class="card" id="sim-party-ov" style="margin-top:6px;padding:6px" ${partyOvOpen ? 'open' : ''}>
    <summary class="sim-detail-sum">👥 パーティ概観（タップで個体詳細）</summary>
    <div class="col2" style="margin-top:4px">${renderSide('a')}${renderSide('b')}</div>
  </details>`;
}

function renderBoostUI(side) {
  const rt = getActiveRt(side);
  const label = side === 'a' ? '自分' : '相手';
  return `<div>
    <label style="font-size:.65rem">${label}ランク</label>
    <div style="display:flex;gap:4px;flex-wrap:wrap">
      ${['at','df','sa','sd','sp'].map(stat => {
        const v = rt.boosts[stat] || 0;
        const col = v > 0 ? 'var(--ok)' : v < 0 ? 'var(--danger)' : '';
        return `<div style="display:flex;flex-direction:column;align-items:center">
          <span style="font-size:.55rem;color:var(--fg2)">${STAT_SHORT[stat]}</span>
          <div style="display:flex;align-items:center;gap:1px">
            <button class="sim-bst-btn" data-side="${side}" data-stat="${stat}" data-dir="-1" style="width:18px;height:18px;padding:0;font-size:.8rem;line-height:1">−</button>
            <span class="sim-bst-val" id="sim-bst-${side}-${stat}" style="min-width:20px;text-align:center;font-size:.65rem;font-weight:700;color:${col}">${v>0?'+':''}${v}</span>
            <button class="sim-bst-btn" data-side="${side}" data-stat="${stat}" data-dir="1" style="width:18px;height:18px;padding:0;font-size:.8rem;line-height:1">＋</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ===== FIELD / HAZARD PANELS =====
function renderFieldPanel() {
  const wT = fieldTurns.weather, tT = fieldTurns.terrain;
  const tag = n => n > 0 ? ` <span style="color:var(--accent2)">残り${n}T</span>` : '';
  return `<div style="margin-top:6px;padding:6px;background:var(--bg);border:1px solid var(--bg3);border-radius:4px">
    <div style="font-size:.7rem;font-weight:700;margin-bottom:4px">フィールド効果（発動で5T計測 / 対応アイテムで8T、発動ターンも消費）</div>
    <div class="col2">
      <div><label style="font-size:.65rem">天候${tag(wT)}</label><select id="sim-weather-b" style="font-size:.75rem">
        <option value="">なし</option><option value="Sun">はれ</option><option value="Rain">あめ</option><option value="Sand">すなあらし</option><option value="Snow">ゆき</option>
      </select></div>
      <div><label style="font-size:.65rem">フィールド${tag(tT)}</label><select id="sim-terrain-b" style="font-size:.75rem">
        <option value="">なし</option><option value="Electric">エレキ</option><option value="Grassy">グラス</option><option value="Psychic">サイコ</option><option value="Misty">ミスト</option>
      </select></div>
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
      <button class="btn btn-sm sim-field-toggle ${fieldTurns.trickRoom>0?'':'btn-outline'}" data-fx="trickRoom">トリックルーム${fieldTurns.trickRoom>0?` ${fieldTurns.trickRoom}T`:''}</button>
      <button class="btn btn-sm sim-field-toggle ${fieldTurns.gravity>0?'':'btn-outline'}" data-fx="gravity">じゅうりょく${fieldTurns.gravity>0?` ${fieldTurns.gravity}T`:''}</button>
      <button class="btn btn-sm sim-field-toggle ${fieldTurns.tailwind.a>0?'':'btn-outline'}" data-fx="tailwind-a">おいかぜ自${fieldTurns.tailwind.a>0?` ${fieldTurns.tailwind.a}T`:''}</button>
      <button class="btn btn-sm sim-field-toggle ${fieldTurns.tailwind.b>0?'':'btn-outline'}" data-fx="tailwind-b">おいかぜ相${fieldTurns.tailwind.b>0?` ${fieldTurns.tailwind.b}T`:''}</button>
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
      ${[['reflect','リフレク'],['lightScreen','ひかりのかべ'],['auroraVeil','ベール']].map(([k, name]) =>
        ['a','b'].map(s =>
          `<button class="btn btn-sm sim-field-toggle ${fieldTurns[k][s]>0?'':'btn-outline'}" data-fx="${k}-${s}" style="font-size:.65rem">${name}${s==='a'?'自':'相'}${fieldTurns[k][s]>0?` ${fieldTurns[k][s]}T`:''}</button>`
        ).join('')).join('')}
    </div>
    <div style="display:flex;gap:10px;margin-top:4px;font-size:.7rem">
      <label><input type="checkbox" id="sim-opt-acc" ${simOptions.autoAccuracy?'checked':''}> 命中判定</label>
      <label><input type="checkbox" id="sim-opt-critrate" ${simOptions.autoCritRate?'checked':''}> 急所率(1/24)を抽選に含める</label>
      <label><input type="checkbox" id="sim-opt-secondary" ${simOptions.autoSecondary?'checked':''}> 追加効果を自動抽選</label>
    </div>
  </div>`;
}

function wireFieldPanel() {
  const wEl = document.getElementById('sim-weather-b');
  const tEl = document.getElementById('sim-terrain-b');
  if (wEl) { wEl.value = field.weather; wEl.addEventListener('change', e => {
    field.weather = e.target.value;
    fieldTurns.weather = field.weather ? weatherRockTurns('weather') : 0;
    addLog(`天候: ${e.target.options[e.target.selectedIndex].text}${fieldTurns.weather?` (${fieldTurns.weather}T)`:''}`);
    renderBattle();
  }); }
  if (tEl) { tEl.value = field.terrain; tEl.addEventListener('change', e => {
    field.terrain = e.target.value;
    fieldTurns.terrain = field.terrain ? weatherRockTurns('terrain') : 0;
    addLog(`フィールド: ${e.target.options[e.target.selectedIndex].text}${fieldTurns.terrain?` (${fieldTurns.terrain}T)`:''}`);
    renderBattle();
  }); }
  document.querySelectorAll('.sim-field-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const fx = btn.dataset.fx;
      const on = (cur) => cur > 0 ? 0 : 5;
      if (fx === 'trickRoom') { fieldTurns.trickRoom = on(fieldTurns.trickRoom); addLog(`トリックルーム ${fieldTurns.trickRoom>0?'発動 (5T)':'解除'}`); }
      else if (fx === 'gravity') { fieldTurns.gravity = on(fieldTurns.gravity); addLog(`じゅうりょく ${fieldTurns.gravity>0?'発動 (5T)':'解除'}`); }
      else if (fx === 'tailwind-a') { fieldTurns.tailwind.a = on(fieldTurns.tailwind.a); addLog(`おいかぜ(自分) ${fieldTurns.tailwind.a>0?'発動 (5T)':'解除'}`); }
      else if (fx === 'tailwind-b') { fieldTurns.tailwind.b = on(fieldTurns.tailwind.b); addLog(`おいかぜ(相手) ${fieldTurns.tailwind.b>0?'発動 (5T)':'解除'}`); }
      else if (/^(reflect|lightScreen|auroraVeil)-(a|b)$/.test(fx)) {
        const [k, s] = fx.split('-');
        fieldTurns[k][s] = on(fieldTurns[k][s]);
        addLog(`${s==='a'?'自分':'相手'}側の${SCREEN_JA[k]} ${fieldTurns[k][s]>0?'展開 (5T)':'解除'}`);
      }
      renderBattle();
    });
  });
  document.getElementById('sim-opt-acc')?.addEventListener('change', e => { simOptions.autoAccuracy = e.target.checked; });
  document.getElementById('sim-opt-critrate')?.addEventListener('change', e => { simOptions.autoCritRate = e.target.checked; });
  document.getElementById('sim-opt-secondary')?.addEventListener('change', e => { simOptions.autoSecondary = e.target.checked; });
}

function renderHazardPanel() {
  const row = (side) => {
    const h = hazards[side];
    const label = side === 'a' ? '自分側' : '相手側';
    return `<div>
      <div style="font-size:.65rem;font-weight:700">${label}（${label}の交代着地で発動）</div>
      <label style="font-size:.7rem;display:block"><input type="checkbox" class="sim-hz" data-side="${side}" data-kind="sr" ${h.sr?'checked':''}> ステルスロック</label>
      <label style="font-size:.7rem;display:flex;align-items:center;gap:3px">まきびし
        <select class="sim-hz-num" data-side="${side}" data-kind="spikes" style="font-size:.7rem">
          ${[0,1,2,3].map(n=>`<option value="${n}"${h.spikes===n?' selected':''}>${n}</option>`).join('')}
        </select></label>
      <label style="font-size:.7rem;display:flex;align-items:center;gap:3px">どくびし
        <select class="sim-hz-num" data-side="${side}" data-kind="tspikes" style="font-size:.7rem">
          ${[0,1,2].map(n=>`<option value="${n}"${h.tspikes===n?' selected':''}>${n}</option>`).join('')}
        </select></label>
    </div>`;
  };
  return `<div style="margin-top:6px;padding:6px;background:var(--bg);border:1px solid var(--bg3);border-radius:4px">
    <div style="font-size:.7rem;font-weight:700;margin-bottom:4px">設置技（交代着地時に自動ダメージ計算）</div>
    <div class="col2">${row('a')}${row('b')}</div>
  </div>`;
}

function wireHazardPanel() {
  document.querySelectorAll('.sim-hz').forEach(el => el.addEventListener('change', () => {
    hazards[el.dataset.side][el.dataset.kind] = el.checked;
  }));
  document.querySelectorAll('.sim-hz-num').forEach(el => el.addEventListener('change', () => {
    hazards[el.dataset.side][el.dataset.kind] = parseInt(el.value);
  }));
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

// 状態異常/やどりぎ/のろいのUIをエンジン状態と同期
// (のろい技や設置技がrtを書き換えるため)
function syncBoostUI(side) {
  const rt = getActiveRt(side);
  for (const stat of ['at','df','sa','sd','sp']) {
    const span = document.getElementById(`sim-bst-${side}-${stat}`);
    if (!span) continue;
    const v = rt.boosts[stat] || 0;
    span.textContent = `${v > 0 ? '+' : ''}${v}`;
    span.style.color = v > 0 ? 'var(--ok)' : v < 0 ? 'var(--danger)' : '';
  }
}

function syncStatusInputs(side) {
  const rt = getActiveRt(side);
  const st = document.getElementById(`sim-st-${side}`);
  const ls = document.getElementById(`sim-ls-${side}`);
  const cs = document.getElementById(`sim-cs-${side}`);
  if (st) st.value = rt.status;
  if (ls) ls.checked = rt.leechSeed;
  if (cs) cs.checked = rt.cursed;
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
  syncStatusInputs('a');
  syncStatusInputs('b');
  syncBoostUI('a');
  syncBoostUI('b');
  appendNewLogs();
  const resEl = document.getElementById('sim-result');
  if (resEl) resEl.innerHTML = renderLastTurn();
  const undoBtn = document.getElementById('sim-undo');
  if (undoBtn) undoBtn.disabled = !canUndo();
}

// ===== LOG =====
function renderLog() {
  if (!battle) return '';
  _logRendered = battle.log.length;
  const entries = battle.log.length > 100 ? battle.log.slice(-100) : battle.log;
  return entries.map(e =>
    `<div class="sim-turn-entry${e.isHeader ? ' turn-header' : ''}">${e.cls ? `<span class="${e.cls}">` : ''}${esc(e.text)}${e.cls ? '</span>' : ''}</div>`
  ).join('');
}
