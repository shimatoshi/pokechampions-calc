// 技固有効果レジストリ — 1技1エントリで全効果を一元管理
// (以前は damage.js の4関数 + battle-engine.js のif連鎖に同じ技名条件が散在していた)
//
// 依存なし(最下層)。dataやDOMには触れない。
//
// エントリのキー(全てoptional):
//   stats:    { atkStat, atkSide, defStat } — ダメージ計算で参照するステータスの差し替え
//             atkStat: 攻撃側が使うステータス('df'等)。省略時は分類通り(at/sa)
//             atkSide: 'defender'なら相手のステータス+ランクで殴る(イカサマ)
//             defStat: 防御側ステータスの差し替え('df'等。サイコショック系)
//   bp:       (bp, ctx) => 新しい威力。ctx={attacker, defender, field}
//   typeEff:  (eff, ctx) => 相性倍率の補正。ctx={defTypes}
//   note:     string | (ctx) => string — ダメ計結果に出す説明。ctx={defender, defTypes, field}
//   fixedDamage: (ctx) => 数値 — 通常式をバイパスする固定ダメージ。
//             ctx={attacker, defender, atkStats, defStats, atkCurHP, defCurHP}
//   selfFaintOnHit: true — 命中後に自分が瀕死(いのちがけ)
//   counter:  { cat: 'Physical'|'Special'|'any', mult } — 被ダメ依存の反射技(シミュ専用)。
//             ダメ計画面では計算不可ノートを表示
//   statusMove: (ctx) => void — bp0変化技のシミュ内効果。
//             ctx={atkRt, defRt, atkLabel, defLabel, moveJa, log, atkTypes}
//   afterHit: (ctx) => void — ダメージ適用後のシミュ内効果(もえつきる等)。
//             ctx={atkRt, defRt, atkLabel, defLabel, log}

export const MOVE_EFFECTS = {
  // ===== ステータス参照先の差し替え =====
  'Body Press': {
    stats: { atkStat: 'df' },
    note: '防御でダメージ計算',
  },
  'Foul Play': {
    stats: { atkSide: 'defender' },
    note: '相手の攻撃でダメージ計算',
  },
  'Psyshock':     { stats: { defStat: 'df' }, note: '相手の防御にダメージ' },
  'Psystrike':    { stats: { defStat: 'df' }, note: '相手の防御にダメージ' },
  'Secret Sword': { stats: { defStat: 'df' }, note: '相手の防御にダメージ' },

  // ===== 威力補正 =====
  'Knock Off': {
    bp: (bp, { defender }) => defender.item ? Math.floor(bp * 1.5) : bp,
    note: ({ defender }) => defender.item ? 'アイテム所持で威力1.5倍' : '',
  },
  'Hex': {
    bp: (bp, { defender }) => defender.status ? bp * 2 : bp,
    note: ({ defender }) => defender.status ? '状態異常で威力2倍' : '',
  },
  'Last Respects': {
    bp: (bp, { field }) => bp + 50 * (field?.faintedCount || 0),
    note: ({ field }) => field?.faintedCount > 0 ? `倒れた味方${field.faintedCount}匹で威力+${50 * field.faintedCount}` : '',
  },
  'Rage Fist': {
    bp: (bp, { field }) => bp + 50 * (field?.faintedCount || 0),
    note: ({ field }) => field?.faintedCount > 0 ? `被弾回数として倒れた味方${field.faintedCount}を加算` : '',
  },
  'Expanding Force': {
    bp: (bp, { field }) => field?.terrain === 'Psychic' ? Math.floor(bp * 1.5) : bp,
    note: ({ field }) => field?.terrain === 'Psychic' ? 'サイコフィールドで威力1.5倍' : '',
  },
  'Rising Voltage': {
    bp: (bp, { field }) => field?.terrain === 'Electric' ? bp * 2 : bp,
    note: ({ field }) => field?.terrain === 'Electric' ? 'エレキフィールドで威力2倍' : '',
  },

  // ===== 相性補正 =====
  'Freeze-Dry': {
    typeEff: (eff, { defTypes }) => defTypes.includes('Water') ? eff * 4 : eff, // 水半減(0.5)→抜群(2)で実質×4
    note: ({ defTypes }) => defTypes.includes('Water') ? 'みずタイプに抜群' : '',
  },

  // ===== 定数ダメージ (データ上bp:1で通常式に流れてデタラメな数値が出ていた) =====
  'Seismic Toss': {
    fixedDamage: () => 50, // レベル分 (Champions=Lv50固定)
    note: 'レベル分(50)の固定ダメージ',
  },
  'Night Shade': {
    fixedDamage: () => 50,
    note: 'レベル分(50)の固定ダメージ',
  },
  'Super Fang': {
    fixedDamage: ({ defCurHP }) => Math.max(1, Math.floor(defCurHP / 2)),
    note: '相手の残りHPの半分',
  },
  'Endeavor': {
    fixedDamage: ({ atkCurHP, defCurHP }) => Math.max(0, defCurHP - atkCurHP),
    note: '相手のHPを自分と同じまで削る',
  },
  'Final Gambit': {
    fixedDamage: ({ atkCurHP }) => atkCurHP,
    selfFaintOnHit: true,
    note: '自分の残りHP分のダメージ(自分は瀕死)',
  },

  // ===== 被ダメ依存の反射技 (シミュ内ではターン中の被ダメから計算) =====
  'Counter':    { counter: { cat: 'Physical', mult: 2 },   note: '直前に受けた物理ダメージの2倍(ダメ計では計算不可)' },
  'Mirror Coat': { counter: { cat: 'Special', mult: 2 },   note: '直前に受けた特殊ダメージの2倍(ダメ計では計算不可)' },
  'Metal Burst': { counter: { cat: 'any', mult: 1.5 },     note: '直前に受けたダメージの1.5倍(ダメ計では計算不可)' },

  // ===== 変化技のシミュ内効果 =====
  'Soak': {
    statusMove({ defRt, atkLabel, defLabel, moveJa, log }) {
      defRt.typeOverride = ['Water'];
      log(`${atkLabel}の${moveJa}！ → ${defLabel}はみずタイプになった！`);
    },
  },
  "Forest's Curse": {
    statusMove({ defRt, atkLabel, defLabel, moveJa, log }) {
      defRt.addedType = 'Grass';
      log(`${atkLabel}の${moveJa}！ → ${defLabel}にくさタイプが追加された！`);
    },
  },
  'Trick-or-Treat': {
    statusMove({ defRt, atkLabel, defLabel, moveJa, log }) {
      defRt.addedType = 'Ghost';
      log(`${atkLabel}の${moveJa}！ → ${defLabel}にゴーストタイプが追加された！`);
    },
  },
  'Charge': {
    statusMove({ atkRt, atkLabel, moveJa, log }) {
      atkRt.charged = true;
      log(`${atkLabel}の${moveJa}！ → じゅうでん状態になった！`);
    },
  },
  'Pain Split': {
    statusMove({ atkRt, defRt, atkLabel, defLabel, moveJa, log }) {
      const total = atkRt.hp + defRt.hp;
      const shared = Math.floor(total / 2);
      atkRt.hp = Math.min(atkRt.maxHp, shared);
      defRt.hp = Math.min(defRt.maxHp, shared);
      log(`${atkLabel}の${moveJa}！ → 両者のHPを分け合った`);
      log(`  ${atkLabel}: HP ${atkRt.hp}/${atkRt.maxHp} / ${defLabel}: HP ${defRt.hp}/${defRt.maxHp}`);
    },
  },
  'Curse': {
    statusMove({ atkRt, defRt, atkLabel, defLabel, moveJa, log, atkTypes }) {
      if (atkTypes.includes('Ghost')) {
        const cost = Math.floor(atkRt.maxHp / 2);
        atkRt.hp = Math.max(0, atkRt.hp - cost);
        defRt.cursed = true;
        log(`${atkLabel}の${moveJa}！ → HP-${cost} で${defLabel}をのろった！`, 'dmg-line');
        log(`  ${atkLabel}: HP ${atkRt.hp}/${atkRt.maxHp}`);
      } else {
        log(`${atkLabel}の${moveJa}！ → こうげき・ぼうぎょアップ、すばやさダウン (ランクは手動設定)`);
      }
    },
  },

  // ===== ダメージ適用後の効果 =====
  'Burn Up': {
    afterHit({ atkRt, atkLabel, log }) {
      atkRt.burnedUp = true;
      log(`  ${atkLabel}: ほのおタイプが消滅した！`);
    },
  },
};
