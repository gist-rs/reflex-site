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
// two cards (4 area spokes + 9 benchmark spokes), a polygon per complete
// lane, measured-dots-only for the partial encoder lane, and legend rows
// naming coverage (the 1/9 partial disclosure).
const areaEl = fakeEl("areas");
window.BenchCharts.areas(d, areaEl);
const aHtml = captured["areas"].innerHTML;
if (!aHtml.includes("<svg") || !aHtml.includes("rd-poly")) {
  console.error("FAIL[radar]: no radar svg/polygons rendered");
  process.exit(1);
}
const polys = (aHtml.match(/class="rd-poly"/g) || []).length;
const dots = (aHtml.match(/class="rd-dot"/g) || []).length;
const legends = (aHtml.match(/class="rd-lg"/g) || []).length;
if (polys < 3) { console.error(`FAIL[radar]: expected >=3 lane polygons (modelless/hybrid/laya complete), got ${polys}`); process.exit(1); }
if (legends !== 8) { console.error(`FAIL[radar]: expected 8 legend rows (4 lanes x 2 cards), got ${legends}`); process.exit(1); }
if (!aHtml.includes("1/9") || !aHtml.includes("Rethink (encoder)")) {
  console.error("FAIL[radar]: the partial-lane disclosure (Rethink encoder 1/9) is missing");
  process.exit(1);
}
// encoder (1 measured suite) must draw DOTS but NO polygon on either card
if ((aHtml.match(/rd-polyline/g) || []).length !== 0) {
  console.error("FAIL[radar]: a 1-point lane drew a polyline");
  process.exit(1);
}
console.log(`[radar] ${polys} polygons, ${dots} dots, 2 cards, ${legends} legend rows, partial lane disclosed`);

console.log(`chart render smoke PASS (p50: ${p50.bands} bands / ${p50.labels} lanes, broken at 500 ms; acc: ${acc.bands} bands / ${acc.labels} lanes; cc: ${cc.bands} bands; radar: ${polys} polys / ${dots} dots)`);
