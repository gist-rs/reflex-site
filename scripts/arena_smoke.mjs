// Arena live smoke: the page boots against a REAL local engine, the
// modelless board makes real decisions, and (when the laya lane is armed)
// the laya board starts reading spots. Headless Chromium via the sibling's
// playwright install.
// Run: node scripts/arena_smoke.mjs [site_dir]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(process.argv[2] ?? path.join(here, ".."));
const PORT = 18907;
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

const outDir = path.join(here, "out");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
let failed = false;
const fail = (m) => {
  failed = true;
  console.error(`[arena-smoke] FAIL: ${m}`);
};
page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));

try {
  await page.goto(`${base}/arena/`, { waitUntil: "networkidle" });
  const title = await page.title();
  if (!/Arena/.test(title)) fail(`title: ${title}`);

  // engine chips: the smoke box runs a real engine with both lanes armed
  await page.waitForFunction(
    () => document.getElementById("status-text").textContent.includes("engine detected"),
    { timeout: 10000 },
  );
  const layaChip = (await page.textContent("#chip-laya")).trim();
  const layaArmed = /ready/.test(layaChip);
  console.log(`[arena-smoke] laya chip: ${layaChip}${layaArmed ? "" : " (conditional laya steps skipped)"}`);

  // ── Tetris: the modelless board must reach a real decision quickly ──
  await page.click("#tetris-run");
  await page.waitForFunction(
    () => /\d+ spots in \d+ ms/.test(document.getElementById("tr-modelless-t").textContent),
    { timeout: 30000 },
  );
  const modellessA = await page.textContent("#tr-modelless-a");
  const modellessStats = await page.textContent("#tst-modelless");
  console.log(`[arena-smoke] modelless answer: ${modellessA.trim()}`);
  console.log(`[arena-smoke] modelless stats: ${modellessStats.trim()}`);
  if (!/decisions [1-9]/.test(modellessStats)) fail("modelless board made no decision");

  // ── Tetris: the laya board reads spots when the lane is armed ──
  if (layaArmed) {
    await page.waitForFunction(
      () => /reading \d+ spots|P\(clean\)/.test(document.getElementById("tr-laya-a").textContent),
      { timeout: 60000 },
    );
    console.log(`[arena-smoke] laya board: ${(await page.textContent("#tr-laya-a")).trim()}`);
  }

  await page.screenshot({ path: path.join(outDir, "arena_tetris.png") });

  // ── Flappy: modelless decisions flow ──
  await page.click('button[data-game="flappy"]');
  await page.click("#flappy-run");
  await page.waitForFunction(
    () => /P\(clean\)|abstain/.test(document.getElementById("fr-modelless-a").textContent),
    { timeout: 30000 },
  );
  console.log(`[arena-smoke] flappy modelless: ${(await page.textContent("#fr-modelless-a")).trim()}`);

  // ── Lanes: modelless decisions flow ──
  await page.click('button[data-game="lanes"]');
  await page.click("#lanes-run");
  await page.waitForFunction(
    () => /left/.test(document.getElementById("lr-modelless-a").textContent),
    { timeout: 30000 },
  );
  console.log(`[arena-smoke] lanes modelless: ${(await page.textContent("#lr-modelless-a")).trim()}`);

  await page.screenshot({ path: path.join(outDir, "arena_lanes.png") });

  // stop the boards
  await page.click('button[data-game="tetris"]');
  await page.click("#tetris-run");
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.error(`[arena-smoke] page errors:\n  ${errors.join("\n  ")}`);
  process.exitCode = 1;
}
if (failed) process.exit(1);
console.log("[arena-smoke] PASS");
