// Record genuine engine-played tetris walks for the arena demo, through the
// LIVE /decide wire (the same call the browser makes):
//
//   tetris_walk      — the laya lane, TRUE ARGMAX play (replaces the old
//                      mixed-play state-capture; same record shape)
//   tetris_head_walk — the modelless lane through the v0.2.2+ fitted head
//                      (same shape; [5] carries the per-decision wall ms the
//                      demo shows as "recorded p50")
//
// Both games see the SAME piece stream (fresh Rng(607), the demo's default
// seed — same seed = same game on both lanes, exactly like live play). Every
// walk is chain-verified against the site's own enumeration BEFORE writing,
// and the existing flappy/lanes reels + tetris archetype rows are preserved.
//
// Run with the engine up (RIIR_REFLEX_LAYA=1 arms the laya lane; without it
// only the head walk is refreshed):
//   node scripts/record_demo_walks.mjs [engine_url]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Rng } from "../assets/games/rng.js";
import * as T from "../assets/games/tetris.js";

const ENGINE = process.argv[2] ?? "http://127.0.0.1:7331";
const ORACLE = path.resolve(import.meta.dirname, "../arena/demo_oracle.json");
const SEED = 607;
const MAX_TURNS = 80; // demo watchability cap (~48 s at the 0.6 s piece delay)

function argmax(ps) {
  let best = -1;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] == null) continue;
    if (best === -1 || ps[i] > ps[best]) best = i;
  }
  return best;
}

function boardRows(board) {
  return board.map((row) => row.map((c) => (c ? "#" : ".")).join(""));
}

async function decide(state, lane) {
  const headers = { "Content-Type": "application/json" };
  if (lane) headers["X-Reflex-Lane"] = lane;
  const t0 = performance.now();
  const r = await fetch(`${ENGINE}/decide`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      state,
      questions: [{ id: "q0", kind: "noul", prompt: T.SPOT_QUESTION, options: [] }],
    }),
  });
  const ms = performance.now() - t0;
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
  const a = (json.answers || [])[0];
  if (!a) throw new Error("no answer");
  const abstain = a.outcome == null || a.outcome.noul == null;
  return { p: abstain ? null : a.probabilities[0], ms };
}

// One full game: sequential per-option decisions (honest per-decision ms),
// argmax pick, real placement. Returns records + the score/lines summary.
async function recordWalk(lane) {
  const board = T.emptyBoard();
  const rng = new Rng(SEED);
  const walk = [];
  let score = 0, lines = 0, pieces = 0, abstains = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const piece = T.PIECES[rng.u32Below(7)];
    const opts = T.buildTurn(board, piece);
    if (opts.length === 0) break; // natural top-out
    const ps = [];
    const ms = [];
    for (const o of opts) {
      const r = await decide(o.sentence, lane);
      if (r.p == null) {
        abstains += 1;
        throw new Error(
          `${lane}: abstained on a grammar-valid sentence (${turn},${o.rot},${o.col}) — the head must answer these`,
        );
      }
      ps.push(r.p);
      ms.push(Math.round(r.ms * 10) / 10);
    }
    const chosen = argmax(ps);
    assert.ok(chosen >= 0, `${lane}: empty ps`);
    walk.push([opts[0].stateSentence, ps, piece, boardRows(board), chosen, ms]);
    const cleared = T.commitPlacement(board, opts[chosen]);
    lines += cleared;
    score += [0, 40, 100, 300, 1200][Math.min(cleared, 4)];
    pieces += 1;
    if (cleared >= 2) console.log(`  ${lane} turn ${turn}: ${cleared} lines cleared (total ${lines})`);
  }
  const allMs = walk.flatMap((r) => r[5]).sort((a, b) => a - b);
  const p50 = allMs.length ? allMs[Math.floor(allMs.length / 2)] : null;
  return { walk, summary: { score, lines, pieces, abstains, p50_ms: p50 } };
}

// Chain-verify exactly like scripts/arena_demo_check.mjs: board + piece from
// record k, the site's own buildTurn must reproduce the record's arity and
// sentence, and placing the record's pick must yield record k+1's board.
function verifyWalk(walk, name) {
  assert.ok(walk.length >= 10, `${name}: too short (${walk.length})`);
  for (let k = 0; k < walk.length; k++) {
    const [sentence, ps, piece, rows, pick] = walk[k];
    const board = T.fromStrings(rows);
    const opts = T.buildTurn(board, piece);
    assert.equal(opts.length, ps.length, `${name}[${k}]: arity ${ps.length} vs ${opts.length}`);
    assert.equal(opts[0].stateSentence, sentence, `${name}[${k}]: sentence drift`);
    assert.equal(argmax(ps), pick, `${name}[${k}]: pick is not argmax`);
    if (k + 1 < walk.length) {
      assert.ok(pick >= 0 && pick < opts.length, `${name}[${k}]: bad pick`);
      const after = board.map((r) => [...r]);
      T.commitPlacement(after, opts[pick]);
      const next = T.fromStrings(walk[k + 1][3]);
      for (let r = 0; r < T.HEIGHT; r++) {
        for (let c = 0; c < T.WIDTH; c++) {
          assert.ok(after[r][c] === next[r][c], `${name}[${k}]: chain broken at (${r},${c})`);
        }
      }
    }
  }
}

// ── probe the engine ─────────────────────────────────────────────────────────
const health = await fetch(`${ENGINE}/healthz`, { cache: "no-store" })
  .then((r) => r.json())
  .catch(() => null);
if (!health) {
  console.error(`no engine at ${ENGINE} — start it first (RIIR_REFLEX_LAYA=1 reflex)`);
  process.exit(1);
}
const layaReady = health.lanes?.laya === "ready";
console.log(`engine: modelless=${health.lanes?.modelless ?? "?"} laya=${health.lanes?.laya ?? "?"} (head walk: yes; laya walk: ${layaReady ? "yes" : "skipped — lane not ready"})`);

// ── record ───────────────────────────────────────────────────────────────────
const oracle = JSON.parse(readFileSync(ORACLE, "utf8"));

console.log("recording the modelless head walk (seed 607, argmax)…");
const head = await recordWalk(null);
verifyWalk(head.walk, "tetris_head_walk");
console.log(`head game: ${JSON.stringify(head.summary)}`);

let laya = null;
if (layaReady) {
  console.log("recording the laya walk (seed 607, TRUE argmax — replaces the mixed-play capture)…");
  laya = await recordWalk("laya");
  verifyWalk(laya.walk, "tetris_walk");
  console.log(`laya game: ${JSON.stringify(laya.summary)}`);
}

// ── write: preserve flappy/lanes reels + archetype rows, swap the walks ─────
oracle.tetris_head_walk = head.walk;
if (laya) oracle.tetris_walk = laya.walk;
oracle._meta = oracle._meta || { sources: {} };
oracle._meta.sources.tetris_head = {
  recorder: "scripts/record_demo_walks.mjs",
  engine: `${ENGINE} (reflex v0.2.2+)`,
  lane: "modelless — the corpus-fitted tetris head",
  policy: "argmax",
  seed: SEED,
  question: T.SPOT_QUESTION,
  grammar: T.GRAMMAR_ID,
  summary: head.summary,
};
if (laya) {
  oracle._meta.sources.tetris = {
    ...(oracle._meta.sources.tetris || {}),
    recorder: "scripts/record_demo_walks.mjs",
    lane: "laya — model-based, full-argmax play (mixed-play capture retired)",
    policy: "argmax",
    seed: SEED,
    summary: laya.summary,
  };
}
writeFileSync(ORACLE, JSON.stringify(oracle, null, 1) + "\n");
console.log(
  `wrote ${path.relative(process.cwd(), ORACLE)} — head ${head.walk.length} turns${
    laya ? `, laya ${laya.walk.length} turns` : ", laya walk kept"
  }`,
);
