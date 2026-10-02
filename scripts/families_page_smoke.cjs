// The families page render smoke: serves the repo statically, renders
// /families/ in headless chromium, and asserts the QUARANTINE + the caveat
// + the pending-not-zero encoder cell behave (reflex issue 059 / Plan 009
// REVISED-2).
//
// Needs playwright locally (never a dep of this repo):
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/families_page_smoke.cjs
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
  // service (the bench-page smoke's measured 2026-10-02 lesson).
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const PORT = server.address().port;
  const BASE = `http://127.0.0.1:${PORT}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

  await page.goto(`${BASE}/families/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelectorAll("#fam-table table.fam tbody tr").length >= 6, { timeout: 15000 });

  // 1) no page errors
  if (errs.length) fail("page errors: " + errs.join("; "));
  else console.log("ok: no page errors");

  // 2) six family rows, table-driven from data/families.json
  const rows = await page.$$eval("#fam-table table.fam tbody tr", (rs) =>
    rs.map((r) => Array.from(r.querySelectorAll("td")).map((td) => td.textContent.trim()))
  );
  if (rows.length !== 6) fail(`expected 6 family rows, got ${rows.length}`);
  else console.log("ok: 6 family rows");

  // 3) the caveat renders verbatim (normalized) in #caveat
  const caveat = await page.$eval("#caveat", (el) => el.textContent.replace(/\s+/g, " ").trim());
  const expected = await page.evaluate(() => fetch("/data/families.json").then((r) => r.json()).then((d) => d.meta.caveat.replace(/\s+/g, " ").trim()));
  if (!caveat.includes(expected)) fail("rendered caveat does not carry the data file's verbatim caveat");
  else console.log("ok: caveat rendered verbatim");

  // 4) QUARANTINE: the page fetches ONLY its own data file (no bench.json)
  const fetched = [];
  page.on("request", (req) => fetched.push(new URL(req.url()).pathname));
  await page.reload({ waitUntil: "networkidle" });
  if (fetched.includes("/data/bench.json")) fail("QUARANTINE BROKEN: the families page fetched bench.json");
  else console.log("ok: quarantine — the page never fetches bench.json");

  // 5) pending-not-zero: the encoder column renders "not run", never 0%
  const encCells = rows.map((r) => r[5]);
  if (!encCells.every((c) => /not run/.test(c))) fail("encoder cells must render 'not run': " + JSON.stringify(encCells));
  else console.log("ok: encoder renders 'not run' on all six");

  // 6) lane names carry the naming law (Reflex / Rethink), no Instinct
  const header = await page.$eval("#fam-table table.fam thead", (h) => h.textContent);
  if (!/Reflex \(modelless\)/.test(header) || !/Rethink \(hybrid\)/.test(header) || !/Rethink \(encoder\)/.test(header))
    fail("lane headers missing the naming-law spellings: " + header);
  else if (/Instinct/.test(await page.content()))
    fail("the page must not use the retired 'Instinct' lane spelling");
  else console.log("ok: lane names follow the naming law (Reflex / Rethink)");

  // 7) chance tier legible beside each accuracy
  if (!rows.every((r) => /^\d+\.\d%$/.test(r[2]))) fail("chance column malformed: " + JSON.stringify(rows.map((r) => r[2])));
  else console.log("ok: chance tiers render");

  await browser.close();
  server.close();
  if (process.exitCode) console.log("FAMILIES PAGE SMOKE FAILED");
  else console.log("FAMILIES PAGE SMOKE PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
