// Parity gate for the browser-live heads: instantiate the built wasm and
// require bit-exact agreement with the recorded engine play — every
// (sentence → f32 P(clean)) pair of the demo's recorded head game
// (Math.fround equality, the same f32 cast the engine's wire makes) — and,
// for the flappy head, the published 96/100 agreement over the recorded
// corpus reel. Also checks the honest abstain (off-grammar → NaN) and
// reports the measured boot + per-decision times.
//
//   node scripts/arena_head_parity.mjs   (build the wasm first — see
//   wasm-head/README.md)
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import * as T from "../assets/games/tetris.js";
import * as F from "../assets/games/flappy.js";

const here = path.dirname(import.meta.dirname);
const WASM = path.join(here, "assets", "arena_head.wasm");
const ORACLE = path.join(here, "arena", "demo_oracle.json");

const bytes = readFileSync(WASM);
const { instance } = await WebAssembly.instantiate(bytes, {});
const e = instance.exports;

// ── boot ─────────────────────────────────────────────────────────────────
const tBoot = performance.now();
const rc = e.head_init();
const bootMs = performance.now() - tBoot;
const mask = e.head_ready();
assert.equal(rc, 0, `head_init refused (${rc}) — a head is broken`);
assert.equal(mask & 1, 1, "the tetris head did not boot");
assert.equal(e.head_lambda(), 1.0, "tetris λ drifted from the published fit");
assert.equal(e.head_anchor(), 44, "tetris in-corpus anchor did not reproduce");
assert.equal(mask & 2, 2, "the flappy head did not boot");
assert.equal(e.head_flappy_lambda(), 1.0, "flappy λ drifted from the Bench 882 fit");
assert.equal(e.head_flappy_anchor(), 96, "flappy in-corpus anchor did not reproduce");
console.log(
  `[head-parity] boot ok in ${bootMs.toFixed(1)} ms — tetris λ ${e.head_lambda()} anchor ${e.head_anchor()}/120 · flappy λ ${e.head_flappy_lambda()} anchor ${e.head_flappy_anchor()}/100`,
);

// ── the score calls ──────────────────────────────────────────────────────
const enc = new TextEncoder();
const mem = () => new Uint8Array(e.memory.buffer);
function write(s) {
  const b = enc.encode(s);
  const ptr = e.head_alloc(b.length);
  if (ptr === 0) throw new Error("head_alloc OOM");
  mem().set(b, ptr);
  return [ptr, b.length];
}
function score(sentence) {
  const [ptr, len] = write(sentence);
  const p = e.head_score(ptr, len);
  e.head_reset();
  return p;
}
function scoreState(state, option) {
  const [sp, sl] = write(state);
  const [op, ol] = write(option);
  const p = e.head_score_state(sp, sl, op, ol);
  e.head_reset();
  return p;
}

// ── the honest abstain ───────────────────────────────────────────────────
assert.ok(Number.isNaN(score("hello world")), "garbage must refuse (NaN)");
assert.ok(Number.isNaN(score("")), "empty must refuse (NaN)");
assert.ok(
  Number.isNaN(score("The bird is level with the gap center, flying level. The gap is wide. The pipe is just ahead.")),
  "a flappy sentence must refuse the TETRIS head — grammars are per-head",
);
assert.ok(
  Number.isNaN(scoreState("hello world", "hello world")),
  "flappy garbage must refuse (NaN)",
);
console.log("[head-parity] off-grammar inputs refuse (NaN) ✓");

// ── the recorded tetris game, bit for bit ────────────────────────────────
const oracle = JSON.parse(readFileSync(ORACLE, "utf8"));
const walk = oracle.tetris_head_walk;
assert.ok(Array.isArray(walk) && walk.length > 0, "no recorded head walk");
let pairs = 0;
let mismatches = 0;
const t0 = performance.now();
let sumMs = 0;
for (let turn = 0; turn < walk.length; turn++) {
  const [sentence0, ps, piece, rows] = walk[turn];
  const board = T.fromStrings(rows);
  const opts = T.buildTurn(board, piece);
  assert.equal(
    opts.length,
    ps.length,
    `turn ${turn}: arity ${ps.length} vs ${opts.length}`,
  );
  assert.equal(
    opts[0].stateSentence,
    sentence0,
    `turn ${turn}: sentence drift`,
  );
  for (let i = 0; i < opts.length; i++) {
    const t1 = performance.now();
    const p = score(opts[i].sentence);
    const dt = performance.now() - t1;
    sumMs += dt;
    pairs += 1;
    // the engine serves f32(p); the JSON recording carries the shortest
    // decimal that round-trips to that f32 — so compare f32 to f32
    if (Math.fround(p) !== Math.fround(ps[i])) {
      mismatches += 1;
      if (mismatches <= 5) {
        console.error(
          `[head-parity] MISMATCH turn ${turn} opt ${i}: wasm ${p} (f32 ${Math.fround(p)}) vs recorded ${ps[i]} — ${opts[i].sentence}`,
        );
      }
    }
  }
}
const totalMs = performance.now() - t0;
assert.equal(mismatches, 0, `${mismatches}/${pairs} recorded decisions disagree`);
assert.ok(pairs >= 500, `probe too small (${pairs} pairs)`);
console.log(
  `[head-parity] tetris PASS — ${pairs}/${pairs} recorded decisions bit-exact ` +
    `(re-scored in ${totalMs.toFixed(1)} ms total, ~${((sumMs / pairs) * 1000).toFixed(1)} µs/decision)`,
);

// ── the flappy head: published agreement over the corpus reel ────────────
// The demo reel IS the v3 fixture (state + oracle ps). Rebuild each turn's
// option sentences with the site's own renderer and require the wasm head's
// argmax to match the recorded oracle argmax on exactly the published 96
// of 100 — a lower count means render/fit drift; a HIGHER one is impossible
// on the same data and means the oracle changed (the pin reds first).
const reel = oracle.flappy_walk;
assert.ok(Array.isArray(reel) && reel.length === 100, `flappy reel broken (${reel?.length})`);
let agree = 0;
for (const [stateSentence, ps, state] of reel) {
  const turn = F.buildTurn(state);
  assert.equal(turn.question, F.QUESTION);
  const scored = turn.options.map((o) => scoreState(stateSentence, o.sentence));
  for (let i = 0; i < scored.length; i++) {
    assert.ok(Number.isFinite(scored[i]), `flappy head refused a grammar-valid pair: ${turn.options[i].sentence}`);
  }
  // the recorded oracle decision: argmax of the recorded ps (lowest index
  // on ties — the fixture's own argmax convention)
  let want = -1;
  for (let i = 0; i < ps.length; i++) if (want === -1 || ps[i] > ps[want]) want = i;
  let got = 0;
  for (let i = 1; i < scored.length; i++) if (scored[i] > scored[got]) got = i;
  if (got === want) agree += 1;
}
assert.equal(
  agree,
  e.head_flappy_anchor(),
  `flappy behavioral agreement ${agree} != the boot anchor ${e.head_flappy_anchor()}`,
);
assert.equal(agree, 96, "flappy agreement drifted from the published 96/100");
console.log(`[head-parity] flappy PASS — agreement ${agree}/100 = the published Bench 882 anchor`);
