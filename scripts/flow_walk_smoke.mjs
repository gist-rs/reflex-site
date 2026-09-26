// Flow-walk smoke: the two rulebook figures inline their SVGs, autoplay at
// 3 s/step once scrolled into view, and the manual controls (pause/resume/
// prev/next/dot-jump) step the highlight + description panel. Headless
// Chromium via the sibling's playwright install.
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

try {
  await page.goto(`${base}/arena/`, { waitUntil: "networkidle" });

  // the imgs were replaced by inline SVGs + the widget chrome
  await waitFn(
    () => document.querySelectorAll("figure[data-walk] .fw-stage svg").length === 2,
    { timeout: 10000 },
  );
  const imgsLeft = await page.locator("figure[data-walk] img").count();
  if (imgsLeft !== 0) fail(`expected the 2 walk imgs replaced, ${imgsLeft} left`);

  const figs = page.locator("figure[data-walk]");
  const dots = [await figs.nth(0).locator(".fw-dot").count(), await figs.nth(1).locator(".fw-dot").count()];
  if (dots[0] !== 6 || dots[1] !== 5) fail(`dots: rulebook=${dots[0]} (want 6), modes=${dots[1]} (want 5)`);
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
  console.log("[flow-walk-smoke] autoplay: rulebook reached step 2 (3 s/step)");
  const modesCount = (await figs.nth(1).locator(".fw-count").textContent()).trim();
  // the modes figure sits below the fold at this scroll — "0 / 5" (not yet
  // armed) and "step n / 5" (armed) are both correct; anything else is not
  if (!/^(?:0 \/ 5|step \d \/ 5)$/.test(modesCount)) fail(`modes counter: "${modesCount}"`);

  // pause (deterministic base for the manual steps), then next/prev
  await figs.nth(0).locator(".fw-toggle").click();
  const pausedText = (await figs.nth(0).locator(".fw-toggle").textContent()).trim();
  if (pausedText !== "play") fail(`after pause the toggle should read "play", got "${pausedText}"`);
  const before = parseInt((await figs.nth(0).locator(".fw-count").textContent()).match(/step (\d)/)[1], 10);
  await figs.nth(0).locator('.fw-btn[aria-label="Next step"]').click();
  const afterNext = (await figs.nth(0).locator(".fw-count").textContent()).trim();
  if (afterNext !== `step ${before + 1} / 6`) fail(`after next: "${afterNext}" (want step ${before + 1})`);
  const stepTitle = (await figs.nth(0).locator(".fw-step-title").textContent()).trim();
  if (!stepTitle.startsWith(`${before + 1} ·`)) fail(`step panel title after next: "${stepTitle}"`);
  await figs.nth(0).locator('.fw-btn[aria-label="Previous step"]').click();
  const afterPrev = (await figs.nth(0).locator(".fw-count").textContent()).trim();
  if (afterPrev !== `step ${before} / 6`) fail(`after prev: "${afterPrev}"`);
  console.log("[flow-walk-smoke] manual: pause + next/prev step the highlight + panel");

  // the mini boards replayed from the recorded walk: both render, carry
  // stack cells + step highlights, and their chip follows the step
  const boards = await page.locator("figure[data-walk] .fw-board svg").count();
  if (boards !== 2) fail(`mini boards: ${boards} (want 2)`);
  const cells = await figs.nth(0).locator(".fw-board svg rect[data-cell]").count();
  if (cells < 20) fail(`rulebook board stack cells: ${cells} (want a real stack, ≥20)`);
  const hl = await figs.nth(0).locator(".fw-board svg rect[data-hl]").count();
  if (hl < 1) fail("rulebook board has no step highlight cells");
  const chipRb = (await figs.nth(0).locator(".fw-board-chip").textContent()).trim();
  if (chipRb.length < 10) fail(`board chip empty: "${chipRb}"`);
  const scan = await figs.nth(0).locator(".fw-board svg rect[data-try]").count();
  if (scan < 10) fail(`spot-scan flash layer: ${scan} rects (want one per candidate cell)`);
  const tryDur = await figs.nth(0).locator(".fw-board svg rect[data-try]").first().evaluate(
    (n) => n.style.getPropertyValue("--try-dur"),
  );
  if (!/ms$/.test(tryDur)) fail(`scan cycle duration not set: "${tryDur}"`);

  // step 6 = the recorded clear: walk the rulebook figure to the last step
  for (let i = 0; i < 5; i++) await figs.nth(0).locator('.fw-btn[aria-label="Next step"]').click();
  const lastChip = (await figs.nth(0).locator(".fw-board-chip").textContent()).trim();
  if (!/play|clear|lands/.test(lastChip)) fail(`rulebook last-step chip: "${lastChip}"`);
  const flashed = await figs.nth(0).locator(".fw-board svg rect[data-flash]").count();
  console.log(`[flow-walk-smoke] boards: replayed from the record (cells=${cells}, hl=${hl}, flash rows=${flashed})`);

  // dot jump on the modes figure → recovery step: BOTH return edges active
  // (path + label each carry the class; count the paths)
  await figs.nth(1).locator(".fw-dot").nth(1).click(); // DOWNSTACK: holes ringed
  await waitFn(
    () => {
      const f = document.querySelectorAll("figure[data-walk]")[1];
      return f.querySelectorAll(".fw-board svg rect[data-hl]").length >= 3 &&
        f.querySelector(".fw-board-chip").textContent.includes("covered holes");
    },
    { timeout: 5000 },
  );
  await figs.nth(1).locator(".fw-dot").nth(3).click();
  await waitFn(
    () => {
      const f = document.querySelectorAll("figure[data-walk]")[1];
      return f.querySelectorAll("path.fw-edge-active").length === 2 &&
        f.querySelectorAll("g.node.fw-active").length === 1 &&
        f.querySelector(".fw-count").textContent.includes("step 4 / 5");
    },
    { timeout: 5000 },
  );
  const labelColor = await figs.nth(1).locator(".edgeLabel.fw-edge-active p").first().evaluate(
    (n) => n.style.color,
  );
  if (!/255,\s*178,\s*122/.test(labelColor)) fail(`active edge label not emphasized (${labelColor})`);
  console.log("[flow-walk-smoke] dot jump: recovery edges + label emphasis OK");

  // resume from the jumped-to step and let it advance once
  await figs.nth(1).locator(".fw-toggle").click();
  const playText = (await figs.nth(1).locator(".fw-toggle").textContent()).trim();
  if (playText !== "pause") fail(`after play the toggle should read "pause", got "${playText}"`);
  await waitFn(
    () => document.querySelectorAll("figure[data-walk]")[1].querySelector(".fw-count").textContent.includes("step 5 / 5"),
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
