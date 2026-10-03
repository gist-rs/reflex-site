// The size-chart render smoke — zero-dependency (no playwright, no jsdom):
// boots size-charts.js in a stubbed DOM (stubbed fetch, the registered
// DOMContentLoaded handler) exactly as /#sizes runs it, against the REAL
// data/sizes.json, and asserts the stacked-bar structure is well-formed:
// ascending order, one stack per candidate with an engine segment, a model
// segment exactly when the lane carries weights, each bar inside its track
// and ending at the total's position on the BROKEN LINEAR axis (a total at
// or under BREAK_AT ends exactly at total/linMax of the linear span), a
// break sign on exactly the bars over BREAK_AT, its segments splitting the
// bar by byte share (summing to 100%), one under-bar label per segment in
// the segment's color, target chips, and the
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

  // 3. engine bar per candidate; model segments — one per published stack
  // component, or a single green segment when the row carries no split —
  // exactly when the lane carries weights (the engine aria-label names the
  // runtime env — rust env / python env; each model segment names its
  // component: "name: model · <label> <bytes>")
  const engineBars = (html.match(/aria-label="[^"]*: (?:rust env|python env) /g) || []).length;
  const rustBars = (html.match(/aria-label="[^"]*: rust env /g) || []).length;
  const pythonBars = (html.match(/aria-label="[^"]*: python env /g) || []).length;
  const modelBars = (html.match(/aria-label="[^"]*: model /g) || []).length;
  const modelSegsOf = (c) => (window.SizeCharts.stackOf(c).length || (c.model_bytes > 0 ? 1 : 0));
  const withModel = d.candidates.filter((c) => c.model_bytes > 0).length;
  const wantModelSegs = d.candidates.reduce((a, c) => a + modelSegsOf(c), 0);
  if (engineBars !== d.candidates.length) fail(`engine bars ${engineBars} != ${d.candidates.length}`);
  if (rustBars + pythonBars !== engineBars) fail(`env bars ${rustBars} rust + ${pythonBars} python != ${engineBars} engine bars`);
  if (modelBars !== wantModelSegs) fail(`model segments ${modelBars} != published components ${wantModelSegs} (${withModel} lanes with weights)`);

  // 4. one stack per candidate; the bar ends at the total's position on the
  // broken linear axis, carries a break sign iff total > BREAK_AT, and its
  // segments split it by byte SHARE (sum to 100%); the under-bar label row
  // spans the same width, one label per side (engine + model total) in the
  // side's color. The stack div doubles as the tap-to-expand toggle, so its
  // open tag carries the toggle attributes between class and the bar div.
  const stacks = [...html.matchAll(/<div class="bc-hbar sz-stack"[^>]*><div class="sz-bar" style="width:([\d.]+)%">(.*?)<\/div>(<i class="sz-break"[^>]*><\/i>)?<\/div><div class="sz-lbls" style="width:([\d.]+)%">(.*?)<\/div>/g)]
    .map((m) => ({ barW: +m[1], inner: m[2], brk: !!m[3], lblW: +m[4], lbls: m[5] }));
  if (stacks.length !== d.candidates.length) fail(`stacks ${stacks.length} != candidates ${d.candidates.length}`);
  const sc = window.SizeCharts.scale(d);
  const BREAK_AT = window.SizeCharts.BREAK_AT;
  let nBroken = 0;
  stacks.forEach(({ barW, inner, brk, lblW, lbls }, i) => {
    const c = d.candidates[i];
    if (!(barW >= 0 && barW <= 100.5)) fail(`bar ${i} width out of track: ${barW}%`);
    const want = sc.pos(totals[i]) * 100;
    if (Math.abs(barW - want) > 0.01) fail(`bar ${i} ends at ${barW.toFixed(2)}%, total sits at ${want.toFixed(2)}%`);
    if (totals[i] <= sc.linMax && Math.abs(barW - (100 * sc.span * totals[i]) / sc.linMax) > 0.01)
      fail(`bar ${i} (${totals[i]} B, under the break) is not on the linear scale`);
    if (brk !== totals[i] > BREAK_AT) fail(`bar ${i}: break sign ${brk} but total ${totals[i]} vs BREAK_AT ${BREAK_AT}`);
    if (brk) nBroken++;
    if (lblW !== barW) fail(`bar ${i}: label row width ${lblW}% != bar ${barW}%`);
    const widths = [...inner.matchAll(/style="width:([\d.]+)%/g)].map((m) => +m[1]);
    const sum = widths.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.05) fail(`bar ${i} segments sum to ${sum}%, not 100%`);
    if (c.engine_bytes > 0 && Math.abs(widths[0] - (100 * c.engine_bytes) / totals[i]) > 0.01)
      fail(`bar ${i} engine share ${widths[0]}% != bytes share`);
    const labels = [...lbls.matchAll(/class="sz-lbl sz-lbl-(engine|model)" style="color:([^"]+)">([^<]+)</g)].map((m) => [m[1], m[2], m[3]]);
    if (labels.length !== (c.model_bytes > 0 ? 2 : 1)) fail(`bar ${i}: ${labels.length} under-bar labels (engine + model-total expected)`);
    if (/class="sz-lbl/.test(inner)) fail(`bar ${i}: a label is still drawn on the bar`);
    if (c.engine_bytes > 0 && labels[0][2] !== window.SizeCharts.human(c.engine_bytes)) fail(`bar ${i} engine label ${labels[0][2]}`);
    if (c.model_bytes > 0 && labels.at(-1)[2] !== window.SizeCharts.human(c.model_bytes)) fail(`bar ${i} model label ${labels.at(-1)[2]}`);
    const segColors = [...inner.matchAll(/style="width:[\d.]+%;background:([^"]+)"/g)].map((m) => m[1]);
    // label 0 pairs with the engine segment; the model-total label is always
    // the weights green (it names the model side's SUM across the stack)
    if (c.engine_bytes > 0 && labels[0][1] !== segColors[0])
      fail(`bar ${i} label 0 color ${labels[0][1]} != engine segment ${segColors[0]}`);
    if (c.model_bytes > 0 && labels.at(-1)[1] !== "#199e70")
      fail(`bar ${i} model-total label ${labels.at(-1)[1]} != the weights green`);
    // the color law: the engine segment follows the runtime env from the
    // data (engine_kind) — rust #ff8a3d / python #3987e5. The model side:
    // a published stack renders its components in the palette's kind
    // colors (the SAME palette the legend + bullets read — one home,
    // SizeCharts.stackColor); an un-split row keeps the green slot.
    const wantEngine = c.engine_kind === "python" ? "#3987e5" : "#ff8a3d";
    if (c.engine_bytes > 0 && segColors[0] !== wantEngine)
      fail(`bar ${i} (${c.key}) engine segment ${segColors[0]} != ${wantEngine} (engine_kind ${c.engine_kind})`);
    const comps = window.SizeCharts.stackOf(c);
    if (c.model_bytes > 0 && comps.length > 1) {
      const modelSegs = segColors.slice(c.engine_bytes > 0 ? 1 : 0);
      if (modelSegs.length !== comps.length) fail(`bar ${i} (${c.key}): ${modelSegs.length} model segments for ${comps.length} components`);
      modelSegs.forEach((col, k) => {
        if (col !== window.SizeCharts.stackColor(comps[k].kind))
          fail(`bar ${i} (${c.key}) stack segment ${k} (${comps[k].kind}) color ${col} != palette ${window.SizeCharts.stackColor(comps[k].kind)}`);
      });
      // the model segments together carry exactly the model share
      const modelW = widths.slice(c.engine_bytes > 0 ? 1 : 0).reduce((a, b) => a + b, 0);
      if (Math.abs(modelW - (100 * c.model_bytes) / totals[i]) > 0.05)
        fail(`bar ${i} (${c.key}) stack widths sum to ${modelW.toFixed(2)}%, model share is ${(100 * c.model_bytes / totals[i]).toFixed(2)}%`);
    } else if (c.model_bytes > 0 && segColors[segColors.length - 1] !== "#199e70")
      fail(`bar ${i} (${c.key}) model segment ${segColors[segColors.length - 1]} != #199e70`);
  });
  const wantBroken = totals.filter((t) => t > BREAK_AT).length;
  if (nBroken !== wantBroken) fail(`break signs ${nBroken} != totals over BREAK_AT ${wantBroken}`);

  // 5. target chips on every row + tooltips on every segment — each tooltip
  // carries the FULL stack as bullets (the color-labeled list), not a
  // single-segment fragment
  const chips = (html.match(/class="sz-chip"/g) || []).length;
  if (chips < d.candidates.length) fail(`target chips ${chips} < candidates ${d.candidates.length}`);
  const tips = (html.match(/data-sztip="/g) || []).length;
  if (tips !== engineBars + modelBars) fail(`tooltips ${tips} != segments ${engineBars + modelBars}`);
  const stackedRow = d.candidates.find((c) => window.SizeCharts.stackOf(c).length > 1);
  if (stackedRow) {
    if (!/sz-tip/.test(html)) fail("no stack bullet list rendered in any tooltip");
    // data-sztip is attribute-escaped; the labels must survive the same way
    const escAttr = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    for (const f of window.SizeCharts.stackOf(stackedRow))
      if (!html.includes(escAttr(f.label))) fail(`stacked tooltip missing component label ${f.label}`);
  }

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

  // 8. the legend names the env + weights slots, plus every split kind the
  // data actually carries (the same palette the segments read)
  if (!/>rust env</.test(html) || !/>python env</.test(html) || !/>model \/ weights</.test(html))
    fail("the legend does not carry rust env / python env / model / weights");
  const legendKinds = new Set();
  for (const c of d.candidates) {
    const comps = window.SizeCharts.stackOf(c);
    if (comps.length > 1) for (const f of comps) if (f.kind !== "weights") legendKinds.add(f.kind);
  }
  for (const k of legendKinds) {
    if (!html.includes(`>${window.SizeCharts.STACK_LABELS[k]}</`)) fail(`legend missing the ${k} slot`);
  }

  // 9. tap-to-expand: every row carries a hidden detail block wired to its
  // bar — role=button + aria-expanded/aria-controls on the bar, unique ids,
  // the caret in the totals column
  const details = (html.match(/class="sz-detail" id="(szd-\d+)" hidden/g) || []).map((m) => m.match(/id="(szd-\d+)"/)[1]);
  if (details.length !== d.candidates.length) fail(`detail blocks ${details.length} != candidates ${d.candidates.length}`);
  if (new Set(details).size !== details.length) fail("detail ids are not unique");
  const toggles = (html.match(/class="bc-hbar sz-stack" role="button" tabindex="0" aria-expanded="false" aria-controls="(szd-\d+)"/g) || []).length;
  if (toggles !== d.candidates.length) fail(`bar toggles ${toggles} != candidates ${d.candidates.length}`);
  const carets = (html.match(/class="sz-caret"/g) || []).length;
  if (carets !== d.candidates.length) fail(`carets ${carets} != candidates ${d.candidates.length}`);
  if (!/click the bar for the full breakdown/.test(html)) fail("the expand affordance is not disclosed in the tooltip");

  console.log(`size chart render smoke PASS (${d.candidates.length} stacks · ${rustBars} rust + ${pythonBars} python + ${modelBars} model segments · stack color law · ascending · broken-linear bars, ${nBroken} past the break · byte-share segments · under-bar labels · ${details.length} tap-to-expand details)`);
})().catch((e) => { console.error("FAIL: " + (e && e.message || e)); process.exit(1); });
