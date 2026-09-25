// Merge a recorded KatGPT rulebook walk into arena/demo_oracle.json as
// `tetris_rulebook_walk` + `_meta.sources.tetris_rulebook`, verified first
// against the site's own pieces (scripts/rulebook_walk.mjs).
//
// Record (katgpt-rs, Issue 892 hybrid FSM champion):
//   cargo run --release --example tetris_09_site_walk -- --out /tmp/walk.json
//   [--stream bag|uniform] [--cap 300] [--seed 607]
// Merge:
//   node scripts/merge_rulebook_walk.mjs /tmp/walk.json [--dry]
//
// Every other oracle key is carried through untouched; the file keeps its
// JSON.stringify serialization (the recorder's and generator's convention).
// gen_demo_oracle.mjs PRESERVES the walk on regeneration (RECORDED_KEYS).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as T from "../assets/games/tetris.js";
import { RULEBOOK_META_KEY, RULEBOOK_WALK_KEY, verifyRulebookWalk } from "./rulebook_walk.mjs";

const [src, ...flags] = process.argv.slice(2);
if (!src) {
  console.error("usage: node scripts/merge_rulebook_walk.mjs <walk.json> [--dry]");
  process.exit(2);
}
const ORACLE = path.resolve(import.meta.dirname, "../arena/demo_oracle.json");
const rec = JSON.parse(readFileSync(src, "utf8"));
const { walk, summary, info } = rec;

const meta = {
  recorder: "katgpt-rs examples/tetris_09_site_walk.rs",
  lane: "KatGPT rulebook search — hybrid FSM champion (katgpt-rs Issue 892), depth-3 expectimax, recorded",
  transport: "in-process (no engine, no sentence question) — per-decision WALL time of the depth-3 search (root options searched in parallel on rayon since katgpt-rs 6e02c72b9, so wall < CPU), split evenly over the options (per_option_ms = decision_ms / options)",
  policy: "argmax",
  seed: info.seed,
  stream: info.stream,
  recorded_at: info.recorded_at,
  host: info.host,
  load_avg: info.load_avg,
  question: "(none — scores placements with the strategy rulebook, not a sentence question)",
  grammar: T.GRAMMAR_ID_V3,
  genome_id: info.genome_id,
  genome: info.genome,
  probs: "sigmoid((v − max v) / std(v)) over the champion's per-option root values (std floor 1e-9) — the pick reads 0.5; a display map, not a probability",
  summary,
};
const replayed = verifyRulebookWalk(walk, meta);
console.log(`${RULEBOOK_WALK_KEY}: ${walk.length} turns verified (stream + replay) · ${JSON.stringify(replayed)}`);

if (flags.includes("--dry")) {
  console.log("--dry: oracle not written");
} else {
  const oracle = JSON.parse(readFileSync(ORACLE, "utf8"));
  oracle._meta = oracle._meta || { sources: {} };
  oracle[RULEBOOK_WALK_KEY] = walk;
  oracle._meta.sources[RULEBOOK_META_KEY] = meta;
  writeFileSync(ORACLE, JSON.stringify(oracle));
  console.log(`wrote ${path.relative(process.cwd(), ORACLE)} (${(readFileSync(ORACLE).length / 1024).toFixed(0)} KB)`);
}
