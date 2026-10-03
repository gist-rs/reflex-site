// The chart render smoke — zero-dependency (no playwright, no jsdom): loads
// bench-charts.js in a stubbed DOM, renders the landing summary chart from
// the REAL data/bench.json, and asserts the min–avg–max range markup is
// well-formed for every rendered lane and metric.
//
//   node scripts/chart_render_smoke.cjs
//
// Exit 0 = green; any assert prints and exits 1. A chart change that breaks
// the range/band/tick structure fails here before any deploy.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const jsFile = path.join(ROOT, "assets", "bench-charts.js");
const dataFile = path.join(ROOT, "data", "bench.json");

// Minimal DOM stub — only what summary()'s render path touches.
const captured = {}; // selector -> { innerHTML, handlers }
function fakeEl(sel) {
  if (!captured[sel]) captured[sel] = { innerHTML: "", handlers: {} };
  const e = captured[sel];
  return {
    get innerHTML() { return e.innerHTML; },
    set innerHTML(v) { e.innerHTML = v; },
    addEventListener(ev, fn) { e.handlers[ev] = fn; },
    setAttribute() {},
    querySelector(sel) { return fakeEl(sel); },
    querySelectorAll() { return []; },
  };
}
global.window = {};
global.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {} },
  addEventListener() {},
};

eval(fs.readFileSync(jsFile, "utf8"));
const d = JSON.parse(fs.readFileSync(dataFile, "utf8"));
if (!window.BenchCharts) { console.error("FAIL: BenchCharts not defined"); process.exit(1); }
if (!d.suites || !d.suites.length) { console.error("FAIL: bench.json has no suites"); process.exit(1); }

const el = fakeEl("summary");
window.BenchCharts.setLogDomain(d);
window.BenchCharts.summary(d, el);

function checkMetric(metric, bodySel) {
  const html = captured[bodySel].innerHTML;
  if (!html.includes("bc-hbar")) { console.error(`FAIL[${metric}]: no bars rendered`); process.exit(1); }
  const bands = html.match(/class="bc-range"/g) || [];
  const marks = html.match(/class="bc-mark"/g) || [];
  const labels = html.match(/aria-label="([^"]+)"/g) || [];
  console.log(`[${metric}] lanes rendered: ${labels.length}, range bands: ${bands.length}, mean ticks: ${marks.length}`);
  if (!marks.length) { console.error(`FAIL[${metric}]: no mean ticks`); process.exit(1); }
  if (!bands.length) { console.error(`FAIL[${metric}]: no range bands (multi-suite lanes exist)`); process.exit(1); }
  // Every band must sit inside the track: left >= 0, left + width <= 100.5.
  for (const m of html.matchAll(/class="bc-range" style="left:([\d.]+)%;width:([\d.]+)%/g)) {
    const left = +m[1], width = +m[2];
    if (!(left >= 0 && left + width <= 100.5)) {
      console.error(`FAIL[${metric}]: band out of track (left=${left}, width=${width})`);
      process.exit(1);
    }
  }
  // min < avg < max must hold in every aria-label of a multi-suite lane.
  for (const m of html.matchAll(/aria-label="([^"]+ averaged[^"]+)"/g)) {
    const a = m[1];
    const minM = a.match(/min ([^,]+), max ([^)]+)\)/);
    if (!minM) continue; // single-suite lane: tick only
    const val = a.match(/averaged: (.+?) over (\d+) suites/);
    if (!val) { console.error(`FAIL[${metric}]: unparseable aria-label: ${a}`); process.exit(1); }
  }
  // Rows sort best-average-first: accuracy descending, latency ascending.
  const toNum = (t) => {
    const m = t.trim().match(/^([\d.]+)\s*(%|µs|ms|s)$/);
    if (!m) { console.error(`FAIL[${metric}]: unparseable average "${t}"`); process.exit(1); }
    return +m[1] * ({ "%": 1, "µs": 1e-3, ms: 1, s: 1e3 })[m[2]];
  };
  const avgs = [...html.matchAll(/aria-label="[^"]+ averaged: (.+?) over \d+ suites/g)].map((m) => toNum(m[1]));
  const lowerBetter = metric === "p50";
  for (let i = 1; i < avgs.length; i++) {
    if (lowerBetter ? avgs[i] < avgs[i - 1] : avgs[i] > avgs[i - 1]) {
      console.error(`FAIL[${metric}]: rows not sorted best-first at row ${i}: ${avgs.join(", ")}`);
      process.exit(1);
    }
  }
  return { bands: bands.length, labels: labels.length };
}

const p50 = checkMetric("p50", "summary");

// The broken latency axis (the /#sizes break-sign idiom): the published data
// carries exactly one past-500 ms lane read (openthai's slowest suite), so
// the p50 body renders exactly one sz-break sign, the dashed break gridline
// once per axis (top + bottom), and an axis tick naming the break. Re-pin
// the count when the data's slowest read moves across the break.
const p50Html = captured["summary"].innerHTML;
const p50Breaks = (p50Html.match(/class="sz-break"/g) || []).length;
if (p50Breaks !== 1) { console.error(`FAIL[p50-break]: expected exactly 1 sz-break sign, got ${p50Breaks}`); process.exit(1); }
const p50GridBreaks = (p50Html.match(/sz-grid-break/g) || []).length;
const p50Rows = (p50Html.match(/class="bc-hbar"/g) || []).length;
// the grid rides EVERY row track (one per lane row), so the break gridline
// count must equal the row count — a grid that lost the break tick reds here
if (p50Rows < 2 || p50GridBreaks !== p50Rows) { console.error(`FAIL[p50-break]: expected a break gridline on every row track (${p50Rows}), got ${p50GridBreaks}`); process.exit(1); }
if (!/style="left:80\.00%">500 ms<\/span>/.test(p50Html)) { console.error("FAIL[p50-break]: the axis does not name the 500 ms break tick"); process.exit(1); }
console.log(`[p50-break] 1 break sign, ${p50GridBreaks} break gridlines (one per row track), axis names the 500 ms break`);

// The family lanes plot on the speed chart, and NO lane ever vanishes from
// it (the 2026-10-03 user reports: hiding the family lanes wholesale read as
// a missing render; hiding unfit lanes read as lost results). The latency
// rows plot the SERVED product: the lane's own arm where it answered, the
// base lane's clock where it declined (↩ — Rethink ≈ Reflex where the
// encoder doesn't fire). Known-bad timing (the box state said NOT QUOTABLE —
// the reflex Issue-021 12× class) never plots; a lane left with nothing
// renders a PRESENCE row with the reason in place (bekko here). Unjudged
// cells (4090, no probes) plot marked unverified. Re-pin the counts when the
// data's verdicts or fallback derivations move.
const familyRows = [...p50Html.matchAll(/aria-label="(Instinct|Rethink) averaged: (.+?) over (\d+) suites/g)];
const byLane = {};
for (const [, lane, val, n] of familyRows) byLane[lane] = { val, n: +n };
if (!byLane["Instinct"] || !byLane["Rethink"]) {
  console.error(`FAIL[p50-family]: Instinct/Rethink missing from the p50 summary — got ${JSON.stringify(byLane)}`);
  process.exit(1);
}
if (byLane["Instinct"].n !== 9 || byLane["Rethink"].n !== 8) {
  console.error(`FAIL[p50-family]: served coverage moved (Instinct ${byLane["Instinct"].n}/9, Rethink ${byLane["Rethink"].n}/8) — re-pin`);
  process.exit(1);
}
// Rethink's row is mostly the base lane answering: the ↩ tag must say so.
const rethinkTag = (p50Html.match(/<span class="bc-mut" title="[^"]*">↩(\d+)<\/span>/g) || []);
if (!rethinkTag.some((t) => t.endsWith("↩5</span>"))) {
  console.error(`FAIL[p50-family]: Rethink's ↩5 served tag missing — got ${rethinkTag.join(", ")}`);
  process.exit(1);
}
// every lane keeps its slot: the unfit-only lane renders a presence row, the
// unjudged lanes (4090) plot again with their disclosure
if (!p50Html.includes("bekko: no verified timing") || /aria-label="bekko averaged/.test(p50Html)) {
  console.error("FAIL[p50-family]: bekko must render a presence row with no value");
  process.exit(1);
}
for (const back of ["paw", "clm", "gliner", "agentjev", "openthai"]) {
  if (!new RegExp(`aria-label="${back} averaged`).test(p50Html)) {
    console.error(`FAIL[p50-family]: ${back} lost its p50 bar — lanes never vanish`);
    process.exit(1);
  }
}
const covTagged = (p50Html.match(/<span class="bc-mut">· \d+\/\d+<\/span>/g) || []).length;
if (covTagged < 2) { console.error(`FAIL[p50-family]: partial-coverage labels not tagged (got ${covTagged})`); process.exit(1); }
if (!p50Html.includes("Unfit timing")) {
  console.error("FAIL[p50-family]: the note must disclose the unfit-exclusion rule");
  process.exit(1);
}
console.log(`[p50-family] Instinct ${byLane["Instinct"].val} over 9 · Rethink ${byLane["Rethink"].val} over 8 (↩5 served) · bekko presence row · unjudged lanes plot marked · ${covTagged} coverage tags`);

// Switch the metric via the captured click handler (accuracy: log=false path).
const toggle = captured[".bc-toggle"];
if (!toggle || !toggle.handlers.click) { console.error("FAIL: metric toggle not wired"); process.exit(1); }
toggle.handlers.click({
  target: { closest: (s) => (s === "button[data-metric]" ? { dataset: { metric: "acc" } } : null) },
});
const acc = checkMetric("acc", ".bc-summary-body");
const accBreaks = (captured[".bc-summary-body"].innerHTML.match(/class="sz-break"/g) || []).length;
if (accBreaks !== 0) { console.error(`FAIL[acc-break]: the accuracy axis must carry no break sign, got ${accBreaks}`); process.exit(1); }
toggle.handlers.click({
  target: { closest: (s) => (s === "button[data-metric]" ? { dataset: { metric: "acc50" } } : null) },
});
checkMetric("acc50", ".bc-summary-body");
toggle.handlers.click({
  target: { closest: (s) => (s === "button[data-metric]" ? { dataset: { metric: "acc" } } : null) },
});

// Regression arm: the OLD markup (a plain width-fill bar with no band) must
// be gone from the summary — the fill <i> carried no class in the old chart.
const oldStyle = /<i style="width:[\d.]+%;background:/.test(captured[".bc-summary-body"].innerHTML);
if (oldStyle) { console.error("FAIL: legacy fill-only bar still rendered"); process.exit(1); }

toggle.handlers.click({
  target: { closest: (s) => (s === "button[data-metric]" ? { dataset: { metric: "cc" } } : null) },
});
const cc = checkMetric("cc", ".bc-summary-body");
const ccHtml = captured[".bc-summary-body"].innerHTML;
if (!ccHtml.includes("random guessing")) {
  console.error("FAIL[cc]: the chance-corrected note is missing");
  process.exit(1);
}
if (!/data-metric="cc"/.test(captured["summary"].innerHTML)) {
  console.error("FAIL[cc]: no chance-corrected metric button rendered");
  process.exit(1);
}
console.log(`[cc] ${cc.bands} bands / ${cc.labels} lanes, note names the chance baseline`);

// The area radar (the /bench/ decision-index cards): renders data.areas —
// two cards (4 area spokes + 9 benchmark spokes), a polygon per lane,
// dots for the lane's own spokes and TRIANGLES (rd-fb) for its fallback
// spokes (the served tier's answer, the 2026-10-02 served-product radar),
// and legend rows naming coverage + the fallback fill.
const areaEl = fakeEl("areas");
window.BenchCharts.areas(d, areaEl);
const aHtml = captured["areas"].innerHTML;
if (!aHtml.includes("<svg") || !aHtml.includes("rd-poly")) {
  console.error("FAIL[radar]: no radar svg/polygons rendered");
  process.exit(1);
}
const polys = (aHtml.match(/class="rd-poly"/g) || []).length;
// below-chance dots carry a SECOND class (rd-dot rd-dot-below), so the
// dot counter must accept both spellings — the exact-match regex went
// stale the day the hollow rings landed (2026-10-02) and under-counted by
// exactly the negative cells.
const dots = (aHtml.match(/class="rd-dot[ "]/g) || []).length;
const legends = (aHtml.match(/class="rd-lg"/g) || []).length;
// Legend rows are data-derived (two cards × every lane the areas block
// carries — 4 product lanes in the v1 block, every filterable lane in v2):
// an equality on a hand-typed count would red on the next lane publish.
const laneCount = Object.keys((d.areas || {}).lanes || {}).length;
if (polys < 3) { console.error(`FAIL[radar]: expected >=3 lane polygons (modelless/hybrid/laya complete), got ${polys}`); process.exit(1); }
if (legends !== laneCount * 2) { console.error(`FAIL[radar]: expected ${laneCount * 2} legend rows (${laneCount} lanes x 2 cards), got ${legends}`); process.exit(1); }
// The partial-lane disclosure is DATA-DERIVED (the coverage the publish
// computes — never a hand-typed literal: the "1/9" of the sst5 era went
// stale the day the lane grew to two suites, issue 017).
const encCov = ((d.areas || {}).lanes || {}).encoder;
const covTxt = encCov && encCov.coverage ? `${encCov.coverage.suites}/${encCov.coverage.of}` : null;
if (!covTxt || !aHtml.includes(covTxt) || !aHtml.includes("Rethink")) {
  console.error(`FAIL[radar]: the partial-lane disclosure (Rethink ${covTxt || "absent"}) is missing`);
  process.exit(1);
}
// A 1-point lane (the Rethink encoder arm) must draw DOTS but no connecting
// line on either card; a 2-point lane draws a legitimate segment. The
// expected polyline count derives from the data, so the guard keeps its
// original teeth (an over-line render exceeds it) without reding on the
// next partial lane that measures exactly two areas.
const numOk = (v) => typeof v === "number" && isFinite(v);
const areaDefsS = (d.areas || {}).areas || [];
const suiteNamesS = Object.keys((d.areas || {}).suites || {});
let expectedLines = 0;
for (const ld of Object.values((d.areas || {}).lanes || {})) {
  if (areaDefsS.filter((a) => numOk((ld.areas || {})[a.id])).length === 2) expectedLines++;
  // The suites-card counter must mirror the renderer's read exactly: a
  // spoke is measured when per_suite[n] exists AND its .cc is a number
  // (the entry is an OBJECT {acc, cc} — the pre-2026-10-01 form
  // `numOk(per_suite[n]) && numOk(per_suite[n].cc)` was dead code: numOk on
  // the object is always false, so the all-benchmarks card was never
  // counted and the guard under-reported by exactly the lanes that drew
  // a two-spoke line there — exposed when the Rethink lane grew to two
  // suites (issue 017) and drew its first legitimate suites-card segment.
  if (suiteNamesS.filter((n) => { const ps = (ld.per_suite || {})[n]; return !!ps && numOk(ps.cc); }).length === 2) expectedLines++;
}
if ((aHtml.match(/rd-polyline/g) || []).length !== expectedLines) {
  console.error(`FAIL[radar]: expected ${expectedLines} polyline segment(s) (lanes with exactly two measured spokes), got ${(aHtml.match(/rd-polyline/g) || []).length} — a 1-point lane drew a line`);
  process.exit(1);
}
console.log(`[radar] ${polys} polygons, ${dots} dots, 2 cards, ${legends} legend rows, partial lane disclosed`);

// Fallback spokes (2026-10-02, the served-product radar): a product lane's
// derived tier-fallback cell rolls up MARKED and draws as a TRIANGLE
// (rd-fb) — the count derives from the published fallback_suites, never a
// hand-typed literal, and the legend + a tooltip must name the fill.
let expectedFb = 0;
for (const ld of Object.values((d.areas || {}).lanes || {}))
  expectedFb += (ld.fallback_suites || []).length;
const fbMarks = (aHtml.match(/rd-fb/g) || []).length;
if (fbMarks !== expectedFb) {
  console.error(`FAIL[radar-fb]: expected ${expectedFb} fallback triangle(s) (the published fallback_suites), got ${fbMarks}`);
  process.exit(1);
}
if (expectedFb > 0 && !aHtml.includes("fallback ▲")) {
  console.error("FAIL[radar-fb]: the legends must disclose the fallback spokes");
  process.exit(1);
}
if (expectedFb > 0 && !/tier fallback — served by /.test(aHtml)) {
  console.error("FAIL[radar-fb]: a fallback tooltip must name the answering tier");
  process.exit(1);
}
console.log(`[radar-fb] ${fbMarks} fallback triangle(s) rendered + disclosed (data-derived)`);

// ── plan 001 (2026-10-02): below-chance cc is VISIBLE, the two formula
// copies agree, and the frontier renders. The published data carries
// negative cc cells (clm@4090-win/banking77, agentjev@4090-win/
// prompt_injections at the time of writing) — the counts below are
// DATA-DERIVED, never hand-typed.
const belowDots = (aHtml.match(/rd-dot-below/g) || []).length;
let expectedBelowDots = 0;
for (const ld of Object.values((d.areas || {}).lanes || {}))
  for (const e of Object.values(ld.per_suite || {}))
    if (numOk(e.cc) && e.cc < 0) expectedBelowDots++;
if (belowDots !== expectedBelowDots || expectedBelowDots < 1) {
  console.error(`FAIL[cc-below]: expected ${expectedBelowDots} hollow below-chance rings (the published per_suite negatives), got ${belowDots}`);
  process.exit(1);
}
console.log(`[cc-below] ${belowDots} hollow below-chance ring(s) on the radar (data-derived)`);

// cc parity: the JS ccOf must agree with EVERY published per_suite cc —
// Python (publish_bench.compute_areas) holds the other copy of the
// formula, and two unpinned copies are a drift waiting to happen.
const areaSuiteOf = (name) => (d.suites || []).find((x) => x.name === name);
function areaCellOf(key, name) {
  const s = areaSuiteOf(name);
  const entry = ((d.areas || {}).lanes || {})[key] && d.areas.lanes[key].per_suite[name];
  if (!s || !entry) return null;
  const cls = key.split("@")[0];
  const container = key.includes("@") ? ((s.extra_host_lanes || {})[key.split("@")[1]] || {}) : s;
  if (entry.ck) return (container.laya || {})[entry.ck] || null;
  const c = container[cls];
  return c && typeof c === "object" ? c : null;
}
let parityN = 0;
for (const [key, ld] of Object.entries((d.areas || {}).lanes || {}))
  for (const [name, e] of Object.entries(ld.per_suite || {})) {
    const cell = areaCellOf(key, name);
    if (!cell) { console.error(`FAIL[cc-parity]: no cell resolves for ${key}/${name}`); process.exit(1); }
    const cc = window.BenchCharts.ccOf(cell, areaSuiteOf(name));
    if (cc === null || Math.abs(cc - e.cc) > 1e-6) {
      console.error(`FAIL[cc-parity]: ${key}/${name} js ${cc} != published ${e.cc}`);
      process.exit(1);
    }
    parityN++;
  }
if (parityN < 10) { console.error(`FAIL[cc-parity]: only ${parityN} entries checked`); process.exit(1); }
console.log(`[cc-parity] ${parityN} published entries agree with the JS ccOf`);

// The hero at the cc metric: every below-chance bar carries the 0-line
// tick, a "below chance" aria callout, and a SIGNED value.
global.location = { search: "" };
global.document.getElementById = (id) => fakeEl(id);
window.BenchCharts.hero(d);
captured[".bc-bar"].handlers.click({
  target: { closest: (s) => (s === "button[data-metric]" ? { dataset: { metric: "cc" } } : null) },
});
const heroCc = captured["bench-hero-body"].innerHTML;
const heroZeros = (heroCc.match(/class="bc-zero"/g) || []).length;
// one callout per below bar lives in the aria-label (the data-tip carries
// a second "below chance" string, so the raw substring count is 2× the
// bar count — count the aria form only)
let heroBelowAris = 0;
for (const m of heroCc.matchAll(/aria-label="([^"]*below chance)"/g)) {
  heroBelowAris++;
  if (!/-\d/.test(m[1])) {
    console.error(`FAIL[cc-hero]: below-chance bar without a signed value: ${m[1]}`);
    process.exit(1);
  }
}
if (!heroZeros || heroZeros !== heroBelowAris) {
  console.error(`FAIL[cc-hero]: ${heroZeros} zero-line tick(s) vs ${heroBelowAris} below-chance aria callout(s) — they must match`);
  process.exit(1);
}
console.log(`[cc-hero] ${heroZeros} below-chance bar(s) marked, values signed`);

// Old-data graceful render (fields absent — an un-rederived bench.json must
// render the page, not throw): strip timing/kind, render areas + frontier +
// the profile view in its three states.
const dOld = JSON.parse(JSON.stringify(d));
delete dOld.areas.timing;
for (const ld of Object.values(dOld.areas.lanes)) delete ld.kind;
fakeEl("areas-old");
window.BenchCharts.areas(dOld, captured["areas-old"]);
if (!captured["areas-old"].innerHTML.includes("rd-lg")) {
  console.error("FAIL[old-data]: areas render lost its legend without timing/kind");
  process.exit(1);
}
fakeEl("frontier-old");
window.BenchCharts.frontier(dOld, captured["frontier-old"]);
if (!captured["frontier-old"].innerHTML.includes("--rederive")) {
  console.error("FAIL[old-data]: frontier must name the refresh remedy on areas v2 data");
  process.exit(1);
}
fakeEl("profile");
window.BenchCharts.profile(d, captured["profile"]);
if (captured["profile"].innerHTML !== "") {
  console.error("FAIL[profile]: without ?lane= the profile must render nothing");
  process.exit(1);
}
global.location.search = "?lane=modelless";
window.BenchCharts.profile(d, captured["profile"]);
if (!captured["profile"].innerHTML.includes("lane-profile")) {
  console.error("FAIL[profile]: ?lane=modelless rendered no profile");
  process.exit(1);
}
global.location.search = "?lane=nonsense";
window.BenchCharts.profile(d, captured["profile"]);
if (!captured["profile"].innerHTML.includes("no lane")) {
  console.error("FAIL[profile]: an unknown lane key must render the honest note");
  process.exit(1);
}
global.location.search = "";
console.log("[old-data] areas/frontier/profile render graceful on stripped + URL-driven inputs");

// The efficiency frontier on the REAL data: dot count = lanes with both an
// index and a quotable geomean; partial lanes hollow; the not-plotted note
// names the rest; at least one ring (some lane is on the frontier).
fakeEl("frontier");
window.BenchCharts.frontier(d, captured["frontier"]);
const fHtml = captured["frontier"].innerHTML;
let expectedPts = 0, expectedPartial = 0, expectedMiss = 0, expectedTPartial = 0;
const fPlotted = [];
for (const [key, ld] of Object.entries((d.areas || {}).lanes || {})) {
  const t = ((d.areas || {}).timing || {})[key] || {};
  const plotted = typeof ld.index === "number" && isFinite(ld.index)
    && typeof t.p50_geomean_ms === "number" && t.p50_geomean_ms > 0;
  if (!plotted) { expectedMiss++; continue; }
  expectedPts++;
  fPlotted.push({ ld, t, x: t.p50_geomean_ms, y: ld.index });
  if (ld.complete === false) expectedPartial++;
  if (t.n_used < t.suites) expectedTPartial++;
}
// Expected rings RE-DERIVED from the data (never read off the renderer):
// a lane rings iff full-timing, non-dominated by another full-timing lane
// over the SAME per-suite set, AND at least one such rival exists — a solo
// coverage group never rings (the 2026-10-02 round-3 verdict: laya(python)
// drew a ring as the only plotted 8-suite lane while its index edge was a
// coverage artifact). Round 2 pinned rings <= full-timing lanes; this pins
// the exact set.
const fCovOf = (p) => Object.keys(p.ld.per_suite || {}).sort().join(",");
const fFull = (p) => p.t.n_used === p.t.suites;
const fRivalled = (p) => fPlotted.some((q) => q !== p && fFull(q) && fCovOf(q) === fCovOf(p));
const fDominated = (p) => !fFull(p) ? false : fPlotted.some((q) => q !== p && fFull(q)
  && fCovOf(q) === fCovOf(p) && q.x <= p.x && q.y >= p.y && (q.x < p.x || q.y > p.y));
const expectedRings = fPlotted.filter((p) => fFull(p) && !fDominated(p) && fRivalled(p)).length;
const fDots = (fHtml.match(/class="rd-dot[ "]/g) || []).length;
const fPartial = (fHtml.match(/ft-partial/g) || []).length;
const fTPartial = (fHtml.match(/ft-tpartial/g) || []).length;
if (fDots !== expectedPts || expectedPts < 2) {
  console.error(`FAIL[frontier]: ${fDots} dot(s) vs ${expectedPts} plottable lanes`);
  process.exit(1);
}
if (fPartial !== expectedPartial) {
  console.error(`FAIL[frontier]: ${fPartial} hollow dot(s) vs ${expectedPartial} partial plotted lanes`);
  process.exit(1);
}
if (fTPartial !== expectedTPartial) {
  console.error(`FAIL[frontier]: ${fTPartial} timing-partial dot(s) vs ${expectedTPartial} in the data`);
  process.exit(1);
}
// a timing-partial dot must NEVER carry a frontier ring (the encoder's
// 2-of-7 geomean drew ringed once — the round-2 verdict's measured
// defect), and a solo-group dot must NEVER ring either (round 3): the
// rendered count must EQUAL the re-derived frontier set
const rings = (fHtml.match(/class="ft-ring"/g) || []).length;
if (!rings) {
  console.error("FAIL[frontier]: no ring rendered — at least one lane is expected on the frontier");
  process.exit(1);
}
if (rings !== expectedRings) {
  console.error(`FAIL[frontier]: ${rings} ring(s) vs ${expectedRings} re-derived frontier members`);
  process.exit(1);
}
// every full-timing solo-group lane must carry the no-frontier disclosure
const soloLanes = fPlotted.filter((p) => fFull(p) && !fRivalled(p)).length;
const soloMarked = (fHtml.match(/alone in its coverage group/g) || []).length;
if (soloMarked !== soloLanes) {
  console.error(`FAIL[frontier]: ${soloMarked} solo disclosure(s) vs ${soloLanes} solo-group lane(s)`);
  process.exit(1);
}
const ariaTimed = (fHtml.match(/aria-label="[^"]*timing \d+\/\d+[^"]*"/g) || []).length;
if (ariaTimed !== fDots) {
  console.error("FAIL[frontier]: every dot's aria must disclose its timing subset size");
  process.exit(1);
}
if (expectedMiss && !fHtml.includes("Not plotted")) {
  console.error("FAIL[frontier]: the not-plotted lanes are not disclosed");
  process.exit(1);
}
console.log(`[frontier] ${fDots} dots, ${fPartial} partial, ${fTPartial} timing-partial, ${rings} rings, ${soloLanes} solo, ${expectedMiss} not plotted`);

// Basis-disclosure machinery (the 2026-10-02 laya(python) regression): a
// lane whose index covers a SUBSET of the suite universe must name the
// missing suites, and any differing-basis peer must carry the shared-basis
// recomputation — with a basis-only marker when the shared-basis indices
// are EQUAL while the published ones differ (a coverage gap reading as a
// quality win). Current data is complete (0 disclosures expected), so the
// fire-path is pinned on a SYNTHETIC clone: delete code_fixtures from the
// python lane — the exact state the live site shipped in — and require
// all three disclosures to render with the right numbers.
(function basisDisclosure() {
  const dSyn = JSON.parse(JSON.stringify(d));
  const A = dSyn.areas;
  delete A.lanes.python.per_suite.code_fixtures;
  A.lanes.python.coverage = { suites: 8, of: 9 };
  A.lanes.python.complete = false;
  // the regression's inconsistent state, faithfully: a published index
  // computed over MORE suites than the lane carries (0.5642 over 8 cells
  // — the value that drew the user's wtf on the live site)
  A.lanes.python.index = 0.564171;
  fakeEl("frontier-syn");
  window.BenchCharts.frontier(dSyn, captured["frontier-syn"]);
  const syn = captured["frontier-syn"].innerHTML;
  const die = (m) => { console.error(`FAIL[basis]: ${m}`); process.exit(1); };
  if (!syn.includes("missing: code_fixtures")) die("the missing-suite disclosure did not render");
  if (!(syn.match(/on shared suites:/g) || []).length) die("the shared-basis line did not render");
  // python 56.4% vs rust 56.4% on the shared 8 — equal shared basis,
  // published 0.5642 vs 0.5030 differ → the gap must be marked basis-only
  if (!syn.includes("basis-only gap")) die("an equal shared basis with differing published indices must be marked basis-only");
  if (!syn.includes("56.4% vs laya (rust) 56.4%")) die(`shared-basis numbers wrong`);
  // and the published index must be disclosed with its basis, never alone
  if (!syn.includes("partial coverage — 8/9")) die("partial coverage line lost");
  console.log("[basis] missing-suite + shared-basis + basis-only disclosures fire on the synthetic partial lane");
})();

// The product ladder (Reflex → Instinct → Rethink) + dot labels: the path
// joins the plotted family lanes in tier order (a missing rung = fewer
// vertices, disclosed by the not-plotted note), and every dot carries a
// visible lane label — the Rethink-is-missing misread died with the
// unlabeled dot.
(function ladderAndLabels() {
  const die = (m) => { console.error(`FAIL[ladder]: ${m}`); process.exit(1); };
  const famPlotted = ["modelless", "hybrid", "encoder"]
    .filter((k) => { const t = ((d.areas || {}).timing || {})[k] || {}; const ld = ((d.areas || {}).lanes || {})[k];
      return ld && typeof ld.index === "number" && typeof t.p50_geomean_ms === "number" && t.p50_geomean_ms > 0; });
  const segs = (fHtml.match(/class="ft-ladder"/g) || []).length;
  if (famPlotted.length >= 2 && segs !== 1) die(`expected exactly one ladder path over ${famPlotted.length} plotted rungs, got ${segs}`);
  if (famPlotted.length < 2 && segs !== 0) die("a ladder rendered with fewer than two plotted rungs");
  const vertexCount = (fHtml.match(/class="ft-ladder"[^>]*points="([^"]*)"/) || [,""])[1].trim().split(/\s+/).filter(Boolean).length;
  if (famPlotted.length >= 2 && vertexCount !== famPlotted.length) die(`ladder has ${vertexCount} vertices vs ${famPlotted.length} plotted rungs`);
  const labels = (fHtml.match(/class="ft-label"/g) || []).length;
  if (labels !== fDots) die(`${labels} dot label(s) vs ${fDots} dots — every dot must be named`);
  if (!fHtml.includes(">Rethink</text>")) die("the Rethink dot is unlabeled — the misread this fixes");
  // the middle rung: a synthetic hybrid with quotable latency joins the
  // path — 3 vertices, and Instinct must appear as a dot + label
  const dSyn2 = JSON.parse(JSON.stringify(d));
  dSyn2.areas.timing.hybrid = Object.assign({}, dSyn2.areas.timing.hybrid,
    { suites: 9, n_used: 9, p50_geomean_ms: 0.0016 });
  fakeEl("frontier-ladder");
  window.BenchCharts.frontier(dSyn2, captured["frontier-ladder"]);
  const l2 = captured["frontier-ladder"].innerHTML;
  const v2 = (l2.match(/class="ft-ladder"[^>]*points="([^"]*)"/) || [,""])[1].trim().split(/\s+/).filter(Boolean).length;
  if (v2 !== 3) die(`synthetic middle rung: ladder has ${v2} vertices, expected 3`);
  if (!l2.includes(">Instinct</text>")) die("the Instinct rung did not label");
  console.log(`[ladder] ${famPlotted.length} plotted rungs (${famPlotted.join(" → ")}), ${labels} labeled dots; middle rung verified on synthetic`);
})();

// The S1MB board chart (reflex plan 010): the grouped lane×suite bars + the
// avg row + the gap none-bars + the compact lane notes under the chart (the
// prose-in-table-cells overflow fix). Counts are DATA-DERIVED from d.s1mb —
// a hand-typed count reds the day a lane lands.
(function s1mbBoard() {
  const die = (m) => { console.error(`FAIL[s1mb]: ${m}`); process.exit(1); };
  if (!d.s1mb || !Array.isArray(d.s1mb.lanes)) die("bench.json carries no s1mb block — the arm cannot run");
  fakeEl("s1mb");
  window.BenchCharts.s1mb(d, captured["s1mb"]);
  const h = captured["s1mb"].innerHTML;
  if (!h.includes("bc-hgrid")) die("no grouped grid rendered");
  let expCells = 0, expNone = 0;
  for (const ln of d.s1mb.lanes) {
    const measured = d.s1mb.suites.filter((s) => (ln.cells || {})[s] && typeof (ln.cells || {})[s].acc === "number").length;
    expCells += measured + (typeof ln.avg === "number" ? 1 : 0);
    expNone += (d.s1mb.suites.length - measured) + (typeof ln.avg === "number" ? 0 : 1);
  }
  const cells = (h.match(/class="bc-cell"/g) || []).length;
  const nones = (h.match(/bc-none/g) || []).length;
  if (cells !== expCells) die(`${cells} bar(s) vs ${expCells} measured (lane × suite) + avg cells`);
  if (nones !== expNone) die(`${nones} gap marker(s) vs ${expNone} expected (unmeasured + avg-less lanes)`);
  for (const m of h.matchAll(/width:calc\(\(100% - 64px\) \* ([\d.]+)\)/g)) {
    const f = +m[1];
    if (!(f >= 0 && f <= 1)) die(`bar fraction out of track: ${f}`);
  }
  if (!h.includes(">avg</div>")) die("the avg row is missing");
  if (!h.includes("not measured")) die("a measured gap must render the none-bar, never a zero");
  if (!h.includes("no lane-own reads yet")) die("an avg-less lane must render the honest none-bar");
  for (const ln of d.s1mb.lanes)
    if (!h.includes(`>${ln.display}</b>`)) die(`lane ${ln.display} missing from the board`);
  if (d.s1mb.disclosure && !h.includes(d.s1mb.disclosure.slice(0, 40))) die("the caption lost the disclosure");
  const dNoS1 = JSON.parse(JSON.stringify(d));
  delete dNoS1.s1mb;
  fakeEl("s1mb-old");
  window.BenchCharts.s1mb(dNoS1, captured["s1mb-old"]);
  if (!captured["s1mb-old"].innerHTML.includes("--rederive")) die("old-data posture must name the refresh remedy");
  console.log(`[s1mb] ${cells} bars / ${nones} gap marker(s), avg row + notes + disclosure render (data-derived)`);
})();

console.log(`chart render smoke PASS (p50: ${p50.bands} bands / ${p50.labels} lanes, broken at 500 ms; acc: ${acc.bands} bands / ${acc.labels} lanes; cc: ${cc.bands} bands; radar: ${polys} polys / ${dots} dots)`);
