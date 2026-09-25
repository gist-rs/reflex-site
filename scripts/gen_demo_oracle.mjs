// Generate arena/demo_oracle.json — the recorded-decision replay data for the
// no-engine demo mode. Source of truth: the committed Plan 607 oracle fixtures
// in katgpt-rs tests/fixtures/ (the SAME fixtures the site's golden tests bind
// and arena_protocol_check.mjs replays against the live lane).
//
//  flappy / lanes — [state_sentence, [p_clean...], structured state] rows;
//    the browser demo rebuilds each turn's option sentences with its own
//    renderer (golden-proven byte-identical to the fixture sentences) and
//    replays the recorded ps.
//  tetris — archetype rows like the above (partial coverage, kept for
//    seed-experiments).
//
// MERGE SEMANTICS: every recorded lane game (RECORDED_KEYS — the tetris
// walks of all four lanes and the laya (Python) / raw reel rows, which are
// aligned 1:1 with the flappy/lanes states below) is OWNED by
// scripts/record_demo_walks.mjs — this script PRESERVES them from the
// existing oracle and never overwrites. Regenerating
// those requires a running engine (the recorder), not this script.
//
// Run from the reflex-site working copy (the default fixture dir is this
// repo's own sha256-pinned copies, tests/fixtures/):
//   node scripts/gen_demo_oracle.mjs [fixtures_dir]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { GRAMMAR_ID as TETRIS_GRAMMAR } from "../assets/games/tetris.js";

const FIXDIR =
  process.argv[2] ?? path.resolve(import.meta.dirname, "../tests/fixtures");
const dest = path.resolve(import.meta.dirname, "../arena/demo_oracle.json");

function argmax(ps) {
  let best = -1;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] == null) continue;
    if (best === -1 || ps[i] > ps[best]) best = i;
  }
  return best;
}

const out = { _meta: { sources: {} } };
console.log(`destination: ${dest}`);

// ── flappy + lanes: recorded decision reels (sentence, ps, state) ──────────
// The fixture states come from enumerateStates (deduped + filtered), NOT the
// play_game stream the live boards drive — so a self-driving demo would miss
// the oracle. The demo therefore replays the recorded states directly as a
// decision reel; the structured state ships so the board can draw it.
for (const [game, file, stateKey] of [
  ["flappy", "flappy_oracle_laya_en_v3.jsonl", "state"],
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

// ── tetris: archetype rows + the PRESERVED recorded walks ─────────────────
{
  // the fixture of the grammar the site serves (laya-tetris-v3 → _v3)
  const file = `tetris_oracle_laya_en_${TETRIS_GRAMMAR.split("-").pop()}.jsonl`;
  const lines = readFileSync(path.join(FIXDIR, file), "utf8")
    .split("\n")
    .filter(Boolean);
  const meta = JSON.parse(lines[0]);
  assert.equal(meta.grammar, TETRIS_GRAMMAR, "tetris: fixture grammar != the site's served grammar");
  out._meta.sources.tetris = {
    fixture: file,
    generator: meta.generator ?? meta.dump_command,
    grammar: meta.grammar,
    question: meta.question,
    checkpoint: meta.checkpoint,
  };
  const recs = lines.slice(1).map((l) => JSON.parse(l));
  const rows = [];
  for (const rec of recs) {
    const ps = rec.options.map((o) => {
      assert.ok(o.p_clean != null, "tetris: option without p_clean");
      return Math.round(o.p_clean * 1e6) / 1e6;
    });
    assert.ok(rec.state_sentence, "tetris: record without state_sentence");
    rows.push([rec.state_sentence, ps]);
  }
  out.tetris = rows;
  console.log(`tetris: ${rows.length} states (archetype rows)`);

  // the recorded lane games are the RECORDER's output — preserve
  // them from the existing oracle (a missing oracle means they must be
  // re-recorded with record_demo_walks.mjs against a live engine)
  const existing = (() => {
    try {
      return JSON.parse(readFileSync(dest, "utf8"));
    } catch {
      return null;
    }
  })();
  const RECORDED_KEYS = [
    "tetris_walk", "tetris_head_walk", "tetris_raw_walk", "tetris_python_walk",
    // katgpt-rs examples/tetris_09_site_walk.rs, merged by
    // scripts/merge_rulebook_walk.mjs (the rulebook lane never runs here)
    "tetris_rulebook_walk",
    "flappy_python", "flappy_raw", "lanes_python", "lanes_raw",
  ];
  // …and their provenance rows (recorder, host, timing transport, summary)
  for (const [k, v] of Object.entries(existing?._meta?.sources ?? {})) {
    if (!(k in out._meta.sources)) out._meta.sources[k] = v;
  }
  for (const key of RECORDED_KEYS) {
    if (existing?.[key]?.length) {
      out[key] = existing[key];
      console.log(`${key}: PRESERVED from the existing oracle (${out[key].length} turns — owned by record_demo_walks.mjs)`);
    } else {
      console.warn(`WARNING: ${key} missing — re-record with scripts/record_demo_walks.mjs against a live engine`);
    }
  }
}

writeFileSync(dest, JSON.stringify(out));
const kb = (readFileSync(dest).length / 1024).toFixed(0);
console.log(`wrote ${dest} (${kb} KB raw)`);
