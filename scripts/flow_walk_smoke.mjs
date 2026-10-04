// Flow-walk smoke: the arena's five lane figures inline their SVGs (gfflow
// since Plan 620 group A — desktop swimlane + 390 px card list), autoplay at
// 3 s/step once scrolled into view, and the manual controls (pause/resume/
// prev/next/dot-jump) step the highlight + description panel. The two
// rulebook figures also carry the replayed Tetris board side panel (the
// flow_walk_tetris plug-in), and every walk's IN/OUT payloads render in the
// step panel. Headless Chromium via the sibling's playwright install.
// Run: node scripts/flow_walk_smoke.mjs [site_dir]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(process.argv[2] ?? path.join(here, ".."));
const PORT = 18911;
const base = `http://127.0.0.1:${PORT}`;

const siblingRequire = createRequire(
  "/Users/katopz/git/riir-mmorpg-examples/scripts/browser-badge-test/package.json",
);
const { chromium } = siblingRequire("playwright");

const server = spawn("python3", ["-m", "http.server", String(PORT)], {
  cwd: siteDir,
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 800));

let failed = false;
const fail = (m) => {
  failed = true;
  console.error(`[flow-walk-smoke] FAIL: ${m}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));

// page.waitForFunction(fn, arg, options) — options is the THIRD argument
const waitFn = (fn, opts) => page.waitForFunction(fn, null, opts);

// the five figures in page order: laya · modelless · rulebook · modes · raw
const DOTS = [6, 4, 6, 5, 4];

try {
  await page.goto(`${base}/arena/`, { waitUntil: "networkidle" });

  // every figure mounted: the <picture>s were replaced by inline gfflow
  // stages (desktop swimlane + mobile card list = 2 svgs each) and no
  // <img> fallback remains
  await waitFn(
    () => document.querySelectorAll("figure[data-walk] .fw-stage svg").length === 10,
    { timeout: 10000 },
  );
  const imgsLeft = await page.locator("figure[data-walk] img").count();
  if (imgsLeft !== 0) fail(`expected the 5 walk pictures replaced, ${imgsLeft} imgs left`);
  const gfflow = await page.locator("figure[data-walk] .fw-stage svg[data-gfflow]").count();
  if (gfflow !== 10) fail(`inline svgs carrying data-gfflow: ${gfflow} (want 10)`);

  const figs = page.locator("figure[data-walk]");
  for (let i = 0; i < DOTS.length; i++) {
    const n = await figs.nth(i).locator(".fw-dot").count();
    if (n !== DOTS[i]) fail(`figure ${i}: dots ${n} (want ${DOTS[i]})`);
  }
  const count0 = (await figs.nth(0).locator(".fw-count").textContent()).trim();
  if (count0 !== "0 / 6") fail(`intro counter: "${count0}" (want "0 / 6")`);

  // scroll into view → autoplay arms: step 1 applies, then 3 s later step 2
  await figs.nth(0).scrollIntoViewIfNeeded();
  await waitFn(
    () => document.querySelectorAll("figure[data-walk] .fw-active").length > 0,
    { timeout: 10000 },
  );
  await waitFn(
    () => document.querySelector("figure[data-walk] .fw-count").textContent.includes("step 2 / 6"),
    { timeout: 12000 },
  );
  console.log("[flow-walk-smoke] autoplay: the laya figure reached step 2 (3 s/step)");

  // pause (deterministic base for the manual steps), then next/prev
  await figs.nth(0).locator(".fw-toggle").click();
  const pausedText = (await figs.nth(0).locator(".fw-toggle").textContent()).trim();
  if (pausedText !== "play") fail(`after pause the toggle should read "play", got "${pausedText}"`);
  const before = parseInt((await figs.nth(0).locator(".fw-count").textContent()).match(/step (\d)/)[1], 10);
  await figs.nth(0).locator('.fw-btn[aria-label="Next step"]').click();
  const afterNext = (await figs.nth(0).locator(".fw-count").textContent()).trim();
  if (afterNext !== `step ${before + 1} / 6`) fail(`after next: "${afterNext}" (want step ${before + 1})`);
  const stepTitle = (await figs.nth(0).locator(".fw-step-title").textContent()).trim();
  if (!/^\d([a-z]?(\.\d)?)? ·/.test(stepTitle) && !/^\d ·/.test(stepTitle)) {
    fail(`step panel title does not carry the step number: "${stepTitle}"`);
  }
  await figs.nth(0).locator('.fw-btn[aria-label="Previous step"]').click();
  const afterPrev = (await figs.nth(0).locator(".fw-count").textContent()).trim();
  if (afterPrev !== `step ${before} / 6`) fail(`after prev: "${afterPrev}"`);
  console.log("[flow-walk-smoke] manual: pause + next/prev step the highlight + panel");

  // the IN/OUT payloads (gfflow walks): the laya figure's step 1 shows the
  // recorded turn, step 5 the recorded answer — a gf-code block each
  await figs.nth(0).locator(".fw-dot").nth(0).click();
  await waitFn(
    () => document.querySelectorAll("figure[data-walk]")[0].querySelectorAll(".fw-io pre.gf-code").length >= 1,
    { timeout: 5000 },
  );
  const layaIn = (await figs.nth(0).locator(".fw-io pre.gf-code").first().textContent()).trim();
  if (!layaIn.includes('"piece"') || !layaIn.includes('"landing_spots"')) {
    fail(`laya IN payload does not look like the recorded turn: "${layaIn.slice(0, 80)}"`);
  }
  const prov = (await figs.nth(0).locator(".fw-io-from").first().textContent()).trim();
  if (!/recorded from the laya \(Rust\) lane/.test(prov)) fail(`laya provenance line: "${prov}"`);
  await figs.nth(0).locator(".fw-dot").nth(4).click();
  await waitFn(
    () => {
      const f = document.querySelectorAll("figure[data-walk]")[0];
      return [...f.querySelectorAll(".fw-io pre.gf-code")].some((p) => p.textContent.includes("p_clean_per_spot"));
    },
    { timeout: 5000 },
  );
  console.log("[flow-walk-smoke] payloads: the recorded turn in, P(clean) per spot out (provenance line present)");

  // the raw figure (index 4): its recorded answer is the all-null abstain
  await figs.nth(4).locator(".fw-dot").nth(3).click();
  await waitFn(
    () => {
      const f = document.querySelectorAll("figure[data-walk]")[4];
      return [...f.querySelectorAll(".fw-io pre.gf-code")].some((p) => p.textContent.includes("null"));
    },
    { timeout: 5000 },
  );
  console.log("[flow-walk-smoke] raw: the abstained answer (every P(clean) null) renders");

  // the rulebook figure (index 2): the gfflow walk + the board panel ride
  // together — 6 boards for 6 walk steps, replayed from the same record.
  // Step to the first search step so the candidate ghosts render (the intro
  // board carries no ghosts).
  const rbBoards = await figs.nth(2).locator(".fw-board svg").count();
  if (rbBoards !== 1) fail(`rulebook board svg count at a step: ${rbBoards} (want 1)`);
  await figs.nth(2).locator('.fw-btn[aria-label="Next step"]').click();
  const cells = await figs.nth(2).locator(".fw-board svg rect[data-cell]").count();
  if (cells < 20) fail(`rulebook board stack cells: ${cells} (want a real stack, ≥20)`);
  const hl = await figs.nth(2).locator(".fw-board svg rect[data-hl]").count();
  if (hl < 1) fail("rulebook board has no step highlight cells");
  const chipRb = (await figs.nth(2).locator(".fw-board-chip").textContent()).trim();
  if (chipRb.length < 10) fail(`board chip empty: "${chipRb}"`);
  const scan = await figs.nth(2).locator(".fw-board svg rect[data-try]").count();
  if (scan < 10) fail(`spot-scan flash layer: ${scan} rects (want one per candidate cell)`);
  const tryDur = await figs.nth(2).locator(".fw-board svg rect[data-try]").first().evaluate(
    (n) => n.style.getPropertyValue("--try-dur"),
  );
  if (!/ms$/.test(tryDur)) fail(`scan cycle duration not set: "${tryDur}"`);
  // the withAlpha-hex bug class: resting ghosts must be TRANSLUCENT (rgba
  // fill, not solid) and the scan must actually be seen flashing (some flash
  // rect reaches high computed opacity within a cycle)
  const ghostFill = await figs.nth(2).locator(".fw-board svg rect[data-ghost]").first().getAttribute("fill");
  if (!ghostFill.startsWith("rgba(")) fail(`ghost fill not translucent: "${ghostFill}"`);
  const scanLit = await page.waitForFunction(
    () => [...document.querySelectorAll("figure[data-walk] .fw-board svg rect[data-try]")]
      .some((r) => parseFloat(getComputedStyle(r).opacity) > 0.6),
    null, { timeout: 4000 },
  ).then(() => true).catch(() => false);
  if (!scanLit) fail("scan flash never reached visible opacity (animation not running?)");

  // step 6 = the recorded clear: walk the rulebook figure to the last step
  for (let i = 0; i < 5; i++) await figs.nth(2).locator('.fw-btn[aria-label="Next step"]').click();
  await waitFn(
    () => document.querySelectorAll("figure[data-walk]")[2].querySelector(".fw-count").textContent.includes("step 6 / 6"),
    { timeout: 5000 },
  );
  const lastChip = (await figs.nth(2).locator(".fw-board-chip").textContent()).trim();
  if (!/play|clear|lands/.test(lastChip)) fail(`rulebook last-step chip: "${lastChip}"`);
  const flashed = await figs.nth(2).locator(".fw-board svg rect[data-flash]").count();
  console.log(`[flow-walk-smoke] boards: replayed from the record (cells=${cells}, hl=${hl}, flash rows=${flashed})`);

  // dot jump on the modes figure → the DOWNSTACK step rings the holes;
  // the recovery step lights BOTH back edges (the gfflow <g data-edge>
  // groups each carry the class; count the paths)
  await figs.nth(3).locator(".fw-dot").nth(1).click();
  await waitFn(
    () => {
      const f = document.querySelectorAll("figure[data-walk]")[3];
      return f.querySelectorAll(".fw-board svg rect[data-hl]").length >= 3 &&
        f.querySelector(".fw-board-chip").textContent.includes("covered holes");
    },
    { timeout: 5000 },
  );
  await figs.nth(3).locator(".fw-dot").nth(3).click();
  await waitFn(
    () => {
      const f = document.querySelectorAll("figure[data-walk]")[3];
      // both back edges lit — ×2 svgs: the desktop swimlane AND the mobile
      // card list are inlined and highlighted in tandem
      return f.querySelectorAll("g[data-edge].fw-edge-active").length === 4 &&
        f.querySelectorAll("g[data-step].fw-active").length === 2 &&
        f.querySelector(".fw-count").textContent.includes("step 4 / 5");
    },
    { timeout: 5000 },
  );
  // emphasized = an inline highlight is set AND it paints differently from a
  // resting label (palette-agnostic: the tint is family-token color-mix since
  // Issue 009 T4, so a literal RGB pin would only re-pin the palette)
  const [labelInline, labelColor, restColor] = await figs.nth(3).evaluate((f) => {
    const on = f.querySelector("g[data-edge].fw-edge-active text");
    const off = f.querySelector("g[data-edge]:not(.fw-edge-active) text");
    return [on?.style.fill ?? "", on ? getComputedStyle(on).fill : "", off ? getComputedStyle(off).fill : ""];
  });
  if (!labelInline || !labelColor || labelColor === restColor) {
    fail(`active edge label not emphasized (inline "${labelInline}", painted ${labelColor} vs resting ${restColor})`);
  }
  console.log("[flow-walk-smoke] dot jump: recovery edges + label emphasis OK");

  // resume from the jumped-to step and let it advance once
  await figs.nth(3).locator(".fw-toggle").click();
  const playText = (await figs.nth(3).locator(".fw-toggle").textContent()).trim();
  if (playText !== "pause") fail(`after play the toggle should read "pause", got "${playText}"`);
  await waitFn(
    () => document.querySelectorAll("figure[data-walk]")[3].querySelector(".fw-count").textContent.includes("step 5 / 5"),
    { timeout: 9000 },
  );
  console.log("[flow-walk-smoke] resume: walk continued to the last step");

  if (!failed) console.log("[flow-walk-smoke] PASS");
} catch (e) {
  fail(`exception: ${e.message}`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
