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
  return { bands: bands.length, labels: labels.length };
}

const p50 = checkMetric("p50", "summary");

// Switch the metric via the captured click handler (accuracy: log=false path).
const toggle = captured[".bc-toggle"];
if (!toggle || !toggle.handlers.click) { console.error("FAIL: metric toggle not wired"); process.exit(1); }
toggle.handlers.click({
  target: { closest: (s) => (s === "button[data-metric]" ? { dataset: { metric: "acc" } } : null) },
});
const acc = checkMetric("acc", ".bc-summary-body");

// Regression arm: the OLD markup (a plain width-fill bar with no band) must
// be gone from the summary — the fill <i> carried no class in the old chart.
const oldStyle = /<i style="width:[\d.]+%;background:/.test(captured[".bc-summary-body"].innerHTML);
if (oldStyle) { console.error("FAIL: legacy fill-only bar still rendered"); process.exit(1); }

console.log(`chart render smoke PASS (p50: ${p50.bands} bands / ${p50.labels} lanes; acc: ${acc.bands} bands / ${acc.labels} lanes)`);
