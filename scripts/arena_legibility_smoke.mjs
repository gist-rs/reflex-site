// Arena legibility + palette smoke (reflex-site Issue 009 T3/T4).
//
// T3 — design guide §6 (riir-ai .docs/13_web_family/design_guide.md): chart
// labels never below 11 px, and the page never scrolls sideways at 390 px.
// Measured, not assumed: every label's RENDERED size = its computed CSS
// font-size × (rendered svg width / viewBox width). A scaled-down svg is
// exactly how a 920-unit chart renders 11-unit labels at ~3.9 px on a phone.
//   • the two result charts (.ac-svg, inline <text>)
//   • the walked flow figures (.fw-stage svg — mermaid htmlLabels, so the
//     labels are HTML inside <foreignObject>, not <text>)
//   • the static flow figures (.lanefig img — an <img> exposes no DOM, so the
//     label size is read from the svg's own root rule, `#<id>{…font-size:Npx`)
//   • the mini replay boards (.fw-board svg) — their only label ("12 rows")
//     appears on some steps, so a board with no label at load is not a
//     finding; their font-size LITERALS in flow_walk_tetris.js (the board
//     plug-in, split out of flow_walk.js in riir-ai Plan 620 P1.4) are
//     checked statically
// Each family carries a blindness floor: a selector that matches nothing
// would otherwise print a perfect score over zero labels.
//
// T4 — the family palette: the Tetris flow figures and the step-through
// script must carry none of the retired brown/ember theme's literals.
//
// Run: node scripts/arena_legibility_smoke.mjs [site_dir]   (exit 1 on any finding)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(process.argv[2] ?? path.join(here, ".."));
const PORT = Number(process.env.LEGIBILITY_PORT ?? 18933);
const base = `http://127.0.0.1:${PORT}`;
const MIN_PX = 11;
const WIDTHS = [390, 1280];
// blindness floors per family (measured 2026-10-03: 2 charts, 2 walked
// figures, 3 static figures, 2 boards)
const FLOORS = { charts: 2, walked: 2, static: 3, boards: 2 };
const LABEL_OPTIONAL = new Set(["boards"]);

let failed = false;
const fail = (m) => { failed = true; console.error(`[legibility] FAIL: ${m}`); };

// ── T4: static palette check (no browser) ─────────────────────────────────
const RETIRED = ["#241410", "#ff8a4c", "#1d110c", "#3a2117", "#f2e6dd", "#b99f8f", "#ffb27a", "#331d13", "#140b08", "242,230,221", "242, 230, 221", "255, 138, 76"];
const paletteFiles = [
  ...readdirSync(path.join(siteDir, "assets")).filter((f) => /^tetris_flow_.*\.svg$/.test(f)).map((f) => path.join("assets", f)),
  "assets/flow_walk.js",
  "assets/flow_walk_tetris.js",
  "assets/arena.css",
];
if (paletteFiles.length < 7) fail(`palette scan saw ${paletteFiles.length} files (< 7) — walk went blind`);
for (const rel of paletteFiles) {
  const text = readFileSync(path.join(siteDir, rel), "utf8").toLowerCase();
  const hits = RETIRED.filter((lit) => text.includes(lit));
  if (hits.length) fail(`${rel} still carries the retired brown palette: ${hits.join(" ")}`);
}
// the board label sizes are svg attributes at 1:1 (the board svg is never
// scaled) — a literal below 11 is a sub-11 px label whenever it shows
{
  const js = readFileSync(path.join(siteDir, "assets/flow_walk_tetris.js"), "utf8");
  const sizes = [...js.matchAll(/"font-size":\s*([\d.]+)/g)].map((m) => Number(m[1]));
  if (!sizes.length) fail("flow_walk_tetris.js: no font-size literal found — the static board-label check went blind");
  for (const fs of sizes) if (fs < MIN_PX) fail(`flow_walk_tetris.js: board label font-size ${fs} < ${MIN_PX}`);
}

// ── T3: rendered label sizes ───────────────────────────────────────────────
const siblingRequire = createRequire(
  "/Users/katopz/git/riir-mmorpg-examples/scripts/browser-badge-test/package.json",
);
const { chromium } = siblingRequire("playwright");
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: siteDir, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();

try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.on("pageerror", (e) => fail(`${width}px pageerror: ${e.message}`));
    await page.goto(`${base}/arena/`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.querySelectorAll(".ac-svg").length >= 2 && document.querySelectorAll(".fw-stage svg").length >= 2,
      null, { timeout: 15000 },
    ).catch(() => {});
    // lazy <img>s load only near the viewport — bring each into view
    for (const img of await page.locator(".lanefig img").all()) await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll(".lanefig img")].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 }).catch(() => {});

    const r = await page.evaluate(async () => {
      const scaleOf = (svg) => {
        const vb = svg.viewBox?.baseVal;
        const bw = svg.getBoundingClientRect().width;
        return vb && vb.width && bw ? bw / vb.width : (bw ? 1 : 0);
      };
      const minOver = (svg, sel) => {
        const s = scaleOf(svg);
        let min = Infinity, what = "";
        for (const n of svg.querySelectorAll(sel)) {
          if (!n.textContent.trim()) continue;
          const px = parseFloat(getComputedStyle(n).fontSize) * s;
          if (px < min) { min = px; what = n.textContent.trim().slice(0, 32); }
        }
        return { min, what, scale: s };
      };
      const fam = (sel, labelSel) => [...document.querySelectorAll(sel)].map((svg, i) => ({ i, ...minOver(svg, labelSel) }));
      const statics = [];
      for (const img of document.querySelectorAll(".lanefig img")) {
        const src = img.getAttribute("src");
        const txt = await (await fetch(src)).text();
        const vbw = parseFloat((/viewBox="[\d.\s-]+?\s([\d.]+)\s[\d.]+"/.exec(txt) || [])[1]);
        const id = (/<svg[^>]*\bid="([^"]+)"/.exec(txt) || [])[1];
        const fs = id ? parseFloat((new RegExp(`#${id}\\{[^}]*?font-size:([\\d.]+)px`).exec(txt) || [])[1]) : NaN;
        const bw = img.getBoundingClientRect().width;
        statics.push({ i: src.split("/").pop(), min: fs * (bw / vbw), what: `${fs}px label in a ${vbw}-wide box at ${Math.round(bw)} px`, scale: bw / vbw });
      }
      return {
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        charts: fam(".ac-svg", "text"),
        walked: fam(".fw-stage svg", "foreignObject div, foreignObject span, text"),
        boards: fam(".fw-board svg", "text"),
        static: statics,
      };
    });

    if (r.scrollW !== r.innerW) fail(`${width}px: page scrolls sideways (scrollWidth ${r.scrollW} ≠ ${r.innerW})`);
    for (const [famName, floor] of Object.entries(FLOORS)) {
      const rows = r[famName];
      if (rows.length < floor) fail(`${width}px: ${famName} measured ${rows.length} (< floor ${floor}) — selector went blind`);
      for (const row of rows) {
        if (!Number.isFinite(row.min)) {
          if (!LABEL_OPTIONAL.has(famName)) fail(`${width}px: ${famName}[${row.i}] has no measurable label`);
          continue;
        }
        const ok = row.min >= MIN_PX - 0.01;
        const line = `${width}px ${famName}[${row.i}] min label ${row.min.toFixed(2)} px (scale ${row.scale.toFixed(3)}) — "${row.what}"`;
        if (ok) console.log(`[legibility] ✓ ${line}`);
        else fail(line);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(failed ? "[legibility] ✗ FAILED" : "[legibility] ✓ every arena label ≥ 11 px at 390 and 1280, no sideways page scroll, no retired palette");
process.exit(failed ? 1 : 0);
