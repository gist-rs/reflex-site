// Prove the no-engine demo replays recorded decisions exactly, using ONLY the
// shipping browser pieces: assets/games/* + arena/demo_oracle.json.
//
//  tetris_walk — replay the chain: board + piece from record k, the site's
//           own buildTurn must reproduce the record's arity and sentence, and
//           placing the record's chainPick must yield record k+1's board. The
//           last record carries chainPick -1 (window end).
//  flappy/lanes walks — each record's structured state must re-render the
//           record's sentence byte-identically (via the site's renderers),
//           arity must match, and argmax(recorded ps) must equal the
//           fixture's own `argmax` field (the decision the live boards make).
//
// Run: node scripts/arena_demo_check.mjs [fixtures_dir]
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import * as T from "../assets/games/tetris.js";
import * as F from "../assets/games/flappy.js";
import * as L from "../assets/games/lanes.js";

const FIXDIR =
  process.argv[2] ?? path.resolve(import.meta.dirname, "../tests/fixtures");

const oracle = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../arena/demo_oracle.json"), "utf8"),
);

function argmax(ps) {
  let best = -1;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] == null) continue;
    if (best === -1 || ps[i] > ps[best]) best = i;
  }
  return best;
}

// ── tetris walks: the recorded games chain under the site's own enumeration ──
// tetris_walk (the laya game) and tetris_head_walk (the fitted-head game)
// share the record shape: [state sentence, ps, piece, board rows, pick, ms?].
// A window-ended walk carries chainPick -1 on its final record; a naturally
// topped-out walk ends on a real pick — both are accepted, the chain simply
// stops at the last record.
function verifyTetrisWalk(walk, name) {
  assert.ok(walk.length >= 10, `${name} too short: ${walk.length}`);
  for (let k = 0; k < walk.length; k++) {
    const [sentence, ps, piece, boardRows, chainPick, ms] = walk[k];
    const board = T.fromStrings(boardRows);
    const opts = T.buildTurn(board, piece);
    assert.equal(opts.length, ps.length, `${name}[${k}]: arity ${ps.length} vs ${opts.length}`);
    assert.equal(opts[0].stateSentence, sentence, `${name}[${k}]: sentence drift`);
    if (ms != null) {
      assert.equal(ms.length, ps.length, `${name}[${k}]: ms arity`);
      assert.ok(ms.every((x) => typeof x === "number" && x >= 0), `${name}[${k}]: ms values`);
    }
    if (k + 1 < walk.length) {
      assert.ok(chainPick >= 0 && chainPick < opts.length, `${name}[${k}]: bad chainPick`);
      const after = board.map((r) => [...r]);
      T.commitPlacement(after, opts[chainPick]);
      const next = walk[k + 1][3];
      for (let r = 0; r < T.HEIGHT; r++) {
        for (let c = 0; c < T.WIDTH; c++) {
          assert.ok(
            after[r][c] === (next[r][c] === "#"),
            `${name}[${k}]: chain broken at (${r},${c})`,
          );
        }
      }
    }
  }
  const p50ms = (() => {
    const all = walk.filter((r) => r[5]).flatMap((r) => r[5]).sort((a, b) => a - b);
    return all.length ? all[Math.floor(all.length / 2)] : null;
  })();
  console.log(
    `${name}: ${walk.length} turns chain-verified against the site's own enumeration${
      p50ms != null ? ` · recorded p50 ${p50ms} ms/decision` : ""
    }`,
  );
  return { p50ms };
}

{
  verifyTetrisWalk(oracle.tetris_walk, "tetris_walk");
  const headSummary = verifyTetrisWalk(oracle.tetris_head_walk, "tetris_head_walk");
  // the head game must actually CLEAR lines — a random-quality walk (the old
  // abstain behavior) scores ~1 line per 36 pieces and must never come back
  const headLines = walkLines(oracle.tetris_head_walk);
  console.log(`tetris_head_walk: clears ${headLines} lines over the recorded game`);
  assert.ok(headLines >= 2, `head walk clears only ${headLines} lines — that is random-class play, not the fitted head`);
  assert.ok(headSummary.p50ms != null, "head walk carries no recorded per-decision ms");
}

// The two recorded-only lanes: the raw baseline (heads skipped — its picks
// are recorded random spots on abstain) and laya (Python), the torch
// reference. Python must be the SAME model as laya (Rust): while the two
// games share a board its per-spot ps stay within 1e-3 of the Rust walk's.
{
  verifyTetrisWalk(oracle.tetris_raw_walk, "tetris_raw_walk");
  verifyTetrisWalk(oracle.tetris_python_walk, "tetris_python_walk");
  let shared = 0;
  let worst = 0;
  for (let k = 0; k < Math.min(oracle.tetris_walk.length, oracle.tetris_python_walk.length); k++) {
    const rs = oracle.tetris_walk[k];
    const py = oracle.tetris_python_walk[k];
    if (rs[2] !== py[2] || rs[3].join("") !== py[3].join("")) break;
    rs[1].forEach((p, i) => { worst = Math.max(worst, Math.abs(p - py[1][i])); });
    shared += 1;
  }
  assert.ok(shared >= 10, `python walk diverges from the Rust walk after ${shared} turns`);
  assert.ok(worst <= 1e-3, `laya (Python) vs laya (Rust) drift ${worst} > 1e-3`);
  console.log(`tetris_python_walk: ${shared} turns share the Rust walk's board · max |Δp| ${worst.toExponential(1)}`);
  for (const game of ["flappy", "lanes"]) {
    for (const lane of ["python", "raw"]) {
      const reel = oracle[`${game}_${lane}`];
      const states = oracle[`${game}_walk`];
      assert.equal(reel?.length, states.length, `${game}_${lane}: ${reel?.length} rows vs ${states.length} states`);
      reel.forEach(([ps, ms], i) => {
        assert.equal(ps.length, states[i][1].length, `${game}_${lane}[${i}]: arity`);
        assert.equal(ms.length, ps.length, `${game}_${lane}[${i}]: ms arity`);
      });
    }
  }
  console.log("flappy/lanes python + raw reels: aligned 1:1 with the recorded states");
}

// replay the walk's placements to count cleared lines without a browser
function walkLines(walk) {
  const board = T.fromStrings(walk[0][3]);
  let lines = 0;
  for (const [, , piece, rows, pick] of walk) {
    for (let r = 0; r < T.HEIGHT; r++) {
      for (let c = 0; c < T.WIDTH; c++) {
        if ((rows[r][c] === "#") !== board[r][c]) {
          return -1; // chain drift — already caught above; do not double-report
        }
      }
    }
    const opts = T.buildTurn(board, piece);
    lines += T.commitPlacement(board, opts[pick]);
  }
  return lines;
}

// ── flappy + lanes: reels re-render + decide exactly like the live boards ──
for (const [game, mod, fixtureFile] of [
  ["flappy", F, "flappy_oracle_laya_en_v3.jsonl"],
  ["lanes", L, "lanes_oracle_laya_en_v1.jsonl"],
]) {
  const walk = oracle[`${game}_walk`];
  const fixture = readFileSync(path.join(FIXDIR, fixtureFile), "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(1)
    .map((l) => JSON.parse(l));
  assert.equal(walk.length, fixture.length, `${game}: walk length vs fixture`);
  const arity = game === "flappy" ? 2 : 3;
  let argmaxAgree = 0;
  for (let i = 0; i < walk.length; i++) {
    const [sentence, ps, state] = walk[i];
    // the structured state must re-render the recorded sentence — this is
    // what the demo board displays
    assert.equal(mod.renderStateSentence(state), sentence, `${game}[${i}]: sentence drift`);
    // and rebuild the exact option set the demo scores
    const turn = mod.buildTurn(state);
    assert.equal(turn.options.length, arity, `${game}[${i}]: buildTurn arity`);
    assert.equal(ps.length, arity, `${game}[${i}]: ps arity`);
    assert.equal(
      turn.options.map((o) => o.sentence).join("|"),
      fixture[i].options.map((o) => o.sentence).join("|"),
      `${game}[${i}]: option sentences drift vs fixture`,
    );
    if (argmax(ps) === fixture[i].argmax) argmaxAgree += 1;
    else console.log(`  ${game}[${i}]: argmax ${argmax(ps)} vs fixture ${fixture[i].argmax}`);
  }
  console.log(`${game}_walk: ${walk.length} reels, sentence+option parity, argmax parity ${argmaxAgree}/${walk.length}`);
  assert.equal(argmaxAgree, walk.length, `${game}: recorded argmax mismatch`);
}

console.log("demo check PASS — the no-engine demo replays recorded decisions exactly");
