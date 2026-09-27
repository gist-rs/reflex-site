// The size-chart render smoke — zero-dependency (no playwright, no jsdom):
// boots size-charts.js in a stubbed DOM (stubbed fetch, the registered
// DOMContentLoaded handler) exactly as /#sizes runs it, against the REAL
// data/sizes.json, and asserts the grouped-bar structure is well-formed:
// ascending order, one engine bar per candidate, a model bar exactly when
// the lane carries weights, in-track widths, target chips, and the
// provenance note (which boot() fills into #sizes-prov — since e1ea6b8 it
// no longer renders inside render()'s html, so the note is asserted on the
// prov element, never on the chart html).
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
const handlers = {};
function fakeEl(sel) {
  if (!captured[sel]) captured[sel] = { innerHTML: "", textContent: "", hidden: true, handlers: {} };
  const e = captured[sel];
  return {
    get innerHTML() { return e.innerHTML; },
    set innerHTML(v) { e.innerHTML = v; },
    get textContent() { return e.textContent; },
    set textContent(v) { e.textContent = v; },
    get hidden() { return e.hidden; },
    set hidden(v) { e.hidden = v; },
    addEventListener(ev, fn) { e.handlers[ev] = fn; },
    setAttribute() {},
    appendChild() {},
  };
}
global.window = {};
global.document = {
  readyState: "loading",                 // boot() registers on DOMContentLoaded — the smoke invokes the handler
  addEventListener: (ev, fn) => { handlers[ev] = fn; },
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {} },
  getElementById: (sel) => fakeEl("#" + sel),
};
let d = null;                            // assigned after the eval; boot() reads it via the fetch stub
global.fetch = async () => ({ ok: true, json: async () => d });

const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };

(async () => {
  eval(fs.readFileSync(jsFile, "utf8"));
  d = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  if (!window.SizeCharts) fail("SizeCharts not defined");
  if (!d.candidates || !d.candidates.length) fail("sizes.json has no candidates");
  if (!handlers["DOMContentLoaded"]) fail("boot did not register on DOMContentLoaded");
  await handlers["DOMContentLoaded"]();

  const el = captured["#size-report"];
  const html = el.innerHTML;
  if (!html) fail("render() produced no html");

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

  // 6. the law note renders at boot into #sizes-prov (unhidden, never-
  // hand-typed wording) + totals column present
  const prov = captured["#sizes-prov"];
  if (!prov || prov.hidden !== false) fail("the provenance note element was not unhidden at boot");
  if (!/never hand-typed/.test(prov.textContent)) fail("the provenance law note did not render");
  const totalsRendered = (html.match(/class="bc-val sz-total"/g) || []).length;
  if (totalsRendered !== d.candidates.length) fail(`total labels ${totalsRendered} != ${d.candidates.length}`);

  // 7. axis ticks: log decades with human labels
  const axis = (html.match(/class="bc-axis sz-axis"/g) || []).length;
  if (!axis) fail("no axis rendered");

  console.log(`size chart render smoke PASS (${d.candidates.length} candidates · ${engineBars} engine + ${modelBars} model bars · ascending)`);
})().catch((e) => { console.error("FAIL: " + (e && e.message || e)); process.exit(1); });
