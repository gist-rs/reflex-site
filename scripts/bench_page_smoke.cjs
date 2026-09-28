// The bench page render smoke: serves the repo statically, renders /bench/ in
// headless chromium, and asserts the lane-filter + the comparison-lane rows
// behave (reflex .issues/029 — the filter governs EVERY section).
//
// Needs playwright locally (never a dep of this repo):
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/bench_page_smoke.cjs
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = require("path").resolve(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const p = path.join(ROOT, rel.replace(/^\//, ""));
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
    res.end(b);
  });
});

(async () => {
  await new Promise((r) => server.listen(8791, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

  await page.goto("http://127.0.0.1:8791/bench/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelectorAll("#tables table.bench").length >= 10, { timeout: 15000 });

  // 1) no page errors
  if (errs.length) fail("page errors: " + errs.join("; "));
  else console.log("ok: no page errors");

  // 1b) suite titles self-link and the quick-nav resolves every anchor
  const suiteAnchors = await page.$$eval("#tables h3.suite", (hs) =>
    hs.map((h) => ({ id: h.id, href: h.querySelector("a.hlink") && h.querySelector("a.hlink").getAttribute("href") }))
  );
  if (suiteAnchors.length < 10) fail(`expected >=10 suite anchors, got ${suiteAnchors.length}`);
  else {
    const bad = suiteAnchors.filter((s) => s.href !== `#${s.id}`);
    if (bad.length) fail("suite titles not self-linked: " + JSON.stringify(bad));
    else console.log(`ok: ${suiteAnchors.length} suite titles self-linked`);
  }
  // the jump nav was removed (the hero labels + browser find replaced it);
  // the element must be gone, not merely hidden
  const navGone = await page.$("#suite-nav");
  if (navGone) fail("jump nav (#suite-nav) still renders — it was removed");
  else console.log("ok: jump nav removed");

  // nav: GitHub icon in, Download out (it lives in the footer now)
  const ghLinks = await page.$$("header.site nav a.gh");
  if (ghLinks.length !== 1) fail(`expected exactly 1 GitHub icon in the nav, got ${ghLinks.length}`);
  const dlInNav = await page.$$eval("header.site nav a", (as) => as.filter((a) => /releases/.test(a.getAttribute("href"))).length);
  if (dlInNav !== 0) fail("Download is still in the nav");
  const dlInFoot = await page.$$("footer.site .fine a[href*='releases']");
  if (!dlInFoot.length) fail("Download missing from the footer");
  else console.log("ok: nav has the GitHub icon, Download moved to the footer");

  // 2) the filter bar: 5 chips (the two laya spellings may both exist)
  const chips = await page.$$eval("#lane-filter input[type=checkbox]", (xs) => xs.map((x) => x.dataset.key));
  console.log("chips:", chips.join(","));
  for (const k of ["katgpt", "rust", "python", "clm", "gliner", "agentjev", "openthai"]) {
    if (!chips.includes(k)) fail(`filter chip missing: ${k}`);
  }
  if (chips.length >= 5) console.log("ok: filter chips present");

  // 3) gliner rows in the tables (the 4090 extra-host rows) — matched on the
  //    lane-label cell ("gliner · <model>"): laneRow strips " (reference)",
  //    and the old "gliner (reference)" substring matched ZERO rows, so the
  //    vanish / persist steps below passed on an empty set.
  const glinerRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^gliner · /.test(c.textContent); }).length);
  if (glinerRows < 10) fail(`expected >=10 gliner table rows, got ${glinerRows}`);
  else console.log(`ok: ${glinerRows} gliner table rows`);

  // 3b) agentjev rows (reflex .issues/025 amendment 4 — the same 4090
  // extra-host law; 14 suites carry the lane)
  const ajRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^agentjev · /.test(c.textContent); }).length);
  if (ajRows < 10) fail(`expected >=10 agentjev table rows, got ${ajRows}`);
  else console.log(`ok: ${ajRows} agentjev table rows`);

  // 3c) openthai rows (reflex Plan 003 / Bench 074): the Thai board's
  // comparison lane — row floor grows only upward
  const otRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^openthai · /.test(c.textContent); }).length);
  if (otRows < 4) fail(`expected >=4 openthai table rows, got ${otRows}`);
  else console.log(`ok: ${otRows} openthai table rows`);

  // 4) hero bars: a lane's not-run bars must be EXACTLY the suites the
  //    lane never measured (read from the data — the suite set grows over
  //    time; the reflex Bench 074 Thai suites joined without clm/gliner/
  //    agentjev cells). A not-run on a suite WITH a lane cell is the
  //    extra-host fallback failing — the defect this check exists for.
  const benchData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
  const laneHasCell = (s, k) => !!(s[k] || Object.values(s.extra_host_lanes || {}).some((h) => h[k]));
  const notRun = await page.$$eval("#bench-hero .bc-hbar.bc-none", (xs) => xs.map((x) => x.textContent.trim()));
  console.log("hero not-run bars:", notRun.join(" | ") || "(none)");
  for (const [key, label] of [["gliner", "gliner"], ["agentjev", "agentjev"], ["openthai", "openthai"]]) {
    const expected = benchData.suites.filter((s) => !laneHasCell(s, key)).length;
    const got = notRun.filter((t) => t.startsWith(label)).length;
    if (got !== expected) fail(`${label}: ${got} hero not-run bars vs ${expected} suites without a ${label} cell — a not-run on a measured suite means the extra-host fallback failed`);
    else if (expected > 0) console.log(`ok: ${label} not-run only on its ${expected} unmeasured suite(s)`);
  }

  // 5) toggle gliner OFF: rows disappear everywhere
  await page.check('#lane-filter input[data-key="gliner"]').catch(() => {});
  await page.uncheck('#lane-filter input[data-key="gliner"]');
  await page.waitForTimeout(300);
  const glinerAfter = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^gliner · /.test(c.textContent); }).length);
  if (glinerAfter !== 0) fail(`gliner rows must vanish when filtered off, got ${glinerAfter}`);
  else console.log("ok: gliner filtered out of tables");
  const suiteBars = await page.$$eval(".bc-slabel", (xs) => xs.filter((x) => x.textContent.includes("gliner")).length);
  if (suiteBars !== 0) fail(`gliner per-suite bars must vanish, got ${suiteBars}`);
  else console.log("ok: gliner filtered out of per-suite bars");

  // 6) reload: the filter persists
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const glinerReload = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^gliner · /.test(c.textContent); }).length);
  if (glinerReload !== 0) fail("filter state must survive reload");
  else console.log("ok: filter persists across reload");

  // 7) restore: check gliner back on
  await page.check('#lane-filter input[data-key="gliner"]');
  await page.waitForTimeout(300);
  const glinerBack = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^gliner · /.test(c.textContent); }).length);
  if (glinerBack < 10) fail(`gliner rows must return when re-checked, got ${glinerBack}`);
  else console.log("ok: gliner rows restored");

  // 8) hero sort follows the FIRST VISIBLE lane (sorting by a lane the
  //    reader filtered out rendered as an unsorted page — the bars carried
  //    no visible order). The key lane is read by COLOR (the first visible
  //    lane's swatch), widths must be monotone, and suites without the key
  //    lane must sort last. Covers "by accuracy" AND "by latency".
  const heroKeyWidths = (color) => page.$$eval(
    "#bench-hero .bc-htrack",
    (ts, c) => ts.map((t) => {
      const b = t.querySelector(`.bc-hbar:not(.bc-none) i[style*="${c}"]`);
      return b ? parseFloat(b.style.width) : null;
    }),
    color
  );
  const assertOrdered = (w, tag, asc) => {
    let seenNull = false;
    for (let i = 0; i < w.length; i++) {
      if (w[i] === null) { seenNull = true; continue; }
      if (seenNull) { fail(`hero sort [${tag}]: a keyed row sorts after a not-run row (index ${i})`); return; }
      if (i > 0 && w[i - 1] !== null) {
        const worse = asc ? w[i] < w[i - 1] - 0.01 : w[i] > w[i - 1] + 0.01;
        if (worse) { fail(`hero sort [${tag}]: order breaks at row ${i} (${w[i - 1]} → ${w[i]})`); return; }
      }
    }
  };
  const heroNote = () => page.$eval("#bench-hero .bc-note", (n) => n.textContent);
  // accuracy, all lanes visible → key = Reflex · modelless (#d95926)
  await page.click('#bench-hero button[data-sort="acc"]');
  await page.waitForTimeout(100);
  let widths = await heroKeyWidths("#d95926");
  assertOrdered(widths, "acc · modelless key", false);
  let note = await heroNote();
  if (!note.includes("Rows sorted best-accuracy-first on the Reflex · modelless lane")) fail(`sort note should name the modelless lane, got: ${note}`);
  else console.log(`ok: hero by-accuracy sorts ${widths.length} rows by the modelless lane`);
  // hide the product lane → key moves to laya (rust) (#3987e5), note names it
  await page.uncheck('#lane-filter input[data-key="katgpt"]');
  await page.waitForTimeout(100);
  widths = await heroKeyWidths("#3987e5");
  assertOrdered(widths, "acc · rust key", false);
  note = await heroNote();
  if (!note.includes("on the laya (rust) lane")) fail(`sort note should name the laya (rust) lane once modelless is hidden, got: ${note}`);
  else console.log("ok: hero sort key follows the first visible lane (note names it)");
  // latency, key back on modelless: fastest-first on the p50 metric
  await page.check('#lane-filter input[data-key="katgpt"]');
  await page.waitForTimeout(100);
  await page.click('#bench-hero button[data-metric="p50"]');
  await page.click('#bench-hero button[data-sort="lat"]');
  await page.waitForTimeout(100);
  widths = await heroKeyWidths("#d95926");
  assertOrdered(widths, "lat · modelless key", true);
  note = await heroNote();
  if (!note.includes("Rows sorted fastest-first on the Reflex · modelless lane")) fail(`latency sort note wrong, got: ${note}`);
  else console.log("ok: hero by-latency sorts fastest-first by the modelless lane");
  // 9) the broken latency axis (the /#sizes break-sign idiom): the p50
  //    hero carries one break sign per visible cell past 500 ms and the
  //    axis names the break, and the per-suite cell table carries them
  //    too. The metric is still p50 from the latency sort above. The
  //    EXPECTED count is derived from the published data (visible p50
  //    cells > 500) — it was hard-pinned to 1 when openthai's
  //    massive_intent_en row was the only cell past the break, and the
  //    m3 lane fill (reflex Bench 086) added banking77 at 3.06 s.
  {
    const bench = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
    const visibleP50s = [];
    for (const s of bench.suites) {
      if (s.modelless?.latency_p50_ms != null) visibleP50s.push(s.modelless.latency_p50_ms);
      for (const l of Object.values(s.laya || {})) if (l.latency_p50_ms != null) visibleP50s.push(l.latency_p50_ms);
      for (const h of Object.values(s.extra_host_lanes || {})) {
        if (h.modelless?.latency_p50_ms != null) visibleP50s.push(h.modelless.latency_p50_ms);
        for (const l of Object.values(h.laya || {})) if (l.latency_p50_ms != null) visibleP50s.push(l.latency_p50_ms);
        for (const lane of [h.openthai]) if (lane?.latency_p50_ms != null) visibleP50s.push(lane.latency_p50_ms);
      }
      if (s.openthai?.latency_p50_ms != null) visibleP50s.push(s.openthai.latency_p50_ms);
    }
    const expectedBreaks = visibleP50s.filter((v) => v > 500).length;
    const heroBreaks = await page.$$eval("#bench-hero .sz-break", (xs) => xs.length);
    if (heroBreaks !== expectedBreaks) fail(`expected ${expectedBreaks} hero break sign(s) on p50 (data-derived), got ${heroBreaks}`);
    else console.log(`ok: hero p50 carries the ${expectedBreaks} past-500ms break sign(s) (data-derived)`);
    const axisBreak = await page.$$eval("#bench-hero .bc-axis span", (xs) => xs.filter((s) => s.textContent === "500 ms").length);
    if (axisBreak < 1) fail("hero axis does not name the 500 ms break tick");
    else console.log(`ok: hero axis names the 500 ms break (${axisBreak} axis renders)`);
    const cellBreaks = await page.$$eval("#tables .bc-cell .sz-break", (xs) => xs.length);
    if (cellBreaks !== expectedBreaks) fail(`expected ${expectedBreaks} suite-cell break sign(s) (data-derived), got ${cellBreaks}`);
    else console.log(`ok: suite cells carry the ${expectedBreaks} past-500ms break sign(s) (data-derived)`);
  }
  // Issue-021 verdicts on the tables: every unfit latency cell renders
  // marked (class + † + reason on hover), and nothing else does. The
  // Reflex lane is always visible, so its unfit cells bound the count.
  {
    const bench = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
    const cells = bench.suites.flatMap((s) => [s.modelless, ...Object.values(s.laya || {}),
      ...Object.values(s.extra_host_lanes || {}).flatMap((h) => [h.modelless, ...Object.values(h.laya || {}),
        h.clm, h.gliner, h.agentjev, h.hybrid, h.openthai]), s.clm, s.gliner, s.agentjev, s.hybrid,
      s.openthai]).filter(Boolean);
    const unfit = cells.filter((c) => c.latency_quotable === false).length;
    const kmUnfit = bench.suites.filter((s) => s.modelless?.latency_quotable === false).length;
    const dom = await page.evaluate(() => [...document.querySelectorAll("td.unq")]
      .map((td) => ({ dagger: !!td.querySelector("sup"), title: td.title || "" })));
    if (dom.length > 2 * unfit) fail(`${dom.length} marked latency cells > 2 × ${unfit} unfit cells in the data`);
    if (dom.length < 2 * kmUnfit) fail(`${dom.length} marked cells < 2 × ${kmUnfit} unfit Reflex cells (always visible)`);
    if (dom.some((d) => !d.dagger || !/not quotable/.test(d.title))) fail("a marked latency cell lacks its † or its reason");
    if (!process.exitCode) console.log(`ok: ${dom.length} latency cells marked unfit (${unfit} unfit cells in the data)`);
  }

  // 9b) the modelless-scoped disclosures follow the modelless lane's filter
  //     (the reported "G1 PASS under openthai" leftover: the G1 verdict,
  //     gate fit and count tables are the MODELLESS lane's gates — they
  //     hide with it and never float over a table the filter emptied of the
  //     modelless row; the chip names the lane so it cannot be read as the
  //     visible lane's verdict).
  {
    const g1Chips = () => page.$$eval("#tables summary .chip", (xs) => xs.filter((c) => /^G1 \(modelless\)/.test(c.textContent)).length);
    const g1Lines = () => page.$$eval("#tables p.g1", (xs) => xs.length);
    const beforeChips = await g1Chips(), beforeLines = await g1Lines();
    if (!beforeChips) fail("expected visible G1 (modelless) chips with the modelless lane shown");
    else if (!beforeLines) fail("expected G1/gate-fit/count-table lines with the modelless lane shown");
    else console.log(`ok: ${beforeChips} G1 chips + ${beforeLines} modelless-scoped lines with the lane shown`);
    await page.uncheck('#lane-filter input[data-key="katgpt"]');
    await page.waitForTimeout(200);
    const hiddenChips = await g1Chips(), hiddenLines = await g1Lines();
    if (hiddenChips !== 0) fail(`G1 chips must hide with the modelless lane, got ${hiddenChips}`);
    else if (hiddenLines !== 0) fail(`G1/gate-fit/count-table lines must hide with the modelless lane, got ${hiddenLines}`);
    else console.log("ok: G1 verdict + gate fit + count tables hide with the modelless lane");
    await page.check('#lane-filter input[data-key="katgpt"]');
    await page.waitForTimeout(200);
    if ((await g1Chips()) !== beforeChips) fail("G1 chips must return with the modelless lane");
    else console.log("ok: G1 chips return with the modelless lane");
  }

  // 9c) a suite the filter empties of EVERY lane answers "not run" instead
  //     of a header-row-only empty table (the reported prompt_injections
  //     empty-render: headers + leak line with zero rows read as broken).
  {
    const keys = await page.$$eval('#lane-filter input[type=checkbox]', (xs) => xs.map((x) => x.dataset.key));
    for (const k of keys) await page.uncheck(`#lane-filter input[data-key="${k}"]`);
    await page.waitForTimeout(300);
    const tables = await page.$$eval('#tables table.bench', (xs) => xs.length);
    const details = await page.$$eval('#tables details.more', (xs) => xs.length);
    const notrun = await page.$$eval('#tables p.cases', (xs) => xs.filter((x) => x.textContent.startsWith("not run —")).length);
    if (tables !== 0 || details !== 0) fail(`all lanes hidden must render no table/details, got ${tables} tables / ${details} details`);
    else if (notrun !== benchData.suites.length) fail(`expected ${benchData.suites.length} not-run suites, got ${notrun}`);
    else console.log(`ok: all lanes hidden -> ${notrun} "not run" suites, zero tables/details`);
    for (const k of keys) await page.check(`#lane-filter input[data-key="${k}"]`);
    await page.waitForTimeout(300);
    const back = await page.$$eval('#tables table.bench', (xs) => xs.length);
    if (back < 10) fail(`re-enabling every lane must restore the tables, got ${back}`);
    else console.log(`ok: lanes restored -> ${back} suite tables`);
  }

  // restore the default posture for the screenshot
  await page.click('#bench-hero button[data-metric="acc"]');
  await page.click('#bench-hero button[data-sort="data"]');
  await page.waitForTimeout(100);

  // screenshot for the record — into the gitignored scripts/out/, never the
  // repo root: the root is the public assets directory (wrangler.toml).
  const shotDir = path.join(__dirname, "out");
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, "bench_smoke.png"), fullPage: false });
  await browser.close();
  server.close();
  console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE PASSED");
})();
