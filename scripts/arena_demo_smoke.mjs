// Arena DEMO smoke: the page boots with NO engine reachable (127.0.0.1:7331
// is route-blocked, so this is deterministic even on a box where a real
// engine is up) and the recorded demo must auto-play: banner visible, both
// tetris boards advancing (laya = recorded plays, modelless = labelled
// abstain fallbacks), then the flappy/lanes reels via their Start buttons.
// Headless Chromium via the sibling's playwright install.
// Run: node scripts/arena_demo_smoke.mjs [site_dir]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(process.argv[2] ?? path.join(here, ".."));
const PORT = 18909;
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
const errs = [];
let failed = false;
const fail = (m) => {
  failed = true;
  console.error(`[demo-smoke] FAIL: ${m}`);
};
page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));

// the engine is UNREACHABLE in this smoke — deterministically
await page.route("**://127.0.0.1:7331/**", (route) => route.abort());

try {
  await page.goto(`${base}/arena/`, { waitUntil: "domcontentloaded" });

  // ── the demo must announce itself and auto-play tetris ──
  await page.waitForFunction(
    () => /RECORDED DEMO/.test(document.getElementById("status-text").textContent),
    { timeout: 10000 },
  );
  const bannerHidden = await page.$eval("#demo-banner", (el) => el.hidden);
  if (bannerHidden) fail("demo banner is hidden while the demo plays");

  // laya board replays recorded plays
  await page.waitForFunction(
    () => /recorded play, spot \d+/.test(document.getElementById("tr-laya-a").textContent),
    { timeout: 15000 },
  );
  const layaStats = await page.textContent("#tst-laya");
  console.log(`[demo-smoke] laya answer: ${(await page.textContent("#tr-laya-a")).trim()}`);
  if (!/pieces [1-9]/.test(layaStats)) fail(`laya demo board not advancing: ${layaStats}`);

  // modelless board abstains with the labelled fallback
  await page.waitForFunction(
    () => /abstain ×\d+ · abstain → random fallback/.test(document.getElementById("tr-modelless-a").textContent),
    { timeout: 15000 },
  );
  console.log(`[demo-smoke] modelless answer: ${(await page.textContent("#tr-modelless-a")).trim()}`);
  const mlStats = await page.textContent("#tst-modelless");
  if (!/abstains [1-9]/.test(mlStats)) fail(`modelless demo board not advancing: ${mlStats}`);

  await page.screenshot({ path: path.join(outDir, "arena_demo_tetris.png") });

  // ── flappy reel ──
  await page.click('button[data-game="flappy"]');
  await page.click("#flappy-run");
  await page.waitForFunction(
    () => /P\(clean\)|abstain/.test(document.getElementById("fr-modelless-a").textContent),
    { timeout: 15000 },
  );
  console.log(`[demo-smoke] flappy laya: ${(await page.textContent("#fr-laya-a")).trim()}`);
  console.log(`[demo-smoke] flappy modelless: ${(await page.textContent("#fr-modelless-a")).trim()}`);

  // ── lanes reel ──
  await page.click('button[data-game="lanes"]');
  await page.click("#lanes-run");
  await page.waitForFunction(
    () => /P\(clean\)|abstain/.test(document.getElementById("lr-modelless-a").textContent),
    { timeout: 15000 },
  );
  console.log(`[demo-smoke] lanes laya: ${(await page.textContent("#lr-laya-a")).trim()}`);
  await page.screenshot({ path: path.join(outDir, "arena_demo_lanes.png") });

  // ── the demo oracle must actually serve from the static site ──
  const demoResp = await page.request.get(`${base}/arena/demo_oracle.json`);
  if (!demoResp.ok()) fail(`demo_oracle.json HTTP ${demoResp.status()}`);
  const demoJson = await demoResp.json();
  if (!demoJson.tetris_walk?.length || !demoJson.flappy_walk?.length || !demoJson.lanes_walk?.length) {
    fail("demo oracle walks missing");
  }
  console.log(
    `[demo-smoke] oracle: tetris_walk ${demoJson.tetris_walk.length}, flappy_walk ${demoJson.flappy_walk.length}, lanes_walk ${demoJson.lanes_walk.length}`,
  );
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  server.kill();
}
if (errs.length) console.error(`page errors:\n  ${errs.join("\n  ")}`);
if (failed) process.exit(1);
console.log("[demo-smoke] PASS");
