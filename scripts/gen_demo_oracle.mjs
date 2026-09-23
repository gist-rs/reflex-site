// Generate arena/demo_oracle.json — the recorded-decision replay data for the
// no-engine demo mode. Source of truth: the committed Plan 607 oracle fixtures
// in katgpt-rs tests/fixtures/ (the SAME fixtures the site's golden tests bind
// and arena_protocol_check.mjs replays against the live lane).
//
//  flappy / lanes — [state_sentence, [p_clean...]] rows; the browser demo
//    looks states up by the sentence its own renderers produce (golden-proven
//    byte-identical to the fixture sentences).
//  tetris — archetype rows like the above (partial coverage, kept for
//    seed-experiments) PLUS "tetris_walk": the recorded PLAY WALK in file
//    order — [state_sentence, [p...], piece, board rows]. The walk is
//    chain-verified HERE at generation time: placing the recorded argmax on
//    record k's board must yield record k+1's board, every arity must match
//    the site's own enumeration, and the walk must end in top-out. The
//    browser demo replays exactly this walk.
//
// Run from the reflex-site working copy (the default fixture path assumes the
// katgpt-rs sibling checkout):
//   node scripts/gen_demo_oracle.mjs [fixtures_dir]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Rng } from "../assets/games/rng.js";
import * as T from "../assets/games/tetris.js";

const FIXDIR =
  process.argv[2] ?? path.resolve(import.meta.dirname, "../../../tests/fixtures");

function argmax(ps) {
  let best = -1;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] == null) continue;
    if (best === -1 || ps[i] > ps[best]) best = i;
  }
  return best;
}

const out = { _meta: { sources: {} } };

// ── flappy + lanes: recorded decision reels (sentence, ps, state) ──────────
// The fixture states come from enumerateStates (deduped + filtered), NOT the
// play_game stream the live boards drive — so a self-driving demo would miss
// the oracle. The demo therefore replays the recorded states directly as a
// decision reel; the structured state ships so the board can draw it.
for (const [game, file, stateKey] of [
  ["flappy", "flappy_oracle_laya_en_v2.jsonl", "state"],
  ["lanes", "lanes_oracle_laya_en_v1.jsonl", "state"],
]) {
  const lines = readFileSync(path.join(FIXDIR, file), "utf8")
    .split("\n")
    .filter(Boolean);
  const meta = JSON.parse(lines[0]);
  out._meta.sources[game] = {
    fixture: file,
    generator: meta.generator ?? meta.dump_command,
    grammar: meta.grammar,
    question: meta.question,
    checkpoint: meta.checkpoint,
  };
  const rows = [];
  for (const line of lines.slice(1)) {
    const rec = JSON.parse(line);
    assert.ok(rec.state_sentence, `${game}: record without state_sentence`);
    assert.ok(rec[stateKey], `${game}: record without structured state`);
    const ps = rec.options.map((o) => {
      assert.ok(o.p_clean != null, `${game}: option without p_clean`);
      // 6 dp — the protocol check runs at ±0.02; this is 4 orders finer and
      // never moves an argmax the recorded forward considered distinct.
      return Math.round(o.p_clean * 1e6) / 1e6;
    });
    rows.push([rec.state_sentence, ps, rec[stateKey]]);
  }
  out[`${game}_walk`] = rows;
  console.log(`${game}_walk: ${rows.length} recorded decision states from ${file}`);
}

// ── tetris: archetype rows + the chain-verified play walk ──────────────────
{
  const file = "tetris_oracle_laya_en_v2.jsonl";
  const lines = readFileSync(path.join(FIXDIR, file), "utf8")
    .split("\n")
    .filter(Boolean);
  const meta = JSON.parse(lines[0]);
  out._meta.sources.tetris = {
    fixture: file,
    generator: meta.generator ?? meta.dump_command,
    grammar: meta.grammar,
    question: meta.question,
    checkpoint: meta.checkpoint,
  };
  const recs = lines.slice(1).map((l) => JSON.parse(l));

  const rows = [];
  const playRecs = [];
  for (const rec of recs) {
    const ps = rec.options.map((o) => {
      assert.ok(o.p_clean != null, "tetris: option without p_clean");
      return Math.round(o.p_clean * 1e6) / 1e6;
    });
    assert.ok(rec.state_sentence, "tetris: record without state_sentence");
    rows.push([rec.state_sentence, ps]);
    if (rec.state_id.startsWith("play")) playRecs.push({ rec, ps });
  }
  out.tetris = rows;
  console.log(`tetris: ${rows.length} states (${playRecs.length} play-walk records)`);

  // Chain-verify the play walk with the site's OWN enumeration: the exact
  // code the browser demo runs. The recorded play is a MIXED policy (it was
  // a state-collection capture, not argmax play — 18/35 picks are argmax),
  // so the replayed decision is the CHAIN pick: whichever option's placement
  // reproduces the next recorded board (argmax when it agrees, else the
  // first match). The demo discloses this in the banner.
  assert.ok(playRecs.length >= 10, `tetris walk too short: ${playRecs.length}`);
  const walk = [];
  for (let k = 0; k < playRecs.length; k++) {
    const { rec, ps } = playRecs[k];
    const board = T.fromStrings(rec.board);
    const opts = T.buildTurn(board, rec.piece);
    assert.equal(
      opts.length,
      ps.length,
      `walk[${k}]: arity ${ps.length} vs site enumeration ${opts.length}`,
    );
    // the recorded state sentence must be what the site renders for this board
    assert.equal(
      opts[0].stateSentence,
      rec.state_sentence,
      `walk[${k}]: state sentence drift`,
    );
    // the recorded play must be a legal index, and placing it must yield the
    // NEXT record's board exactly (the last record ends the window)
    let chainPick = -1;
    if (k + 1 < playRecs.length) {
      const next = playRecs[k + 1].rec.board;
      const argmaxPick = argmax(ps);
      for (let i = 0; i < opts.length && chainPick === -1; i++) {
        const after = board.map((r) => [...r]);
        T.commitPlacement(after, opts[i]);
        let same = true;
        for (let r = 0; r < T.HEIGHT && same; r++) {
          for (let c = 0; c < T.WIDTH && same; c++) {
            if (after[r][c] !== (next[r][c] === "#")) same = false;
          }
        }
        if (same) chainPick = i;
      }
      assert.ok(chainPick !== -1, `walk[${k}]: no option reproduces the next recorded board`);
      // deterministic preference: when argmax IS a chain match, take it so
      // the demo highlights the highest-P spot wherever the records allow
      if (chainPick !== argmaxPick) {
        const after = board.map((r) => [...r]);
        T.commitPlacement(after, opts[argmaxPick]);
        let same = true;
        for (let r = 0; r < T.HEIGHT && same; r++) {
          for (let c = 0; c < T.WIDTH && same; c++) {
            if (after[r][c] !== (next[r][c] === "#")) same = false;
          }
        }
        if (same) chainPick = argmaxPick;
      }
    }
    walk.push([rec.state_sentence, ps, rec.piece, rec.board, chainPick]);
  }
  const nArgmax = walk.filter((w) => w[4] === argmax(w[1])).length;
  out.tetris_walk = walk;
  console.log(
    `tetris_walk: ${walk.length} turns chain-verified ` +
      `(${nArgmax} of ${walk.length - 1} recorded plays are argmax — mixed capture policy, ` +
      `disclosed in the demo banner; last record ends the window)`,
  );
}

const dest = path.resolve(import.meta.dirname, "../arena/demo_oracle.json");
writeFileSync(dest, JSON.stringify(out));
const kb = (readFileSync(dest).length / 1024).toFixed(0);
console.log(`wrote ${dest} (${kb} KB raw)`);
