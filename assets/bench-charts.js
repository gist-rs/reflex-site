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
    // Qualifier-free product spelling (owner call 2026-10-01) — what the
    // name means is disclosed in the page's Notes/FAQ; the legacy
    // qualified spelling still matches so an un-re-published bench.json
    // renders.
    { key: "instinct", label: "Instinct", color: "#e06ab4", match: (l) => l.lane === "Instinct" || l.lane === "Instinct (hybrid)" },
    // riir-instinct issue 014 C1: the record-only encoder arm — a paler
    // magenta beside the Instinct slot (the same instinct family, the
    // measured-but-refused read: serve ✗). Product name "Rethink" per
    // the naming law (riir-ai Proposal 051), qualifier-free per the
    // owner call 2026-10-01; both legacy spellings still match so an
    // un-re-published bench.json renders. Its results are partial
    // (coverage data-derived on the radar legends — never a typed count).
    { key: "instinct-encoder", label: "Rethink", color: "#b895d0", match: (l) => l.lane === "Rethink" || l.lane === "Rethink (encoder)" || l.lane === "Instinct (encoder)" },
    // The OpenThai comparison lane (reflex Plan 003): red slot, distinct
    // from the seven existing hues under the same dark-surface ≥3:1
    // contrast rule (~5:1 measured against #140b08 / #1d110c).
    { key: "openthai", label: "openthai", color: "#7e57c2", match: (l) => l.lane === "openthai (reference)" },
    // The Bekko comparison lane (reflex Bench 103, owner call 2026-10-01):
    // soft-rose slot — distinct from all existing hues under the same
    // dark-surface ≥3:1 contrast rule (disclosed: not ΔE-validated with the
    // founding slots' rigor; the next palette pass re-checks all-pairs).
    { key: "bekko", label: "bekko", color: "#e57373", match: (l) => l.lane === "bekko (reference)" },
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

  // The palette's one home, exposed for the sibling renderers that draw
  // lane-colored marks outside the charts (instinct.js's per-suite verdict
  // bars). Keyed by the same DISPLAY forms shortLane() renders ("Reflex",
  // "paw (hosted)", "laya (rust)", …) so a caller never re-derives the
  // lane→color mapping (a second palette is a drift waiting to happen).
  window.BenchLanes = {
    instinct: LANES.find((x) => x.key === "instinct").color,
    reflex: LANES.find((x) => x.key === "katgpt").color,
    color(label) {
      const s = String(label).replace(/ \(reference\)$/, "");
      const hit = LANES.find((x) => x.key === "katgpt" ? (s === "Reflex" || s === "KatGPT")
        : x.key === "paw" ? s.startsWith("paw")
        : s === x.label);
      return (hit || OTHER).color;
    },
  };

  // ── lane filter (one checkbox bar, governs EVERY section of the page) ────
  // The filter keys on the CANONICAL lane key (laneOf(l).key — "katgpt",
  // "rust", …), never on display spellings, so the charts, the tables, and
  // the extra-host rows all agree by construction. State = hidden keys,
  // persisted in localStorage so a reader's view survives a reload; a key
  // the data no longer carries is dropped at init (a retired lane must not
  // stay hidden forever).
  const FILTER_KEY = "bench-lane-filter";
  const filter = { hidden: new Set(), keys: [], ready: false, areas: null };
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
    // The areas block rides the filter state (plan 001 tasks 1b+5): the
    // chips carry each lane's kind + cc index + coverage from the PUBLISHED
    // rollups — a chip is the one place every reader looks first, so the
    // headline number lives there too. Absent (an old bench.json) = the
    // plain label chip, exactly as before.
    filter.areas = (d && d.areas) || null;
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
    // chip meta (plan 001 tasks 1b+5): the published areas block keyed back
    // through areaPaletteKey — the PRIMARY-host lane preferred, a
    // serving-host lane otherwise (one chip gates every posture of the
    // lane; the radar legend names the host).
    const A = filter.areas;
    const metaFor = (chipKey) => {
      if (!A || !A.lanes) return null;
      const cands = Object.entries(A.lanes).filter(([k]) => areaPaletteKey(k) === chipKey);
      if (!cands.length) return null;
      const [, ld] = cands.find(([k]) => !k.includes("@")) || cands[0];
      return ld;
    };
    const chips = order.filter((k) => byKey[k]).map((k) => {
      const x = byKey[k];
      const color = (LANES.find((l) => l.key === k) || OTHER).color;
      const ld = metaFor(k);
      const meta = ld ? [ld.kind,
        num(ld.index) ? "idx " + pct(ld.index) : null,
        ld.coverage ? ld.coverage.suites + "/" + ld.coverage.of : null,
      ].filter(Boolean).join(" · ") : "";
      return `<label class="lf-chip"><input type="checkbox" data-key="${esc(k)}"${visibleKey(k) ? " checked" : ""}><i class="bc-sw" style="background:${color}"></i>${esc(x.label)}${meta ? `<span class="lf-meta">${esc(meta)}</span>` : ""}</label>`;
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
  window.BenchFilter = { init, visible, visibleKey, bar, wire, ready: () => filter.ready };

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
    // Chance-corrected accuracy — cc = (acc − chance) / (1 − chance), the
    // same scale the /bench/ area radar rolls up (data.areas). 0 = random
    // guessing on that suite's option count, so suites with different
    // option counts (4-way ag_news vs 77-way banking77) finally share an
    // axis. The chances ride data.areas.suites (publish_bench.py — dataset
    // facts, not measurements); a suite with no entry is skipped, never
    // guessed.
    //
    // ccOf (defined beside accOf below) is the ONE place the JS computes
    // the formula — Python holds the other copy in compute_areas, and the
    // chart smoke's parity arm pins the two together. Values BELOW 0 are
    // real and stay signed: a lane under random guessing must read that
    // way (the published scale string says the same). Only the BAR LENGTH
    // clamps at 0 — the value, the tooltip and the below-chance marker
    // carry the sign.
    cc: {
      label: "chance-corrected acc",
      // The suite argument is load-bearing: chanceOf(s) reads the suite's
      // curated baseline, and a call site that drops it (the hero's barHtml
      // called M.get(l) alone) scores EVERY cell null — the whole board read
      // "— not run" on this metric only, beside tables full of scores
      // (2026-10-01 user report). Every call site passes (lane, suite).
      get: (l, s) => ccOf(l, s),
      log: false,
    },
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

  // The ONE JS home of the cc formula (METRICS.cc is its consumer; the
  // table's cc column and the profile view call it directly). Python holds
  // the other copy (publish_bench.py compute_areas) — the chart smoke's
  // parity arm asserts the two agree on every published entry.
  function ccOf(l, s) {
    const a = accOf(l), ch = chanceOf(s);
    return num(a) && num(ch) ? (a - ch) / (1 - ch) : null;
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
    areasBlock = (d && d.areas) || null;
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
  // The data's area-rollup block (publish_bench.py compute_areas) — the
  // chance baselines the cc metric reads. Set by setLogDomain (both the
  // home figure and the bench hero call it before any render).
  let areasBlock = null;
  function chanceOf(s) {
    const sm = areasBlock && areasBlock.suites;
    return s && sm && sm[s.name] ? sm[s.name].chance : null;
  }
  function allLanes(s) {
    const out = [];
    if (s.modelless) out.push(s.modelless);
    for (const k of Object.keys(s.laya || {})) out.push(s.laya[k]);
    if (s.clm) out.push(s.clm);
    if (s.gliner) out.push(s.gliner);
    if (s.bekko) out.push(s.bekko);
    if (s.agentjev) out.push(s.agentjev);
    if (s.openthai) out.push(s.openthai);
    if (s.paw) out.push(s.paw);
    if (s.paw_local) out.push(s.paw_local);
    if (s.hybrid) out.push(s.hybrid);
    if (s.encoder) out.push(s.encoder);
    return out;
  }
  function extraLanes(s) {
    const out = [];
    for (const [host, hl] of Object.entries(s.extra_host_lanes || {})) {
      if (hl.modelless) out.push([hl.modelless, host]);
      for (const k of Object.keys(hl.laya || {})) out.push([hl.laya[k], host]);
      if (hl.clm) out.push([hl.clm, host]);
      if (hl.gliner) out.push([hl.gliner, host]);
      if (hl.bekko) out.push([hl.bekko, host]);
      if (hl.agentjev) out.push([hl.agentjev, host]);
      if (hl.openthai) out.push([hl.openthai, host]);
      if (hl.paw) out.push([hl.paw, host]);
      if (hl.paw_local) out.push([hl.paw_local, host]);
      if (hl.hybrid) out.push([hl.hybrid, host]);
      if (hl.encoder) out.push([hl.encoder, host]);
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
  // pickHost narrows the walk to ONE host (want = the host id; primary-host
  // cells carry host === null, so they compare as primaryHost). pick() is the
  // unscoped best-across-hosts form. The reflex-site Issue-`hero-host-mix`
  // fix: in the all-rigs hero the per-host form renders one labeled bar per
  // host, so a reader can never misread a 4090 bar as the M3's.
  function pickHost(s, lane, want) {
    let best = null;
    for (const [l, host] of scopedPairs(s)) {
      if (want !== null && (host || primaryHost) !== want) continue;
      if (laneOf(l) !== lane || l.model === "multilingual") continue;
      const a = accOf(l);
      if (!num(a)) continue;
      if (!best || a > accOf(best[0])) best = [l, host];
    }
    return best;
  }
  function pick(s, lane) {
    return pickHost(s, lane, null);
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

  const tipHtml = (l, extra, s) => {
    const h = l.hard || {};
    const lane = laneOf(l);
    const acc = accOf(l);
    // The tier-fallback disclosure (the full-coverage serving law, owner
    // 2026-10-02): the cell shows the SERVED answer; the tip names the
    // tier that answered and carries the measured reason this lane's own
    // arm is absent.
    const fb = l.serves === "tier-fallback"
      ? `<br><span class="bc-mut">↩ ${esc(l.served_by || "fallback tier")} answered${l.fallback_note ? ` — ${esc(l.fallback_note)}` : ""}</span>`
      : "";
    // The cc line rides every tooltip whose caller has the suite: SIGNED,
    // with the below-chance callout when negative (plan 001 verdict D1 —
    // the frac() clamp must never be the only place the sign lives).
    const cc = s ? ccOf(l, s) : null;
    return `<span class="bc-sw" style="background:${lane.color}"></span><b>${esc(shortLane(l))} · ${esc(l.model)}</b>${extra ? ` <span class="bc-mut">${esc(extra)}</span>` : ""}<br>` +
      `accuracy ${num(acc) ? pct(acc) : "—"} · acc@50cov ${num(h.acc_at_50_coverage) ? pct(h.acc_at_50_coverage) : "—"}<br>` +
      `p50 ${num(l.latency_p50_ms) ? lat(l.latency_p50_ms) : "—"} · p99 ${num(l.latency_p99_ms) ? lat(l.latency_p99_ms) : "—"}` +
      (num(h.n) ? ` · n=${h.n}` : "") +
      (cc != null ? `<br>cc ${pct(cc)}${cc < 0 ? " — below chance" : ""}` : "") + fb;
  };

  const legend = () => `<div class="bc-legend" aria-label="lanes">${LANES.filter((x) => visibleKey(x.key)).map((x) =>
    `<span><i class="bc-sw" style="background:${x.color}"></i>${esc(x.label)}</span>`).join("")}</div>`;

  const axis = (m) => `<div class="bc-axis">${ticks(m).map(([f, t]) =>
    `<span style="left:${(f * 100).toFixed(2)}%">${esc(t)}</span>`).join("")}</div>`;
  const grid = (m) => ticks(m).map(([f]) =>
    `<i class="bc-grid${latBroken && METRICS[m].log && Math.abs(f - LIN_SPAN) < 1e-9 ? " sz-grid-break" : ""}" style="left:${(f * 100).toFixed(2)}%"></i>`).join("");

  // ── sort: a minimal order toggle for the charts ──────────────────────────
  // "data" is the harness's own suite order / the lane order as published.
  // "by value" is the GENERIC sort (2026-10-02 user ask — acc@50% coverage
  // and chance-corrected acc had no sort at all): it follows the ACTIVE
  // METRIC, so one button covers every metric toggle instead of a sort
  // button per metric, and switching metric with it armed re-sorts on the
  // next render. Direction is per-metric, always best-first: higher
  // accuracy metrics first, shorter latency first. "acc"/"lat" are the
  // fixed-column sorts the per-suite TABLES keep — a table shows accuracy
  // and p50 only (no metric toggle there), so a "by value" would be
  // ambiguous. Key for suite rows: the FIRST VISIBLE lane in LANES order —
  // the product lane at the default filter. Sorting by a lane the reader
  // has filtered out renders as an unsorted page (the bars the reader sees
  // carry no visible order), so the key follows the filter and the note
  // names the lane actually used. Key for lane rows inside a suite table:
  // that lane's own value. Missing cells sort last, never first.
  const SORTS = {
    data: { label: "data order" },
    value: { label: "by value", dirOf: (m) => (METRICS[m].log ? "asc" : "desc") },
    acc: { label: "by accuracy", dir: "desc" },
    lat: { label: "by latency", dir: "asc" },
  };
  const HERO_SORT_KEYS = ["data", "value"];
  const TABLE_SORT_KEYS = ["data", "acc", "lat"];
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

  function sortDirOf(kind, m) {
    const S = SORTS[kind];
    return S ? (S.dir || (S.dirOf ? S.dirOf(m) : null)) : null;
  }
  function sortKeyOf(l, kind, metric, s) {
    if (!l) return null;
    // accOf, same as pick(): the acc-only paw cells must be sortable too.
    // "value" reads the ACTIVE metric — cc's getter takes the suite for its
    // chance baseline, so the caller passes the suite through.
    const v = kind === "value" ? METRICS[metric].get(l, s)
      : kind === "acc" ? accOf(l) : l.latency_p50_ms;
    return num(v) ? v : null;
  }
  function sortPairs(pairs, kind, keyOf, m) {
    if (kind === "data") return pairs;
    const dir = sortDirOf(kind, m) === "desc" ? -1 : 1;
    return pairs.slice().sort((a, b) => {
      const av = keyOf(a), bv = keyOf(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }
  function sortToggleHtml(kind, current, keys) {
    const btns = keys.map((k) =>
      `<button type="button" data-sort="${k}" aria-pressed="${k === current}">${esc(SORTS[k].label)}</button>`).join("");
    return `<div class="bc-toggle" role="group" aria-label="sort ${esc(kind)}">${btns}</div>`;
  }
  // The hero's sort-key lane: the first lane in LANES order the reader has
  // not filtered out (LANES[0] fallback = the product lane, for the
  // everything-hidden corner where no visible lane exists to key on).
  function sortLane() {
    return LANES.find((x) => visibleKey(x.key)) || LANES[0];
  }
  // Only "value" reaches the note body now — the hero's toggle is
  // data/value, and the note names the metric actually sorted by.
  function sortNote(kind, lane, m) {
    if (kind === "data") return "";
    const on = lane ? ` on the ${lane.label} lane` : "";
    const M = METRICS[m];
    return M.log
      ? ` Rows sorted by ${M.label}, fastest first${on}; not-run sorts last.`
      : ` Rows sorted by ${M.label}, best first${on}; not-run sorts last.`;
  }

  // ── hero: every suite × three lanes ──────────────────────────────────────
  let heroData = null, heroMetric = "acc";

  function heroBody() {
    const d = heroData, m = heroMetric, M = METRICS[m], f = fmtOf(m);
    const shown = LANES.filter((lane) => visibleKey(lane.key));
    const sLane = sortLane();
    const sorted = sortPairs((d.suites || []).map((s) => [s, null]), heroSort,
      ([s]) => { const p = pick(s, sLane); return sortKeyOf(p ? p[0] : null, heroSort, m, s); }, m);
    // All-rigs + a known primary host: one bar PER HOST per lane (the
    // host-mix fix — the old single best-accuracy bar put a 4090 cell and an
    // M3 cell in the same chart with the host named only on hover). Any
    // other rig scope is single-host-shaped to the reader and keeps the one
    // picked bar.
    const allSplit = !rig.hosts && !!primaryHost;
    const barHtml = (s, lane, l, host, isPicked) => {
      // (l, s) — the suite feeds chanceOf for cc; dropping it is the
      // all-not-run defect this call site carried (see METRICS.cc).
      const v = M.get(l, s);
      const fr = frac(m, v);
      if (fr === null) return null;
      const brk = M.log && latBroken && v > BREAK_AT
        ? `<i class="sz-break" aria-hidden="true" style="left:${(LIN_SPAN * 100).toFixed(2)}%"></i>` : "";
      // The tier-fallback mark (owner 2026-10-02): the bar carries the
      // SERVED answer — the ↩ badge says the lane's own arm is absent and
      // the answering tier's name is on hover, never an unexplained bar.
      const fbMark = l.serves === "tier-fallback"
        ? `<b class="bc-fb" title="${esc(l.served_by || "fallback tier")} answered">↩</b> `
        : "";
      // Below-chance marker (plan 001 D1): a negative cc clamps to a
      // zero-length bar, which read exactly like a lane AT chance — the
      // tick at the 0 line + the signed tooltip/aria carry the sign.
      const below = m === "cc" && num(v) && v < 0;
      const zero = below ? `<i class="bc-zero" style="background:${lane.color}"></i>` : "";
      return `<div class="bc-hbar"${isPicked ? ' data-picked="1"' : ""} tabindex="0" data-tip="${esc(`<span class="bc-mut">${esc(s.name)}</span><br>` + tipHtml(l, host ? "@" + host : "", s))}" aria-label="${esc(`${s.name} ${lane.label} ${l.model}${host ? " on " + host : ""}: ${f(v)}${below ? " — below chance" : ""}`)}">` +
        `<i style="width:${(fr * 100).toFixed(2)}%;background:${lane.color}"></i>${brk}${zero}` +
        `${fbMark}${host && allSplit ? `<span class="bc-hhost">@${esc(host)}</span>` : ""}</div>`;
    };
    // The honest empty cell: "not run" is reserved for a lane that never
    // measured the suite. A lane that RAN but cannot score on the active
    // metric names what is missing — cc on a suite with no curated chance
    // baseline, acc50 on a cell without the coverage field — so a skipped
    // transform can never masquerade as missing data again.
    // A third state: `s.disclosures[lane.key]` — a lane that will not run
    // the suite for a MEASURED reason (screened dead, law-excluded, no head
    // earned) carries the reason from data/bench.json instead of reading
    // "not run" (2026-10-02 Rethink board completion; the reasons are
    // hand-cited to issue records in publish_bench.py).
    const noneBar = (lane, s, ran) => {
      const why = !ran && s.disclosures && s.disclosures[lane.key] ? s.disclosures[lane.key]
        : !ran ? "not run"
        : m === "cc" && !num(chanceOf(s)) ? "no chance baseline"
        : `no ${M.label} value`;
      return `<div class="bc-hbar bc-none">${esc(lane.label)} — ${esc(why)}</div>`;
    };
    const rows = sorted.map(([s]) => {
      const bars = shown.map((lane) => {
        if (allSplit) {
          const p = pick(s, lane);
          const pickedHost = p ? p[1] || primaryHost : null;
          const hosts = [primaryHost, ...Object.keys(s.extra_host_lanes || {})];
          const parts = [];
          for (const h of hosts) {
            const hp = pickHost(s, lane, h);
            if (!hp) continue;
            const bar = barHtml(s, lane, hp[0], h, h === pickedHost);
            if (bar) parts.push(bar);
          }
          if (parts.length) return parts.join("");
          return noneBar(lane, s, !!pick(s, lane));
        }
        const picked = pick(s, lane);
        const l = picked ? picked[0] : null;
        const host = picked ? picked[1] || primaryHost : null;
        if (!l) return noneBar(lane, s, false);
        return barHtml(s, lane, l, host, true) || noneBar(lane, s, true);
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
      (allSplit
        ? "All-rigs view: each lane renders one bar PER HOST that ran it, labeled @host — hosts are never mixed inside one bar."
        : `Comparison-lane bars (clm, gliner, agentjev, openthai, paw) carry the host they ran on in the tooltip${extraHosts ? " — other hosts' rows stay in the tables below" : ""}.`) +
      (M.log ? (latBroken
        ? ` Latency is log-scale up to ${lat(BREAK_AT)} (each gridline = 10×); a bar past the break sign runs on a compressed log scale (${lat(BREAK_AT)} … ${lat(latMax)}) — read its value from the tooltip. Shorter is faster.`
        : " Latency is log-scale (each gridline = 10×) — shorter is faster.")
        : m === "cc"
        ? " Chance-corrected: 0% = random guessing on that suite's options, so suites with different option counts share one axis. Suites without a curated chance baseline are marked \"no chance baseline\" — skipped, never guessed."
        : " Chance level differs per suite — compare lanes within a row, not rows with each other.") + sortNote(heroSort, sLane, m);
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
    el.innerHTML = `<div class="bc-bar">${legend()}<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="bc-mut">sort</span>${sortToggleHtml("suites", heroSort, HERO_SORT_KEYS)}<div class="bc-toggle" role="group" aria-label="metric">${btns}</div></div></div><div id="bench-hero-body">${heroBody()}</div>`;
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
    // The all-blank guard (2026-10-01, the user's live report): a persisted
    // RIG SCOPE from an older visit must never render the whole board as
    // "— not run" while the data carries scored cells — the rig filter is
    // the only persisted state that can exclude every host's cells (the
    // lane filter hides rows entirely; it cannot produce not-run rows).
    // Count real bars; on zero with a non-default rig, reset the rig to
    // all rigs, re-render once, and say so — the reader loses a stale
    // scope, never the data. A deliberate all-lanes-hidden view (filter)
    // stays the reader's choice and is never touched.
    const dataHasCells = (d.suites || []).some((s) => num(accOf(s.modelless)));
    if (dataHasCells && rig.id !== "all" && !el.querySelector(".bc-hbar:not(.bc-none)")) {
      try { localStorage.removeItem(RIG_KEY); } catch (err) { /* non-fatal */ }
      rig.id = "all"; rig.hosts = null;
      document.getElementById("bench-hero-body").innerHTML = heroBody();
      const note = document.createElement("p");
      note.className = "bc-note";
      note.textContent = "⚠ Your saved rig scope was hiding every result on this page — it has been reset to all rigs. The data was always here.";
      el.querySelector(".bc-bar").after(note);
    }
  }

  // ── per-suite bar table: one row per table row, accuracy | p50 ──────────
  function cell(m, s, l, extra) {
    // (l, s) — same law as barHtml: the suite feeds chanceOf for cc.
    const v = METRICS[m].get(l, s), fr = frac(m, v);
    if (fr === null) return `<div class="bc-cell bc-none">—</div>`;
    // the break sign rides the fill region's own coordinate space (the same
    // (100% - 64px) span the value label reserves), never the value column
    const brk = METRICS[m].log && latBroken && v > BREAK_AT
      ? `<i class="sz-break" aria-hidden="true" style="left:calc((100% - 64px) * ${LIN_SPAN})"></i>` : "";
    // The tier-fallback mark — the value IS what the product serves; the
    // badge + tooltip say which tier answered (owner 2026-10-02).
    const fb = l.serves === "tier-fallback" ? `<b class="bc-fb" title="${esc(l.served_by || "fallback tier")} answered">↩</b>` : "";
    // below-chance: signed value (automatic — pct carries the minus) + the
    // 0-line tick, never a bare zero-length bar
    const below = m === "cc" && num(v) && v < 0;
    const zero = below ? `<i class="bc-zero" style="background:${laneOf(l).color}"></i>` : "";
    return `<div class="bc-cell${below ? " bc-below" : ""}" tabindex="0" data-tip="${esc(tipHtml(l, extra, s))}"><i style="width:calc((100% - 64px) * ${fr.toFixed(4)});background:${laneOf(l).color}"></i>${brk}${zero}<span>${esc(fmtOf(m)(v))}${fb}</span></div>`;
  }

  function suite(s) {
    suiteStore.set(s.name, s);
    const rows = sortPairs(scopedPairs(s).filter(([l]) => visible(l)), suiteSort, ([l]) => sortKeyOf(l, suiteSort));
    if (!rows.length) return "";
    return `<div class="bc-suite" data-bc-suite="${esc(s.name)}" aria-label="${esc(s.name)} lanes compared">` +
      `<div class="bc-sh"></div><div class="bc-sh">accuracy</div><div class="bc-sh">p50 latency · log${latBroken ? ` · break at ${lat(BREAK_AT)}` : ""} · shorter is faster</div>` +
      rows.map(([l, host]) => {
        // The primary host labels its rows too — an untagged row read as
        // "the machine" while every comparison row named its host (the
        // missing @m3-max-metal).
        const hh = host || primaryHost;
        return `<div class="bc-slabel" title="${esc(`${shortLane(l)} · ${l.model}${hh ? " @" + hh : ""}`)}"><i class="bc-sw" style="background:${laneOf(l).color}"></i>${esc(shortLane(l))} · ${esc(l.model)}${l.serves === "tier-fallback" ? ` <b class="bc-fb" title="${esc(l.served_by || "fallback tier")} answered">↩</b>` : ""}${hh ? ` <span class="bc-mut">@${esc(hh)}</span>` : ""}</div>` +
        cell("acc", s, l, hh ? "@" + hh : "") + cell("p50", s, l, hh ? "@" + hh : "");
      }).join("") +
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
      const v = METRICS[m].get(l, s);
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
      : m === "cc"
        ? "Band = min → max suite chance-corrected accuracy; tick = macro-average; 0% = random guessing on that suite's option count (the same scale as the area radar), so suites compare — bars clip at the 0% chance line, tooltips carry exact values. "
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
    return sortToggleHtml("lanes within each suite", suiteSort, TABLE_SORT_KEYS);
  }
  function setSuiteSort(kind) {
    if (!TABLE_SORT_KEYS.includes(kind)) return;
    suiteSort = kind;
    for (const [name, s] of suiteStore) {
      const el = document.querySelector(`[data-bc-suite="${CSS.escape(name)}"]`);
      if (el) el.outerHTML = suite(s);
    }
    const ctrl = document.getElementById("suite-sort");
    if (ctrl) for (const b of ctrl.querySelectorAll("button[data-sort]")) b.setAttribute("aria-pressed", b.dataset.sort === suiteSort);
  }

  // ── the area radar (the /bench/ decision-index cards) ────────────────
  // Renders data.areas — publish_bench.py's compute_areas block (the
  // derived rollups ride the published bench.json; the page never
  // re-derives them). Two cards, the leaderboard's shape: "All areas"
  // (one spoke per area, each the lane's mean chance-corrected score over
  // the area's benchmarks; the index is the mean of the spokes) and "All
  // benchmarks" (one spoke per suite). Chance-corrected so a 4-way and a
  // 77-way suite share a radius: 0 = random guessing, 1 = every question
  // right. Lanes honor the lane filter; the rollups are primary-host rows,
  // except a lane the primary host never ran — it rolls up from its
  // serving host under a host-tagged key and renders the host beside its
  // name. A partial lane draws its SERVED answer on the suites its own
  // arm never measured (the tier-fallback spokes publish_bench.py marks
  // in the rollup): the spoke draws as a TRIANGLE (rd-fb), the tooltip
  // names the answering tier, the legend counts the fill — a suite
  // nothing measurable serves stays a gap, never zero dressed as data.
  const AREA_LANE_KEYS = {
    modelless: "katgpt", hybrid: "instinct", encoder: "instinct-encoder",
    laya: "rust", python: "python", clm: "clm", gliner: "gliner",
    agentjev: "agentjev", openthai: "openthai", paw: "paw", paw_local: "paw",
  };
  // The block's lane key → filter palette key: the curated keys map
  // explicitly, a comparison lane keys as itself, and a serving-host
  // lane's "@host" suffix strips ("clm@4090-win" → "clm") so ONE filter
  // chip gates every posture of the lane.
  const areaPaletteKey = (key) => {
    const k = String(key);
    return AREA_LANE_KEYS[k] || AREA_LANE_KEYS[k.split("@")[0]] || k.split("@")[0];
  };

  function radarLaneRows(A) {
    return Object.entries(A.lanes).map(([key, ld]) => {
      const meta = LANES.find((x) => x.key === areaPaletteKey(key)) || OTHER;
      const host = ld.host ? " · " + (RIG_LABELS[ld.host] || ld.host) : "";
      return { key, meta, label: (ld.display || meta.label) + host, color: meta.color, data: ld };
    }).filter((l) => !(window.BenchFilter && window.BenchFilter.ready()) || window.BenchFilter.visibleKey(l.meta.key));
  }

  function radarSvg(spokes, laneRows, valuesOf, tipOf, ariaOf, fbOf) {
    const n = spokes.length;
    const W = 430, H = 344, cx = 215, cy = 172, R = 112;
    const f2 = (v) => (+v).toFixed(2);
    const pt = (i, r) => {
      const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    let out = `<svg class="rd-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="radar chart, ${esc(String(n))} spokes">`;
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const pts = spokes.map((_, i) => pt(i, f * R).map(f2).join(",")).join(" ");
      out += `<polygon class="rd-ring${f === 1 ? " rd-ring-outer" : ""}" points="${pts}"/>`;
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, R);
      out += `<line class="rd-spoke" x1="${cx}" y1="${cy}" x2="${f2(x)}" y2="${f2(y)}"/>`;
    }
    spokes.forEach((label, i) => {
      const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
      const c = Math.cos(a);
      const [x, y] = pt(i, R + 14);
      const anchor = c > 0.35 ? "start" : c < -0.35 ? "end" : "middle";
      out += `<text class="rd-label" x="${f2(x)}" y="${f2(y + 3.5)}" text-anchor="${anchor}">${esc(String(label))}</text>`;
    });
    for (const lane of laneRows) {
      const measured = [];
      valuesOf(lane).forEach((v, i) => {
        if (!num(v)) return;
        measured.push([i, pt(i, Math.max(0, Math.min(1, v)) * R)]);
      });
      if (measured.length >= 3) {
        const d = measured.map(([, p], j) => `${j ? "L" : "M"}${f2(p[0])},${f2(p[1])}`).join("") +
          (measured.length === n ? "Z" : "");
        out += `<path class="rd-poly" d="${d}" style="stroke:${lane.color};fill:${lane.color}"/>`;
      } else if (measured.length === 2) {
        const [[, p1], [, p2]] = measured;
        out += `<line class="rd-polyline" x1="${f2(p1[0])}" y1="${f2(p1[1])}" x2="${f2(p2[0])}" y2="${f2(p2[1])}" style="stroke:${lane.color}"/>`;
      }
      for (const [i, p] of measured) {
        // below-chance mark: HOLLOW at the centre (the clamp would sit it
        // exactly on a 0 spoke — the hollow fill is what says negative;
        // the tooltip carries the signed value)
        const v = valuesOf(lane)[i];
        const below = num(v) && v < 0;
        const tip = ` data-tip="${esc(tipOf(lane, i))}" tabindex="0" aria-label="${esc(ariaOf(lane, i))}"`;
        if (fbOf && fbOf(lane, i)) {
          // fallback spoke: TRIANGLE (▲) — the served tier answers where
          // this lane's own arm has no cell; hollow when below chance,
          // the same language as the hollow below-chance ring.
          const r = 4.3, x = p[0], y = p[1];
          const pts = `${f2(x)},${f2(y - r)} ${f2(x - r * 0.92)},${f2(y + r * 0.72)} ${f2(x + r * 0.92)},${f2(y + r * 0.72)}`;
          out += `<polygon class="rd-dot rd-fb${below ? " rd-dot-below" : ""}" points="${pts}" style="fill:${below ? "none" : lane.color};stroke:${below ? lane.color : "none"};stroke-width:${below ? 1.6 : 0}"` + tip + `/>`;
        } else {
          out += `<circle class="rd-dot${below ? " rd-dot-below" : ""}" cx="${f2(p[0])}" cy="${f2(p[1])}" r="3.2" style="fill:${below ? "none" : lane.color};stroke:${below ? lane.color : "none"};stroke-width:${below ? 1.6 : 0}"` + tip + `/>`;
        }
      }
    }
    return out + "</svg>";
  }

  // Compact legend spellings of the published lane kinds — the full form
  // stays in the lane profile and tooltips; a long kind (or mark) wrapped
  // the legend row onto a second line.
  const KIND_SHORT = {
    "modelless-in-process": "modelless",
    "trained-head": "trained",
    "encoder": "encoder",
    "python-subprocess": "py-sub",
    "http-oracle": "http",
    "compiled-program": "compiled",
  };

  function radarLegend(laneRows, scoreOf) {
    return laneRows.map((lane) => {
      // fallback lanes lead with the FILL count (▲ marks a fallback
      // spoke — the served tier answers). A partial lane discloses only
      // through its coverage count (8/9) — the old partial+pending note
      // wrapped every partial row onto a second line.
      const fbn = (lane.data.fallback_suites || []).length;
      const mark = fbn ? ` · ${fbn} fallback ▲` : "";
      const kind = lane.data.kind ? (KIND_SHORT[lane.data.kind] || lane.data.kind) + " · " : "";
      return `<div class="rd-lg">` +
        `<i class="bc-sw" style="background:${lane.color}"></i>` +
        `<b>${esc(lane.label)}</b>` +
        `<span class="rd-lg-idx">${num(scoreOf(lane)) ? pct(scoreOf(lane)) : "—"}</span>` +
        `<span class="bc-mut">${esc(kind)}${lane.data.coverage ? `${lane.data.coverage.suites}/${lane.data.coverage.of}` : ""}` +
        mark +
        `</span></div>`;
    }).join("");
  }

  function areas(d, el) {
    if (!el) return;
    const A = d && d.areas;
    if (!A || !A.areas || !A.lanes || !A.suites) {
      el.innerHTML = "<p class=\"bc-note\">area rollups are not in this bench.json yet — re-publish with the compute_areas-capable publish_bench.py</p>";
      return;
    }
    tooltip();
    setPrimaryHost(d.meta && d.meta.host);
    const laneRows = radarLaneRows(A);
    const chanceTxt = (name) => (A.suites[name] ? pct(A.suites[name].chance) : "?");
    // card 1 — one spoke per area
    const areaDefs = A.areas;
    const areaVals = (lane) => areaDefs.map((a) => {
      const v = lane.data.areas ? lane.data.areas[a.id] : undefined;
      return v === undefined ? null : v;
    });
    const areaTip = (lane, i) => {
      const a = areaDefs[i];
      const rows = a.suites.map((name) => {
        const e = lane.data.per_suite[name];
        return e ? `${esc(name)}: <b>${pct(e.acc)}</b> raw${e.fallback ? " (▲ fallback)" : ""}` : `${esc(name)}: not run`;
      }).join("<br>");
      const fbCount = a.suites.filter((n) => ((lane.data.per_suite || {})[n] || {}).fallback).length;
      return `<span class="bc-sw" style="background:${lane.color}"></span><b>${esc(lane.label)}</b> · ${esc(a.label)}<br>` +
        `area score ${num((lane.data.areas || {})[a.id]) ? pct(lane.data.areas[a.id]) : "—"} (chance-corrected mean)<br>` +
        `<span class="bc-mut">${rows}</span>` +
        (fbCount ? `<br><span class="bc-mut">includes ${fbCount} fallback spoke(s)</span>` : "");
    };
    const areaAria = (lane, i) =>
      `${lane.label} ${areaDefs[i].label}: ${num((lane.data.areas || {})[areaDefs[i].id]) ? pct(lane.data.areas[areaDefs[i].id]) : "not run"}`;
    // card 2 — one spoke per benchmark (data.areas.suites insertion order)
    const suiteNames = Object.keys(A.suites);
    const suiteVals = (lane) => suiteNames.map((name) => {
      const e = lane.data.per_suite[name];
      return e ? e.cc : null;
    });
    const suiteTip = (lane, i) => {
      const name = suiteNames[i];
      const e = lane.data.per_suite[name];
      if (!e) return `<span class="bc-sw" style="background:${lane.color}"></span><b>${esc(lane.label)}</b> · ${esc(name)}<br>not run`;
      const fbLine = e.fallback
        ? `<br><span class="bc-mut">▲ tier fallback — served by ${esc(e.served_by || "the answering tier")}` +
          (num(e.record_acc) ? `; this lane's own refused record read ${pct(e.record_acc)}` : "") + `</span>`
        : "";
      return `<span class="bc-sw" style="background:${lane.color}"></span><b>${esc(lane.label)}</b> · ${esc(name)}${e.ck ? ` <span class="bc-mut">(${esc(e.ck)} checkpoint)</span>` : ""}<br>` +
        `chance-corrected <b>${pct(e.cc)}</b> · accuracy <b>${pct(e.acc)}</b> (chance ${chanceTxt(name)})` + fbLine;
    };
    const suiteAria = (lane, i) => {
      const name = suiteNames[i];
      const e = lane.data.per_suite[name];
      if (!e) return `${lane.label} ${name}: not run`;
      return `${lane.label} ${name}: ${pct(e.cc)} chance-corrected` +
        (e.fallback ? ` (tier fallback, served by ${e.served_by || "the answering tier"})` : "");
    };
    const laneMean = (lane) => {
      const vs = suiteNames.map((name) => (lane.data.per_suite[name] || {}).cc).filter(num);
      return vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : null;
    };
    // fallback spokes draw on the per-benchmark card (the areas card rolls
    // them into its means and discloses the count in the tooltip)
    const suiteFb = (lane, i) => {
      const e = lane.data.per_suite[suiteNames[i]];
      return !!(e && e.fallback);
    };
    el.innerHTML =
      `<div class="area-cards">` +
      `<div class="area-card"><h3>All areas <span class="bc-mut">· decision index</span></h3>` +
      radarSvg(areaDefs.map((a) => a.label), laneRows, areaVals, areaTip, areaAria) +
      `<div class="rd-legend">${radarLegend(laneRows, (l) => l.data.index)}</div>` +
      `<p class="bc-note">${esc("One spoke per area — the lane's mean chance-corrected score over the area's benchmarks; the index is the mean of the spokes. " + A.scale + ". Primary-host rows; a lane the primary host never ran renders from its serving host (host named on the lane). A lane's fallback spokes (triangles on the benchmarks card) roll into its area means.")}</p></div>` +
      `<div class="area-card"><h3>All benchmarks <span class="bc-mut">· ${esc(String(suiteNames.length))} spokes</span></h3>` +
      radarSvg(suiteNames, laneRows, suiteVals, suiteTip, suiteAria, suiteFb) +
      `<div class="rd-legend">${radarLegend(laneRows, laneMean)}</div>` +
      `<p class="bc-note">${esc(`One spoke per benchmark (${suiteNames.length}), chance-corrected — hover a point for the raw accuracy. A lane's own spokes are dots; a triangle (▲) marks a fallback spoke — the served tier's answer where the lane's own arm has no seated cell (see the Instinct section); a suite nothing measurable serves stays a gap, never zero. Coverage counts the lane's own measured suites. Primary-host rows; serving-host lanes carry their host.`)}</p></div>` +
      `</div>`;
  }

  // ── the efficiency frontier (plan 001 task 10) ─────────────────────
  // cc decision index (y) vs p50 latency (x, log) — the one view no
  // leaderboard in the Jev index publishes: quality per millisecond. Both
  // axes are PUBLISHED numbers (areas.lanes[k].index + areas.timing[k]
  // .p50_geomean_ms — the publisher owns the aggregates, the page never
  // re-derives them); the only client-side geometry is the Pareto marks:
  // a dot is on the frontier when no lane of the SAME coverage group (the
  // same suite count behind the index) sits up-and-left of it — a partial
  // lane "beating" a complete one is a comparison across different
  // populations and must not dominate (the 2026-10-02 verdict call).
  function frontier(d, el) {
    if (!el) return;
    const A = d && d.areas;
    if (!A || !A.lanes || !A.timing) {
      el.innerHTML = `<p class="bc-note">the efficiency frontier needs bench.json areas v3 (timing + kind) — refresh with publish_bench.py --rederive data/bench.json</p>`;
      return;
    }
    tooltip();
    const pts = [], missing = [];
    for (const [key, ld] of Object.entries(A.lanes)) {
      const t = A.timing[key] || {};
      if (num(ld.index) && num(t.p50_geomean_ms) && t.p50_geomean_ms > 0)
        pts.push({ key, ld, t, x: t.p50_geomean_ms, y: ld.index });
      else missing.push({ ld, why: !num(ld.index) ? "no index" : "no quotable latency" });
    }
    if (!pts.length) {
      el.innerHTML = `<p class="bc-note">no lane has both an index and quotable latency yet.</p>`;
      return;
    }
    const covKey = (p) => Object.keys(p.ld.per_suite || {}).sort().join(",");
    // Timing-partial lanes (a n_used < suites geomean describes a SUBSET of
    // the lane's index population) neither dominate nor are dominated —
    // they plot marked, never as frontier members (the 2026-10-02 verdict
    // round 2: the encoder's 2-of-7 geomean drew ringed under an axis
    // label that claimed lane-wide coverage).
    const timingFull = (p) => p.t.n_used === p.t.suites;
    const dominated = (p) => !timingFull(p) ? false : pts.some((q) =>
      q !== p && timingFull(q) && covKey(q) === covKey(p) &&
      q.x <= p.x && q.y >= p.y && (q.x < p.x || q.y > p.y));
    const W = 470, H = 310, L = 52, R = 16, T = 16, B = 40;
    const xs = pts.map((p) => p.x);
    const xmin = Math.log10(Math.min(...xs)) - 0.15;
    const xmax = Math.log10(Math.max(...xs)) + 0.15;
    const ymin = Math.min(0, ...pts.map((p) => p.y));
    const px = (v) => L + ((Math.log10(v) - xmin) / (xmax - xmin)) * (W - L - R);
    const py = (v) => T + (1 - (v - ymin) / (1 - ymin)) * (H - T - B);
    let out = `<svg class="ft-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="efficiency frontier: cc decision index versus p50 latency">`;
    for (let e = Math.ceil(xmin); e <= Math.floor(xmax); e++) {
      const x = px(Math.pow(10, e));
      out += `<line class="ft-grid" x1="${x.toFixed(1)}" y1="${T}" x2="${x.toFixed(1)}" y2="${H - B}"/>` +
        `<text class="ft-tick" x="${x.toFixed(1)}" y="${H - B + 14}" text-anchor="middle">${esc(lat(Math.pow(10, e)))}</text>`;
    }
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      if (t < ymin - 1e-9) continue;
      out += `<line class="ft-grid" x1="${L}" y1="${py(t).toFixed(1)}" x2="${W - R}" y2="${py(t).toFixed(1)}"/>` +
        `<text class="ft-tick" x="${L - 6}" y="${(py(t) + 3).toFixed(1)}" text-anchor="end">${Math.round(t * 100)}%</text>`;
    }
    out += `<line class="ft-chance" x1="${L}" y1="${py(0).toFixed(1)}" x2="${W - R}" y2="${py(0).toFixed(1)}"/>` +
      `<text class="ft-tick ft-chance-t" x="${W - R}" y="${(py(0) - 5).toFixed(1)}" text-anchor="end">chance</text>` +
      `<text class="ft-axis" x="${((L + W - R) / 2).toFixed(0)}" y="${H - 3}" text-anchor="middle">p50 latency · geometric mean over the lane's index suites · log</text>`;
    for (const p of pts) {
      const meta = LANES.find((x) => x.key === areaPaletteKey(p.key)) || OTHER;
      const on = timingFull(p) && !dominated(p);
      const partial = p.ld.complete === false;
      // timing-partial: the geomean covers a SUBSET of the index suites —
      // dashed stroke, never a frontier ring, aria carries the subset size
      const tpartial = !timingFull(p);
      const cx = px(p.x), cy = py(p.y);
      const host = p.ld.host ? " · @" + p.ld.host : "";
      const tip = `<b>${esc((p.ld.display || meta.label) + host)}</b><br>` +
        `cc index <b>${pct(p.y)}</b> · p50 geo <b>${lat(p.x)}</b> (${p.t.n_used} quotable of ${p.t.suites})<br>` +
        `<span class="bc-mut">${esc(p.ld.kind || "")} · ${esc(p.t.clock || "")}</span>` +
        (partial ? `<br><span class="bc-mut">partial coverage — ${p.ld.coverage.suites}/${p.ld.coverage.of}</span>` : "") +
        (tpartial ? `<br><span class="bc-mut">timing partial — the geomean covers ${p.t.n_used} of ${p.t.suites} index suites; excluded from the frontier</span>` : "") +
        (on ? `<br><span class="bc-mut">on the Pareto frontier (within its coverage group)</span>` : "");
      if (on) out += `<circle class="ft-ring" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="8.5" style="stroke:${meta.color}"/>`;
      out += `<circle class="rd-dot${partial ? " ft-partial" : ""}${tpartial ? " ft-tpartial" : ""}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.6" style="fill:${meta.color};fill-opacity:${partial ? 0.25 : 1};stroke:${meta.color};stroke-width:${tpartial ? 1.6 : 1};stroke-dasharray:${tpartial ? "2.5 2" : "none"}"` +
        ` data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(`${p.ld.display || meta.label} index ${pct(p.y)} p50 ${lat(p.x)} timing ${p.t.n_used}/${p.t.suites}${on ? " on the frontier" : ""}${partial ? " partial" : ""}`)}"/>`;
    }
    out += `</svg>`;
    const missNote = missing.length
      ? ` Not plotted: ${missing.map((m) => esc(`${m.ld.display || m.key} — ${m.why}`)).join("; ")}.`
      : "";
    el.innerHTML = `<div class="ft-wrap">${out}</div>` +
      `<p class="bc-note">${esc("One dot per lane: the cc decision index (y) against the p50 latency geometric mean over the lane's QUOTABLE index suites (x, log). Ringed dots sit on the Pareto frontier within their coverage group — lanes only compete against lanes that measured the SAME suites, and only on full timing; dashed dots are timing-partial (the geomean covers a subset of the index suites); hollow dots are partial lanes. Timing methods differ per lane — the table below says which clock each number comes from.")}${missNote}</p>`;
  }

  // ── the per-lane profile view (plan 001 task 8; /bench/?lane=<id>) ──
  // Read-only over the published blocks: the lane's headline (index,
  // coverage, kind, timing method) + its per-suite rows with the cc
  // column. It never touches the saved lane filter — a URL-scoped view
  // must not clobber the reader's persisted state.
  function profile(d, el) {
    if (!el) return;
    let want = null;
    try { want = new URLSearchParams(location.search).get("lane"); } catch (e) { /* no location (smoke stubs) */ }
    if (!want) { el.innerHTML = ""; return; }
    const A = d && d.areas;
    const key = A && A.lanes ? (A.lanes[want] ? want
      : (Object.keys(A.lanes).find((k) => areaPaletteKey(k) === want && !k.includes("@"))
        || Object.keys(A.lanes).find((k) => areaPaletteKey(k) === want))) : null;
    if (!key) {
      el.innerHTML = `<p class="bc-note">no lane “${esc(want)}” in this bench.json (lanes: ${esc(Object.keys((A && A.lanes) || {}).join(", ") || "none")}).</p>`;
      return;
    }
    const ld = A.lanes[key];
    const t = (A.timing || {})[key] || {};
    const meta = LANES.find((x) => x.key === areaPaletteKey(key)) || OTHER;
    const host = ld.host ? " · @" + esc(ld.host) : "";
    const suiteByName = new Map((d.suites || []).map((s) => [s.name, s]));
    const rows = Object.keys(A.suites).map((name) => {
      const e = ld.per_suite[name];
      const s = suiteByName.get(name);
      let cellc = null;
      if (s && e) {
        const cls = key.split("@")[0];
        const container = key.includes("@")
          ? ((s.extra_host_lanes || {})[key.split("@")[1]] || {}) : s;
        cellc = e.ck ? (container.laya || {})[e.ck] : container[cls];
      }
      const ccTxt = e ? pct(e.cc) + (e.cc < 0 ? " — below chance" : "") : "not run";
      const p50 = cellc && num(cellc.latency_p50_ms) ? lat(cellc.latency_p50_ms) : "—";
      const q = cellc ? cellc.latency_quotable : undefined;
      const qTxt = q === true ? "quotable" : q === false ? "unfit box" : q === null ? "unjudged" : "—";
      const det = cellc && cellc.determinism_ok === true ? "✓" : cellc && cellc.determinism_ok === false ? "✗" : "—";
      const sha = cellc && cellc.source_run && cellc.source_run.git_sha ? String(cellc.source_run.git_sha) : "—";
      return `<tr><td>${esc(name)}</td><td>${e ? pct(e.acc) : "—"}</td>` +
        `<td${e && e.cc < 0 ? ' class="ft-neg"' : ""}>${ccTxt}</td>` +
        `<td>${p50}</td><td>${qTxt}</td><td>${det}</td><td><span class="bc-mut">${esc(sha)}</span></td></tr>`;
    }).join("");
    const geoTxt = num(t.p50_geomean_ms)
      ? lat(t.p50_geomean_ms)
      : `not plotted (${t.n_unjudged || 0} unjudged / ${t.n_unquotable || 0} unfit of ${t.suites || 0} cells)`;
    el.innerHTML = `<div class="lane-profile" style="border-left:4px solid ${meta.color};padding-left:12px">` +
      `<h3>${esc(ld.display || meta.label)}${host} <span class="bc-mut">· ${esc(ld.kind || "")}</span></h3>` +
      `<p class="bc-note">cc index <b>${num(ld.index) ? pct(ld.index) : "—"}</b> · coverage ${ld.coverage.suites}/${ld.coverage.of}${ld.complete ? " (complete)" : " (partial — pending suites stay pending, never zero)"} · clock ${esc(t.clock || "?")} — ${esc(t.method || "")} · p50 geo ${geoTxt}</p>` +
      `<div class="scroll"><table class="bench"><thead><tr><th>suite</th><th>acc</th><th>cc</th><th>p50</th><th>timing</th><th>det</th><th>source run</th></tr></thead><tbody>${rows}</tbody></table></div>` +
      `<p class="bc-note"><a href="/bench/">← full board</a> — this view is read-only and does not touch your saved lane filter.</p>` +
      `</div>`;
  }

  window.BenchCharts = { hero, suite, setLogDomain, summary, areas, frontier, profile, suiteSortControl, setSuiteSort, setPrimaryHost, lat, accOf, ccOf };
  window.BenchRig.scoped = scopedPairs;
})();
