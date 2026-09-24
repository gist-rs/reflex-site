// bench-charts.js — the minimal bar charts on /bench/.
//
// Every number is read from data/bench.json at render time (same rule as the
// tables: a hand-typed number on the site is a defect), so a re-published
// bench.json re-draws the charts with no edit here.
//
//   BenchCharts.hero(d)   → the grouped "all suites × lane" chart at the top
//   BenchCharts.suite(s)  → the per-suite bar table above each suite's table
//
// Palette: three categorical slots validated all-pairs on the site's dark
// surfaces (#140b08 and #1d110c) — CVD ΔE 9.4, normal-vision ΔE 20.9, all
// ≥ 3:1 contrast. Color follows the LANE, never its rank.
(function () {
  "use strict";

  const LANES = [
    { key: "katgpt", label: "KatGPT · modelless", color: "#d95926", match: (l) => l.lane === "KatGPT" || l.model === "modelless" },
    { key: "rust", label: "laya (rust)", color: "#3987e5", match: (l) => l.lane === "laya (rust)" },
    { key: "python", label: "laya (python)", color: "#199e70", match: (l) => l.lane === "laya (python)" },
  ];
  const OTHER = { key: "other", label: "other", color: "#8a7468" };
  const laneOf = (l) => LANES.find((x) => x.match(l)) || OTHER;

  const METRICS = {
    acc: { label: "accuracy", get: (l) => (l.hard || {}).accuracy, log: false },
    acc50: { label: "acc@50% coverage", get: (l) => (l.hard || {}).acc_at_50_coverage, log: false },
    p50: { label: "p50 latency", get: (l) => l.latency_p50_ms, log: true },
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const num = (v) => typeof v === "number" && isFinite(v);
  const pct = (v) => (v * 100).toFixed(1) + "%";
  const lat = (v) => v < 1 ? +(v * 1000).toPrecision(3) + " µs" : v < 1000 ? +v.toPrecision(3) + " ms" : +(v / 1000).toPrecision(3) + " s";
  const fmtOf = (m) => (METRICS[m].log ? lat : pct);

  // One log domain for EVERY latency bar on the page, so a bar in one suite is
  // comparable with a bar in another. Snapped to whole decades.
  let logDomain = [-3, 3];
  function setLogDomain(d) {
    const vs = [];
    for (const s of d.suites || []) for (const l of allLanes(s)) if (num(l.latency_p50_ms) && l.latency_p50_ms > 0) vs.push(l.latency_p50_ms);
    if (vs.length) logDomain = [Math.floor(Math.log10(Math.min(...vs))), Math.ceil(Math.log10(Math.max(...vs)))];
    if (logDomain[1] <= logDomain[0]) logDomain[1] = logDomain[0] + 1;
  }
  const frac = (m, v) => {
    if (!num(v)) return null;
    if (!METRICS[m].log) return Math.max(0, Math.min(1, v));
    if (v <= 0) return 0;
    const [lo, hi] = logDomain;
    return Math.max(0.004, Math.min(1, (Math.log10(v) - lo) / (hi - lo)));
  };
  const ticks = (m) => {
    if (!METRICS[m].log) return [0, 0.25, 0.5, 0.75, 1].map((t) => [t, t * 100 + "%"]);
    const [lo, hi] = logDomain, out = [];
    for (let e = lo; e <= hi; e++) out.push([(e - lo) / (hi - lo), lat(Math.pow(10, e))]);
    return out;
  };

  // Primary-host lanes first, then the fleet merge's extra_host_lanes (tagged).
  function allLanes(s) {
    const out = [];
    if (s.modelless) out.push(s.modelless);
    for (const k of Object.keys(s.laya || {})) out.push(s.laya[k]);
    return out;
  }
  function extraLanes(s) {
    const out = [];
    for (const [host, hl] of Object.entries(s.extra_host_lanes || {})) {
      if (hl.modelless) out.push([hl.modelless, host]);
      for (const k of Object.keys(hl.laya || {})) out.push([hl.laya[k], host]);
    }
    return out;
  }

  // Hero pick: per suite and lane, the best-accuracy NON-multilingual
  // checkpoint on the primary host. Picked once by accuracy, so every metric
  // toggle shows the SAME run (no per-metric cherry-pick).
  function pick(s, lane) {
    let best = null;
    for (const l of allLanes(s)) {
      if (laneOf(l) !== lane || l.model === "multilingual" || !l.hard) continue;
      if (!best || (l.hard.accuracy ?? -1) > (best.hard.accuracy ?? -1)) best = l;
    }
    return best;
  }

  // ── tooltip (one per page) ───────────────────────────────────────────────
  let tip;
  function tooltip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.className = "bc-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    const show = (e) => {
      const t = e.target.closest("[data-tip]");
      if (!t) return hide();
      tip.innerHTML = t.getAttribute("data-tip");
      tip.style.display = "block";
      const r = t.getBoundingClientRect();
      const x = e.clientX ?? r.right, y = e.clientY ?? r.top;
      const w = tip.offsetWidth;
      tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 12)) + "px";
      tip.style.top = Math.max(8, y - tip.offsetHeight - 10) + "px";
    };
    const hide = () => { tip.style.display = "none"; };
    document.addEventListener("mousemove", show);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, { passive: true });
    return tip;
  }

  const tipHtml = (l, extra) => {
    const h = l.hard || {};
    const lane = laneOf(l);
    return `<span class="bc-sw" style="background:${lane.color}"></span><b>${esc(l.lane)} · ${esc(l.model)}</b>${extra ? ` <span class="bc-mut">${esc(extra)}</span>` : ""}<br>` +
      `accuracy ${num(h.accuracy) ? pct(h.accuracy) : "—"} · acc@50cov ${num(h.acc_at_50_coverage) ? pct(h.acc_at_50_coverage) : "—"}<br>` +
      `p50 ${num(l.latency_p50_ms) ? lat(l.latency_p50_ms) : "—"} · p99 ${num(l.latency_p99_ms) ? lat(l.latency_p99_ms) : "—"}` +
      (num(h.n) ? ` · n=${h.n}` : "");
  };

  const legend = () => `<div class="bc-legend" aria-label="lanes">${LANES.map((x) =>
    `<span><i class="bc-sw" style="background:${x.color}"></i>${esc(x.label)}</span>`).join("")}</div>`;

  const axis = (m) => `<div class="bc-axis">${ticks(m).map(([f, t]) =>
    `<span style="left:${(f * 100).toFixed(2)}%">${esc(t)}</span>`).join("")}</div>`;
  const grid = (m) => ticks(m).map(([f]) => `<i class="bc-grid" style="left:${(f * 100).toFixed(2)}%"></i>`).join("");

  // ── hero: every suite × three lanes ──────────────────────────────────────
  let heroData = null, heroMetric = "acc";

  function heroBody() {
    const d = heroData, m = heroMetric, M = METRICS[m], f = fmtOf(m);
    const rows = (d.suites || []).map((s) => {
      const bars = LANES.map((lane) => {
        const l = pick(s, lane);
        const v = l ? M.get(l) : null;
        const fr = frac(m, v);
        if (fr === null) return `<div class="bc-hbar bc-none">${esc(lane.label)} — not run</div>`;
        return `<div class="bc-hbar" tabindex="0" data-tip="${esc(`<span class="bc-mut">${esc(s.name)}</span><br>` + tipHtml(l))}" aria-label="${esc(`${s.name} ${lane.label} ${l.model}: ${f(v)}`)}">` +
          `<i style="width:${(fr * 100).toFixed(2)}%;background:${lane.color}"></i></div>`;
      }).join("");
      return `<a class="bc-hlabel" href="#suite-${esc(s.name)}">${esc(s.name)}</a><div class="bc-htrack">${grid(m)}${bars}</div>`;
    }).join("");
    const picks = new Set();
    for (const s of d.suites || []) for (const lane of LANES.slice(1)) { const l = pick(s, lane); if (l && l.model !== "english") picks.add(`${l.model} on ${s.name}`); }
    const note = `laya bars use each suite's best non-multilingual checkpoint${picks.size ? ` (${[...picks].join(", ")}; english elsewhere)` : " (english)"}. ` +
      `Multilingual rows${d.suites.some((s) => s.extra_host_lanes) ? " and other hosts" : ""} stay in the tables below.` +
      (M.log ? " Latency is log-scale (each gridline = 10×) — shorter is faster." : " Chance level differs per suite — compare lanes within a row, not rows with each other.");
    return `<div class="bc-hgrid"><div></div>${axis(m)}${rows}<div></div>${axis(m)}</div><p class="bc-note">${esc(note)}</p>`;
  }

  function hero(d) {
    const el = document.getElementById("bench-hero");
    if (!el || !d || !d.suites) return;
    heroData = d;
    setLogDomain(d);
    const q = new URLSearchParams(location.search).get("m"); // shareable view: /bench/?m=p50
    if (METRICS[q]) heroMetric = q;
    tooltip();
    const btns = Object.entries(METRICS).map(([k, M]) =>
      `<button type="button" data-metric="${k}" aria-pressed="${k === heroMetric}">${esc(M.label)}${M.log ? " (log)" : ""}</button>`).join("");
    el.innerHTML = `<div class="bc-bar">${legend()}<div class="bc-toggle" role="group" aria-label="metric">${btns}</div></div><div id="bench-hero-body">${heroBody()}</div>`;
    el.querySelector(".bc-toggle").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-metric]");
      if (!b) return;
      heroMetric = b.dataset.metric;
      for (const x of el.querySelectorAll("button[data-metric]")) x.setAttribute("aria-pressed", x === b);
      document.getElementById("bench-hero-body").innerHTML = heroBody();
    });
  }

  // ── per-suite bar table: one row per table row, accuracy | p50 ──────────
  function cell(m, l, extra) {
    const v = METRICS[m].get(l), fr = frac(m, v);
    if (fr === null) return `<div class="bc-cell bc-none">—</div>`;
    return `<div class="bc-cell" tabindex="0" data-tip="${esc(tipHtml(l, extra))}"><i style="width:calc((100% - 64px) * ${fr.toFixed(4)});background:${laneOf(l).color}"></i><span>${esc(fmtOf(m)(v))}</span></div>`;
  }

  function suite(s) {
    const rows = allLanes(s).map((l) => [l, null]).concat(extraLanes(s));
    if (!rows.length) return "";
    return `<div class="bc-suite" aria-label="${esc(s.name)} lanes compared">` +
      `<div class="bc-sh"></div><div class="bc-sh">accuracy</div><div class="bc-sh">p50 latency · log · shorter is faster</div>` +
      rows.map(([l, host]) =>
        `<div class="bc-slabel"><i class="bc-sw" style="background:${laneOf(l).color}"></i>${esc(l.lane)} · ${esc(l.model)}${host ? ` <span class="bc-mut">@${esc(host)}</span>` : ""}</div>` +
        cell("acc", l, host ? "@" + host : "") + cell("p50", l, host ? "@" + host : "")).join("") +
      `</div>`;
  }

  window.BenchCharts = { hero, suite, setLogDomain };
})();
