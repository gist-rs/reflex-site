// size-charts.js — the disk-footprint chart on /#sizes.
//
// Every byte count is read from data/sizes.json at render time (the
// bench.json law: a hand-typed number on this site is a defect), so a
// re-published sizes.json re-draws the chart with no edit here.
//
//   SizeCharts.render(d, el)  → one STACKED bar per candidate on a shared
//                               log axis (92 KB … 47 GB is six decades — a
//                               linear axis would flatten everything but the
//                               largest), data order = ascending total. The
//                               bar's right edge IS the total on the log
//                               axis; WITHIN the bar the segments split by
//                               byte SHARE (linear), so an 846 MB model on a
//                               5 MB engine reads as ~99% of its bar. (The
//                               earlier cumulative-edge split gave the engine
//                               every decade from the axis floor up to its own
//                               bytes, so a 5 MB engine out-drew an 846 MB
//                               model.) Each segment carries its bytes as an
//                               on-bar label when the label fits, and in its
//                               tooltip always.
//
// Palette: engine = the site's ember (the Reflex · modelless lane color), model = the
// laya lane blue — both already validated on the dark surfaces. Each
// segment carries its own tooltip (data-sztip, this module's own handler — never
// bench-charts' data-tip namespace).
(function () {
  "use strict";

  const ENGINE_COLOR = "#d95926";
  const MODEL_COLOR = "#3987e5";

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

  // ── the log axis: ticks at each decade spanning the data ────────────────
  function domain(d) {
    let lo = Infinity, hi = 0;
    for (const c of d.candidates || []) {
      for (const v of [c.engine_bytes, c.model_bytes]) {
        if (v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
      hi = Math.max(hi, (c.engine_bytes || 0) + (c.model_bytes || 0));
    }
    if (!isFinite(lo) || lo <= 0) lo = 1;
    if (hi <= lo) hi = lo * 1000;
    return [Math.floor(Math.log10(lo)), Math.ceil(Math.log10(hi))];
  }
  const frac = (v, [lo, hi]) =>
    v <= 0 ? 0 : Math.max(0.004, Math.min(1, (Math.log10(v) - lo) / (hi - lo)));
  const tickVals = ([lo, hi]) => {
    const out = [];
    for (let e = lo; e <= hi; e++) out.push(Math.pow(10, e));
    return out;
  };

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
  const tipHtml = (c, which) => {
    const isEngine = which === "engine";
    const bytes = isEngine ? c.engine_bytes : c.model_bytes;
    const what = isEngine ? c.engine_what : c.model_what;
    const prov = isEngine ? c.engine_provenance : c.model_provenance;
    return `<b>${esc(c.name)} · ${isEngine ? "runtime / engine" : "model / weights"}</b><br>` +
      `<span class="bc-mut">${esc(what)}</span><br>` +
      `<b>${human(bytes)}</b>${!isEngine && bytes === 0 ? " (nothing to download)" : ""}` +
      (prov ? `<br><span class="bc-mut">${provLine(prov)}</span>` : "") +
      `<br><span class="bc-mut">total (engine + model): ${human((c.engine_bytes || 0) + (c.model_bytes || 0))}</span>`;
  };

  // Hide an on-bar label that does not fit its segment (a clipped "8…" reads
  // as a different number); the tooltip still carries it. Re-run on resize.
  function fitLabels(el) {
    if (typeof el.querySelectorAll !== "function") return;
    for (const l of el.querySelectorAll(".sz-lbl")) {
      l.style.visibility = "";
      const seg = l.parentElement;
      l.style.visibility = l.scrollWidth + 6 <= seg.clientWidth ? "" : "hidden";
    }
  }
  const observed = new WeakSet();

  function render(d, el) {
    if (!d || !Array.isArray(d.candidates) || !d.candidates.length) {
      el.innerHTML = '<p class="sub">size data unavailable</p>';
      return;
    }
    if (typeof document !== "undefined" && document.body) tooltip();
    const dom = domain(d);
    const ticks = tickVals(dom).map((v) => [frac(v, dom), human(v)]);
    const grid = ticks.map(([f]) => `<i class="bc-grid" style="left:${(f * 100).toFixed(2)}%"></i>`).join("");

    const rows = (d.candidates || []).map((c) => {
      const total = (c.engine_bytes || 0) + (c.model_bytes || 0);
      const chips = (c.targets || []).map((t) => `<span class="sz-chip">${esc(t)}</span>`).join("");
      // bar length = log position of the total; segments split it by byte
      // share (see header). A non-zero segment keeps a 2px floor (CSS
      // min-width) so a sliver stays hoverable.
      const totalEdge = frac(total, dom);
      const seg = (which, bytes) =>
        `<i class="sz-seg" tabindex="0" data-sztip="${esc(tipHtml(c, which))}" ` +
        `aria-label="${esc(`${c.name}: ${which === "engine" ? "runtime" : "model"} ${human(bytes)}`)}" ` +
        `style="width:${((bytes / total) * 100).toFixed(3)}%;background:${which === "engine" ? ENGINE_COLOR : MODEL_COLOR}">` +
        `<span class="sz-lbl">${human(bytes)}</span></i>`;
      const stack =
        `<div class="bc-hbar sz-stack"><div class="sz-bar" style="width:${(totalEdge * 100).toFixed(2)}%">` +
        (c.engine_bytes > 0 ? seg("engine", c.engine_bytes) : "") +
        (c.model_bytes > 0 ? seg("model", c.model_bytes) : "") +
        `</div></div>`;
      return `<div class="sz-row">` +
        `<div class="bc-hlabel sz-label"><span class="sz-name">${esc(c.name)}</span><span class="sz-chips">${chips}</span></div>` +
        `<div class="bc-htrack">${grid}${stack}</div>` +
        `<div class="bc-val sz-total">${human(total)}</div></div>`;
    }).join("");

    el.innerHTML =
      `<div class="sz-head">` +
      `<div class="bc-legend" aria-label="bar kinds">` +
      `<span><i class="bc-sw" style="background:${ENGINE_COLOR}"></i>runtime / engine</span>` +
      `<span><i class="bc-sw" style="background:${MODEL_COLOR}"></i>model / weights</span>` +
      `</div><div class="bc-axis sz-axis">${ticks.map(([f, t]) => `<span style="left:${(f * 100).toFixed(2)}%">${esc(t)}</span>`).join("")}</div></div>` +
      `<div class="sz-grid">${rows}</div>` +
      (d.meta && d.meta.release
        ? `<p class="bc-note">reflex release <a href="${esc(d.meta.release.url)}">${esc(d.meta.release.tag)}</a> — ` +
          `archives ${human(Math.min(...Object.values(d.meta.release.archives || { x: 0 })))}–${human(Math.max(...Object.values(d.meta.release.archives || { x: 0 })))}` +
          ` · generated ${esc(String(d.meta.date_utc || "").slice(0, 10))}</p>`
        : "") +
      `<p class="bc-note">Axis is log-scale (each gridline 10×): a bar ends at its total. ` +
      `Inside a bar, runtime and model split by their share of the bytes.</p>`;
    fitLabels(el);
    if (typeof ResizeObserver !== "undefined" && !observed.has(el)) {
      observed.add(el);
      new ResizeObserver(() => fitLabels(el)).observe(el);
    }
  }

  window.SizeCharts = { render, domain, frac, human };

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
