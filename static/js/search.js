// Pokemon Champions Calculator - Web検索ページ
// 構築記事・トレンドを傍らでググる導線。編成の合間に切り替えて使う。

let built = false;

export function initSearchPage() {
  if (built) return;
  built = true;
  const page = document.getElementById('page-search');
  page.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center;gap:6px">
        <input type="search" id="search-q" placeholder="構築・トレンドを調べる" style="flex:1" enterkeyhint="search" autocomplete="off">
        <button class="btn" id="search-go">検索</button>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:.78rem;color:var(--fg2)">
        <input type="checkbox" id="search-scope" checked> 「ポケモンチャンピオンズ 構築」を添える
      </label>
    </div>
    <div class="card">
      <div style="font-size:.78rem;color:var(--fg2);margin-bottom:6px">よく使う</div>
      <div class="row" style="flex-wrap:wrap;gap:6px" id="search-presets">
        <button class="btn btn-sm btn-outline" data-q="ポケモンチャンピオンズ 構築 まとめ">構築まとめ</button>
        <button class="btn btn-sm btn-outline" data-q="ポケモンチャンピオンズ 使用率 ランキング">使用率</button>
        <button class="btn btn-sm btn-outline" data-q="ポケモンチャンピオンズ 最強 トレンド">トレンド</button>
        <button class="btn btn-sm btn-outline" data-q="ポケモンチャンピオンズ パーティ 対策">対策</button>
      </div>
    </div>
  `;

  const q = document.getElementById('search-q');
  const run = (raw) => {
    const term = (raw !== undefined ? raw : q.value).trim();
    if (!term) return;
    const scoped = document.getElementById('search-scope').checked;
    // プリセットは既にキーワードを含むので素通し、手入力だけスコープ語を添える
    const query = (scoped && raw === undefined) ? `${term} ポケモンチャンピオンズ 構築` : term;
    window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank', 'noopener');
  };

  document.getElementById('search-go').addEventListener('click', () => run());
  q.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  document.querySelectorAll('#search-presets button').forEach(btn => {
    btn.addEventListener('click', () => run(btn.dataset.q));
  });
}
