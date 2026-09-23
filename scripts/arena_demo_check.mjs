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
  process.argv[2] ?? path.resolve(import.meta.dirname, "../../../tests/fixtures");

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

// ── tetris: the recorded walk chains under the site's own enumeration ──────
{
  const walk = oracle.tetris_walk;
  assert.ok(walk.length >= 10, `tetris walk too short: ${walk.length}`);
  for (let k = 0; k < walk.length; k++) {
    const [sentence, ps, piece, boardRows, chainPick] = walk[k];
    const board = T.fromStrings(boardRows);
    const opts = T.buildTurn(board, piece);
    assert.equal(opts.length, ps.length, `walk[${k}]: arity ${ps.length} vs ${opts.length}`);
    assert.equal(opts[0].stateSentence, sentence, `walk[${k}]: sentence drift`);
    if (k + 1 < walk.length) {
      assert.ok(chainPick >= 0 && chainPick < opts.length, `walk[${k}]: bad chainPick`);
      const after = board.map((r) => [...r]);
      T.commitPlacement(after, opts[chainPick]);
      const next = walk[k + 1][3];
      for (let r = 0; r < T.HEIGHT; r++) {
        for (let c = 0; c < T.WIDTH; c++) {
          assert.ok(
            after[r][c] === (next[r][c] === "#"),
            `walk[${k}]: chain broken at (${r},${c})`,
          );
        }
      }
    } else {
      assert.equal(chainPick, -1, "walk: final record must end the window (chainPick -1)");
    }
  }
  console.log(
    `tetris_walk: ${walk.length} turns chain-verified against the site's own enumeration`,
  );
}

// ── flappy + lanes: reels re-render + decide exactly like the live boards ──
for (const [game, mod, fixtureFile] of [
  ["flappy", F, "flappy_oracle_laya_en_v2.jsonl"],
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
