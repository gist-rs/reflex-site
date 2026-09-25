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

  // 2) the filter bar: 5 chips (the two laya spellings may both exist)
  const chips = await page.$$eval("#lane-filter input[type=checkbox]", (xs) => xs.map((x) => x.dataset.key));
  console.log("chips:", chips.join(","));
  for (const k of ["katgpt", "rust", "python", "clm", "gliner", "agentjev"]) {
    if (!chips.includes(k)) fail(`filter chip missing: ${k}`);
  }
  if (chips.length >= 5) console.log("ok: filter chips present");

  // 3) gliner rows in the tables (the 4090 extra-host rows)
  const glinerRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => t.textContent.includes("gliner (reference)")).length);
  if (glinerRows < 10) fail(`expected >=10 gliner table rows, got ${glinerRows}`);
  else console.log(`ok: ${glinerRows} gliner table rows`);

  // 3b) agentjev rows (reflex .issues/025 amendment 4 — the same 4090
  // extra-host law; 14 suites carry the lane)
  const ajRows = await page.$$eval("#tables tr", (trs) => trs.filter((t) => t.textContent.includes("agentjev (reference)")).length);
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
  const glinerAfter = await page.$$eval("#tables tr", (trs) => trs.filter((t) => t.textContent.includes("gliner (reference)")).length);
  if (glinerAfter !== 0) fail(`gliner rows must vanish when filtered off, got ${glinerAfter}`);
  else console.log("ok: gliner filtered out of tables");
  const suiteBars = await page.$$eval(".bc-slabel", (xs) => xs.filter((x) => x.textContent.includes("gliner")).length);
  if (suiteBars !== 0) fail(`gliner per-suite bars must vanish, got ${suiteBars}`);
  else console.log("ok: gliner filtered out of per-suite bars");

  // 6) reload: the filter persists
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const glinerReload = await page.$$eval("#tables tr", (trs) => trs.filter((t) => t.textContent.includes("gliner (reference)")).length);
  if (glinerReload !== 0) fail("filter state must survive reload");
  else console.log("ok: filter persists across reload");

  // 7) restore: check gliner back on
  await page.check('#lane-filter input[data-key="gliner"]');
  await page.waitForTimeout(300);
  const glinerBack = await page.$$eval("#tables tr", (trs) => trs.filter((t) => t.textContent.includes("gliner (reference)")).length);
  if (glinerBack < 10) fail(`gliner rows must return when re-checked, got ${glinerBack}`);
  else console.log("ok: gliner rows restored");

  // screenshot for the record
  await page.screenshot({ path: "bench_smoke.png", fullPage: false });
  await browser.close();
  server.close();
  console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE PASSED");
})();
