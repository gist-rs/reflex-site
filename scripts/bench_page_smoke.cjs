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
  // Ephemeral loopback port — a hard-coded port collides with any local
  // service (measured 2026-10-02: an instinct `serve` on 8791 made the
  // smoke talk to the WRONG server and time out on its own fixture).
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const PORT = server.address().port;
  const BASE = `http://127.0.0.1:${PORT}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

  await page.goto(`${BASE}/bench/`, { waitUntil: "networkidle" });
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

  // 3e) clef rows (the Clef comparison lane, acc-only cells): the same
  //     data-derived law — the cells are acc-only (latency stripped under
  //     the Issue-021 wall until the quiet-box re-read), so a zero here is
  //     the invisible-lane class again, never an honest absence.
  const clefRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => { const c = t.querySelector("td"); return c && /^clef \(local\)/.test(c.textContent); }).length);
  const expectedClef = expectedLaneRows("clef");
  if (clefRows !== expectedClef || expectedClef < 1) fail(`clef rows ${clefRows} != data ${expectedClef}`);
  else console.log(`ok: ${clefRows} clef table rows (data-derived)`);

  // 3f) the JDI crosswalk (plan 011 C3): the section renders per data.
  //     crosswalk — one table per crosswalk suite (the clef-carrying set),
  //     the B5 caveat VERBATIM (the publisher carries the sentence; the page
  //     renders it, never re-words it), the board reference rows, and at
  //     least one measured row per suite (clef itself). A missing block on
  //     a clef-carrying board is the invisible-section class.
  const X = laneData.crosswalk;
  if (X && Array.isArray(X.suites) && X.suites.length) {
    const xwTables = await page.$$eval("#bench-crosswalk table", (ts) => ts.length);
    const xwExpected = X.suites.length + 2; // suites + board ref + blog
    if (xwTables !== xwExpected) fail(`crosswalk tables ${xwTables} != data ${xwExpected}`);
    else console.log(`ok: crosswalk renders ${X.suites.length} suite table(s) + the reference blocks (data-derived)`);
    const caveatText = await page.$eval("#bench-crosswalk .bc-note", (el) => el.textContent);
    if (!caveatText.includes(X.caveat)) fail(`crosswalk caveat not verbatim: ${caveatText.slice(0, 80)}`);
    else console.log("ok: crosswalk B5 caveat renders verbatim");
    // The pin line: every suite's heading carries its population pin.
    const pins = await page.$$eval("#bench-crosswalk h3.suite .cases code", (els) => els.map((e) => e.textContent));
    const expectedPins = X.suites.map((s) => s.pin);
    if (JSON.stringify(pins) !== JSON.stringify(expectedPins)) fail(`crosswalk pins ${pins} != data ${expectedPins}`);
    else console.log(`ok: crosswalk population pins render (${pins.length} suite(s))`);
    // The TL;DR card (plan 011 C3's remainder): one verdict line per suite,
    // derived from the rows — the leader name must match the data's argmax
    // (accuracy, clef named in every line), and a record-only leader must
    // carry its rec tag. Never a typed verdict.
    const tldrEl = await page.$("#bench-crosswalk .bc-note.tldr-verdict");
    if (!tldrEl) fail("crosswalk TL;DR card missing");
    else {
      const tldrText = await tldrEl.evaluate((el) => el.textContent);
      const leaderOf = (s) => {
        const withAcc = s.rows.filter((r) => typeof r.accuracy === "number");
        return withAcc.length ? withAcc.reduce((a, b) => (b.accuracy > a.accuracy ? b : a)) : null;
      };
      for (const s of X.suites) {
        if (!tldrText.includes(s.name)) fail(`TL;DR missing suite ${s.name}`);
        const lead = leaderOf(s);
        // clef-led suites read "<suite> — Clef … leads" (the renderer's
        // fixed phrasing); every other leader reads "<suite> — <display>".
        const leadTxt = String(lead.display).startsWith("clef") ? "Clef" : lead.display;
        if (lead && !tldrText.includes(`${s.name} — ${leadTxt}`)) fail(`TL;DR leader mismatch on ${s.name}`);
        if (lead && lead.record_only && !tldrText.includes("rec")) fail(`TL;DR record-only leader unmarked on ${s.name}`);
      }
      if (!/Clef/.test(tldrText)) fail("TL;DR never names Clef");
      console.log(`ok: crosswalk TL;DR verdicts render (${X.suites.length} suite(s), leaders match the data)`);
    }
  } else {
    console.log("ok: no crosswalk block (the board carries no clef cells) — section hidden");
  }

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
  // The instinct lanes ride it too: the katgpt matcher's `modelless` arm
  // classified the derived tier-fallback cells (model "modelless" riding
  // the Instinct/Rethink lane) as Reflex cells, and the hero rendered
  // "Instinct — not run" / "Rethink — not run" on every family row beside
  // a verdict card counting the same cells as family arms (2026-10-02
  // user report) — a not-run on a suite WITH a cell, this exact class.
  for (const [key, label] of [["gliner", "gliner"], ["agentjev", "agentjev"], ["openthai", "openthai"], ["paw", "paw"], ["clef", "clef"], ["hybrid", "Instinct"], ["encoder", "Rethink"]]) {
    const expected = benchData.suites.filter((s) => !laneHasCell(s, key)).length;
    const got = notRun.filter((t) => t.startsWith(label)).length;
    if (got !== expected) fail(`${label}: ${got} hero not-run bars vs ${expected} suites without a ${label} cell — a not-run on a measured suite means the extra-host fallback failed`);
    else if (expected > 0) console.log(`ok: ${label} not-run only on its ${expected} unmeasured suite(s)`);
  }

  // 4b) the S1MB section renders the grouped bar chart (the prose-in-cells
  //     overflow fix) and the lane filter governs it like every section.
  //     Bar counts are DATA-DERIVED from d.s1mb (a hand-typed count reds
  //     the day a lane lands).
  {
    const s1 = laneData.s1mb;
    if (!s1 || !Array.isArray(s1.lanes)) fail("s1mb arm: bench.json carries no s1mb block");
    else {
      const laneBars = (ln) => s1.suites.filter((su) => (ln.cells || {})[su] && typeof (ln.cells || {})[su].acc === "number").length
        + (typeof ln.avg === "number" ? 1 : 0);
      const expAll = s1.lanes.reduce((n, ln) => n + laneBars(ln), 0);
      const s1mbBars = () => page.$$eval("#bench-s1mb .bc-cell", (xs) => xs.length);
      if (!(await page.$("#bench-s1mb .bc-hgrid"))) fail("s1mb section renders no chart (bc-hgrid missing)");
      else {
        const n0 = await s1mbBars();
        if (n0 !== expAll) fail(`s1mb bars ${n0} != data ${expAll}`);
        else console.log(`ok: s1mb chart renders ${n0} bars (data-derived)`);
        // the laya lane leaves with its filter chip — bars AND its gap none-bar
        const laya = s1.lanes.find((ln) => ln.key === "laya");
        if (laya) {
          await page.uncheck('#lane-filter input[data-key="rust"]');
          await page.waitForTimeout(200);
          const n1 = await s1mbBars();
          if (n1 !== n0 - laneBars(laya)) fail(`s1mb bars after hiding laya: ${n1}, expected ${n0 - laneBars(laya)}`);
          else console.log("ok: s1mb chart honors the lane filter");
          await page.check('#lane-filter input[data-key="rust"]');
          await page.waitForTimeout(200);
        }
      }
    }
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
  //    lane must sort last. Covers the generic "by value" sort under the
  //    four metrics — accuracy, p50 (fastest-first), and the two that had
  //    NO sort before the generic one (acc@50% coverage, chance-corrected
  //    acc; 2026-10-02 user ask). The width is read from the [data-picked]
  //    bar — the cell the pick logic chose IS the sort key; in the all-rigs
  //    view the lane renders several per-host bars and the first DOM bar is
  //    the primary host's, not necessarily the picked one.
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
  // accuracy, all lanes visible → key = Reflex · modelless (#ff8a3d)
  await page.click('#bench-hero button[data-sort="value"]');
  await page.waitForTimeout(100);
  let widths = await heroKeyWidths("#ff8a3d");
  assertOrdered(widths, "acc · modelless key", false);
  let note = await heroNote();
  if (!note.includes("Rows sorted by accuracy, best first on the Reflex · modelless lane")) fail(`sort note should name the modelless lane, got: ${note}`);
  else console.log(`ok: hero by-value at the acc metric sorts ${widths.length} rows by the modelless lane`);
  // hide the product lane → key moves to laya (rust) (#3987e5), note names it
  await page.uncheck('#lane-filter input[data-key="katgpt"]');
  await page.waitForTimeout(100);
  widths = await heroKeyWidths("#3987e5");
  assertOrdered(widths, "acc · rust key", false);
  note = await heroNote();
  if (!note.includes("on the laya (rust) lane")) fail(`sort note should name the laya (rust) lane once modelless is hidden, got: ${note}`);
  else console.log("ok: hero sort key follows the first visible lane (note names it)");
  // latency: "by value" FOLLOWS the metric switch — no sort re-click, the
  // p50 metric re-sorts fastest-first on the next render
  await page.check('#lane-filter input[data-key="katgpt"]');
  await page.waitForTimeout(100);
  await page.click('#bench-hero button[data-metric="p50"]');
  await page.waitForTimeout(100);
  widths = await heroKeyWidths("#ff8a3d");
  assertOrdered(widths, "lat · modelless key", true);
  note = await heroNote();
  if (!note.includes("Rows sorted by p50 latency, fastest first on the Reflex · modelless lane")) fail(`latency sort note wrong, got: ${note}`);
  else console.log("ok: hero by-value follows the p50 metric switch (fastest-first, no re-click)");
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
        for (const lane of [h.openthai, h.bekko]) if (lane?.latency_p50_ms != null) visibleP50s.push(lane.latency_p50_ms);
      }
      if (s.openthai?.latency_p50_ms != null) visibleP50s.push(s.openthai.latency_p50_ms);
      if (s.bekko?.latency_p50_ms != null) visibleP50s.push(s.bekko.latency_p50_ms);
      // paw/paw_local joined the visible-latency set at reflex bench 116
      // (3 hosted cells ~1.0-1.2 s quotable; the local lane 24-65 ms). The
      // remaining hosted cells were published acc-only (no latency fields),
      // so the null check excludes them exactly as it does every other lane.
      if (s.paw?.latency_p50_ms != null) visibleP50s.push(s.paw.latency_p50_ms);
      if (s.paw_local?.latency_p50_ms != null) visibleP50s.push(s.paw_local.latency_p50_ms);
      // clef joined the visible-latency set at reflex bench 118 (the
      // quiet-box re-read: both cells quotable, 3368/1690 ms — past the
      // break). The lane's OTHER cells stay acc-only until measured on a
      // preflight-clean box.
      if (s.clef?.latency_p50_ms != null) visibleP50s.push(s.clef.latency_p50_ms);
    }
    // TABLES count: every variant cell's own p50 (the per-suite tables
    // render one row per lane VARIANT — paw hosted and paw local are two
    // rows, every laya checkpoint its own row).
    const expectedTables = visibleP50s.filter((v) => v > 500).length;
    // HERO count: the hero renders ONE bar per (suite, lane KEY, host) —
    // the best-accuracy candidate for that key (bench-charts.js pickHost;
    // first-wins-ties in allLanes order, multilingual skipped). The paw key
    // matches BOTH postures and the laya keys match every checkpoint, so
    // raw-cell counting over-counts variants the hero never renders —
    // measured at the bench-117 tail publish: ag_news + typed_decisions
    // pick paw LOCAL on accuracy (0.7925/0.5955 beat hosted 0.79/0.5925),
    // so their ~1.05 s hosted p50s count in the tables but never render a
    // hero bar. This mirrors the page's pick exactly (same field order,
    // same accOf, same lane-key grouping).
    const PRODUCT = new Set(["Instinct", "Instinct (hybrid)", "Rethink", "Rethink (encoder)", "Instinct (encoder)"]);
    const keyOf = (l) => {
      const ln = String(l.lane ?? "");
      if (ln === "KatGPT" || (l.model === "modelless" && !PRODUCT.has(ln))) return "katgpt";
      if (ln === "laya (rust)") return "rust";
      if (ln === "laya (python)") return "python";
      if (ln === "clm (reference)") return "clm";
      if (ln === "gliner (reference)") return "gliner";
      if (ln === "agentjev (reference)") return "agentjev";
      if (ln === "Instinct" || ln === "Instinct (hybrid)") return "instinct";
      if (PRODUCT.has(ln)) return "instinct-encoder";
      if (ln === "openthai (reference)") return "openthai";
      if (ln === "bekko (reference)") return "bekko";
      if (ln.startsWith("paw")) return "paw";
      if (ln === "clef (local)") return "clef";
      return "other";
    };
    const accOf = (l) => { const h = (l.hard || {}).accuracy; return h != null ? h : l.accuracy; };
    const num = (v) => typeof v === "number" && isFinite(v);
    // allLanes/extraLanes field order (bench-charts.js) — tie-breaks depend on it.
    const candsOf = (base) => {
      const out = [];
      if (base.modelless) out.push(base.modelless);
      for (const k of Object.keys(base.laya || {})) out.push(base.laya[k]);
      for (const k of ["clm", "gliner", "bekko", "agentjev", "openthai", "paw", "paw_local", "clef", "hybrid", "encoder"])
        if (base[k]) out.push(base[k]);
      return out;
    };
    let expectedHero = 0;
    for (const s of bench.suites) {
      const hosts = [s, ...Object.values(s.extra_host_lanes || {})];
      for (const hv of hosts) {
        const byKey = new Map();
        for (const l of candsOf(hv)) {
          if (l.model === "multilingual") continue;
          const k = keyOf(l);
          if (!byKey.has(k)) byKey.set(k, []);
          byKey.get(k).push(l);
        }
        for (const group of byKey.values()) {
          let best = null;
          for (const l of group) {
            const a = accOf(l);
            if (!num(a)) continue;
            if (!best || a > accOf(best)) best = l;
          }
          if (best && best.latency_p50_ms != null && best.latency_p50_ms > 500) expectedHero++;
        }
      }
    }
    const heroBreaks = await page.$$eval("#bench-hero .sz-break", (xs) => xs.length);
    if (heroBreaks !== expectedHero) fail(`expected ${expectedHero} hero break sign(s) on p50 (pick-mirrored, data-derived), got ${heroBreaks}`);
    else console.log(`ok: hero p50 carries the ${expectedHero} past-500ms break sign(s) (pick-mirrored, data-derived)`);
    const axisBreak = await page.$$eval("#bench-hero .bc-axis span", (xs) => xs.filter((s) => s.textContent === "500 ms").length);
    if (axisBreak < 1) fail("hero axis does not name the 500 ms break tick");
    else console.log(`ok: hero axis names the 500 ms break (${axisBreak} axis renders)`);
    const cellBreaks = await page.$$eval("#tables .bc-cell .sz-break", (xs) => xs.length);
    if (cellBreaks !== expectedTables) fail(`expected ${expectedTables} suite-cell break sign(s) (data-derived), got ${cellBreaks}`);
    else console.log(`ok: suite cells carry the ${expectedTables} past-500ms break sign(s) (data-derived)`);
  }

  // 9a) the two metrics that had NO sort before the generic "by value" one
  //     (2026-10-02 user ask): acc@50% coverage (two suites lack the field —
  //     they must sort LAST) and chance-corrected acc (suites without a
  //     chance baseline sort last too). Placed AFTER the break-sign block,
  //     which needs the metric still p50.
  {
    await page.click('#bench-hero button[data-metric="acc50"]');
    await page.waitForTimeout(100);
    widths = await heroKeyWidths("#ff8a3d");
    assertOrdered(widths, "acc50 · modelless key", false);
    note = await heroNote();
    if (!note.includes("Rows sorted by acc@50% coverage, best first")) fail(`acc50 sort note wrong, got: ${note}`);
    else console.log(`ok: hero by-value sorts by acc@50% coverage (${widths.filter((x) => x !== null).length} keyed rows, ${widths.filter((x) => x === null).length} not-run last)`);
    await page.click('#bench-hero button[data-metric="cc"]');
    await page.waitForTimeout(100);
    widths = await heroKeyWidths("#ff8a3d");
    assertOrdered(widths, "cc · modelless key", false);
    note = await heroNote();
    if (!note.includes("Rows sorted by chance-corrected acc, best first")) fail(`cc sort note wrong, got: ${note}`);
    else console.log(`ok: hero by-value sorts by chance-corrected acc (${widths.filter((x) => x !== null).length} keyed rows, ${widths.filter((x) => x === null).length} not-run last)`);
  }

  // 9b) the cc metric (2026-10-01, the user's live report): chance-corrected
  //     accuracy needs BOTH the lane cell and the suite's chance baseline —
  //     barHtml called M.get(l) without the suite, so cc rendered EVERY lane
  //     on EVERY suite "— not run" while the acc view and the tables were
  //     full of scores. Expectations are data-derived: a suite with a
  //     curated chance (data.areas.suites) that the modelless lane ran must
  //     render a real bar; a ran suite WITHOUT a chance must say
  //     "no chance baseline" (never "not run" — a skipped transform is not
  //     missing data); a suite the lane never measured stays "not run".
  {
    await page.click('#bench-hero button[data-metric="cc"]');
    await page.waitForTimeout(100);
    const areas = (benchData.areas && benchData.areas.suites) || {};
    const kmRan = (s) => !!(s.modelless || Object.values(s.extra_host_lanes || {}).some((h) => h.modelless));
    const rowsState = await page.$$eval("#bench-hero .bc-hgrid", (gs) => {
      const out = [];
      for (const g of gs) {
        const kids = [...g.children];
        for (let i = 0; i + 1 < kids.length; i++) {
          if (!kids[i].classList.contains("bc-hlabel") || !kids[i + 1].classList.contains("bc-htrack")) continue;
          const bars = [...kids[i + 1].querySelectorAll(".bc-hbar")];
          const km = bars.find((b) => (b.getAttribute("aria-label") || "").includes("Reflex · modelless"))
            || bars.find((b) => b.textContent.trim().startsWith("Reflex · modelless"));
          out.push({
            name: kids[i].textContent.trim(),
            real: !!km && !km.classList.contains("bc-none"),
            txt: km ? km.textContent.trim() : "(no modelless cell)",
          });
        }
      }
      return out;
    });
    let nChance = 0, nNoBase = 0, nNotRun = 0, bad = 0;
    for (const r of rowsState) {
      const s = benchData.suites.find((x) => x.name === r.name);
      if (!s) continue;
      const ran = kmRan(s), chance = !!areas[r.name];
      if (ran && chance) {
        nChance++;
        if (!r.real) { fail(`cc: ${r.name} ran + has a chance baseline but renders "${r.txt}"`); bad++; }
      } else if (ran && !chance) {
        nNoBase++;
        if (r.real || !/no chance baseline/.test(r.txt)) { fail(`cc: ${r.name} ran but chance-less — expected "no chance baseline", got "${r.txt}"`); bad++; }
      } else {
        nNotRun++;
        if (!/not run/.test(r.txt)) { fail(`cc: ${r.name} never measured by modelless — expected "not run", got "${r.txt}"`); bad++; }
      }
    }
    if (nChance < 1) { fail("cc: no chance-baseline suite rendered a bar — the metric is dead again"); bad++; }
    if (!bad) console.log(`ok: cc metric renders (${nChance} chance bars, ${nNoBase} "no chance baseline", ${nNotRun} not-run rows — data-derived)`);
    // back to accuracy so the sections below run on the default metric
    await page.click('#bench-hero button[data-metric="acc"]');
    await page.waitForTimeout(100);
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
        h.clm, h.gliner, h.agentjev, h.hybrid, h.openthai, h.paw, h.paw_local, h.clef, h.encoder]), s.clm, s.gliner, s.agentjev, s.hybrid,
      s.openthai, s.paw, s.paw_local, s.clef, s.encoder]).filter(Boolean);
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
  //     polygons for lanes, dots for the lane's own spokes, TRIANGLES
  //     (rd-fb) for its fallback spokes (the served tier's answer — count
  //     DATA-DERIVED from the publish's fallback_suites, never a literal),
  //     the partial lane (Rethink encoder, coverage DATA-DERIVED from the
  //     publish's areas block — never a hand-typed literal, issue 017)
  //     disclosed in BOTH legends, and the lane filter governs it like
  //     every other section (hiding a lane removes its rows from both cards).
  {
    await page.waitForFunction(() => document.querySelectorAll("#bench-areas .area-card svg").length === 2, { timeout: 10000 });
    const cards = await page.$$eval("#bench-areas .area-card", (xs) => xs.length);
    if (cards !== 2) fail(`expected 2 area cards, got ${cards}`);
    const polys = await page.$$eval("#bench-areas .rd-poly", (xs) => xs.length);
    if (polys < 6) fail(`expected >=6 radar polygons (modelless/hybrid/laya x 2 cards), got ${polys}`);
    const dots = await page.$$eval("#bench-areas .rd-dot", (xs) => xs.length);
    if (dots < 40) fail(`expected >=40 radar dots, got ${dots}`);
    const benchData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
    const encCov = ((benchData.areas || {}).lanes || {}).encoder;
    const covTxt = encCov && encCov.coverage ? `${encCov.coverage.suites}/${encCov.coverage.of}` : null;
    const legendTxt = await page.$eval("#bench-areas", (x) => x.textContent);
    if (!legendTxt.includes("Rethink") || !covTxt || !legendTxt.includes(covTxt))
      fail(`the radar legends must disclose the partial Rethink lane (${covTxt || "absent"})`);
    const encRows = await page.$$eval("#bench-areas .rd-lg", (xs) => xs.filter((x) => x.textContent.includes("Rethink")).length);
    if (encRows !== 2) fail(`expected a Rethink legend row on both cards, got ${encRows}`);
    else console.log(`ok: area radar renders (${polys} polygons, ${dots} dots, partial lane disclosed on both cards)`);
    // fallback spokes: triangles rendered per the published fallback_suites,
    // disclosed in the legends (the served-product radar, 2026-10-02)
    const expectedFb = Object.values(((benchData.areas || {}).lanes) || {})
      .reduce((a, ld) => a + ((ld.fallback_suites || []).length), 0);
    const fbs = await page.$$eval("#bench-areas .rd-fb", (xs) => xs.length);
    if (fbs !== expectedFb) fail(`expected ${expectedFb} fallback triangle(s) (data-derived), got ${fbs}`);
    else if (expectedFb > 0 && !legendTxt.includes("fallback")) fail("the radar legends must disclose the fallback spokes");
    else console.log(`ok: ${fbs} fallback triangle(s) rendered + disclosed`);
    // the filter governs the radar: hiding the encoder lane empties its rows
    await page.uncheck('#lane-filter input[data-key="instinct-encoder"]');
    await page.waitForTimeout(300);
    const encAfter = await page.$$eval("#bench-areas .rd-lg", (xs) => xs.filter((x) => x.textContent.includes("Rethink")).length);
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
    // The FAMILY lanes' data spelling (owner call 2026-10-01, instinct
    // issue 017 T5): the hybrid lane "Instinct" (+ legacy "Instinct
    // (hybrid)") and the encoder lane "Rethink" (+ legacy spellings) — the
    // vs-Reflex/vs-best rows count the family's best measured cell, with
    // the encoder contribution TAGGED record-only on its line. The smoke
    // mirrors the page's matcher exactly.
    const isHybrid = (l) => l.lane === "Instinct" || l.lane === "Instinct (hybrid)";
    const isEncoder = (l) => l.lane === "Rethink" || l.lane === "Rethink (encoder)" || l.lane === "Instinct (encoder)";
    const isFamily = (l) => isHybrid(l) || isEncoder(l);
    const cells = (s) => {
      const out = [s.modelless, ...Object.values(s.laya || {}), s.clm, s.gliner, s.agentjev, s.openthai, s.paw, s.paw_local, s.hybrid, s.encoder]
        .filter(Boolean);
      for (const hl of Object.values(s.extra_host_lanes || {}))
        out.push(hl.modelless, ...Object.values(hl.laya || {}), hl.clm, hl.gliner, hl.agentjev, hl.openthai, hl.paw, hl.paw_local, hl.hybrid, hl.encoder);
      return out.filter(Boolean);
    };
    const armed = bench.suites.filter((s) => accOf(s.modelless) != null && cells(s).some(isFamily));
    const famOf = (s) => Math.max(...cells(s).filter(isFamily).map(accOf));
    // Row 1 is the ENCODERLESS claim (reflex-site issue 010): hybrid cells
    // only, mirroring the page's isHybrid filter exactly.
    const hybOf = (s) => {
      const h = cells(s).filter((l) => l.lane === "Instinct" || l.lane === "Instinct (hybrid)");
      return h.length ? Math.max(...h.map(accOf)) : null;
    };
    // The best hybrid cell's `serves` — A0 means the free floor answered
    // (no specialist earned a seat): the page greys those out as
    // floor-seated instead of counting them as specialist ties (verdict
    // round 2, issue 010). Classified from the DATA, not the suite name.
    const hybServesOf = (s) => {
      const h = cells(s).filter((l) => l.lane === "Instinct" || l.lane === "Instinct (hybrid)");
      if (!h.length) return null;
      return h.reduce((a, b) => (accOf(b) > accOf(a) ? b : a)).serves || null;
    };
    const kmOf = (s) => Math.max(...cells(s).filter((l) => l.lane === "KatGPT" || l.model === "modelless").map(accOf));
    // The comparator pool refuses DERIVED tier-fallback rows wearing the
    // Rethink name — they carry the family's own number, so counting them
    // as "others" compares the stack against itself (the false-tie bug
    // reflex-site issue 010 fixes; mirrored from the page).
    const bestOtherOf = (s) => Math.max(...cells(s)
      .filter((l) => !isFamily(l) && !(l.derived && (l.lane === "Rethink" || l.lane === "Rethink (encoder)")) && l.model !== "multilingual")
      .map(accOf));
    const strictlyAll = armed.length > 0 && armed.every((s) => famOf(s) - bestOtherOf(s) > 1e-9);
    const chip = await page.$eval("#instinct-verdict .chip", (x) => x.className);
    if (chip !== (strictlyAll ? "chip ok" : "chip poc")) fail(`instinct chip "${chip}" but the data says ${strictlyAll ? "chip ok" : "chip poc"}`);
    else console.log(`ok: instinct chip ${chip} matches the data (${armed.length} armed suites)`);
    const verdict = await page.textContent("#instinct-verdict");
    if (!/Reflex vs Instinct · trained specialists \(encoderless\), accuracy/.test(verdict)) fail("the vs-Reflex row (encoderless specialists) is missing");
    if (!/Rethink vs Others, accuracy/.test(verdict)) fail("the Rethink-vs-Others row (the rung stack) is missing");
    if (!/no specialist arm yet/.test(verdict)) fail("the no-specialist-arm disclosure is missing");
    // A0-seated suites render as floor-seated, never as specialist ties —
    // the count is data-derived (serves === "A0" on the best hybrid cell).
    const hybArmed = armed.filter((s) => hybOf(s) != null);
    const a0N = hybArmed.filter((s) => hybServesOf(s) === "A0").length;
    if (a0N > 0 && !new RegExp(`floor-seated \\(A0 — no specialist earned a seat\\) on ${a0N}`).test(verdict))
      fail(`floor-seated disclosure missing or wrong (data says A0 on ${a0N} suites)`);
    else if (a0N > 0) console.log(`ok: floor-seated (A0) disclosure matches the data (${a0N} suites)`);
    if (!/Rethink reads record-only until its serving deploy/.test(verdict)) fail("the record-only qualifier on the rung-stack row is missing");
    // Both row marks follow the MAJORITY law (owner call, the Reflex-vs-laya
    // rule one lane over): green everywhere, YELLOW on a strict majority,
    // red on a minority — re-derived here from the same bench.json. Row 1's
    // population is the suites with a HYBRID arm (the encoderless claim);
    // row 2's is every suite with a family arm (the rung stack).
    const rowMark = (label) => page.$eval("#instinct-verdict ul", (ul, l) => {
      const li = [...ul.querySelectorAll("li")].find((x) => x.textContent.includes(l));
      return li ? li.className : null;
    }, label);
    const markOf = (wins, n) => (wins === n ? "ok" : wins * 2 > n ? "warn" : "gap");
    const vsReflexWins = hybArmed.filter((s) => hybOf(s) > kmOf(s)).length;
    const expectReflex = markOf(vsReflexWins, hybArmed.length);
    if ((await rowMark("Reflex vs Instinct")) !== expectReflex)
      fail(`vs-Reflex mark ${await rowMark("Reflex vs Instinct")} but majority rule says ${expectReflex} (${vsReflexWins}/${hybArmed.length} specialists ahead)`);
    else console.log(`ok: vs-Reflex mark ${expectReflex} (${vsReflexWins}/${hybArmed.length} specialists ahead)`);
    const vsBestWins = armed.filter((s) => famOf(s) - bestOtherOf(s) > 1e-9).length;
    const expectBest = markOf(vsBestWins, armed.length);
    if ((await rowMark("Rethink vs Others")) !== expectBest)
      fail(`vs-best mark ${await rowMark("Rethink vs Others")} but majority rule says ${expectBest} (${vsBestWins}/${armed.length} strictly best)`);
    else console.log(`ok: vs-best mark ${expectBest} (${vsBestWins}/${armed.length} strictly best)`);
    if (!process.exitCode) console.log("ok: instinct verdict rows render (Reflex vs specialists + Rethink vs Others + no-arm)");
  }

  // ── plan 001 (2026-10-02): the Jev-distill UI. All counts DATA-DERIVED
  // from bench.json (the population law the older arms follow).
  const bench2 = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bench.json"), "utf8"));
  const areasV3 = bench2.areas || {};
  if (areasV3.timing && areasV3.lanes) {
    // 1) the cc column: every suite table carries it, and the below-chance
    //    cells render marked — count = every published per_suite negative.
    const ccHeads = await page.$$eval("#tables table.bench thead th", (ths) =>
      ths.filter((t) => t.textContent.trim() === "cc").length);
    const suiteTables = await page.$$eval("#tables table.bench", (ts) => ts.length);
    if (ccHeads !== suiteTables || suiteTables < 1) fail(`cc column missing (${ccHeads}/${suiteTables} tables)`);
    else console.log(`ok: cc column on all ${suiteTables} suite tables`);
    const chanceOf = (sName) => (areasV3.suites[sName] || {}).chance;
    const accOfCell = (l) => { if (!l) return null; const h = (l.hard || {}).accuracy; return h != null ? h : l.accuracy; };
    let expectedNeg = 0;
    for (const ld of Object.values(areasV3.lanes))
      for (const [name, e] of Object.entries(ld.per_suite || {}))
        if (typeof e.cc === "number" && e.cc < 0) expectedNeg++;
    // the table renders EVERY lane cell (not the hero's pick), so the
    // negative count is over all (suite, lane-slot) pairs, computed with
    // the published chance basis — the same ccOf law
    let negCells = 0;
    for (const s of bench2.suites) {
      const ch = chanceOf(s.name);
      if (typeof ch !== "number") continue;
      const slots = [s.modelless, ...Object.values(s.laya || {}), s.clm, s.gliner, s.agentjev, s.openthai, s.paw, s.paw_local, s.hybrid, s.encoder];
      for (const hl of Object.values(s.extra_host_lanes || {}))
        slots.push(hl.modelless, ...Object.values(hl.laya || {}), hl.clm, hl.gliner, hl.agentjev, hl.openthai, hl.paw, hl.paw_local, hl.hybrid, hl.encoder);
      for (const l of slots) {
        const a = accOfCell(l);
        if (typeof a === "number" && (a - ch) / (1 - ch) < 0) negCells++;
      }
    }
    const ccNeg = await page.$$eval("#tables td.ccneg", (tds) => tds.length);
    if (ccNeg !== negCells) fail(`cc below-chance marks ${ccNeg} != data ${negCells}`);
    else console.log(`ok: ${ccNeg} below-chance cc cell(s) marked (data-derived)`);

    // 2) the timing methodology table: one row per areas lane.
    await page.waitForFunction(() => document.querySelectorAll("#bench-timing tbody tr").length > 0, null, { timeout: 10000 });
    const timingRows = await page.$$eval("#bench-timing tbody tr", (rs) => rs.length);
    if (timingRows !== Object.keys(areasV3.timing).length) fail(`timing rows ${timingRows} != data ${Object.keys(areasV3.timing).length}`);
    else console.log(`ok: timing methodology table (${timingRows} lanes)`);

    // 3) the efficiency frontier: svg + at least one Pareto ring + the
    //    not-plotted disclosure.
    const frontier = await page.$eval("#bench-frontier", (el) => ({
      svg: !!el.querySelector("svg"),
      dots: el.querySelectorAll("circle.rd-dot").length,
      rings: el.querySelectorAll("circle.ft-ring").length,
      note: el.textContent,
    }));
    let expectedPlotted = 0, expectedMiss = 0;
    for (const [key, ld] of Object.entries(areasV3.lanes)) {
      const t = areasV3.timing[key] || {};
      const ok = typeof ld.index === "number" && isFinite(ld.index)
        && typeof t.p50_geomean_ms === "number" && t.p50_geomean_ms > 0;
      ok ? expectedPlotted++ : expectedMiss++;
    }
    if (!frontier.svg || frontier.dots !== expectedPlotted || !frontier.rings) fail(`frontier render: ${JSON.stringify({ dots: frontier.dots, rings: frontier.rings, expectedPlotted })}`);
    else if (expectedMiss && !frontier.note.includes("Not plotted")) fail("frontier: not-plotted lanes undisclosed");
    else console.log(`ok: efficiency frontier (${frontier.dots} dots, ${frontier.rings} rings, ${expectedMiss} not plotted)`);

    // 4) the board-changes feed.
    await page.waitForFunction(() => document.querySelectorAll("#bench-changes li").length > 0, null, { timeout: 10000 });
    const changeRows = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "changes.json"), "utf8"));
    const renderedChanges = await page.$$eval("#bench-changes li", (ls) => ls.length);
    if (renderedChanges !== changeRows.length) fail(`board changes ${renderedChanges} != data ${changeRows.length}`);
    else console.log(`ok: board changes feed (${renderedChanges} rows)`);

    // 5) the ?lane= profile view (read-only; the saved filter untouched).
    await page.goto(`${BASE}/bench/?lane=clm@4090-win`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("#lane-profile .lane-profile"), null, { timeout: 10000 });
    const prof = await page.$eval("#lane-profile", (el) => ({
      head: el.querySelector("h3") && el.textContent,
      rows: el.querySelectorAll("tbody tr").length,
      neg: el.querySelectorAll("td.ft-neg").length,
    }));
    const clmLane = areasV3.lanes["clm@4090-win"];
    if (!prof.head || !/clm/i.test(prof.head) || prof.rows !== Object.keys(areasV3.suites).length) fail(`profile render: rows ${prof.rows}`);
    else if (!prof.head.includes("@4090-win")) fail("profile: host tag missing");
    else if (prof.neg !== Object.values(clmLane.per_suite).filter((e) => e.cc < 0).length) fail(`profile: below-chance marks ${prof.neg}`);
    else console.log(`ok: ?lane= profile view (clm@4090-win, ${prof.rows} suite rows, ${prof.neg} below-chance)`);
    // back to the main page posture for the screenshot
    await page.goto(`${BASE}/bench/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#tables table.bench").length >= 10, { timeout: 15000 });
  } else {
    fail("bench.json carries no areas v3 (timing/kind) — re-derive before deploying");
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
