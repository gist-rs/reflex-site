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
//                               apart. WITHIN a bar the segments split by
//                               byte SHARE. Each bar's byte labels sit UNDER
//                               it, right-aligned to its end, in the
//                               segment's color; the tooltip carries the
//                               stack as color-labeled bullets.
//
// Model stack: a row's `model_stack` (publish_sizes.py — the recorded
// measurement's own per-file values) splits the model segment into
// SUB-SEGMENTS, one color per component kind, so "Rethink · encoder arm"
// reads as encoder checkpoint + three trained heads and "Instinct · trained
// specialists" as its six specialist files at a glance — not one green
// block behind a wall of provenance text.
//
// Tap-to-expand: hover tooltips have no touch equivalent, so every bar (and
// Enter/Space on a focused one) toggles a detail block UNDER its row — a
// BREAKDOWN CHART (one labeled bar per engine_stack / model_stack part, by
// side) with the per-source provenance and the row note folded into a
// collapsed list beneath it, never a joined "a B (…) + b B (…)" wall. Mobile
// reads the same content by tapping; the caret in the totals column marks it.
//
// Palette: the engine segment follows the runtime's ENVIRONMENT — rust env =
// the site accent (family --accent, #ff8a3d), python env = the laya lane blue (#3987e5);
// model = the founding palette's green (#199e70). All three are the founding
// trio, validated all-pairs on the dark surfaces. Stack kinds extend it:
// the encoder checkpoint wears the Rethink violet, a trained specialist the
// Instinct magenta, a trained head a cyan — each read against the same
// dark surfaces. Each segment carries its own tooltip (data-sztip, this
// module's own handler — never bench-charts' data-tip namespace).
(function () {
  "use strict";

  // rust env — the site's accent (the family --accent token; Reflex orange)
  const RUST_COLOR = (function () {
    try { return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff8a3d"; } catch (_) { return "#ff8a3d"; }
  })();
  const PYTHON_COLOR = "#3987e5"; // python env — the laya lane blue
  const MODEL_COLOR = "#199e70";  // model / weights — the founding palette's green

  // The special-stack palette (the model side's component colors). Kinds
  // are emitted by publish_sizes.py; the two family kinds reuse their
  // product lanes' hues (Rethink violet / Instinct magenta) so a stack
  // segment reads as the product it belongs to.
  const STACK_COLORS = {
    encoder: "#a98bfa",    // encoder checkpoint — the Rethink violet
    specialist: "#f472b6", // trained specialist — the Instinct magenta
    head: "#22d3ee",       // trained head over an encoder — cyan
    weights: "#199e70",    // plain model weights — the founding model green
  };
  const STACK_LABELS = {
    encoder: "encoder checkpoint",
    specialist: "trained specialist",
    head: "trained head",
    weights: "model / weights",
  };
  // An unknown kind still renders (data newer than this palette): a stable
  // string hash picks a fallback slot, so the same kind is always the same
  // color on every row and every reload.
  const STACK_FALLBACK = ["#e0b34d", "#5aa9e6", "#c792ea", "#66bb6a"];
  function stackColor(kind) {
    if (STACK_COLORS[kind]) return STACK_COLORS[kind];
    let h = 0;
    for (const ch of String(kind)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return STACK_FALLBACK[h % STACK_FALLBACK.length];
  }
  const stackLabel = (kind) => STACK_LABELS[kind] || String(kind);

  // The row's model components: the published stack, else one generic leaf
  // (an un-re-published sizes.json still renders, bullets included).
  function stackOf(c) {
    if (Array.isArray(c.model_stack) && c.model_stack.length) return c.model_stack;
    return c.model_bytes > 0
      ? [{ label: "model / weights", kind: "weights", bytes: c.model_bytes }]
      : [];
  }

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
  const envColor = (kind) => (kind === "python" ? PYTHON_COLOR : RUST_COLOR);

  // The stack bullets — color swatch + label + bytes per component, the
  // what-line under the last bullet of each side. Shared by the hover
  // tooltip (short) and the expanded detail (full, below).
  function bulletList(c, comps) {
    const li = [];
    if (c.engine_bytes > 0)
      li.push(`<li><i class="bc-sw" style="background:${envColor(envKind(c))}"></i>` +
        `<b>${envLabel(envKind(c))}</b> · ${human(c.engine_bytes)}` +
        `<br><span class="bc-mut">${esc(c.engine_what || "")}</span></li>`);
    comps.forEach((comp, i) => {
      const last = i === comps.length - 1;
      li.push(`<li><i class="bc-sw" style="background:${stackColor(comp.kind)}"></i>` +
        `<b>${esc(comp.label || stackLabel(comp.kind))}</b> · ${human(comp.bytes)}` +
        (last && c.model_what ? `<br><span class="bc-mut">${esc(c.model_what)}</span>` : "") +
        `</li>`);
    });
    return `<ul class="sz-tip">${li.join("")}</ul>`;
  }

  // The hover tooltip: the full stack as bullets + the total + the sources
  // (short forms — the long provenance lines live in the expanded detail,
  // which is where touch readers land anyway).
  const tipHtml = (c, comps) => {
    const provs = [c.engine_provenance, c.model_provenance].filter(Boolean)
      .map((p) => esc(p.source)).filter((s, i, a) => a.indexOf(s) === i);
    return `<b>${esc(c.name)}</b>` + bulletList(c, comps) +
      `<b>total (engine + model): ${human(totalOf(c))}</b>` +
      (provs.length ? `<br><span class="bc-mut">${provs.join(" · ")}</span>` : "") +
      `<br><span class="bc-mut">click the bar for the full breakdown</span>`;
  };

  // ── the expanded detail: a breakdown CHART, not a wall of provenance ──
  // One labeled bar per measured part (publish_sizes.py engine_stack /
  // model_stack), grouped by side. Bars scale within their side (so a
  // 1.8 MB dataset next to a 7.9 MB binary still reads); the value column
  // carries bytes + share of the ROW total, so cross-side size is never
  // implied by bar length. The provenance (what / when / host / how per
  // source) and the row note fold into a collapsed list under the chart.

  // The side's parts: the published stack, else one leaf for the side (an
  // older sizes.json still renders a one-bar chart).
  function partsOf(c, side) {
    const st = side === "engine" ? c.engine_stack : stackOf(c);
    if (Array.isArray(st) && st.length) return st;
    const b = c[side + "_bytes"];
    return b > 0 ? [{ label: side === "engine" ? envLabel(envKind(c)) : "model / weights", kind: side, bytes: b, src: 0 }] : [];
  }
  // The side's structured sources (provenance `parts`), else the flat line.
  function sourcesOf(p) {
    if (!p) return [];
    return Array.isArray(p.parts) && p.parts.length ? p.parts : [{ source: p.source, what: p.detail }];
  }
  const pct = (b, total) => {
    const v = total > 0 ? (b / total) * 100 : 0;
    return v >= 10 ? v.toFixed(0) + "%" : v >= 0.1 ? v.toFixed(1) + "%" : "<0.1%";
  };

  function sideChart(c, side, total) {
    const parts = partsOf(c, side);
    if (!parts.length) return "";
    const bytes = c[side + "_bytes"];
    const color = (f) => side === "engine" ? envColor(envKind(c)) : stackColor(f.kind);
    const head = side === "engine"
      ? `<i class="bc-sw" style="background:${envColor(envKind(c))}"></i>${envLabel(envKind(c))} (runtime)`
      : `<i class="bc-sw" style="background:${MODEL_COLOR}"></i>model / weights`;
    const what = side === "engine" ? c.engine_what : c.model_what;
    const max = Math.max(...parts.map((f) => f.bytes));
    const rows = parts.map((f) =>
      `<div class="sz-bd-row">` +
      `<span class="sz-bd-lbl">${esc(f.label || stackLabel(f.kind))}</span>` +
      `<span class="sz-bd-val">${human(f.bytes)} <span class="bc-mut">· ${pct(f.bytes, total)}</span></span>` +
      `<span class="sz-bd-track"><i style="width:${((f.bytes / max) * 100).toFixed(2)}%;background:${color(f)}"></i></span>` +
      `</div>`).join("");
    return `<div class="sz-bd-side">` +
      `<div class="sz-bd-head"><span>${head}</span><b>${human(bytes)} <span class="bc-mut">· ${pct(bytes, total)}</span></b></div>` +
      (what ? `<p class="sz-bd-what">${esc(what)}</p>` : "") + rows + `</div>`;
  }

  // The collapsed source list: one item per measurement (each side's
  // `parts`), the long `what` + verbatim `how` living here, not on the chart.
  function sourcesHtml(c) {
    const items = [...sourcesOf(c.engine_provenance), ...sourcesOf(c.model_provenance)].map((s) => {
      const meta = [s.source, s.date_utc, s.host].filter(Boolean).map(esc).join(" · ");
      return `<li>${s.label ? `<b>${esc(s.label)}</b> — ` : ""}${esc(s.what || "")}` +
        `<br><span class="bc-mut">${meta}</span>` +
        (s.how ? `<br><span class="sz-src-how">${esc(s.how)}</span>` : "") + `</li>`;
    });
    if (!items.length && !c.note) return "";
    return `<details class="sz-src"><summary>How each number was measured · ${items.length} source${items.length === 1 ? "" : "s"}` +
      `${c.note ? " + note" : ""}</summary>` +
      (items.length ? `<ol>${items.join("")}</ol>` : "") +
      (c.note ? `<p class="sz-prov"><b>note</b> — ${esc(c.note)}</p>` : "") + `</details>`;
  }

  // Toggled by clicking the bar (touch-friendly).
  const detailHtml = (c) => {
    const total = totalOf(c);
    return `<div class="sz-bd-title"><b>${esc(c.name)}</b>${c.framework ? ` <span class="bc-mut">· ${esc(c.framework)}</span>` : ""}</div>` +
      `<div class="sz-bd">${sideChart(c, "engine", total)}${sideChart(c, "model", total)}</div>` +
      `<p class="sz-bd-total"><b>total on disk: ${human(total)}</b> ` +
      `<span class="bc-mut">· bars scale within each side; % is the share of this row's total</span></p>` +
      sourcesHtml(c);
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

    // the stack legend slots actually present in the data (never a
    // hand-typed set): only split kinds join the env + weights trio
    const kinds = new Set();
    for (const c of d.candidates) {
      const comps = stackOf(c);
      if (comps.length > 1) for (const f of comps) if (f.kind !== "weights") kinds.add(f.kind);
    }

    const rows = (d.candidates || []).map((c, idx) => {
      const total = totalOf(c);
      const kind = envKind(c);
      const comps = stackOf(c);
      const split = comps.length > 1;
      const chips = (c.targets || []).map((t) => `<span class="sz-chip">${esc(t)}</span>`).join("");
      // bar length = the total's position on the broken axis — and every
      // segment maps its ABSOLUTE byte range through the SAME axis function,
      // so equal bytes draw equal lengths in every row (the 2026-10-09
      // owner report: the ~600 MB python-env venvs split each bar's LENGTH
      // by byte share, which rendered the same venv as a sliver in the 16 GB
      // pplx row and half the bar in the 1.1 GB bekko-68M row — a share is
      // of the row's own total, not a position on the shared axis). The
      // segments tile [0, total] contiguously, so under the monotone mapping
      // they stay contiguous: width = pos(cum_end) − pos(cum_start), the bar
      // div spans the full track, and a segment whose range crosses the
      // break compresses past it exactly like the bar's own tip. A non-zero
      // segment keeps a 3px floor (CSS min-width) so a sliver stays
      // hoverable. The model side is one green segment or the stack's
      // colored sub-segments.
      const end = (sc.pos(total) * 100).toFixed(2);
      const segs = [];
      if (c.engine_bytes > 0)
        segs.push({ color: envColor(kind), bytes: c.engine_bytes,
          aria: `${c.name}: ${envLabel(kind)} ${human(c.engine_bytes)}` });
      for (const comp of comps)
        segs.push({ color: stackColor(comp.kind), bytes: comp.bytes,
          aria: `${c.name}: model · ${esc(comp.label || stackLabel(comp.kind))} ${human(comp.bytes)}` });
      let cum = 0;
      const seg = (s) => {
        const w = Math.max(sc.pos(cum + s.bytes) - sc.pos(cum), 0) * 100;
        cum += s.bytes;
        return `<i class="sz-seg" tabindex="0" data-sztip="${esc(tipHtml(c, comps))}" ` +
          `aria-label="${esc(s.aria)}" ` +
          `style="width:${w.toFixed(3)}%;background:${s.color}"></i>`;
      };
      const brk = sc.broken && total > sc.linMax
        ? `<i class="sz-break" aria-hidden="true" style="left:${(sc.span * 100).toFixed(2)}%"></i>`
        : "";
      const lbl = (which, bytes, color) =>
        `<span class="sz-lbl sz-lbl-${which}" style="color:${color}">${human(bytes)}</span>`;
      const lbls = [];
      if (c.engine_bytes > 0) lbls.push(lbl("engine", c.engine_bytes, envColor(kind)));
      if (c.model_bytes > 0) lbls.push(lbl("model", c.model_bytes, MODEL_COLOR));
      const did = `szd-${idx}`;
      const stack =
        `<div class="bc-hbar sz-stack" role="button" tabindex="0" aria-expanded="false" aria-controls="${did}"` +
        ` aria-label="${esc(`${c.name}: show the full disk breakdown`)}">` +
        `<div class="sz-bar" style="width:100%">${segs.map(seg).join("")}</div>${brk}</div>` +
        `<div class="sz-lbls" style="width:${end}%">${lbls.join("")}</div>`;
      return `<div class="sz-row">` +
        `<div class="bc-hlabel sz-label"><span class="sz-name">${esc(c.name)}</span><span class="sz-chips">${chips}</span></div>` +
        `<div class="bc-htrack">${grid}${stack}</div>` +
        `<div class="bc-val sz-total">${human(total)}<span class="sz-caret" aria-hidden="true"> ▾</span></div>` +
        `<div class="sz-detail" id="${did}" hidden>${detailHtml(c)}</div>` +
        `</div>`;
    }).join("");

    el.innerHTML =
      `<div class="sz-head">` +
      `<div class="bc-legend" aria-label="bar kinds">` +
      `<span><i class="bc-sw" style="background:${RUST_COLOR}"></i>rust env</span>` +
      `<span><i class="bc-sw" style="background:${PYTHON_COLOR}"></i>python env</span>` +
      `<span><i class="bc-sw" style="background:${MODEL_COLOR}"></i>model / weights</span>` +
      [...kinds].map((k) => `<span><i class="bc-sw" style="background:${stackColor(k)}"></i>${esc(stackLabel(k))}</span>`).join("") +
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
      `Inside a bar, the runtime env (rust or python) and the model sit at their absolute byte positions on the same axis as the bar's end — equal sizes draw equal lengths in every row; ` +
      `where a model stack is published the model part splits into its components ` +
      `(encoder checkpoint · trained specialists · trained heads). ` +
      `Hover a segment for the stack as color-labeled bullets — or click the bar (works on touch) ` +
      `to expand the full breakdown under the row.</p>`;

    // tap-to-expand: the bar is the toggle (its segments keep their own
    // tooltips); property assignment — render() re-wires, never accumulates
    const toggle = (t) => {
      const det = document.getElementById(t.getAttribute("aria-controls"));
      if (!det) return;
      det.hidden = !det.hidden;
      t.setAttribute("aria-expanded", String(!det.hidden));
      const row = t.closest && t.closest(".sz-row");
      if (row) row.classList.toggle("sz-open", !det.hidden);
    };
    const hit = (e) => e.target && e.target.closest && e.target.closest(".sz-stack");
    el.onclick = (e) => { const t = hit(e); if (t && el.contains(t)) toggle(t); };
    el.onkeydown = (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const t = hit(e);
      if (t && el.contains(t)) { e.preventDefault(); toggle(t); }
    };
  }

  window.SizeCharts = { render, scale, human, BREAK_AT, stackColor, STACK_COLORS, STACK_LABELS, stackOf };

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
