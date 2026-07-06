// Pokemon Champions - Battle Simulator: 手動調整パネル (フィールド効果 / 設置技)
// sim.js から分離。描画(renderXxx)とイベント配線(wireXxx)のペア。
// 変更後の再描画のため renderBattle を sim.js から参照する（循環importだが
// 呼び出しはハンドラ内=遅延評価なので安全）。
import { field, fieldTurns, hazards, simOptions, SCREEN_JA, weatherRockTurns, addLog } from './battle-engine.js';
import { renderBattle } from './sim.js';

// ===== FIELD PANEL (天候/フィールド/トリル/重力/追い風/壁/自動判定オプション) =====
export function renderFieldPanel() {
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

export function wireFieldPanel() {
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

// ===== HAZARD PANEL (ステルスロック/まきびし/どくびし) =====
export function renderHazardPanel() {
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

export function wireHazardPanel() {
  document.querySelectorAll('.sim-hz').forEach(el => el.addEventListener('change', () => {
    hazards[el.dataset.side][el.dataset.kind] = el.checked;
  }));
  document.querySelectorAll('.sim-hz-num').forEach(el => el.addEventListener('change', () => {
    hazards[el.dataset.side][el.dataset.kind] = parseInt(el.value);
  }));
}
