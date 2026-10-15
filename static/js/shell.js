// Apply appearance before first paint; keep saved preferences optional.
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try { preference = localStorage.getItem('pokechamp-theme'); } catch {}
  const apply = theme => {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#17191d' : '#ffffff';
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.textContent = theme === 'dark' ? 'ライト表示' : 'ダーク表示';
      button.setAttribute('aria-label', `${theme === 'dark' ? 'ライト' : 'ダーク'}モードに切り替え`);
    }
  };
  const preferred = () => preference === 'light' || preference === 'dark' ? preference : media.matches ? 'dark' : 'light';
  apply(preferred());
  media.addEventListener('change', () => apply(preferred()));
  window.addEventListener('storage', event => {
    if (event.key !== 'pokechamp-theme') return;
    preference = event.newValue;
    apply(preferred());
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply(preferred());
    document.getElementById('theme-toggle').addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(preference);
      try { localStorage.setItem('pokechamp-theme', preference); } catch {}
    });
    // Existing editors use visual labels; associate them with their controls too.
    const labelControls = () => {
      document.querySelectorAll('label:not([for])').forEach(label => {
        if (label.querySelector('input, select, textarea')) return;
        const next = label.nextElementSibling;
        const control = next?.matches('input, select, textarea') ? next : next?.querySelector('input:not([type=hidden]), select, textarea');
        if (control?.id) label.htmlFor = control.id;
      });
      document.querySelectorAll('.sp-row').forEach(row => {
        const label = row.querySelector('.sp-label')?.textContent;
        const input = row.querySelector('input');
        if (input && label) input.setAttribute('aria-label', `${label}のSP配分`);
        row.querySelectorAll('.sp-btn').forEach(button => {
          const action = button.dataset.act;
          button.setAttribute('aria-label', `${label}のSPを${action === '+' ? '1増やす' : action === '-' ? '1減らす' : action + 'にする'}`);
        });
      });
      document.querySelectorAll('input[id*="-move-"]').forEach(input => {
        if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', `わざ${Number(input.id.split('-').pop()) + 1}`);
      });
    };
    labelControls();
    new MutationObserver(labelControls).observe(document.body, { childList: true, subtree: true });
  });
})();
