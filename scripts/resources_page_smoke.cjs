// The /resources education-page smoke: serves the repo statically, renders
// /resources/ in headless chromium, and asserts the page the proposal
// specified (ai Proposal 053 / plan 619 T3.3):
//   1. render — the four sections exist with self-linked titles, the three
//      framing sentences appear VERBATIM in visible text, every <img>
//      resolves (the mermaid-<img> embedding law) with a non-empty alt,
//      the target matrix has its shape, the collapses are present, and
//      Rethink carries NO link to its private repo (the moat law).
//   2. numbers law — on VISIBLE TEXT only (tags/scripts/styles stripped
//      first, per the proposal caveat: raw-HTML grep would flag version
//      strings and svg attributes), the digit patterns from
//      scripts/sync_mirror.py's fence (_DECIMAL_RE + _UNIT_RE) must find
//      NOTHING: qualitative classes are typed, exact figures are links.
//
// Needs playwright locally (never a dep of this repo):
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/resources_page_smoke.cjs
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "resources", "index.html");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".md": "text/markdown" };
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

// The fence's own digit vocabulary (keep in lockstep with sync_mirror.py —
// one definition of "digit-heavy" across the site's instruments).
const DECIMAL_RE = /\d+\.\d+/;
const UNIT_RE = /\d+\s?(?:ms|µs|us|s|tok\/s|%)/;

// Raw-file visible text: drop script/style blocks, strip tags, decode the
// entities the page actually uses. This is the static half; the rendered
// innerText below is the live half.
function visibleTextOfRawHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/>/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function digitFindings(text, label, fail) {
  const dec = text.match(new RegExp(DECIMAL_RE, "g")) || [];
  const unit = text.match(new RegExp(UNIT_RE, "g")) || [];
  if (dec.length) fail(`${label}: ${dec.length} decimal figure(s) in visible text: ${JSON.stringify(dec.slice(0, 5))}`);
  if (unit.length) fail(`${label}: ${unit.length} digit+unit claim(s) in visible text: ${JSON.stringify(unit.slice(0, 5))}`);
  if (!dec.length && !unit.length) console.log(`ok: numbers law clean on ${label} (no decimals, no digit+unit)`);
}

(async () => {
  await new Promise((r) => server.listen(8795, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

  // 0. the numbers law on the RAW file first (no browser needed to be true)
  const raw = fs.readFileSync(PAGE, "utf8");
  digitFindings(visibleTextOfRawHtml(raw), "raw resources/index.html visible text", fail);

  await page.goto("http://127.0.0.1:8795/resources/", { waitUntil: "networkidle" });

  // the figures are loading="lazy" (the site convention) — scroll through the
  // page so every one enters the viewport and actually loads before asserting
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 });

  // 1. no page errors
  if (errs.length) fail("page errors: " + errs.join("; "));
  else console.log("ok: no page errors");

  // 2. the four sections exist with self-linked titles
  const sections = await page.evaluate(() =>
    ["overview", "reflex", "rethink", "development"].map((id) => {
      const sec = document.getElementById(id);
      const a = sec && sec.querySelector("h2 a.hlink");
      return { id, ok: !!sec, href: a && a.getAttribute("href") };
    })
  );
  for (const s of sections) {
    if (!s.ok) fail(`missing section #${s.id}`);
    else if (s.href !== `#${s.id}`) fail(`#${s.id} title not self-linked (href=${s.href})`);
  }
  if (sections.every((s) => s.ok && s.href === `#${s.id}`)) console.log("ok: all four sections present, titles self-linked");

  // 3. the framing sentences VERBATIM on the page (textContent, not
  //    innerText — collapsed <details> text is hidden from innerText but is
  //    still page copy)
  const bodyText = await page.evaluate(() => document.body.textContent);
  const norm = (s) => s.replace(/\s+/g, " "); // source wraps sentences across lines
  const flat = norm(bodyText);
  const framings = [
    "Reflex is the family's free floor — a modelless decision engine that runs on your machine, answers from a corpus you author, and abstains by design when the evidence is thin.",
    "Instinct is the idea that upgrades Reflex without replacing it: when the free engine abstains, a specialist trained for exactly that domain scores the survivors on top, never instead.",
    "Rethink is the same Instinct idea one rung deeper: where a bag specialist is too coarse, a trained encoder head thinks — served HOSTED-ONLY from our GPU servers, so the weights never leave controlled hardware.",
  ];
  framings.forEach((f, i) => {
    if (!flat.includes(f)) fail(`framing sentence ${i + 1} missing or not verbatim`);
  });
  if (framings.every((f) => flat.includes(f))) console.log("ok: all three framing sentences verbatim");

  // 4. every image resolves (the <img> embedding law — mermaid renders share
  //    id="mermaid-svg", inlining two would clash) and carries an alt
  const imgs = await page.evaluate(() =>
    [...document.images].map((i) => ({
      src: i.getAttribute("src"),
      ok: i.complete && i.naturalWidth > 0,
      alt: (i.getAttribute("alt") || "").trim(),
    }))
  );
  const broken = imgs.filter((i) => !i.ok);
  if (broken.length) fail(`broken images: ${JSON.stringify(broken)}`);
  const noAlt = imgs.filter((i) => !i.alt);
  if (noAlt.length) fail(`images without alt text: ${JSON.stringify(noAlt.map((i) => i.src))}`);
  const wanted = [
    "/assets/decision_flow.svg", "/assets/instinct_flow.svg", "/assets/rethink_flow.svg",
    "/assets/reflex_dev_flow.svg", "/assets/instinct_dev_flow.svg", "/assets/rethink_dev_flow.svg",
  ];
  for (const w of wanted) {
    if (!imgs.some((i) => i.src === w)) fail(`expected image missing: ${w}`);
  }
  if (imgs.length !== 7) fail(`expected 7 <img> (decision_flow reused in overview + reflex), got ${imgs.length}`);
  if (!broken.length && !noAlt.length && imgs.length === 7 && wanted.every((w) => imgs.some((i) => i.src === w))) {
    console.log(`ok: all 7 images resolve with alts (6 unique assets, decision_flow reused)`);
  }

  // 5. the target matrix: 4 columns, header + 6 rows
  const matrix = await page.evaluate(() => {
    const t = document.querySelector("#matrix table");
    if (!t) return null;
    const headCols = t.querySelectorAll("thead th").length;
    const rows = t.querySelectorAll("tbody tr").length;
    return { headCols, rows };
  });
  if (!matrix) fail("target matrix (#matrix table) missing");
  else if (matrix.headCols !== 4 || matrix.rows !== 6) fail(`matrix shape ${matrix.headCols} cols x ${matrix.rows} rows, expected 4 x 6`);
  else console.log(`ok: target matrix 4 columns x ${matrix.rows} rows`);

  // 6. collapses present (details.more / details.faq)
  const det = await page.evaluate(() => document.querySelectorAll("details").length);
  if (det < 5) fail(`expected >=5 collapsible details, got ${det}`);
  else console.log(`ok: ${det} collapsible details`);

  // 7. the moat law: Rethink carries NO link to its private repo — not in
  //    hrefs, not as visible text
  const moat = await page.evaluate(() => ({
    hrefs: [...document.querySelectorAll("a[href*='riir-rethink']")].map((a) => a.getAttribute("href")),
    text: /riir-rethink/.test(document.body.textContent),
  }));
  if (moat.hrefs.length || moat.text) fail(`moat law: riir-rethink referenced (${moat.hrefs.length} hrefs, text=${moat.text})`);
  else console.log("ok: moat law — no riir-rethink link or text anywhere");

  // 8. the numbers law on RENDERED visible text (the live half; innerText —
  //    not textContent — is the visible surface, the raw-file half above is
  //    the superset)
  digitFindings(await page.evaluate(() => document.body.innerText), "rendered innerText", fail);

  // 9. the storefront is marked incoming (graceful degradation — no hard
  //    dependency on a URL that may be dark)
  if (!/incoming/.test(flat)) fail("storefront not marked incoming");
  else console.log("ok: rethink.gist.rs marked incoming");

  // 10. nav: exactly one Resources link, marked current here; GitHub icon in
  const cur = await page.$$eval("header.site nav a", (as) =>
    as.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.getAttribute("href"))
  );
  if (cur.length !== 1 || cur[0] !== "/resources/") fail(`aria-current nav: ${JSON.stringify(cur)}`);
  const resLinks = await page.$$eval("header.site nav a[href='/resources/']", (as) => as.length);
  if (resLinks !== 1) fail(`expected 1 Resources nav link, got ${resLinks}`);
  const gh = await page.$$eval("header.site nav a.gh", (as) => as.length);
  if (gh !== 1) fail(`expected 1 GitHub nav icon, got ${gh}`);
  if (cur.length === 1 && cur[0] === "/resources/" && resLinks === 1 && gh === 1) console.log("ok: nav (Resources current, GitHub icon in)");

  await browser.close();
  server.close();
  if (!process.exitCode) console.log("resources page smoke PASS");
})();
