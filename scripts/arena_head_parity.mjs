// Parity gate for the browser-live head: instantiate the built wasm and
// require BIT-EXACT agreement with the recorded engine play — every
// (sentence → f32 P(clean)) pair of the demo's recorded head game
// (Math.fround equality, the same f32 cast the engine's wire makes).
// Also checks the honest abstain (off-grammar → NaN) and reports the
// measured boot + per-decision times.
//
//   node scripts/arena_head_parity.mjs   (build the wasm first — see
//   wasm-head/README.md)
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import * as T from "../assets/games/tetris.js";

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
assert.equal(rc, 0, `head_init refused (${rc}) — the wasm build is broken`);
assert.equal(e.head_ready(), 1);
assert.equal(e.head_lambda(), 1.0, "λ drifted from the published fit");
assert.equal(e.head_anchor(), 44, "in-corpus anchor did not reproduce");
console.log(
  `[head-parity] boot ok in ${bootMs.toFixed(1)} ms — λ ${e.head_lambda()}, anchor ${e.head_anchor()}/120`,
);

// ── the score call ───────────────────────────────────────────────────────
const enc = new TextEncoder();
const mem = () => new Uint8Array(e.memory.buffer);
function score(sentence) {
  const b = enc.encode(sentence);
  const ptr = e.head_alloc(b.length);
  if (ptr === 0) throw new Error("head_alloc OOM");
  mem().set(b, ptr);
  const p = e.head_score(ptr, b.length);
  e.head_reset();
  return p;
}

// ── the honest abstain ───────────────────────────────────────────────────
assert.ok(Number.isNaN(score("hello world")), "garbage must refuse (NaN)");
assert.ok(Number.isNaN(score("")), "empty must refuse (NaN)");
assert.ok(
  Number.isNaN(score("The bird is a little below the gap center, falling.")),
  "a flappy sentence must refuse — the head answers only the tetris grammar",
);
console.log("[head-parity] off-grammar inputs refuse (NaN) ✓");

// ── the recorded game, bit for bit ───────────────────────────────────────
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
  `[head-parity] PASS — ${pairs}/${pairs} recorded decisions bit-exact ` +
    `(re-scored in ${totalMs.toFixed(1)} ms total, ~${((sumMs / pairs) * 1000).toFixed(1)} µs/decision)`,
);
