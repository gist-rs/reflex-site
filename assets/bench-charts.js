// bench-charts.js — the minimal bar charts on /bench/.
//
// Every number is read from data/bench.json at render time (same rule as the
// tables: a hand-typed number on the site is a defect), so a re-published
// bench.json re-draws the charts with no edit here.
//
//   BenchCharts.hero(d)   → the grouped "all suites × lane" chart at the top
//   BenchCharts.suite(s)  → the per-suite bar table above each suite's table
//
// Two governing bars compose: the LANE filter (which lanes render) and the
// RIG scope (BenchRig — which machine's rows render; "all" is the default
// and the page's original behavior). Every rendered path goes through
// scopedPairs(); only the filter's key derivation walks all rigs, so the
// checkbox set never changes under a rig switch.
//
// Palette: three categorical slots validated all-pairs on the site's dark
// surfaces (#140b08 and #1d110c) — CVD ΔE 9.4, normal-vision ΔE 20.9, all
// ≥ 3:1 contrast. Color follows the LANE, never its rank.
(function () {
  "use strict";

  // Palette: categorical slots validated on the site's dark surfaces
  // (#140b08 and #1d110c). Color follows the LANE, never its rank. The
  // three founding slots were validated all-pairs (CVD ΔE 9.4, normal
  // ΔE 20.9); the two comparison-lane slots (clm violet, gliner teal) were
  // added later with the same dark-surface ≥3:1 contrast rule.
  const LANES = [
    { key: "katgpt", label: "Reflex · modelless", color: "#d95926", match: (l) => l.lane === "KatGPT" || l.model === "modelless" },
    { key: "rust", label: "laya (rust)", color: "#3987e5", match: (l) => l.lane === "laya (rust)" },
    { key: "python", label: "laya (python)", color: "#199e70", match: (l) => l.lane === "laya (python)" },
    { key: "clm", label: "clm", color: "#b39ddb", match: (l) => l.lane === "clm (reference)" },
    { key: "gliner", label: "gliner", color: "#4dd0c4", match: (l) => l.lane === "gliner (reference)" },
    { key: "agentjev", label: "agentjev", color: "#d9a62e", match: (l) => l.lane === "agentjev (reference)" },
    // The instinct hybrid (riir-instinct): magenta slot, distinct from all
    // six existing hues under the same dark-surface ≥3:1 contrast rule.
    { key: "instinct", label: "Instinct (hybrid)", color: "#e06ab4", match: (l) => l.lane === "Instinct (hybrid)" },
    // The OpenThai comparison lane (reflex Plan 003): red slot, distinct
    // from the seven existing hues under the same dark-surface ≥3:1
    // contrast rule (~5:1 measured against #140b08 / #1d110c).
    { key: "openthai", label: "openthai", color: "#7e57c2", match: (l) => l.lane === "openthai (reference)" },
    // The PAW comparison lanes (reflex .issues/033): ProgramAsWeights — the
    // hosted and local postures share ONE palette slot and ONE filter chip
    // (same lane, two serving postures); the table row label carries the
    // posture ("paw (hosted)" / "paw (local)"). Lime slot, added under the
    // same dark-surface contrast rule.
    { key: "paw", label: "paw", color: "#cddc39", match: (l) => String(l.lane).startsWith("paw") },
  ];
  const OTHER = { key: "other", label: "other", color: "#8a7468" };
  const laneOf = (l) => LANES.find((x) => x.match(l)) || OTHER;
  // display form of the data's lane name — the "(reference)" qualifier
  // stays in the data (it drives laneOf matching) but never renders
  // "KatGPT" is the modelless lane's DATA id (publish_bench.py); display it as the product.
  const shortLane = (l) => (l.lane === "KatGPT" ? "Reflex" : String(l.lane).replace(/ \(reference\)$/, ""));

  // ── lane filter (one checkbox bar, governs EVERY section of the page) ────
  // The filter keys on the CANONICAL lane key (laneOf(l).key — "katgpt",
  // "rust", …), never on display spellings, so the charts, the tables, and
  // the extra-host rows all agree by construction. State = hidden keys,
  // persisted in localStorage so a reader's view survives a reload; a key
  // the data no longer carries is dropped at init (a retired lane must not
  // stay hidden forever).
  const FILTER_KEY = "bench-lane-filter";
  const filter = { hidden: new Set(), keys: [], ready: false };
  function loadHidden() {
    try {
      const raw = JSON.parse(localStorage.getItem(FILTER_KEY) || "[]");
      if (Array.isArray(raw)) filter.hidden = new Set(raw.map(String));
    } catch (e) { /* corrupt storage = the default all-visible view */ }
  }
  loadHidden();
  // Derive the ordered key/label list from the DATA (every lane the page
  // would render, primary + extra-host, in first-seen order).
  function init(d) {
    const seen = [];
    const add = (l) => {
      const k = laneOf(l).key;
      if (!seen.some((x) => x.key === k)) seen.push({ key: k, label: laneOf(l).label });
    };
    for (const s of (d && d.suites) || []) {
      for (const l of allLanes(s)) add(l);
      for (const [l] of extraLanes(s)) add(l);
    }
    filter.keys = seen;
    for (const k of [...filter.hidden]) if (!seen.some((x) => x.key === k)) filter.hidden.delete(k);
    filter.ready = true;
  }
  const visible = (l) => !filter.hidden.has(laneOf(l).key);
  const visibleKey = (k) => !filter.hidden.has(k);
  function bar() {
    if (!filter.ready || !filter.keys.length) return "";
    const byKey = Object.fromEntries(filter.keys.map((x) => [x.key, x]));
    const order = LANES.map((x) => x.key).concat(filter.keys.map((x) => x.key)
      .filter((k) => !LANES.some((x) => x.key === k)));
    const chips = order.filter((k) => byKey[k]).map((k) => {
      const x = byKey[k];
      const color = (LANES.find((l) => l.key === k) || OTHER).color;
      return `<label class="lf-chip"><input type="checkbox" data-key="${esc(k)}"${visibleKey(k) ? " checked" : ""}><i class="bc-sw" style="background:${color}"></i>${esc(x.label)}</label>`;
    }).join("");
    return `<div class="lf-bar" role="group" aria-label="filter lanes">${chips}</div>`;
  }
  function wire(el, rerender) {
    // Property assignment (not addEventListener): render() re-wires on every
    // re-render, and assignment REPLACES the handler — listeners never
    // accumulate on the container.
    el.onchange = (e) => {
      const b = e.target.closest("input[type=checkbox][data-key]");
      if (!b) return;
      if (b.checked) filter.hidden.delete(b.dataset.key);
      else filter.hidden.add(b.dataset.key);
      try { localStorage.setItem(FILTER_KEY, JSON.stringify([...filter.hidden])); } catch (err) { /* non-fatal */ }
      rerender();
    };
  }
  window.BenchFilter = { init, visible, bar, wire };

  // ── rig scope (one radio group; governs every chart + table on the page) ──
  // The fleet merge publishes extra hosts beside the primary run; the rig
  // radio scopes EVERY rendered section to one machine's rows ("all" is the
  // default and the page's original every-row view). Rigs DERIVE from the
  // data: the primary host + every extra_host_lanes key; a host ending in a
  // known device suffix is a DEVICE ROW of its base machine (@m3-max-ane is
  // the M3 Max's ANE row, not a third box). Labels are the Machines
  // section's display names, never measurements. Persisted like the filter.
  const RIG_KEY = "bench-rig-scope";
  // The fleet names device rows <machine>-<device> (@m3-max-ane is the M3
  // Max's ANE row). A device row joins the PRIMARY host's rig when its
  // stripped name is a prefix of the primary host name — a data-anchored
  // rule (no synthetic rig ids); anything else stands as its own rig.
  const DEVICE_SUFFIXES = ["-ane"];
  const RIG_LABELS = { "m3-max-metal": "M3 Max", "4090-win": "RTX 4090" };
  const rig = { id: "all", hosts: null, ready: false }; // hosts: null = every rig
  let rigs = [];
  function loadRig() {
    try { rig.id = localStorage.getItem(RIG_KEY) || "all"; } catch (e) { rig.id = "all"; }
  }
  loadRig();
  function rigBase(h) {
    for (const sfx of DEVICE_SUFFIXES) {
      if (!h.endsWith(sfx)) continue;
      const stem = h.slice(0, -sfx.length);
      if (primaryHost && primaryHost.startsWith(stem)) return primaryHost;
      return stem;
    }
    return h;
  }
  function initRigs(d) {
    const hosts = [];
    const push = (h) => { if (h && !hosts.includes(h)) hosts.push(h); };
    push(d && d.meta && d.meta.host);
    for (const row of (d && d.meta && d.meta.hosts) || []) push(row.host);
    for (const s of (d && d.suites) || [])
      for (const h of Object.keys(s.extra_host_lanes || {})) push(h);
    rigs = [];
    for (const h of hosts) {
      const base = rigBase(h);
      let r = rigs.find((x) => x.id === base);
      if (!r) { r = { id: base, label: RIG_LABELS[base] || base, hosts: [] }; rigs.push(r); }
      r.hosts.push(h);
    }
    if (rig.id !== "all" && !rigs.some((x) => x.id === rig.id)) rig.id = "all";
    rig.hosts = rig.id === "all" ? null : new Set(rigs.find((x) => x.id === rig.id).hosts);
    rig.ready = true;
  }
  const onRig = (host) => !rig.hosts || rig.hosts.has(host);
  function rigBar() {
    if (!rig.ready || rigs.length <= 1) return "";
    const opts = [{ id: "all", label: "All rigs" }, ...rigs].map((r) =>
      `<label class="rf-chip"><input type="radio" name="bench-rig" value="${esc(r.id)}"${rig.id === r.id ? " checked" : ""}>${esc(r.label)}</label>`).join("");
    return `<div class="rf-bar" role="radiogroup" aria-label="benchmark rig">${opts}</div>` +
      `<p class="rf-hint">Scope every chart and table to one benchmark rig (remembered) — a comparison lane renders where its host ran.</p>`;
  }
  function wireRig(el, rerender) {
    // Property assignment, like the lane filter: render() re-wires on every
    // re-render and assignment never accumulates listeners.
    el.onchange = (e) => {
      const b = e.target.closest("input[type=radio][name=bench-rig]");
      if (!b || b.value === rig.id) return;
      rig.id = b.value;
      rig.hosts = rig.id === "all" ? null : new Set(rigs.find((x) => x.id === rig.id).hosts);
      try { localStorage.setItem(RIG_KEY, rig.id); } catch (err) { /* non-fatal */ }
      rerender();
    };
  }
  window.BenchRig = {
    init: initRigs,
    bar: rigBar,
    wire: wireRig,
    onRig,
    scoped: null, // assigned with the BenchCharts export (scopedPairs hoists)
    active: () => rig.id,
    label: () => (rigs.find((x) => x.id === rig.id) || {}).label || "all",
    inited: () => rig.ready,
  };

  const METRICS = {
    acc: { label: "accuracy", get: accOf, log: false },
    acc50: { label: "acc@50% coverage", get: (l) => (l.hard || {}).acc_at_50_coverage, log: false },
    p50: { label: "p50 latency", get: (l) => l.latency_p50_ms, log: true },
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const num = (v) => typeof v === "number" && isFinite(v);
  const pct = (v) => (v * 100).toFixed(1) + "%";
  const lat = (v) => v < 1 ? +(v * 1000).toPrecision(3) + " µs" : v < 1000 ? +v.toPrecision(3) + " ms" : +(v / 1000).toPrecision(3) + " s";
  const fmtOf = (m) => (METRICS[m].log ? lat : pct);
  // Accuracy across cell shapes: full cells carry it under `hard`; the
  // acc-only comparison cells (paw, reflex 5f76526) carry a top-level
  // `accuracy` with no hard block at all. One reader for every surface.
  function accOf(l) {
    const h = (l.hard || {}).accuracy;
    return h != null ? h : l.accuracy;
  }

  // One log domain for EVERY latency bar on the page, so a bar in one suite is
  // comparable with a bar in another. Snapped to whole decades.
  let logDomain = [-3, 3];
  // ── the broken latency axis (the /#sizes break-sign idiom) ──────────────
  // BREAK_AT is a design threshold (the owner's "past 500 ms earns the break
  // sign"), not a measured number — every latency still comes from the data.
  // A page whose slowest p50 stays under it renders exactly as before
  // (full-track log, no break). When something crosses, the ≤500 ms region
  // takes LIN_SPAN of the track — so the fast lanes keep their real
  // proportions — a dashed break gridline marks the seam, and every bar past
  // it continues on a compressed log tail (the break … the slowest read)
  // over the rest, carrying the slanted break sign where the scale changes.
  const BREAK_AT = 500;
  const LIN_SPAN = 0.8;
  const TAIL_FLOOR = 0.12;
  let latBroken = false, latMax = BREAK_AT;
  function setLogDomain(d) {
    const vs = [];
    for (const s of d.suites || [])
      for (const [l] of scopedPairs(s)) if (num(l.latency_p50_ms) && l.latency_p50_ms > 0) vs.push(l.latency_p50_ms);
    if (vs.length) {
      latMax = Math.max(...vs);
      latBroken = latMax > BREAK_AT;
      // broken: the readable region ends AT the break (not at the next
      // decade past the slowest read — the tail carries that)
      logDomain = [Math.floor(Math.log10(Math.min(...vs))),
        latBroken ? Math.log10(BREAK_AT) : Math.ceil(Math.log10(latMax))];
    }
    if (logDomain[1] <= logDomain[0]) logDomain[1] = logDomain[0] + 1;
  }
  const frac = (m, v) => {
    if (!num(v)) return null;
    if (!METRICS[m].log) return Math.max(0, Math.min(1, v));
    if (v <= 0) return 0;
    const [lo, hi] = logDomain;
    if (!latBroken) return Math.max(0.004, Math.min(1, (Math.log10(v) - lo) / (hi - lo)));
    // broken axis: ≤ the break logs over [0, LIN_SPAN]; past it a compressed
    // log tail over [LIN_SPAN, 1], floored so the break sign always sits
    // inside the bar (the size chart's TAIL_FLOOR rule)
    const lv = Math.log10(v);
    if (v <= BREAK_AT) return Math.max(0.004, (lv - lo) / (hi - lo)) * LIN_SPAN;
    return LIN_SPAN + (1 - LIN_SPAN) * Math.max(TAIL_FLOOR, (lv - hi) / (Math.log10(latMax) - hi));
  };
  const ticks = (m) => {
    if (!METRICS[m].log) return [0, 0.25, 0.5, 0.75, 1].map((t) => [t, t * 100 + "%"]);
    const [lo, hi] = logDomain, out = [];
    const span = latBroken ? LIN_SPAN : 1;
    for (let e = lo; e <= hi; e++) {
      const f = ((e - lo) / (hi - lo)) * span;
      // a decade crowded against the break tick keeps its gridline, drops
      // its label (the narrow-track courtesy the size chart's ticks carry)
      out.push([f, latBroken && LIN_SPAN - f < 0.055 ? "" : lat(Math.pow(10, e))]);
    }
    if (latBroken) {
      out.push([LIN_SPAN, lat(BREAK_AT)]);
      out.push([1, lat(latMax)]);
    }
    return out;
  };

  // Primary-host lanes first, then the fleet merge's extra_host_lanes (tagged).
  function allLanes(s) {
    const out = [];
    if (s.modelless) out.push(s.modelless);
    for (const k of Object.keys(s.laya || {})) out.push(s.laya[k]);
    if (s.clm) out.push(s.clm);
    if (s.gliner) out.push(s.gliner);
    if (s.agentjev) out.push(s.agentjev);
    if (s.openthai) out.push(s.openthai);
    if (s.paw) out.push(s.paw);
    if (s.paw_local) out.push(s.paw_local);
    if (s.hybrid) out.push(s.hybrid);
    return out;
  }
  function extraLanes(s) {
    const out = [];
    for (const [host, hl] of Object.entries(s.extra_host_lanes || {})) {
      if (hl.modelless) out.push([hl.modelless, host]);
      for (const k of Object.keys(hl.laya || {})) out.push([hl.laya[k], host]);
      if (hl.clm) out.push([hl.clm, host]);
      if (hl.gliner) out.push([hl.gliner, host]);
      if (hl.agentjev) out.push([hl.agentjev, host]);
      if (hl.openthai) out.push([hl.openthai, host]);
      if (hl.paw) out.push([hl.paw, host]);
      if (hl.paw_local) out.push([hl.paw_local, host]);
      if (hl.hybrid) out.push([hl.hybrid, host]);
    }
    return out;
  }
  // The RIG-SCOPED enumeration — every rendered path (charts, tables, the
  // log domain, per-suite picks, the Instinct verdicts) reads lanes through
  // this: primary-host cells first (when the rig includes the primary),
  // then the active rig's extra-host cells, each tagged with its host. The
  // filter's key derivation deliberately stays on the UNSCOPED walk
  // (allLanes/extraLanes), so the checkbox set is stable across rig swaps.
  function scopedPairs(s) {
    const out = [];
    // An UNSET primary host (a direct setLogDomain/summary call before any
    // page render — the render smokes) means the pre-fleet data model:
    // the primary cells ARE the data, never dropped. Once set, the rig
    // decides (a 4090 scope excludes the m3 primary via onRig).
    if (!primaryHost || onRig(primaryHost))
      for (const l of allLanes(s)) out.push([l, null]);
    for (const [l, host] of extraLanes(s)) if (onRig(host)) out.push([l, host]);
    return out;
  }

  // Hero pick: per suite and lane, the best-accuracy NON-multilingual
  // checkpoint on the primary host; when the primary never ran the lane
  // (the comparison lanes run on their own host), the best EXTRA-HOST cell
  // fills the bar, host-tagged in the tooltip. Accuracy is read through
  // accOf — the acc-only comparison cells (paw, reflex 5f76526) carry a
  // top-level `accuracy` with no hard block, and gating on `hard` here
  // rendered the whole lane "not run" beside tables that scored it fine.
  // Picked once by accuracy, so every metric toggle shows the SAME run (no
  // per-metric cherry-pick); accuracy is box-independent and may mix hosts
  // (reflex .issues/027 amendment 2), latency bars disclose the host in the
  // tooltip.
  function pick(s, lane) {
    let best = null;
    // scopedPairs: rig-aware, primary host first (the earlier-in-list
    // tie-break keeps the primary cell when hosts measure a lane equally).
    for (const [l, host] of scopedPairs(s)) {
      if (laneOf(l) !== lane || l.model === "multilingual") continue;
      const a = accOf(l);
      if (!num(a)) continue;
      if (!best || a > accOf(best[0])) best = [l, host];
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
    const acc = accOf(l);
    return `<span class="bc-sw" style="background:${lane.color}"></span><b>${esc(shortLane(l))} · ${esc(l.model)}</b>${extra ? ` <span class="bc-mut">${esc(extra)}</span>` : ""}<br>` +
      `accuracy ${num(acc) ? pct(acc) : "—"} · acc@50cov ${num(h.acc_at_50_coverage) ? pct(h.acc_at_50_coverage) : "—"}<br>` +
      `p50 ${num(l.latency_p50_ms) ? lat(l.latency_p50_ms) : "—"} · p99 ${num(l.latency_p99_ms) ? lat(l.latency_p99_ms) : "—"}` +
      (num(h.n) ? ` · n=${h.n}` : "");
  };

  const legend = () => `<div class="bc-legend" aria-label="lanes">${LANES.filter((x) => visibleKey(x.key)).map((x) =>
    `<span><i class="bc-sw" style="background:${x.color}"></i>${esc(x.label)}</span>`).join("")}</div>`;

  const axis = (m) => `<div class="bc-axis">${ticks(m).map(([f, t]) =>
    `<span style="left:${(f * 100).toFixed(2)}%">${esc(t)}</span>`).join("")}</div>`;
  const grid = (m) => ticks(m).map(([f]) =>
    `<i class="bc-grid${latBroken && METRICS[m].log && Math.abs(f - LIN_SPAN) < 1e-9 ? " sz-grid-break" : ""}" style="left:${(f * 100).toFixed(2)}%"></i>`).join("");

  // ── sort: a minimal order toggle for the charts ──────────────────────────
  // "data" is the harness's own suite order / the lane order as published.
  // "acc" sorts best-first (descending); "lat" sorts fastest-first
  // (ascending — on the latency axis shorter is better, so both sorts put
  // the best row on top). Key for suite rows: the FIRST VISIBLE lane in
  // LANES order — the product lane at the default filter. Sorting by a lane
  // the reader has filtered out renders as an unsorted page (the bars the
  // reader sees carry no visible order), so the key follows the filter and
  // the note names the lane actually used. Key for lane rows inside a
  // suite table: that lane's own value. Missing cells sort last, never
  // first.
  const SORTS = {
    data: { label: "data order" },
    acc: { label: "by accuracy", dir: "desc" },
    lat: { label: "by latency", dir: "asc" },
  };
  let heroSort = "data", suiteSort = "data";
  const suiteStore = new Map();
  // The primary run's host (meta.host) — its lanes carry "@host" like every
  // extra host's, so no row on the page is an unlabelled "the machine".
  // pick() keeps returning null for a primary-host cell (laneStats reads
  // non-null as "includes extra-host cells"); only the LABELS use this.
  let primaryHost = null;
  function setPrimaryHost(h) {
    primaryHost = h || null;
  }

  function sortKeyOf(l, kind) {
    if (!l) return null;
    // accOf, same as pick(): the acc-only paw cells must be sortable too.
    const v = kind === "acc" ? accOf(l) : l.latency_p50_ms;
    return typeof v === "number" && isFinite(v) ? v : null;
  }
  function sortPairs(pairs, kind, keyOf) {
    if (kind === "data") return pairs;
    const dir = SORTS[kind].dir === "desc" ? -1 : 1;
    return pairs.slice().sort((a, b) => {
      const av = keyOf(a), bv = keyOf(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }
  function sortToggleHtml(kind, current) {
    const btns = Object.entries(SORTS).map(([k, S]) =>
      `<button type="button" data-sort="${k}" aria-pressed="${k === current}">${esc(S.label)}</button>`).join("");
    return `<div class="bc-toggle" role="group" aria-label="sort ${esc(kind)}">${btns}</div>`;
  }
  // The hero's sort-key lane: the first lane in LANES order the reader has
  // not filtered out (LANES[0] fallback = the product lane, for the
  // everything-hidden corner where no visible lane exists to key on).
  function sortLane() {
    return LANES.find((x) => visibleKey(x.key)) || LANES[0];
  }
  function sortNote(kind, lane) {
    if (kind === "data") return "";
    const on = lane ? ` on the ${lane.label} lane` : "";
    return SORTS[kind].dir === "desc"
      ? ` Rows sorted best-accuracy-first${on}; not-run sorts last.`
      : ` Rows sorted fastest-first${on}; not-run sorts last.`;
  }

  // ── hero: every suite × three lanes ──────────────────────────────────────
  let heroData = null, heroMetric = "acc";

  function heroBody() {
    const d = heroData, m = heroMetric, M = METRICS[m], f = fmtOf(m);
    const shown = LANES.filter((lane) => visibleKey(lane.key));
    const sLane = sortLane();
    const sorted = sortPairs((d.suites || []).map((s) => [s, null]), heroSort,
      ([s]) => { const p = pick(s, sLane); return sortKeyOf(p ? p[0] : null, heroSort); });
    const rows = sorted.map(([s]) => {
      const bars = shown.map((lane) => {
        const picked = pick(s, lane);
        const l = picked ? picked[0] : null;
        const host = picked ? picked[1] || primaryHost : null;
        const v = l ? M.get(l) : null;
        const fr = frac(m, v);
        if (fr === null) return `<div class="bc-hbar bc-none">${esc(lane.label)} — not run</div>`;
        const brk = M.log && latBroken && v > BREAK_AT
          ? `<i class="sz-break" aria-hidden="true" style="left:${(LIN_SPAN * 100).toFixed(2)}%"></i>` : "";
        return `<div class="bc-hbar" tabindex="0" data-tip="${esc(`<span class="bc-mut">${esc(s.name)}</span><br>` + tipHtml(l, host ? "@" + host : ""))}" aria-label="${esc(`${s.name} ${lane.label} ${l.model}${host ? " on " + host : ""}: ${f(v)}`)}">` +
          `<i style="width:${(fr * 100).toFixed(2)}%;background:${lane.color}"></i>${brk}</div>`;
      }).join("");
      return `<a class="bc-hlabel" href="#suite-${esc(s.name)}">${esc(s.name)}</a><div class="bc-htrack">${grid(m)}${bars}</div>`;
    }).join("");
    const picks = new Set();
    for (const s of d.suites || [])
      for (const lane of LANES.filter((x) => x.key === "rust" || x.key === "python")) {
        if (!visibleKey(lane.key)) continue;
        const picked = pick(s, lane);
        const l = picked ? picked[0] : null;
        if (l && l.model !== "english") picks.add(`${l.model} on ${s.name}`);
      }
    const extraHosts = d.suites.some((s) => s.extra_host_lanes);
    const note = `laya bars use each suite's best non-multilingual checkpoint${picks.size ? ` (${[...picks].join(", ")}; english elsewhere)` : " (english)"}. ` +
      `Comparison-lane bars (clm, gliner, agentjev, openthai, paw) carry the host they ran on in the tooltip${extraHosts ? " — other hosts' rows stay in the tables below" : ""}.` +
      (M.log ? (latBroken
        ? ` Latency is log-scale up to ${lat(BREAK_AT)} (each gridline = 10×); a bar past the break sign runs on a compressed log scale (${lat(BREAK_AT)} … ${lat(latMax)}) — read its value from the tooltip. Shorter is faster.`
        : " Latency is log-scale (each gridline = 10×) — shorter is faster.")
        : " Chance level differs per suite — compare lanes within a row, not rows with each other.") + sortNote(heroSort, sLane);
    return `<div class="bc-hgrid"><div></div>${axis(m)}${rows}<div></div>${axis(m)}</div><p class="bc-note">${esc(note)}</p>`;
  }

  function hero(d) {
    const el = document.getElementById("bench-hero");
    if (!el || !d || !d.suites) return;
    heroData = d;
    setPrimaryHost(d.meta && d.meta.host);
    initRigs(d);
    setLogDomain(d);
    const q = new URLSearchParams(location.search).get("m"); // shareable view: /bench/?m=p50
    if (METRICS[q]) heroMetric = q;
    tooltip();
    const btns = Object.entries(METRICS).map(([k, M]) =>
      `<button type="button" data-metric="${k}" aria-pressed="${k === heroMetric}">${esc(M.label)}${M.log ? " (log)" : ""}</button>`).join("");
    el.innerHTML = `<div class="bc-bar">${legend()}<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="bc-mut">sort</span>${sortToggleHtml("suites", heroSort)}<div class="bc-toggle" role="group" aria-label="metric">${btns}</div></div></div><div id="bench-hero-body">${heroBody()}</div>`;
    el.querySelector(".bc-bar").addEventListener("click", (e) => {
      const m = e.target.closest("button[data-metric]");
      const so = e.target.closest("button[data-sort]");
      if (m) {
        heroMetric = m.dataset.metric;
        for (const x of el.querySelectorAll("button[data-metric]")) x.setAttribute("aria-pressed", x === m);
        document.getElementById("bench-hero-body").innerHTML = heroBody();
      } else if (so) {
        heroSort = so.dataset.sort;
        for (const x of el.querySelectorAll("button[data-sort]")) x.setAttribute("aria-pressed", x === so);
        document.getElementById("bench-hero-body").innerHTML = heroBody();
      }
    });
  }

  // ── per-suite bar table: one row per table row, accuracy | p50 ──────────
  function cell(m, l, extra) {
    const v = METRICS[m].get(l), fr = frac(m, v);
    if (fr === null) return `<div class="bc-cell bc-none">—</div>`;
    // the break sign rides the fill region's own coordinate space (the same
    // (100% - 64px) span the value label reserves), never the value column
    const brk = METRICS[m].log && latBroken && v > BREAK_AT
      ? `<i class="sz-break" aria-hidden="true" style="left:calc((100% - 64px) * ${LIN_SPAN})"></i>` : "";
    return `<div class="bc-cell" tabindex="0" data-tip="${esc(tipHtml(l, extra))}"><i style="width:calc((100% - 64px) * ${fr.toFixed(4)});background:${laneOf(l).color}"></i>${brk}<span>${esc(fmtOf(m)(v))}</span></div>`;
  }

  function suite(s) {
    suiteStore.set(s.name, s);
    const rows = sortPairs(scopedPairs(s).filter(([l]) => visible(l)), suiteSort, ([l]) => sortKeyOf(l, suiteSort));
    if (!rows.length) return "";
    return `<div class="bc-suite" data-bc-suite="${esc(s.name)}" aria-label="${esc(s.name)} lanes compared">` +
      `<div class="bc-sh"></div><div class="bc-sh">accuracy</div><div class="bc-sh">p50 latency · log${latBroken ? ` · break at ${lat(BREAK_AT)}` : ""} · shorter is faster</div>` +
      rows.map(([l, host]) =>
        `<div class="bc-slabel" title="${esc(`${shortLane(l)} · ${l.model}${host ? " @" + host : ""}`)}"><i class="bc-sw" style="background:${laneOf(l).color}"></i>${esc(shortLane(l))} · ${esc(l.model)}${host ? ` <span class="bc-mut">@${esc(host)}</span>` : ""}</div>` +
        cell("acc", l, host ? "@" + host : "") + cell("p50", l, host ? "@" + host : "")).join("") +
      `</div>`;
  }


  // ── summary: the compact averaged chart (the landing page) ──────────────
  // The /bench/ hero with the per-suite separation RESTORED as a range: one
  // min–max band + average tick per lane per metric (a comparison lane
  // whose primary-host cell is absent falls back to its extra-host cell, as
  // on the full chart — the tooltip names the host).
  // Accuracy metrics are macro-averages (suites count equally, exactly like
  // the hero's rows); latency is the GEOMETRIC mean — the average that
  // matches the log axis (bar position = mean of the per-suite bar
  // positions). Same lane pick rule as hero(): best non-multilingual
  // checkpoint per suite, so both charts always agree lane-for-lane. The
  // per-suite separation lives on /bench/ and only there.
  // the landing page defaults to the speed story — the reason Reflex exists;
  // /bench/'s hero keeps its own accuracy default
  let summaryData = null, summaryMetric = "p50";

  function laneStats(d, m, lane) {
    const vals = [], perSuite = [];
    const hosts = new Set();
    for (const s of d.suites || []) {
      // pick() returns [lane, host] — host names the extra-host cell when the
      // primary host never ran this lane (the comparison-lane fallback)
      const picked = pick(s, lane);
      const l = picked ? picked[0] : null;
      if (!l) continue;
      const v = METRICS[m].get(l);
      if (!num(v) || (METRICS[m].log && v <= 0)) continue;
      vals.push(v);
      perSuite.push([s.name, v]);
      if (picked[1]) hosts.add(picked[1]);
    }
    if (!vals.length) return null;
    const avg = METRICS[m].log
      ? Math.exp(vals.reduce((a, v) => a + Math.log(v), 0) / vals.length)
      : vals.reduce((a, v) => a + v, 0) / vals.length;
    return { value: avg, min: Math.min(...vals), max: Math.max(...vals), n: vals.length, perSuite, hosts: [...hosts] };
  }

  function summaryBody() {
    const d = summaryData, m = summaryMetric, M = METRICS[m], f = fmtOf(m);
    // rows sorted best-average-first for the active metric: highest mean
    // accuracy first, fastest geometric-mean latency first (Array.sort is
    // stable, so ties keep LANES order); lanes with no cell are dropped
    const ranked = LANES.map((lane) => [lane, laneStats(d, m, lane)])
      .filter(([, a]) => a)
      .sort(([, x], [, y]) => (M.log ? x.value - y.value : y.value - x.value));
    const rows = ranked.map(([lane, a]) => {
      const fLo = frac(m, a.min), fHi = frac(m, a.max), fAv = frac(m, a.value);
      const how = M.log ? "geometric mean" : "macro-average";
      const spread = a.n > 1 ? `min <b>${f(a.min)}</b> · max <b>${f(a.max)}</b>` : "single suite";
      const per = a.perSuite.map(([name, v]) => `${esc(name)}: <b>${f(v)}</b>`).join("<br>");
      const tip = `<span class="bc-sw" style="background:${lane.color}"></span><b>${esc(lane.label)}</b><br>` +
        `${how} over <b>${a.n}</b> suites: <b>${f(a.value)}</b> — band = per-suite range (${spread})` +
        (a.hosts.length ? `<br><span class="bc-mut">includes extra-host cells: ${a.hosts.map((h) => "@" + esc(h)).join(", ")}</span>` : "") +
        `<br><span class="bc-mut">${per}</span>`;
      const band = a.n > 1
        ? `<i class="bc-range" style="left:${(fLo * 100).toFixed(2)}%;width:${Math.max((fHi - fLo) * 100, 0.6).toFixed(2)}%;background:${lane.color}40;border-color:${lane.color}"></i>`
        : "";
      // the value label belongs to the MEAN pipe, not the band end — a label
      // at the band's right edge reads as the max. It rides right BESIDE the
      // tick (to its left once the mean sits past ~78%, so the chip never
      // runs off the track's right edge); the chip backdrop keeps it legible
      // mid-band
      // a mean chip that would run into the break sign flips left of its
      // tick (0.78 stays the off-the-right-edge threshold on a whole axis)
      const flipAt = M.log && latBroken ? LIN_SPAN - 0.10 : 0.78;
      const valStyle = fAv <= flipAt
        ? `left:calc(${(fAv * 100).toFixed(2)}% + 5px);transform:translate(0,-50%);`
        : `left:${(fAv * 100).toFixed(2)}%;transform:translate(calc(-100% - 5px),-50%);`;
      const brk = M.log && latBroken && a.max > BREAK_AT
        ? `<i class="sz-break" aria-hidden="true" style="left:${(LIN_SPAN * 100).toFixed(2)}%"></i>` : "";
      return `<div class="bc-hlabel"><i class="bc-sw" style="background:${lane.color}"></i>${esc(lane.label)}</div>` +
        `<div class="bc-htrack">${grid(m)}` +
        `<div class="bc-hbar" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(`${lane.label} averaged: ${f(a.value)} over ${a.n} suites (min ${f(a.min)}, max ${f(a.max)})`)}">` +
        `${band}${brk}<i class="bc-mark" style="left:${(fAv * 100).toFixed(2)}%;background:${lane.color}"></i><span class="bc-val" style="${valStyle}">${f(a.value)}</span></div></div>`;
    }).join("");
    const note = (M.log
      ? (latBroken
        ? `Band = min → max suite p50; tick = geometric mean; log to ${lat(BREAK_AT)}, then a compressed tail past the break sign — exact values on the tooltip. Shorter is faster. `
        : "Band = min → max suite p50; tick = geometric mean; each gridline 10×, shorter is faster. ")
      : "Band = min → max suite accuracy; tick = macro-average; chance differs per suite — compare lanes, not suites. ") +
      `Rows sorted ${M.log ? "fastest" : "best"} average first. ` +
      `Over ${(d.suites || []).length} published suites — hover a bar for per-suite values.`;
    return `<div class="bc-hgrid"><div></div>${axis(m)}${rows}<div></div>${axis(m)}</div><p class="bc-note">${esc(note)}</p>`;
  }

  function summary(d, el) {
    if (!el || !d || !d.suites) return;
    summaryData = d;
    setPrimaryHost(d.meta && d.meta.host);
    tooltip();
    const btns = Object.entries(METRICS).map(([k, M]) =>
      `<button type="button" data-metric="${k}" aria-pressed="${k === summaryMetric}">${esc(M.label)}${M.log ? " (log)" : ""}</button>`).join("");
    el.innerHTML = `<div class="bc-bar"><div class="bc-legend"><span>every published suite, one min–avg–max range per lane — the same data as <a href="/bench/">the full benchmark</a></span></div>` +
      `<div class="bc-toggle" role="group" aria-label="metric">${btns}</div></div><div class="bc-summary-body">${summaryBody()}</div>`;
    el.querySelector(".bc-toggle").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-metric]");
      if (!b) return;
      summaryMetric = b.dataset.metric;
      for (const x of el.querySelectorAll("button[data-metric]")) x.setAttribute("aria-pressed", x === b);
      el.querySelector(".bc-summary-body").innerHTML = summaryBody();
    });
  }

  // ── suite-table sort control (rendered once above the tables) ────────────
  function suiteSortControl() {
    return sortToggleHtml("lanes within each suite", suiteSort);
  }
  function setSuiteSort(kind) {
    if (!SORTS[kind]) return;
    suiteSort = kind;
    for (const [name, s] of suiteStore) {
      const el = document.querySelector(`[data-bc-suite="${CSS.escape(name)}"]`);
      if (el) el.outerHTML = suite(s);
    }
    const ctrl = document.getElementById("suite-sort");
    if (ctrl) for (const b of ctrl.querySelectorAll("button[data-sort]")) b.setAttribute("aria-pressed", b.dataset.sort === suiteSort);
  }

  window.BenchCharts = { hero, suite, setLogDomain, summary, suiteSortControl, setSuiteSort, setPrimaryHost, lat, accOf };
  window.BenchRig.scoped = scopedPairs;
})();
