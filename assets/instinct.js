/* instinct.js — the Instinct verdict block on /bench/#instinct, rendered
   from data/bench.json at load (the site's number law: never hand-typed).

   Two verdict groups, told from Instinct's side, each = a short headline
   (the majority-law mark) + a segmented "remain" bar + ONE LINE PER SUITE
   (owner ask 2026-09-29: the prose rows were unreadable):

   1. "Instinct vs Reflex" — the row law MOVED here from the arena TL;DR
      (owner call 2026-09-29): the arena stays Reflex's; Reflex is free, so
      Instinct must EARN its place. The MARK follows the majority law (the
      same one the Reflex-vs-laya row uses): green ✓ only when ahead on
      EVERY suite with an arm, YELLOW ✓ on a strict majority, red ✗ on a
      minority or a tie-heavy board — a tie is still no reason to pay.
      The Bench-068 Wilson screen marks within-noise trailing suites ≈ on
      their own lines instead of enumerating them in prose.

   2. "Instinct vs best lane" — the RAISED bar (instinct .issues/008
      amendment, 2026-09-29): free Reflex is the floor, not the bar. The
      competitor is the best published lane per suite — every comparison
      lane included (laya's best non-multilingual checkpoint, clm, gliner,
      agentjev, openthai, paw), any host (accuracy is box-independent, the
      same law the charts' pick() uses). Same majority mark: green only
      when strictly best everywhere (the GOAT chip flips with it).

   Per-suite line: a loading bar — fill = Instinct (its lane color), a
   tick at the compared lane's accuracy (THAT lane's palette color, one
   home: BenchLanes in bench-charts.js), the dim span between = the gap
   (what remains). Colors follow the LANE, never the verdict, so a line
   reads the same as the charts above it.

   Status chip: "PoC" until Instinct is strictly ahead of every other lane
   on every suite it covers; when that flips, the chip reads GOAT and the
   row may return to the arena TL;DR (owner call at that point — instinct
   .issues/008 T9). */

fetch("/data/bench.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then(render)
  .catch((e) => {
    const box = document.getElementById("instinct-verdict");
    if (box) box.textContent = `benchmark data unavailable (${e.message}) — see the tables above.`;
  });

const pct = (x) => (x * 100).toFixed(1) + "%";
const nOf = (cell) => (cell && cell.hard && cell.hard.n) || null;
const accOf = (l) => {
  const h = (l && l.hard || {}).accuracy;
  return h != null ? h : (l && l.accuracy);
};
const isModelless = (l) => l.lane === "KatGPT" || l.model === "modelless";
const isHybrid = (l) => l.lane === "Instinct (hybrid)";

// The 95% Wilson score interval (the arena_tldr.js screen, same constants).
function wilson(p, n, z = 1.96) {
  if (!n || p == null) return null;
  const den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const hw = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [c - hw, c + hw];
}
const inWilson = (p, n, x) => {
  const ci = wilson(p, n);
  return ci != null && x >= ci[0] && x <= ci[1];
};

// Every lane cell of a suite, tagged with its host (null = primary run).
// NOTE: the instinct ENCODER lane (riir-instinct issue 014 C1, serve: ✗)
// is deliberately NOT enumerated — a serve-refused arm is not the serving
// lane and must not move the "Instinct vs best lane" board (its cell is
// visible in the tables/charts with its own serves/gate disclosure).
function cellsOf(s) {
  const out = [];
  const push = (l, host) => { if (l && accOf(l) != null) out.push([l, host]); };
  if (s.modelless) push(s.modelless, null);
  for (const k of Object.keys(s.laya || {})) push(s.laya[k], null);
  for (const k of ["clm", "gliner", "agentjev", "openthai", "paw", "paw_local", "hybrid"]) push(s[k], null);
  for (const [host, hl] of Object.entries(s.extra_host_lanes || {})) {
    if (hl.modelless) push(hl.modelless, host);
    for (const k of Object.keys(hl.laya || {})) push(hl.laya[k], host);
    for (const k of ["clm", "gliner", "agentjev", "openthai", "paw", "paw_local", "hybrid"]) push(hl[k], host);
  }
  return out;
}

function row(state, text) {
  const li = document.createElement("li");
  li.className = state === true ? "ok" : state === false ? "gap" : state === "warn" ? "warn" : "eq";
  li.innerHTML = `<i>${state === true || state === "warn" ? "✓" : state === false ? "✗" : "="}</i><div class="iv-main"></div>`;
  li.querySelector(".iv-main").innerHTML = text;
  return li;
}

const ivEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The segmented "remain" bar: one segment per state, flex = the count, so
// the bar IS the fraction (how many won / tied / remain / have no arm yet).
function segBar(parent, up, eq, down, none) {
  const seg = (cls, n, title) => n > 0 || cls === "none"
    ? `<i class="${cls}" style="flex:${Math.max(n, 0.0001)}" title="${ivEsc(title)}"></i>` : "";
  const d = document.createElement("div");
  d.className = "iv-seg";
  d.innerHTML = seg("up", up, `${up} won`) + seg("eq", eq, `${eq} tied`) +
    seg("down", down, `${down} remain`) +
    (none > 0 ? seg("none", none, `${none} of the published suites have no Instinct arm yet`) : "");
  parent.appendChild(d);
}

// One suite line: suite | loading bar (fill = Instinct, tick + dim gap
// span = the compared lane, in THAT lane's palette color) | numbers | delta.
function suiteLine(L, r, cmp, opts = {}) {
  const li = document.createElement("li");
  li.className = "iv-line";
  const w = (x) => Math.max(0, Math.min(100, x * 100)).toFixed(2);
  const instW = w(r.inst);
  const cmpW = cmp.acc == null ? null : w(cmp.acc);
  const lo = cmpW == null ? +instW : Math.min(+instW, +cmpW);
  const hi = cmpW == null ? +instW : Math.max(+instW, +cmpW);
  const d = cmp.acc == null ? null : r.inst - cmp.acc;
  let cls = "eq", delta = "±0.0", title = "";
  if (d != null && d > 1e-9) { cls = "up"; delta = `+${(d * 100).toFixed(1)}`; }
  else if (d != null && d < -1e-9) { cls = "down"; delta = `−${(Math.abs(d) * 100).toFixed(1)}`; }
  if (opts.noise && d != null && d < -1e-9) {
    cls = "noise"; delta = `≈ −${(Math.abs(d) * 100).toFixed(1)}`;
    title = ` within noise at this arm's n=${r.instN} (the Bench-068 Wilson screen)`;
  }
  const cmpColor = L.color(cmp.lane);
  li.innerHTML =
    `<span class="iv-suite" title="${ivEsc(r.name)}">${ivEsc(r.name)}</span>` +
    `<span class="iv-bar">` +
      `<i class="iv-fill" style="width:${instW}%;background:${L.instinct}"></i>` +
      (cmpW != null && hi > lo + 1e-9 ? `<i class="iv-gap" style="left:${lo.toFixed(2)}%;width:${(hi - lo).toFixed(2)}%;background:${cmpColor}"></i>` : "") +
      (cmpW != null ? `<b class="iv-tick" style="left:${cmpW}%;background:${cmpColor}"></b>` : "") +
    `</span>` +
    `<span class="iv-nums"><b style="color:${L.instinct}">${pct(r.inst)}</b> vs ` +
      (cmpW != null
        ? `<span style="color:${cmpColor}">${pct(cmp.acc)} ${ivEsc(cmp.lane)}</span>` +
          (cmp.host ? ` <span class="iv-host">@${ivEsc(cmp.host)}</span>` : "")
        : `<span class="iv-host">no Reflex row</span>`) +
    `</span>` +
    `<span class="iv-delta ${cls}"${title ? ` title="${ivEsc(title.trim())}"` : ""}>${delta}</span>`;
  return li;
}

function linesUl(items) {
  const ul = document.createElement("ul");
  ul.className = "iv-lines";
  for (const el of items) ul.appendChild(el);
  return ul;
}

function render(bench) {
  const box = document.getElementById("instinct-verdict");
  if (!box) return;
  const suites = bench.suites || [];
  const withKm = suites.filter((s) => accOf(s.modelless) != null);

  // Per suite with an arm: the best hybrid cell (any host), the Reflex row,
  // and the best OTHER published lane (best non-multilingual checkpoint,
  // any host — accuracy is box-independent).
  const armed = [];
  for (const s of withKm) {
    const cells = cellsOf(s);
    const hyb = cells.filter(([l]) => isHybrid(l));
    if (!hyb.length) continue;
    const hybCell = hyb.reduce((a, b) => (accOf(b[0]) > accOf(a[0]) ? b : a));
    const inst = accOf(hybCell[0]);
    const kmCell = cells.find(([l]) => isModelless(l));
    const km = kmCell ? accOf(kmCell[0]) : null;
    const others = cells.filter(([l]) => !isHybrid(l) && l.model !== "multilingual");
    const best = others.reduce((a, b) => (accOf(b[0]) > accOf(a[0]) ? b : a));
    armed.push({
      name: s.name, inst, km, kmN: nOf(kmCell && kmCell[0]), instN: nOf(hybCell[0]),
      bestLane: String(best[0].lane).replace(/ \(reference\)$/, "") === "KatGPT" ? "Reflex" : String(best[0].lane).replace(/ \(reference\)$/, ""),
      bestModel: best[0].model, bestAcc: accOf(best[0]), bestHost: best[1],
      edge: inst - accOf(best[0]),
    });
  }

  box.innerHTML = "";
  const meta = bench.meta || {};
  const newest = window.BenchProv ? BenchProv.latestRun(bench) : null;
  const lead = document.createElement("p");
  lead.className = "cases";
  lead.style.cssText = "margin:0 0 6px";
  lead.innerHTML = `Measured on <b>${armed.length}</b> suites with an Instinct arm` +
    (newest ? ` · latest run ${newest.git_sha} (${(newest.date_utc || "?").slice(0, 10)}) · ${newest.host}` : "") +
    ` · single frozen test read per registered arm.`;
  const ul = document.createElement("ul");
  const L = window.BenchLanes ||
    { instinct: "#e06ab4", reflex: "#d95926", color: () => "#8a7468" };
  const noArmTotal = suites.length - armed.length; // a suite with no Reflex row is also unsold (thai_*)

  // ── row 1: vs Reflex (the floor) — the moved arena law ──────────────
  if (armed.length) {
    const ahead = armed.filter((r) => r.km != null && r.inst > r.km)
      .sort((a, b) => (b.inst - b.km) - (a.inst - a.km));
    const notAhead = armed.filter((r) => r.km == null || r.inst <= r.km)
      .sort((a, b) => ((b.km ?? b.inst) - b.inst) - ((a.km ?? a.inst) - a.inst));
    const tied = notAhead.filter((r) => r.km != null && Math.abs(r.inst - r.km) <= 1e-9);
    const gaps = notAhead
      .filter((r) => r.km != null && r.km > r.inst)
      .map((r) => ({ name: r.name, gap: r.km - r.inst, acc: r.inst, n: r.instN }))
      .sort((a, b) => b.gap - a.gap);
    const gapsReal = gaps.filter((r) => !inWilson(r.acc, r.n, r.acc + r.gap));
    const gapsNoise = gaps.filter((r) => inWilson(r.acc, r.n, r.acc + r.gap));
    const noArm = noArmTotal;
    // The majority mark (owner call, matching the Reflex-vs-laya row):
    // green ✓ only when ahead EVERYWHERE, YELLOW ✓ on a strict majority,
    // red ✗ on a minority or a tie-heavy board — the lines name every gap.
    const vsReflexState = notAhead.length === 0 ? true
      : ahead.length * 2 > armed.length ? "warn" : false;
    const li = row(vsReflexState,
      `<div class="iv-head"><b>Instinct vs Reflex, accuracy</b> — ahead on <b>${ahead.length}/${armed.length}</b> suites with an arm` +
      (gapsReal.length + gapsNoise.length ? ` · behind on ${gapsReal.length + gapsNoise.length}` +
        (gapsNoise.length ? ` (${gapsNoise.length} ≈ within noise)` : "") : "") +
      (tied.length ? ` · tied on ${tied.length}` : "") +
      (noArm > 0 ? ` · no Instinct arm yet on ${noArm} of ${suites.length} published suites.` : "."));
    const main = li.querySelector(".iv-main");
    segBar(main, ahead.length, tied.length, gapsReal.length + gapsNoise.length, noArm);
    const lines = [
      ...ahead.map((r) => suiteLine(L, r, { acc: r.km, lane: "Reflex", host: null })),
      ...tied.map((r) => suiteLine(L, r, { acc: r.km, lane: "Reflex", host: null })),
      ...notAhead.filter((r) => r.km != null && r.km > r.inst).map((r) =>
        suiteLine(L, r, { acc: r.km, lane: "Reflex", host: null },
          { noise: gapsNoise.some((g) => g.name === r.name) })),
      ...notAhead.filter((r) => r.km == null).map((r) => suiteLine(L, r, { acc: null, lane: "Reflex", host: null })),
    ];
    main.appendChild(linesUl(lines));
    ul.appendChild(li);
  }

  // ── row 2: vs the best published lane (the bar) ────────────────────────
  let chip;
  if (armed.length) {
    const best = armed.filter((r) => r.edge > 1e-9).sort((a, b) => b.edge - a.edge);
    const tied = armed.filter((r) => Math.abs(r.edge) <= 1e-9);
    const trailing = armed.filter((r) => r.edge < -1e-9).sort((a, b) => a.edge - b.edge);
    const strictlyAll = best.length === armed.length;
    chip = document.createElement("p");
    chip.style.cssText = "margin:0 0 8px";
    chip.innerHTML = `<span class="chip ${strictlyAll ? "ok" : "poc"}">${strictlyAll ? "GOAT" : "PoC"}</span> ` +
      (strictlyAll
        ? `strictly ahead of every published lane on every suite it covers — the bar for leaving this section is met.`
        : `not yet the best lane on every suite it covers: strictly best on <b>${best.length}/${armed.length}</b>, ` +
          `tied on ${tied.length}, trailing on ${trailing.length} — listed below, never hidden. The arena TL;DR stays Reflex's until this flips.`);
    // Same majority law, one lane wider: the bar is EVERY published lane,
    // so the mark is green only when strictly best everywhere (the GOAT
    // chip flips with it), YELLOW on a strict majority, red ✗ on a
    // minority.
    const vsBestState = strictlyAll ? true
      : best.length * 2 > armed.length ? "warn" : false;
    const li = row(vsBestState,
      `<div class="iv-head"><b>Instinct vs best lane, accuracy</b> — strictly best on <b>${best.length}/${armed.length}</b> suites with an arm` +
      (trailing.length ? ` · trails the best on ${trailing.length}` : "") +
      (tied.length ? ` · tied on ${tied.length} (a tie sells nothing)` : "") + ".");
    const main = li.querySelector(".iv-main");
    segBar(main, best.length, tied.length, trailing.length, noArmTotal);
    const cmpOf = (r) => ({ acc: r.bestAcc, lane: r.bestLane, host: r.bestHost });
    main.appendChild(linesUl([
      ...best.map((r) => suiteLine(L, r, cmpOf(r))),
      ...tied.map((r) => suiteLine(L, r, cmpOf(r))),
      ...trailing.map((r) => suiteLine(L, r, cmpOf(r))),
    ]));
    ul.appendChild(li);
  } else {
    chip = document.createElement("p");
    chip.innerHTML = `<span class="chip poc">PoC</span> no registered arm published yet.`;
  }

  box.append(chip, lead);
  if (armed.length) {
    const legend = document.createElement("p");
    legend.className = "iv-legend";
    legend.innerHTML =
      `per suite: <i class="iv-sw" style="background:${L.instinct}"></i>bar = Instinct · <i class="iv-tickdemo"></i>tick = the compared lane (its lane color) · dim span = the gap · ≈ = within noise · grey hatch = no Instinct arm yet`;
    box.append(legend, ul);
  } else {
    box.append(ul);
  }
}
