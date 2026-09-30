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
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
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
  //    vanish / persist steps below passed on an empty set. The count is
  //    DATA-DERIVED (the paw precedent): the suite population is a decision
  //    (the T8 family drop shrank it 17→11), so a hard floor rots the first
  //    time the board legitimately shrinks. Only the >=1 liveness floor is
  //    hardcoded — a zero means the lane vanished from the tables.
  const laneData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
  const expectedLaneRows = (lane) => laneData.suites.reduce((n, s) => n + (s[lane] ? 1 : 0)
    + Object.values(s.extra_host_lanes || {}).reduce((m, h) => m + (h[lane] ? 1 : 0), 0), 0);
  const glinerRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^gliner · /.test(c.textContent); }).length);
  const expectedGliner = expectedLaneRows("gliner");
  if (glinerRows !== expectedGliner || expectedGliner < 1) fail(`gliner rows ${glinerRows} != data ${expectedGliner}`);
  else console.log(`ok: ${glinerRows} gliner table rows (data-derived)`);

  // 3b) agentjev rows (reflex .issues/025 amendment 4 — the same 4090
  // extra-host law; data-derived for the same population reason)
  const ajRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^agentjev · /.test(c.textContent); }).length);
  const expectedAj = expectedLaneRows("agentjev");
  if (ajRows !== expectedAj || expectedAj < 1) fail(`agentjev rows ${ajRows} != data ${expectedAj}`);
  else console.log(`ok: ${ajRows} agentjev table rows (data-derived)`);

  // 3c) openthai rows (reflex Plan 003 / Bench 074): the Thai board's
  //     comparison lane — row floor grows only upward
  const otRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^openthai · /.test(c.textContent); }).length);
  if (otRows < 4) fail(`expected >=4 openthai table rows, got ${otRows}`);
  else console.log(`ok: ${otRows} openthai table rows`);

  // 3d) paw rows (reflex .issues/033 — hosted + local postures of the
  //     ProgramAsWeights comparison lane): the cells were published into
  //     bench.json before any renderer carried them (the invisible-lane
  //     class) — the count is derived from the data, grows only upward.
  const pawRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^paw \(/.test(c.textContent); }).length);
  const expectedPaw = expectedLaneRows("paw") + expectedLaneRows("paw_local");
  if (pawRows !== expectedPaw) fail(`paw rows ${pawRows} != data ${expectedPaw}`);
  else console.log(`ok: ${pawRows} paw table rows (data-derived)`);

  // 4) hero bars: a lane's not-run bars must be EXACTLY the suites the
  //    lane never measured (read from the data — the suite set grows over
  //    time; the reflex Bench 074 Thai suites joined without clm/gliner/
  //    agentjev cells). A not-run on a suite WITH a lane cell is the
  //    extra-host fallback failing — the defect this check exists for.
  const benchData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
  const laneHasCell = (s, k) => !!(s[k] || Object.values(s.extra_host_lanes || {}).some((h) => h[k]));
  const notRun = await page.$$eval("#bench-hero .bc-hbar.bc-none", (xs) => xs.map((x) => x.textContent.trim()));
  console.log("hero not-run bars:", notRun.join(" | ") || "(none)");
  // paw rides the same pin: its cells are acc-only (top-level `accuracy`,
  // no hard block) and a pick() that gated on `hard` rendered the whole
  // lane "not run" on all nine measured suites while the tables scored
  // them fine (the user-reported ag_news case).
  for (const [key, label] of [["gliner", "gliner"], ["agentjev", "agentjev"], ["openthai", "openthai"], ["paw", "paw"]]) {
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
  if (glinerBack !== expectedGliner) fail(`gliner rows must return when re-checked, got ${glinerBack} (data ${expectedGliner})`);
  else console.log("ok: gliner rows restored");

  // 8) hero sort follows the FIRST VISIBLE lane (sorting by a lane the
  //    reader filtered out rendered as an unsorted page — the bars carried
  //    no visible order). The key lane is read by COLOR (the first visible
  //    lane's swatch), widths must be monotone, and suites without the key
  //    lane must sort last. Covers "by accuracy" AND "by latency". The
  //    width is read from the [data-picked] bar — the cell the pick logic
  //    chose IS the sort key; in the all-rigs view the lane renders several
  //    per-host bars and the first DOM bar is the primary host's, not
  //    necessarily the picked one.
  const heroKeyWidths = (color) => page.$$eval(
    "#bench-hero .bc-htrack",
    (ts, c) => ts.map((t) => {
      const b = t.querySelector(`.bc-hbar:not(.bc-none)[data-picked] i[style*="${c}"]`);
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

  // 8b) the all-rigs hero renders ONE BAR PER HOST, labeled @host. The old
  //     single best-accuracy bar mixed hosts inside one chart with the host
  //     named only on hover — a 4090 bar read as the M3's (the reported
  //     banking77 misread). Invariants: every rendered bar names its host,
  //     and the user's exact case (openthai · banking77) shows BOTH the m3
  //     and the 4090 bar side by side.
  {
    const barCount = await page.$$eval("#bench-hero .bc-hbar:not(.bc-none)", (xs) => xs.length);
    const labeled = await page.$$eval("#bench-hero .bc-hbar:not(.bc-none) .bc-hhost", (xs) => xs.length);
    if (labeled !== barCount) fail(`all-rigs hero: ${barCount} bars but ${labeled} @host labels — an unlabeled bar can be misread across rigs`);
    else console.log(`ok: all ${barCount} all-rigs hero bars carry an @host label`);
    const otBars = await page.$$eval(
      '#bench-hero .bc-hbar[aria-label^="banking77 openthai"]',
      (xs) => xs.map((x) => x.getAttribute("aria-label"))
    );
    const m3Bar = otBars.find((a) => a.includes(" on m3-max-metal"));
    const winBar = otBars.find((a) => a.includes(" on 4090-win"));
    if (!m3Bar || !winBar || otBars.length !== 2) fail(`openthai · banking77 must render exactly its two host bars (m3 + 4090), got: ${JSON.stringify(otBars)}`);
    else console.log("ok: openthai · banking77 renders both host bars (@m3-max-metal + @4090-win)");
  }
  // Issue-021 verdicts on the tables: every unfit latency cell renders
  // marked (class + † + reason on hover), and nothing else does. The
  // Reflex lane is always visible, so its unfit cells bound the count.
  {
    const bench = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
    const cells = bench.suites.flatMap((s) => [s.modelless, ...Object.values(s.laya || {}),
      ...Object.values(s.extra_host_lanes || {}).flatMap((h) => [h.modelless, ...Object.values(h.laya || {}),
        h.clm, h.gliner, h.agentjev, h.hybrid, h.openthai, h.paw, h.paw_local]), s.clm, s.gliner, s.agentjev, s.hybrid,
      s.openthai, s.paw, s.paw_local]).filter(Boolean);
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

  // 9d) the area radar (#bench-areas): two cards render from data.areas —
  //     polygons only for complete lanes, dots for measured spokes, the
  //     partial lane (Rethink encoder, 1/9) disclosed in BOTH legends, and
  //     the lane filter governs it like every other section (hiding a lane
  //     removes its rows from both cards).
  {
    await page.waitForFunction(() => document.querySelectorAll("#bench-areas .area-card svg").length === 2, { timeout: 10000 });
    const cards = await page.$$eval("#bench-areas .area-card", (xs) => xs.length);
    if (cards !== 2) fail(`expected 2 area cards, got ${cards}`);
    const polys = await page.$$eval("#bench-areas .rd-poly", (xs) => xs.length);
    if (polys < 6) fail(`expected >=6 radar polygons (modelless/hybrid/laya x 2 cards), got ${polys}`);
    const dots = await page.$$eval("#bench-areas .rd-dot", (xs) => xs.length);
    if (dots < 40) fail(`expected >=40 radar dots, got ${dots}`);
    const legendTxt = await page.$eval("#bench-areas", (x) => x.textContent);
    if (!legendTxt.includes("Rethink (encoder)") || !legendTxt.includes("1/9"))
      fail("the radar legends must disclose the partial Rethink encoder lane (1/9)");
    const encRows = await page.$$eval("#bench-areas .rd-lg", (xs) => xs.filter((x) => x.textContent.includes("Rethink (encoder)")).length);
    if (encRows !== 2) fail(`expected a Rethink legend row on both cards, got ${encRows}`);
    else console.log(`ok: area radar renders (${polys} polygons, ${dots} dots, partial lane disclosed on both cards)`);
    // the filter governs the radar: hiding the encoder lane empties its rows
    await page.uncheck('#lane-filter input[data-key="instinct-encoder"]');
    await page.waitForTimeout(300);
    const encAfter = await page.$$eval("#bench-areas .rd-lg", (xs) => xs.filter((x) => x.textContent.includes("Rethink (encoder)")).length);
    if (encAfter !== 0) fail(`hiding the encoder lane must empty its radar rows, got ${encAfter}`);
    else console.log("ok: the lane filter governs the area radar");
    await page.check('#lane-filter input[data-key="instinct-encoder"]');
    await page.waitForTimeout(300);
  }

  // 10) the rig radio: derived from the fleet merge (all | M3 Max | RTX
  //     4090), default "all", governs EVERY section — tables, per-suite
  //     charts, the hero, and the provenance strip. The M3 Max scope keeps
  //     the ANE device rows (same machine, device suffix rule); the 4090
  //     scope keeps the comparison lanes that ran there. Counts derived
  //     from the data; the scope survives a reload.
  {
    const rigValues = await page.$$eval("#rig-filter input[name=bench-rig]", (xs) => xs.map((x) => x.value));
    if (!(rigValues.includes("all") && rigValues.some((v) => v.startsWith("m3-max")) && rigValues.includes("4090-win")))
      fail(`rig radios wrong: ${rigValues.join(",")}`);
    else console.log(`ok: rig radios present (${rigValues.join(" · ")})`);
    const checked0 = await page.$eval("#rig-filter input[name=bench-rig]:checked", (x) => x.value);
    if (checked0 !== "all") fail(`default rig must be "all", got ${checked0}`);
    else console.log("ok: default rig is all");

    const bench = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
    const hostRowCount = (host) => bench.suites.reduce((n, s) => {
      const hl = (s.extra_host_lanes || {})[host];
      if (!hl) return n;
      return n + (hl.modelless ? 1 : 0) + Object.keys(hl.laya || {}).length
        + ["clm", "gliner", "agentjev", "openthai", "paw", "paw_local", "hybrid"].filter((k) => hl[k]).length;
    }, 0);

    // RTX 4090 scope: no m3 rows (primary rows are unlabeled — the
    // PRIMARY_HOST tag — so ANY unlabeled row is a leak), every row tagged
    // @4090-win, and the provenance strip scoped to the 4090 chip.
    await page.check('#rig-filter input[value="4090-win"]');
    await page.waitForTimeout(300);
    const hostTags = await page.$$eval("#tables .host", (xs) => xs.map((x) => x.textContent.trim()));
    const unlabeled = await page.$$eval("#tables tbody tr", (trs) => trs.filter((t) => !t.querySelector(".host")).length);
    const m3Tags = hostTags.filter((t) => /m3-max/.test(t)).length;
    if (m3Tags !== 0 || unlabeled !== 0) fail(`4090 scope leaks m3 rows: ${m3Tags} @m3 tags, ${unlabeled} unlabeled rows`);
    const expect4090 = hostRowCount("4090-win");
    if (hostTags.filter((t) => t === "@4090-win").length !== expect4090)
      fail(`4090 scope: ${hostTags.filter((t) => t === "@4090-win").length} @4090-win rows vs ${expect4090} cells in the data`);
    else console.log(`ok: 4090 scope renders exactly the ${expect4090} 4090-win cells`);
    const provChips = await page.$$eval("#bench-meta .run-chip b", (xs) => xs.map((x) => x.textContent));
    if (provChips.some((h) => /m3-max/.test(h))) fail(`provenance strip not scoped: ${provChips}`);
    else console.log(`ok: provenance strip scoped (${provChips.join(", ")})`);

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#tables table.bench").length >= 10, { timeout: 15000 });
    const still = await page.$eval("#rig-filter input[name=bench-rig]:checked", (x) => x.value);
    if (still !== "4090-win") fail("rig scope must survive a reload");
    else console.log("ok: rig scope survives a reload");

    // M3 Max scope: no 4090 rows; the ANE device rows stay (same machine);
    // 4090-only comparison lanes (clm/gliner/agentjev/paw) vanish.
    await page.check('#rig-filter input[value="m3-max-metal"]');
    await page.waitForTimeout(300);
    const winTags = await page.$$eval("#tables .host", (xs) => xs.filter((x) => /4090-win/.test(x.textContent)).length);
    if (winTags !== 0) fail(`M3 scope still shows ${winTags} @4090-win rows`);
    const expectAne = hostRowCount("m3-max-ane");
    const aneTags = await page.$$eval("#tables .host", (xs) => xs.filter((x) => x.textContent.trim() === "@m3-max-ane").length);
    if (aneTags !== expectAne) fail(`M3 scope: ${aneTags} @m3-max-ane rows vs ${expectAne} in the data`);
    else console.log(`ok: M3 scope keeps the ${aneTags} ANE device rows, zero 4090 rows`);
    const clmUnderM3 = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^clm · /.test(c.textContent); }).length);
    if (clmUnderM3 !== 0) fail(`clm (a 4090 lane) still renders under the M3 scope: ${clmUnderM3} rows`);
    else console.log("ok: 4090-only lanes vanish under the M3 scope");

    // back to all: the comparison lanes return.
    await page.check('#rig-filter input[value="all"]');
    await page.waitForTimeout(300);
    const glinerBack = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^gliner · /.test(c.textContent); }).length);
    if (glinerBack !== expectedGliner) fail(`"all" scope must restore the comparison lanes, got ${glinerBack} gliner rows (data ${expectedGliner})`);
    else console.log("ok: all-rigs scope restores the comparison lanes");
  }

  // 11) the Instinct section (#instinct): sits between Protocol and FAQ,
  //     embeds the two-mirror flow figure, and renders BOTH verdict rows
  //     + the PoC/GOAT chip from the data (the same computation as
  //     instinct.js — the smoke re-derives the expected chip state).
  {
    const order = await page.evaluate(() => {
      const p = document.getElementById("protocol-section"), i = document.getElementById("instinct"), f = document.getElementById("faq");
      if (!p || !i || !f) return null;
      return !!(p.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING)
        && !!(i.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    if (!order) fail("#instinct must sit after #protocol-section and before #faq");
    else console.log("ok: #instinct sits after Protocol, before FAQ");
    const figEl = await page.$(".instinct img");
    await figEl.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const i = document.querySelector(".instinct img"); return i && i.naturalWidth > 0; }, null, { timeout: 10000 });
    const fig = await page.$eval(".instinct img", (x) => ({ src: x.getAttribute("src"), w: x.naturalWidth }));
    if (fig.src !== "/assets/instinct_flow.svg" || !fig.w) fail(`instinct figure broken: ${JSON.stringify(fig)}`);
    else console.log(`ok: instinct flow figure loads (${fig.w}px)`);
    await page.waitForFunction(() => document.querySelectorAll("#instinct-verdict li").length >= 2, { timeout: 10000 });
    const accOf = (l) => { if (!l) return null; const h = (l.hard || {}).accuracy; return h != null ? h : l.accuracy; };
    const bench = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
    const cells = (s) => {
      const out = [s.modelless, ...Object.values(s.laya || {}), s.clm, s.gliner, s.agentjev, s.openthai, s.paw, s.paw_local, s.hybrid]
        .filter(Boolean);
      for (const hl of Object.values(s.extra_host_lanes || {}))
        out.push(hl.modelless, ...Object.values(hl.laya || {}), hl.clm, hl.gliner, hl.agentjev, hl.openthai, hl.paw, hl.paw_local, hl.hybrid);
      return out.filter(Boolean);
    };
    const armed = bench.suites.filter((s) => accOf(s.modelless) != null && cells(s).some((l) => l.lane === "Instinct (hybrid)"));
    const strictlyAll = armed.length > 0 && armed.every((s) => {
      const hyb = Math.max(...cells(s).filter((l) => l.lane === "Instinct (hybrid)").map(accOf));
      const bestOther = Math.max(...cells(s).filter((l) => l.lane !== "Instinct (hybrid)" && l.model !== "multilingual").map(accOf));
      return hyb - bestOther > 1e-9;
    });
    const chip = await page.$eval("#instinct-verdict .chip", (x) => x.className);
    if (chip !== (strictlyAll ? "chip ok" : "chip poc")) fail(`instinct chip "${chip}" but the data says ${strictlyAll ? "chip ok" : "chip poc"}`);
    else console.log(`ok: instinct chip ${chip} matches the data (${armed.length} armed suites)`);
    const verdict = await page.textContent("#instinct-verdict");
    if (!/Instinct vs Reflex, accuracy/.test(verdict)) fail("the vs-Reflex row (moved law) is missing");
    if (!/Instinct vs best lane, accuracy/.test(verdict)) fail("the vs-best-lane row (the raised bar) is missing");
    if (!/no Instinct arm yet/.test(verdict)) fail("the no-arm disclosure is missing");
    // Both row marks follow the MAJORITY law (owner call, the Reflex-vs-laya
    // rule one lane over): green everywhere, YELLOW on a strict majority,
    // red on a minority — re-derived here from the same bench.json.
    const rowMark = (label) => page.$eval("#instinct-verdict ul", (ul, l) => {
      const li = [...ul.querySelectorAll("li")].find((x) => x.textContent.includes(l));
      return li ? li.className : null;
    }, label);
    const markOf = (wins, n) => (wins === n ? "ok" : wins * 2 > n ? "warn" : "gap");
    const vsReflexWins = armed.filter((s) => {
      const hyb = Math.max(...cells(s).filter((l) => l.lane === "Instinct (hybrid)").map(accOf));
      const km = Math.max(...cells(s).filter((l) => l.lane === "KatGPT" || l.model === "modelless").map(accOf));
      return hyb > km;
    }).length;
    const expectReflex = markOf(vsReflexWins, armed.length);
    if ((await rowMark("Instinct vs Reflex")) !== expectReflex)
      fail(`vs-Reflex mark ${await rowMark("Instinct vs Reflex")} but majority rule says ${expectReflex} (${vsReflexWins}/${armed.length})`);
    else console.log(`ok: vs-Reflex mark ${expectReflex} (${vsReflexWins}/${armed.length} ahead)`);
    const vsBestWins = armed.filter((s) => {
      const hyb = Math.max(...cells(s).filter((l) => l.lane === "Instinct (hybrid)").map(accOf));
      const bestOther = Math.max(...cells(s).filter((l) => l.lane !== "Instinct (hybrid)" && l.model !== "multilingual").map(accOf));
      return hyb - bestOther > 1e-9;
    }).length;
    const expectBest = markOf(vsBestWins, armed.length);
    if ((await rowMark("Instinct vs best lane")) !== expectBest)
      fail(`vs-best mark ${await rowMark("Instinct vs best lane")} but majority rule says ${expectBest} (${vsBestWins}/${armed.length})`);
    else console.log(`ok: vs-best mark ${expectBest} (${vsBestWins}/${armed.length} strictly best)`);
    if (!process.exitCode) console.log("ok: instinct verdict rows render (vs Reflex + vs best lane + no-arm)");
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
