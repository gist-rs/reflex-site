// Production smoke: the LIVE https://reflex.gist.rs/arena/ page against the
// local engine (CORS allows the custom domain). Run only when the local
// engine is up with RIIR_REFLEX_ALLOWED_ORIGIN=https://reflex.gist.rs.
import { createRequire } from "node:module";

const siblingRequire = createRequire(
  "/Users/katopz/git/riir-mmorpg-examples/scripts/browser-badge-test/package.json",
);
const { chromium } = siblingRequire("playwright");

const browser = await chromium.launch({
  args: ["--disable-features=LocalNetworkAccessChecks"],
});
await browser.newContext({ permissions: ["local-network-access"] }).catch(() => null);
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
let failed = false;

try {
  await page.goto("https://reflex.gist.rs/arena/", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.getElementById("status-text").textContent.includes("engine detected"),
    { timeout: 10000 },
  );
  console.log(`[prod-smoke] chips: ${await page.textContent("#chip-modelless")} | ${(await page.textContent("#chip-laya")).trim()}`);
  await page.click("#tetris-run");
  await page.waitForFunction(
    () => /\d+ spots in \d+ ms/.test(document.getElementById("tr-modelless-t").textContent),
    { timeout: 30000 },
  );
  console.log(`[prod-smoke] modelless: ${(await page.textContent("#tr-modelless-a")).trim()}`);
  console.log(`[prod-smoke] stats: ${(await page.textContent("#tst-modelless")).trim()}`);
  const layaTxt = (await page.textContent("#tr-laya-a")).trim();
  console.log(`[prod-smoke] laya board: ${layaTxt}`);
  await page.screenshot({ path: "scripts/out/arena_prod.png" });
} catch (e) {
  failed = true;
  console.error(`[prod-smoke] FAIL: ${e.message}`);
} finally {
  await browser.close();
}
if (errs.length) console.error(`page errors: ${errs.join(" | ")}`);
process.exit(failed ? 1 : 0);
