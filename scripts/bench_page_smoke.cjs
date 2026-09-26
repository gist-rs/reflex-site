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
  const navChips = await page.$$eval("#suite-nav a", (as) => as.map((a) => a.getAttribute("href")));
  if (navChips.length !== suiteAnchors.length) fail(`quick-nav chips ${navChips.length} != suites ${suiteAnchors.length}`);
  else {
    const ids = new Set(suiteAnchors.map((s) => `#${s.id}`));
    const missing = navChips.filter((h) => !ids.has(h));
    if (missing.length) fail("quick-nav chips without a suite anchor: " + missing.join(", "));
    else console.log(`ok: quick-nav has ${navChips.length} chips, all resolve`);
  }

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
  for (const k of ["katgpt", "rust", "python", "clm", "gliner", "agentjev"]) {
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

  // 4) hero bars: gliner lane bar present (not "not run")
  const notRun = await page.$$eval("#bench-hero .bc-hbar.bc-none", (xs) => xs.map((x) => x.textContent.trim()));
  console.log("hero not-run bars:", notRun.join(" | ") || "(none)");
  if (notRun.some((t) => t.startsWith("gliner"))) fail("gliner hero bar reads not-run — the extra-host fallback failed");

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

  // screenshot for the record — into the gitignored scripts/out/, never the
  // repo root: the root is the public assets directory (wrangler.toml).
  const shotDir = path.join(__dirname, "out");
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, "bench_smoke.png"), fullPage: false });
  await browser.close();
  server.close();
  console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE PASSED");
})();
