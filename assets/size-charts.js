// size-charts.js — the disk-footprint chart on /#sizes.
//
// Every byte count is read from data/sizes.json at render time (the
// bench.json law: a hand-typed number on this site is a defect), so a
// re-published sizes.json re-draws the chart with no edit here.
//
//   SizeCharts.render(d, el)  → one STACKED bar per candidate (the Apple
//                               storage-bar idiom), data order = ascending
//                               total. The axis is a BROKEN LINEAR axis:
//                               0 … BREAK_AT (1 GB) is linear over the first
//                               LIN_SPAN of the track, so every bar at or
//                               under 1 GB ends exactly at its total and the
//                               small lanes read as small as they are. A
//                               total over BREAK_AT crosses the break — the
//                               bar carries a break sign at the 1 GB line and
//                               its tail runs on a compressed LOG scale
//                               (1 GB … the largest total) over the rest of
//                               the track, so 1.5 GB and 47 GB still read
//                               apart. WITHIN a bar the segments
//                               split by byte SHARE. Each bar's byte labels
//                               sit UNDER it, right-aligned to its end, in
//                               the segment's color; the tooltip carries the
//                               provenance.
//
// Palette: the engine segment follows the runtime's ENVIRONMENT — rust env =
// the site's ember (#d95926), python env = the laya lane blue (#3987e5);
// model = the founding palette's green (#199e70). All three are the founding
// trio, validated all-pairs on the dark surfaces. Each segment carries its
// own tooltip (data-sztip, this module's own handler — never
// bench-charts' data-tip namespace).
(function () {
  "use strict";

  const RUST_COLOR = "#d95926";   // rust env — the site's ember
  const PYTHON_COLOR = "#3987e5"; // python env — the laya lane blue
  const MODEL_COLOR = "#199e70";  // model / weights — the founding palette's green

  // ── formatting (human bytes; SI, like every size a download page shows) ──
  function human(bytes) {
    if (!(typeof bytes === "number" && isFinite(bytes) && bytes >= 0)) return "—";
    if (bytes < 1000) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let v = bytes, i = -1;
    do { v /= 1000; i++; } while (v >= 1000 && i < units.length - 1);
    return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + " " + units[i];
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ── the broken linear axis ───────────────────────────────────────────
  // BREAK_AT is a design threshold (the owner's "over 1 GB earns the break
  // sign"), not a measured number — every byte count still comes from data.
  const BREAK_AT = 1e9;
  const LIN_SPAN = 0.8;                    // share of the track the linear 0…BREAK_AT part gets
  const TAIL_FLOOR = 0.12;                 // min share of the tail zone a past-the-break bar draws
  const totalOf = (c) => (c.engine_bytes || 0) + (c.model_bytes || 0);

  // A 1-2-2.5-5 ceiling, so an all-small data set still gets round ticks.
  function niceCeil(v) {
    if (!(v > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * e) return m * e;
    return 10 * e;
  }

  function scale(d) {
    const max = Math.max(0, ...(d.candidates || []).map(totalOf));
    const broken = max > BREAK_AT;
    const linMax = broken ? BREAK_AT : niceCeil(max);
    const span = broken ? LIN_SPAN : 1;
    const pos = (v) => {
      if (!(v > 0)) return 0;
      if (v <= linMax) return (v / linMax) * span;
      // past the break: a compressed LOG tail over 1 GB … max, floored so the
      // break sign always sits inside the bar (a tail too short to see
      // would put the sign on the bar's tip)
      return span + (1 - span) * Math.max(TAIL_FLOOR, Math.log10(v / linMax) / Math.log10(max / linMax));
    };
    // [position, label, minor] — on a narrow screen the quarter ticks drop their
    // label, and so does the max (it collides with 1 GB; the totals column carries it)
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => [k * span, k === 0 ? "0" : human(k * linMax), k === 0.25 || k === 0.75]);
    if (broken) ticks.push([1, human(max), "max"]);
    return { broken, linMax, span, max, pos, ticks };
  }

  // ── tooltip (own instance, own attribute namespace) ─────────────────────
  let tip = null;
  function tooltip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.className = "bc-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    const show = (e) => {
      const t = e.target.closest && e.target.closest("[data-sztip]");
      if (!t) return hide();
      tip.innerHTML = t.getAttribute("data-sztip");
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

  const provLine = (p) => p ? esc(p.source) + ": " + esc(p.detail) : "";
  const envKind = (c) => (c.engine_kind === "python" ? "python" : "rust");
  const envLabel = (kind) => (kind === "python" ? "python env" : "rust env");
  const tipHtml = (c, which) => {
    const isEngine = which === "engine";
    const bytes = isEngine ? c.engine_bytes : c.model_bytes;
    const what = isEngine ? c.engine_what : c.model_what;
    const prov = isEngine ? c.engine_provenance : c.model_provenance;
    return `<b>${esc(c.name)} · ${isEngine ? envLabel(envKind(c)) : "model / weights"}</b><br>` +
      `<span class="bc-mut">${esc(what)}</span><br>` +
      `<b>${human(bytes)}</b>${!isEngine && bytes === 0 ? " (nothing to download)" : ""}` +
      (prov ? `<br><span class="bc-mut">${provLine(prov)}</span>` : "") +
      `<br><span class="bc-mut">total (engine + model): ${human((c.engine_bytes || 0) + (c.model_bytes || 0))}</span>`;
  };

  function render(d, el) {
    if (!d || !Array.isArray(d.candidates) || !d.candidates.length) {
      el.innerHTML = '<p class="sub">size data unavailable</p>';
      return;
    }
    if (typeof document !== "undefined" && document.body) tooltip();
    const sc = scale(d);
    const grid = sc.ticks.map(([f]) =>
      `<i class="bc-grid${sc.broken && f === sc.span ? " sz-grid-break" : ""}" style="left:${(f * 100).toFixed(2)}%"></i>`).join("");
    const envKindOf = (c) => (c.engine_kind === "python" ? "python" : "rust");
    const colorOf = (which, kind) => (which === "model" ? MODEL_COLOR : kind === "python" ? PYTHON_COLOR : RUST_COLOR);

    const rows = (d.candidates || []).map((c) => {
      const total = totalOf(c);
      const kind = envKindOf(c);
      const chips = (c.targets || []).map((t) => `<span class="sz-chip">${esc(t)}</span>`).join("");
      const parts = [["engine", c.engine_bytes], ["model", c.model_bytes]].filter(([, b]) => b > 0);
      // bar length = the total's position on the broken axis; segments split
      // it by byte share. A non-zero segment keeps a 2px floor (CSS
      // min-width) so a sliver stays hoverable.
      const end = (sc.pos(total) * 100).toFixed(2);
      const seg = ([which, bytes]) =>
        `<i class="sz-seg" tabindex="0" data-sztip="${esc(tipHtml(c, which))}" ` +
        `aria-label="${esc(`${c.name}: ${which === "engine" ? envLabel(kind) : "model"} ${human(bytes)}`)}" ` +
        `style="width:${((bytes / total) * 100).toFixed(3)}%;background:${colorOf(which, kind)}"></i>`;
      const brk = sc.broken && total > sc.linMax
        ? `<i class="sz-break" aria-hidden="true" style="left:${(sc.span * 100).toFixed(2)}%"></i>`
        : "";
      const lbl = ([which, bytes]) =>
        `<span class="sz-lbl sz-lbl-${which}" style="color:${colorOf(which, kind)}">${human(bytes)}</span>`;
      const stack =
        `<div class="bc-hbar sz-stack"><div class="sz-bar" style="width:${end}%">${parts.map(seg).join("")}</div>${brk}</div>` +
        `<div class="sz-lbls" style="width:${end}%">${parts.map(lbl).join("")}</div>`;
      return `<div class="sz-row">` +
        `<div class="bc-hlabel sz-label"><span class="sz-name">${esc(c.name)}</span><span class="sz-chips">${chips}</span></div>` +
        `<div class="bc-htrack">${grid}${stack}</div>` +
        `<div class="bc-val sz-total">${human(total)}</div></div>`;
    }).join("");

    el.innerHTML =
      `<div class="sz-head">` +
      `<div class="bc-legend" aria-label="bar kinds">` +
      `<span><i class="bc-sw" style="background:${RUST_COLOR}"></i>rust env</span>` +
      `<span><i class="bc-sw" style="background:${PYTHON_COLOR}"></i>python env</span>` +
      `<span><i class="bc-sw" style="background:${MODEL_COLOR}"></i>model / weights</span>` +
      `</div></div>` +
      `<div class="sz-grid"><div class="sz-axisrow"><span></span>` +
      `<div class="bc-axis sz-axis">${sc.ticks.map(([f, t, minor]) => `<span${minor ? ` class="sz-tick-${minor === "max" ? "max" : "minor"}"` : ""} style="left:${(f * 100).toFixed(2)}%">${esc(t)}</span>`).join("")}</div>` +
      `<span></span></div>${rows}</div>` +
      (d.meta && d.meta.release
        ? `<p class="bc-note">reflex release <a href="${esc(d.meta.release.url)}">${esc(d.meta.release.tag)}</a> — ` +
          `archives ${human(Math.min(...Object.values(d.meta.release.archives || { x: 0 })))}–${human(Math.max(...Object.values(d.meta.release.archives || { x: 0 })))}` +
          ` · generated ${esc(String(d.meta.date_utc || "").slice(0, 10))}</p>`
        : "") +
      `<p class="bc-note">` + (sc.broken
        ? `Axis is linear up to ${human(sc.linMax)}; a bar past the break sign runs on a compressed log scale ` +
          `(${human(sc.linMax)} … ${human(sc.max)}) — read its size from its label. `
        : `Axis is linear: a bar ends at its total. `) +
      `Inside a bar, the runtime env (rust or python) and the model split by their share of the bytes.</p>`;
  }

  window.SizeCharts = { render, scale, human, BREAK_AT };

  // Self-bootstrap on /#sizes — the app.js bench pattern, kept local so the
  // section is one <script> tag with no app.js coupling.
  async function boot() {
    const el = document.getElementById("size-report");
    if (!el) return;
    let d;
    try {
      const r = await fetch("/data/sizes.json", { cache: "no-store" });
      if (!r.ok) return;
      d = await r.json();
    } catch (e) { return; }
    render(d, el);
    const prov = document.getElementById("sizes-prov");
    if (prov && d.meta && d.meta.date_utc) {
      prov.hidden = false;
      prov.textContent = `measured ${d.meta.date_utc.slice(0, 10)} · release ${d.meta.release ? d.meta.release.tag : "?"} — every number on this chart renders from data/sizes.json, never hand-typed`;
    }
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
