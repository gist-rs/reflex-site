// The size-chart render smoke — zero-dependency (no playwright, no jsdom):
// loads size-charts.js in a stubbed DOM, renders the /#sizes chart from the
// REAL data/sizes.json, and asserts the grouped-bar structure is
// well-formed: ascending order, one engine bar per candidate, a model bar
// exactly when the lane carries weights, in-track widths, target chips,
// and the provenance note.
//
//   node scripts/size_chart_smoke.cjs
//
// Exit 0 = green; any assert prints and exits 1.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const jsFile = path.join(ROOT, "assets", "size-charts.js");
const dataFile = path.join(ROOT, "data", "sizes.json");

const captured = {};
function fakeEl(sel) {
  if (!captured[sel]) captured[sel] = { innerHTML: "", handlers: {} };
  const e = captured[sel];
  return {
    get innerHTML() { return e.innerHTML; },
    set innerHTML(v) { e.innerHTML = v; },
    addEventListener(ev, fn) { e.handlers[ev] = fn; },
    setAttribute() {},
    appendChild() {},
  };
}
global.window = {};
global.document = {
  readyState: "loading",                 // boot() deferred — the smoke calls render() directly
  addEventListener() {},
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {} },
  getElementById: () => null,
};

eval(fs.readFileSync(jsFile, "utf8"));
const d = JSON.parse(fs.readFileSync(dataFile, "utf8"));
if (!window.SizeCharts) { console.error("FAIL: SizeCharts not defined"); process.exit(1); }
if (!d.candidates || !d.candidates.length) { console.error("FAIL: sizes.json has no candidates"); process.exit(1); }

const el = fakeEl("size-report");
window.SizeCharts.render(d, el);
const html = captured["size-report"].innerHTML;

const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };

// 1. data order must already be ascending by total (the generator's law)
const totals = d.candidates.map((c) => (c.engine_bytes || 0) + (c.model_bytes || 0));
if (totals.some((t, i) => i && t < totals[i - 1])) fail("sizes.json not sorted ascending by total");

// 2. rows: one per candidate, in data order
const rowNames = [...html.matchAll(/class="sz-name">([^<]+)</g)].map((m) => m[1]);
if (rowNames.length !== d.candidates.length) fail(`row count ${rowNames.length} != candidates ${d.candidates.length}`);
d.candidates.forEach((c, i) => { if (rowNames[i] !== c.name) fail(`row ${i} is ${rowNames[i]}, expected ${c.name}`); });

// 3. engine bar per candidate; model bar exactly when model_bytes > 0
const engineBars = (html.match(/aria-label="[^"]*: runtime /g) || []).length;
const modelBars = (html.match(/aria-label="[^"]*: model /g) || []).length;
const withModel = d.candidates.filter((c) => c.model_bytes > 0).length;
if (engineBars !== d.candidates.length) fail(`engine bars ${engineBars} != ${d.candidates.length}`);
if (modelBars !== withModel) fail(`model bars ${modelBars} != lanes-with-weights ${withModel}`);

// 4. every bar sits inside its track (0 .. 100.5%)
for (const m of html.matchAll(/class="bc-hbar"[^>]*>\s*<i style="width:([\d.]+)%/g)) {
  const w = +m[1];
  if (!(w >= 0 && w <= 100.5)) fail(`bar width out of track: ${w}%`);
}

// 5. target chips on every row + tooltips on every bar
const chips = (html.match(/class="sz-chip"/g) || []).length;
if (chips < d.candidates.length) fail(`target chips ${chips} < candidates ${d.candidates.length}`);
const tips = (html.match(/data-sztip="/g) || []).length;
if (tips !== engineBars + modelBars) fail(`tooltips ${tips} != bars ${engineBars + modelBars}`);

// 6. the law note renders (never-hand-typed) + totals column present
if (!/never hand-typed/.test(html)) fail("the provenance law note did not render");
const totalsRendered = (html.match(/class="bc-val sz-total"/g) || []).length;
if (totalsRendered !== d.candidates.length) fail(`total labels ${totalsRendered} != ${d.candidates.length}`);

// 7. axis ticks: log decades with human labels
const axis = (html.match(/class="bc-axis sz-axis"/g) || []).length;
if (!axis) fail("no axis rendered");

console.log(`size chart render smoke PASS (${d.candidates.length} candidates · ${engineBars} engine + ${modelBars} model bars · ascending)`);
