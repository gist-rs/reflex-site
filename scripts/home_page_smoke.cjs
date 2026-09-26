// The home-page render smoke: serves the repo statically, renders / in
// headless chromium, and asserts the /#sizes disk-footprint chart drew
// from data/sizes.json (candidates present, ascending, bars + chips +
// totals + tooltips) and sits BEFORE the "Start here" section. Also pins
// the hero bench chart still rendering (the two charts share the page).
//
// Needs playwright locally (never a dep of this repo):
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/home_page_smoke.cjs
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
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
  await new Promise((r) => server.listen(8793, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

  await page.goto("http://127.0.0.1:8793/", { waitUntil: "networkidle" });

  // 1. the size chart rendered from data (not the loading placeholder)
  await page.waitForFunction(
    () => document.querySelectorAll("#size-report .sz-row").length >= 7,
    { timeout: 10000 }
  );
  const sizes = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#size-report .sz-row")];
    const order = [...document.querySelectorAll("#size-report .sz-name")].map((n) => n.textContent);
    const totals = [...document.querySelectorAll("#size-report .sz-total")].map((n) => n.textContent);
    const chips = document.querySelectorAll("#size-report .sz-chip").length;
    const tips = document.querySelectorAll("#size-report [data-sztip]").length;
    return { rows: rows.length, order, totals, chips, tips };
  });
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sizes.json"), "utf8"));
  if (sizes.rows !== data.candidates.length) fail(`rows ${sizes.rows} != data ${data.candidates.length}`);
  for (let i = 0; i < data.candidates.length; i++) {
    if (sizes.order[i] !== data.candidates[i].name) fail(`row ${i}: ${sizes.order[i]} != ${data.candidates[i].name}`);
    if (!sizes.totals[i] || sizes.totals[i] === "—") fail(`row ${i}: no total rendered`);
  }
  if (sizes.chips < data.candidates.length) fail(`chips ${sizes.chips} < candidates`);
  if (sizes.tips < data.candidates.length) fail(`tooltips ${sizes.tips} < candidates (engine bars alone)`);
  else console.log(`ok: /#sizes rendered ${sizes.rows} candidates, chips ${sizes.chips}, tooltips ${sizes.tips}, first="${sizes.order[0]}", last="${sizes.order.at(-1)}"`);

  // 2. the section sits BEFORE "Start here" (the placement law)
  const placement = await page.evaluate(() => {
    const sizesEl = document.getElementById("sizes");
    const explore = document.getElementById("explore");
    if (!sizesEl || !explore) return null;
    return sizesEl.compareDocumentPosition(explore) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  if (!placement) fail("#sizes is not before #explore (Start here)");
  else console.log("ok: #sizes sits before Start here");

  // 3. the provenance line rendered (never-hand-typed disclosure)
  const prov = await page.textContent("#sizes-prov").catch(() => null);
  if (!prov || !/never hand-typed/.test(prov)) fail("sizes provenance line missing");
  else console.log("ok: provenance line rendered");

  // 4. the hero bench chart still renders (shared page, no regression)
  const heroBars = await page.evaluate(() => document.querySelectorAll("#bench-summary .bc-hbar").length);
  if (heroBars < 5) fail(`hero bench chart bars ${heroBars} — regression?`);
  else console.log(`ok: hero bench chart still rendering (${heroBars} bars)`);

  // 4b. every section title self-links to its own anchor
  const hlinks = await page.evaluate(() =>
    [...document.querySelectorAll("section[id]")].map((sec) => {
      const a = sec.querySelector("h2 a.hlink");
      return { id: sec.id, href: a && a.getAttribute("href") };
    })
  );
  if (hlinks.length < 7) fail(`expected >=7 self-linked section titles, got ${hlinks.length}`);
  else {
    const bad = hlinks.filter((s) => s.href !== `#${s.id}`);
    if (bad.length) fail("section titles not self-linked: " + JSON.stringify(bad));
    else console.log(`ok: ${hlinks.length} section titles self-linked`);
  }

  // nav: GitHub icon in, Download out (it lives in the footer now)
  const ghLinks = await page.$$("header.site nav a.gh");
  if (ghLinks.length !== 1) fail(`expected exactly 1 GitHub icon in the nav, got ${ghLinks.length}`);
  const dlInNav = await page.$$eval("header.site nav a", (as) => as.filter((a) => /releases/.test(a.getAttribute("href"))).length);
  if (dlInNav !== 0) fail("Download is still in the nav");
  const dlInFoot = await page.$$("footer.site .fine a[href*='releases']");
  if (!dlInFoot.length) fail("Download missing from the footer");
  else console.log("ok: nav has the GitHub icon, Download moved to the footer");

  // nav: the GitHub icon is vertically centered against its text neighbors
  // (the 18px svg rode the text baseline 3px high; pinned by pixel box)
  const dy = await page.evaluate(() => {
    const t = document.querySelector('header.site nav a[href="/#skill"]').getBoundingClientRect();
    const i = document.querySelector("header.site nav a.gh svg").getBoundingClientRect();
    return (t.top + t.bottom) / 2 - (i.top + i.bottom) / 2;
  });
  if (Math.abs(dy) > 1) fail(`GitHub icon not vertically centered: |dy|=${Math.abs(dy).toFixed(2)}px`);
  else console.log(`ok: GitHub icon centered against the nav text (dy=${dy.toFixed(2)}px)`);

  // 5. no page errors
  if (errs.length) fail("page errors: " + errs.join("; "));
  else console.log("ok: no page errors");

  await browser.close();
  server.close();
  if (!process.exitCode) console.log("home page render smoke PASS");
})();
