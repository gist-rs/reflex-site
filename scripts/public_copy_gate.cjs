// The public-copy gate (web trust audit Issue 008 T5, 2026-10-03): every
// served page's RENDERED text (headless chromium, every <details> opened,
// scripts/styles excluded — innerText, the visible surface) and every served
// mirrored doc must carry
//   1. no internal record ids — `Plan|Proposal|Issue|Bench <number>`, `<n>-era`,
//      `pre-<n>` (the history lives in HISTORY.md / data/changes.json, read on
//      GitHub, never in page copy);
//   2. no banned vocabulary — "seal/sealed/sealing" (design guide §5: the
//      word is a third-party game name; the crypto step is "lock/locked");
//   3. the family chrome — <html data-product="reflex">, the gf-bar first in
//      <body> with Reflex current, the gf-foot family map;
//   4. no sideways scroll at 390 px (design guide §6), details opened.
//
// Needs playwright locally (never a dep of this repo):
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/public_copy_gate.cjs
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8797;
const PAGES = ["/", "/playground/", "/arena/", "/bench/", "/resources/", "/docs/api/", "/404.html"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".md": "text/markdown", ".wasm": "application/wasm" };

// Case-INSENSITIVE: innerText applies CSS text-transform, so an id inside an
// uppercased kicker reads "PLAN 12" and a case-sensitive scan never saw it.
const ID_RE = /\b(?:Plan|Proposal|Issue|Bench)\s+\d+|\b\d+-era\b|\bpre-\d+\b/gi;
const SEAL_RE = /\bseal(?:ed|s|ing)?\b/gi;
// FAQ figures (Issue 009 T1, the numbers law): a measured figure in FAQ copy
// must be BOUND — rendered into a [data-ot] / [data-bind] element from
// data/bench.json — never typed. The scan reads each opened <details class=
// "faq"> with its bound elements removed. What is left that looks like a
// measurement must be an ALLOWED constant below, each with its reason; a new
// typed figure reds, and so does an allow row nothing matches any more.
const FIG_RE = /~?\d+(?:\.\d+)?\s?(?:ms|µs|s\b|×|%)|\b0\.\d{3,}\b/g;
const FAQ_FIGURE_ALLOW = new Map([
  ["9×", "a THIRD PARTY's published claim, quoted and attributed (Jev's own speedup)"],
  ["99.9%", "the parity gate's threshold — a policy constant, not a measurement"],
  ["5%", "the re-read tolerance the methodology states — a policy constant"],
  ["10×", "the log axis's gridline step — a chart-design constant"],
  ["500 ms", "the log axis's range — a chart-design constant"],
]);

// Wire captures (`.wire-pair`, rendered by scripts/render_wire.mjs from
// data/wire.json) are the engine's VERBATIM bytes — the site cannot reword
// them without lying about what the binary returns. An internal id inside one
// is an ENGINE defect, fixed at the source and allowed here by name until the
// next release is re-captured; an id in ordinary copy is never allowed, and a
// row no capture carries any more reds (the recapture forces its removal).
const WIRE_ID_ALLOW = new Map([
]);
const wireIdSeen = new Set();

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

function served(rel) {
  // the served mirrored docs + the agent skill (the md surfaces a reader fetches)
  const out = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const r = path.join(d, n.name);
      if (n.isDirectory()) walk(r);
      else if (/\.(md|svg)$/.test(n.name)) out.push(r);
    }
  };
  for (const d of rel) if (fs.existsSync(path.join(ROOT, d))) walk(d);
  return out;
}

(async () => {
  const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch();
  let checked = 0;
  const faqAllowSeen = new Set();
  for (const url of PAGES) {
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => fail(`${url}: ${e.message}`));
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
      await page.waitForTimeout(200);
      const faqText = await page.evaluate(() => [...document.querySelectorAll("details.faq")].map((d) => {
        const c = d.cloneNode(true);
        c.querySelectorAll("[data-ot],[data-bind]").forEach((e) => e.remove());
        return c.innerText;
      }).join("\n"));
      const r = await page.evaluate(() => ({
        text: document.body.innerText,
        wire: [...document.querySelectorAll(".wire-pair")].map((w) => w.innerText).join("\n"),
        copy: (() => {
          const b = document.body.cloneNode(true);
          b.querySelectorAll(".wire-pair").forEach((w) => w.remove());
          document.body.appendChild(b); // innerText needs a rendered node
          const t = b.innerText;
          b.remove();
          return t;
        })(),
        product: document.documentElement.getAttribute("data-product"),
        firstIsBar: !!(document.body.firstElementChild && document.body.firstElementChild.classList.contains("gf-bar")),
        current: [...document.querySelectorAll(".gf-bar a[aria-current]")].map((a) => a.textContent.trim()).join(),
        foot: [...document.querySelectorAll("footer.gf-foot a")].map((a) => { try { return new URL(a.href).host; } catch (_) { return ""; } }),
        sw: document.documentElement.scrollWidth,
        iw: innerWidth,
      }));
      const tag = `${url} @${vp.width}`;
      if (vp.width === 1280) {
        const ids = r.copy.match(ID_RE) || [];
        if (ids.length) fail(`${tag}: internal ids in rendered copy: ${JSON.stringify([...new Set(ids)].slice(0, 8))}`);
        for (const id of new Set(r.wire.match(ID_RE) || [])) {
          if (WIRE_ID_ALLOW.has(id)) wireIdSeen.add(id);
          else fail(`${tag}: internal id ${JSON.stringify(id)} in a captured wire example — fix the engine string at the source, or allow it by name with a reason`);
        }
        const seals = r.text.match(SEAL_RE) || [];
        if (seals.length) fail(`${tag}: banned word "seal" in rendered copy (${seals.length}×)`);
        for (const f of faqText.match(FIG_RE) || []) {
          const k = f.replace(/^~/, "");
          if (FAQ_FIGURE_ALLOW.has(k)) faqAllowSeen.add(k);
          else fail(`${tag}: typed figure ${JSON.stringify(f)} in FAQ copy — bind it to data/bench.json ([data-ot]) or allow it with a reason`);
        }
        if (r.product !== "reflex") fail(`${tag}: <html data-product> = ${r.product}`);
        if (!r.firstIsBar) fail(`${tag}: gf-bar is not the first element in <body>`);
        if (r.current !== "Reflex") fail(`${tag}: gf-bar current = ${JSON.stringify(r.current)}`);
        for (const h of ["reflex.gist.rs", "rethink.gist.rs", "refine.gist.rs", "ai.gist.rs"]) {
          if (!r.foot.includes(h)) fail(`${tag}: family footer misses ${h}`);
        }
      } else if (r.sw !== r.iw) {
        fail(`${tag}: page scrolls sideways (scrollWidth ${r.sw} vs ${r.iw}) with every <details> open`);
      }
      checked++;
      await page.close();
    }
  }
  // the served md/svg mirrors: the banned word only (ids in mirrored docs are
  // the source repos' own business — their pages are not this site's copy)
  const files = served(["docs", "skills", "assets"]);
  let seal = 0;
  for (const f of files) {
    const t = fs.readFileSync(path.join(ROOT, f), "utf8");
    const m = t.match(SEAL_RE);
    if (m) { seal++; fail(`served ${f}: banned word "seal" (${m.length}×)`); }
  }
  for (const k of WIRE_ID_ALLOW.keys()) {
    if (!wireIdSeen.has(k)) fail(`wire allow row ${JSON.stringify(k)} matches no captured example any more — remove it`);
  }
  for (const k of FAQ_FIGURE_ALLOW.keys()) {
    if (!faqAllowSeen.has(k)) fail(`FAQ allow row ${JSON.stringify(k)} matches nothing any more — remove it`);
  }
  if (files.length < 10) fail(`walked only ${files.length} served md/svg files — the walk went blind`);
  await browser.close();
  server.close();
  if (!process.exitCode) console.log(`public copy gate PASS (${PAGES.length} pages × 2 sizes = ${checked} renders; ${files.length} served md/svg files; no internal ids, no "seal", family chrome, 390 px clean)`);
})();
