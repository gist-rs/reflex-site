/* The KAT network env toggle — the reflex-site embed (Plan 042 T3, dapps
 * Plan 042's "shipped once" component, the same contract the kat-service
 * pages render server-side: the PATH /devnet entry (this site's
 * _redirects rule carries it), the QUERY ?env=devnet canonical carrier,
 * the #devnet free alias, localStorage stickiness, the sticky header.
 * Self-mounting: one <script src> line per page, no markup required.
 *
 * Exposes window.KAT_ENV ('mainnet'|'devnet') and window.KAT_API_BASE
 * ('https://ai.gist.rs' | 'https://devnet.ai.gist.rs') for widgets; the
 * toggle only ever switches which API BASE widgets call — never the
 * ledger workers' own hostnames.
 * */
(function () {
  var q = new URLSearchParams(location.search).get('env');
  var h = location.hash === '#devnet';
  var stored = null;
  try { stored = localStorage.getItem('kat_env'); } catch (e) { /* private mode */ }
  var env = (q === 'devnet' || h || stored === 'devnet') ? 'devnet' : 'mainnet';
  if (q === 'devnet' || h) {
    try { localStorage.setItem('kat_env', 'devnet'); } catch (e) { /* as above */ }
    if (h) history.replaceState(null, '', location.pathname + location.search);
  } else if (!q && stored !== 'devnet') {
    try { localStorage.removeItem('kat_env'); } catch (e) { /* as above */ }
  }
  window.KAT_ENV = env;
  window.KAT_API_BASE = env === 'devnet'
    ? 'https://devnet.ai.gist.rs'
    : 'https://ai.gist.rs';

  var clean = location.pathname.split(['?', '#'])[0] || '/';
  var bar = document.createElement('div');
  bar.id = 'kat-env-toggle';
  bar.className = 'kat-env-toggle ' + env;
  bar.innerHTML =
    '<span class="kat-env-dot"></span>' +
    '<span>env: <b>' + env + '</b></span>' +
    '<a href="/devnet" data-to-devnet>switch to devnet</a>' +
    '<a href="' + clean + '" data-to-mainnet>back to mainnet</a>';
  var style = document.createElement('style');
  style.textContent =
    '.kat-env-toggle{position:sticky;top:0;z-index:50;display:flex;gap:10px;align-items:center;justify-content:center;background:#161b22;border:1px solid #30363d;border-radius:0 0 10px 10px;padding:6px 14px;font-size:12px;color:#8b949e;max-width:30rem;margin:0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}' +
    '.kat-env-toggle b{color:#e6edf3}' +
    '.kat-env-dot{width:8px;height:8px;border-radius:999px;background:#3fb950;flex:none}' +
    '.kat-env-toggle.devnet .kat-env-dot{background:#388bfd}' +
    '.kat-env-toggle.devnet b{color:#79c0ff}' +
    '.kat-env-toggle a{color:#58a6ff;text-decoration:none;border:1px solid #30363d;border-radius:999px;padding:1px 10px;font-size:11px}' +
    '.kat-env-toggle a:hover{border-color:#8b949e}' +
    '.kat-env-toggle [data-to-devnet],.kat-env-toggle [data-to-mainnet]{display:none}' +
    '.kat-env-toggle.mainnet [data-to-devnet]{display:inline-flex}' +
    '.kat-env-toggle.devnet [data-to-mainnet]{display:inline-flex}';
  document.head.appendChild(style);
  document.body.insertBefore(bar, document.body.firstChild);
  bar.dispatchEvent(new CustomEvent('kat-env', { detail: { env: env, base: window.KAT_API_BASE } }));
})();
