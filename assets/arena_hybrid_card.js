// Arena hybrid card — the Instinct (hybrid) lane's registered arms.
// The site law: a hand-typed number is a defect. The card shell is static
// HTML (arena/index.html, placed directly before the raw board — the raw
// board is always the last card); this module fills EVERY [data-hybrid-arms]
// on the page from ONE fetch of data/bench.json, the same file /bench/ and
// the TL;DR render from.
(function () {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => (x * 100).toFixed(1) + "%";
  // sub-millisecond lanes print µs — "0.002 ms" hides the order of magnitude
  const fmtLat = (x) => (x < 1 ? `${(x * 1000).toFixed(x * 1000 < 10 ? 2 : 0)} µs`
    : x < 10 ? `${x.toFixed(2)} ms` : `${Math.round(x)} ms`);

  function fill(el, html) { el.innerHTML = html; }

  function render(bench) {
    const rows = (bench.suites || [])
      .filter((s) => s.hybrid)
      .map((s) => {
        const h = s.hybrid;
        const acc = h.hard && h.hard.accuracy;
        const lat = h.latency_p50_ms;
        // The edge Instinct sells per domain: its accuracy over free Reflex's
        // on the same questions — a gap renders as a gap, never hidden.
        const km = s.modelless && s.modelless.hard && s.modelless.hard.accuracy;
        const edge = acc != null && km != null ? (acc - km) * 100 : null;
        return "<li>" +
          `<b>${esc(s.name)}</b>` +
          `<span class="arm">${esc(h.model || "registered arm")}</span>` +
          (acc != null ? `<span class="acc">acc ${esc(pct(acc))}</span>` : "") +
          (edge != null ? `<span class="edge ${edge > 0 ? "up" : "down"}">${edge > 0 ? "+" : ""}${edge.toFixed(1)} pt vs Reflex</span>` : "") +
          (lat != null ? `<span class="lat">${esc(fmtLat(lat))} p50</span>` : "") +
          (typeof h.consult_rate === "number"
            ? `<span class="consult">specialist consulted ${(h.consult_rate * 100).toFixed(0)}%</span>` : "") +
          "</li>";
      });
    const cards = document.querySelectorAll("[data-hybrid-arms]");
    if (!cards.length) return;
    if (!rows.length) {
      for (const el of cards) fill(el, '<p class="sub">the benchmark carries no hybrid arm — see <a href="/bench/">the tables</a>.</p>');
      return;
    }
    const html = `<ul>${rows.join("")}</ul>`;
    for (const el of cards) fill(el, html);
  }

  fetch("/data/bench.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(render)
    .catch((e) => {
      for (const el of document.querySelectorAll("[data-hybrid-arms]")) {
        el.innerHTML = `<p class="sub">benchmark data unavailable (${esc(e.message)}) — see <a href="/bench/">the tables</a>.</p>`;
      }
    });
})();
