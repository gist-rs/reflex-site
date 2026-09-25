// Arena DEMO smoke: the page boots with NO engine reachable (127.0.0.1:7331
// is route-blocked, so this is deterministic even on a box where a real
// engine is up) and the demo must auto-play: banner visible, all four tetris
// boards advancing (laya (Python), laya (Rust) and raw replaying their
// recorded games) — the modelless board LIVE on the wasm head when it
// loads (the normal case; its probe must pass), else the recorded replay —
// then the flappy/lanes reels via their Start buttons.
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
    () => /RECORDED DEMO|PLAYS LIVE/.test(document.getElementById("status-text").textContent),
    { timeout: 10000 },
  );
  const bannerHidden = await page.$eval("#demo-banner", (el) => el.hidden);
  if (bannerHidden) fail("demo banner is hidden while the demo plays");

  // laya board replays recorded plays
  await page.waitForFunction(
    () => /recorded play, spot \d+|P\(clean\) [\d.]+ — spot \d+/.test(document.getElementById("tr-laya-a").textContent),
    { timeout: 15000 },
  );
  const layaStats = await page.textContent("#tst-laya");
  console.log(`[demo-smoke] laya answer: ${(await page.textContent("#tr-laya-a")).trim()}`);
  if (!/pieces [1-9]/.test(layaStats)) fail(`laya demo board not advancing: ${layaStats}`);

  // modelless board: LIVE on the wasm head (the wasm · timing line) — or,
  // if the artifact failed to load, the recorded replay (recorded · p50 …).
  await page.waitForFunction(
    () => /P\(clean\) [\d.]+ — spot \d+/.test(document.getElementById("tr-modelless-a").textContent),
    { timeout: 15000 },
  );
  console.log(`[demo-smoke] modelless answer: ${(await page.textContent("#tr-modelless-a")).trim()}`);
  const mlStats = await page.textContent("#tst-modelless");
  if (!/pieces [1-9]/.test(mlStats)) fail(`modelless demo board not advancing: ${mlStats}`);
  const mlTiming = await page.textContent("#tr-modelless-t");
  const isWasm = /wasm · \d+ spots · ~[\d.]+ µs\/spot/.test(mlTiming);
  const isRecorded = /recorded · p50 \d+(\.\d+)? ms/.test(mlTiming);
  // sub-millisecond lanes print µs precision, never a rounded "p50 0 ms"
  if (/p50 0(\.0+)? ms/.test(await page.textContent("#tst-modelless"))) fail("modelless p50 reads zero (timer resolution, not a measurement)");
  if (!isWasm && !isRecorded) fail(`head board timing missing: ${mlTiming}`);
  const mlSrc = await page.textContent("#tr-modelless-src");
  if (isWasm && !/wasm head/.test(mlSrc)) fail(`live head not labelled in SOURCE: ${mlSrc}`);
  console.log(
    `[demo-smoke] modelless timing (${isWasm ? "LIVE wasm" : "recorded fallback"}): ${mlTiming.trim()}`,
  );

  // The raw baseline and laya (Python) boards replay their RECORDED games
  // (engine X-Reflex-Lane: raw; the torch reference) — labelled recorded.
  for (const lane of ["raw", "python"]) {
    await page.waitForFunction(
      (l) => /pieces [1-9]/.test(document.getElementById(`tst-${l}`).textContent),
      lane,
      { timeout: 15000 },
    );
    const src = (await page.textContent(`#tr-${lane}-src`)).trim();
    if (!/recorded/.test(src)) fail(`${lane} board not labelled recorded: ${src}`);
    console.log(`[demo-smoke] ${lane} board (recorded): ${(await page.textContent(`#tr-${lane}-a`)).trim()} · ${src}`);
  }

  // layout: 2 boards per row — python|laya, modelless|rulebook, then raw
  // (owner call 2026-09-25: the rulebook board sits beside modelless) — and
  // the lane-note boxes of a row share one height
  const box = await page.evaluate(() => Object.fromEntries(
    ["python", "laya", "modelless", "rulebook", "raw"].map((l) => {
      const c = document.getElementById(`tc-${l}`).getBoundingClientRect();
      const n = document.querySelector(`#tc-${l} .lane-note`).getBoundingClientRect();
      return [l, { top: Math.round(c.top), left: Math.round(c.left), note: Math.round(n.height) }];
    }),
  ));
  if (box.python.top !== box.laya.top || box.modelless.top !== box.rulebook.top || box.modelless.top <= box.python.top
    || box.raw.top <= box.modelless.top || box.raw.left !== box.python.left) {
    fail(`board grid is not 2 per row: ${JSON.stringify(box)}`);
  }
  if (box.python.note !== box.laya.note || box.modelless.note !== box.rulebook.note) {
    fail(`lane-note heights differ within a row: ${JSON.stringify(box)}`);
  }

  // TL;DR renders from data/bench.json — four verdict rows
  await page.waitForFunction(() => document.querySelectorAll("#tldr li").length === 4, { timeout: 10000 });
  console.log(`[demo-smoke] TL;DR: ${(await page.textContent("#tldr")).replace(/\s+/g, " ").trim().slice(0, 240)}…`);

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

  // ── lanes reel — the modelless board is LIVE via the joined-state wasm
  // head when it loads (numeric lane ps), else the recorded abstain reel ──
  await page.click('button[data-game="lanes"]');
  await page.click("#lanes-run");
  await page.waitForFunction(
    () => /left (—|\d\.\d{3})/.test(document.getElementById("lr-modelless-a").textContent),
    { timeout: 15000 },
  );
  const lanesAns = (await page.textContent("#lr-modelless-a")).trim();
  const lanesLive = /left \d/.test(lanesAns);
  console.log(`[demo-smoke] lanes laya: ${(await page.textContent("#lr-laya-a")).trim()}`);
  console.log(`[demo-smoke] lanes modelless (${lanesLive ? "LIVE wasm · joined-state" : "recorded fallback"}): ${lanesAns}`);
  await page.screenshot({ path: path.join(outDir, "arena_demo_lanes.png") });

  // ── the demo oracle must actually serve from the static site ──
  const demoResp = await page.request.get(`${base}/arena/demo_oracle.json`);
  if (!demoResp.ok()) fail(`demo_oracle.json HTTP ${demoResp.status()}`);
  const demoJson = await demoResp.json();
  if (!demoJson.tetris_walk?.length || !demoJson.flappy_walk?.length || !demoJson.lanes_walk?.length) {
    fail("demo oracle walks missing");
  }
  if (!demoJson.tetris_head_walk?.length) fail("tetris_head_walk missing — the modelless demo has no head game to replay");
  for (const k of ["tetris_raw_walk", "tetris_python_walk", "flappy_python", "lanes_python", "flappy_raw", "lanes_raw"]) {
    if (!demoJson[k]?.length) fail(`${k} missing from the demo oracle`);
  }
  console.log(
    `[demo-smoke] oracle: tetris_walk ${demoJson.tetris_walk.length}, tetris_head_walk ${demoJson.tetris_head_walk.length}, flappy_walk ${demoJson.flappy_walk.length}, lanes_walk ${demoJson.lanes_walk.length}`,
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
