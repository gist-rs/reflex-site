// Golden drift-check: the JS Tetris port vs the committed laya oracle
// fixture (katgpt-rs tests/fixtures/tetris_oracle_laya_en_v2.jsonl, grammar
// `laya-tetris-v2`). Every state's option order, cells, features and
// sentences must reproduce byte-identically — the fixture is what the oracle
// answered, so any drift here invalidates the live arena's protocol claim.
// Run: node assets/games/tetris_golden.test.mjs
//
// The fixture ships IN THIS REPO (tests/fixtures/, a verbatim copy of the
// katgpt-rs canonical) so the test is self-contained; the copy is pinned by
// sha256 — if the canonical ever moves, the pin reds and the copy must be
// re-copied, never hand-edited. TETRIS_FIXTURE overrides for a sibling
// checkout run.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE =
  process.env.TETRIS_FIXTURE ??
  path.resolve(here, "../../tests/fixtures/tetris_oracle_laya_en_v2.jsonl");
const FIXTURE_SHA256 = "12c46035a7f6b5416c4ce34c86bc9b0b890975aff57944739a24c5869b8fc259";

const { fromStrings, landingOptions, outcomeFeatures, renderSpotSentence, renderStateSentence, PIECES } =
  await import("./tetris.js");

function cmpF(a, b) {
  // Features are integers except landing_height (exact halves/quarters —
  // exact in binary floating point, so === is the honest check).
  if (typeof a === "number") return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

const raw = readFileSync(FIXTURE, "utf8");
const sha = createHash("sha256").update(raw).digest("hex");
const lines = raw.split("\n").filter(Boolean);
const failures = [];
let states = 0;
let optChecks = 0;
let stateSentenceChecks = 0;

if (sha !== FIXTURE_SHA256) {
  failures.push(
    `fixture sha256 drifted: ${sha} != ${FIXTURE_SHA256} — re-copy the canonical from katgpt-rs tests/fixtures, never hand-edit`,
  );
}

for (const line of lines) {
  const rec = JSON.parse(line);
  if (rec.state_id === "_meta") {
    if (rec.grammar !== "laya-tetris-v2") {
      failures.push(`meta grammar drifted: ${rec.grammar}`);
    }
    continue;
  }
  states += 1;
  const board = fromStrings(rec.board);
  const piece = rec.piece;
  if (!PIECES.includes(piece)) failures.push(`${rec.state_id}: unknown piece ${piece}`);

  const got = landingOptions(board, piece).map((p) => {
    const f = outcomeFeatures(board, p);
    return { p, f, sentence: renderSpotSentence(board, p, f) };
  });
  const want = rec.options;

  if (got.length !== want.length) {
    failures.push(`${rec.state_id}: option count ${got.length} != ${want.length}`);
    continue;
  }
  for (let i = 0; i < got.length; i++) {
    const g = got[i];
    const w = want[i];
    const tag = `${rec.state_id}#${i}`;
    if (g.p.rot !== w.rot || g.p.col !== w.col || g.p.row !== w.row) {
      failures.push(`${tag}: placement rot/col/row ${g.p.rot}/${g.p.col}/${g.p.row} != ${w.rot}/${w.col}/${w.row}`);
    }
    const gCells = JSON.stringify(g.p.cells);
    const wCells = JSON.stringify(w.cells);
    if (gCells !== wCells) failures.push(`${tag}: cells drift`);
    for (const k of Object.keys(w.features ?? {})) {
      if (!(k in g.f) || !cmpF(g.f[k], w.features[k])) {
        failures.push(`${tag}: feature ${k} ${JSON.stringify(g.f[k])} != ${JSON.stringify(w.features[k])}`);
      }
    }
    if (g.sentence !== w.sentence) {
      failures.push(`${tag}: sentence drift\n  got:  ${g.sentence}\n  want: ${w.sentence}`);
    }
    optChecks += 1;
  }

  const gotState = renderStateSentence(board, piece);
  if (gotState !== rec.state_sentence) {
    failures.push(`${rec.state_id}: state sentence drift\n  got:  ${gotState}\n  want: ${rec.state_sentence}`);
  }
  stateSentenceChecks += 1;
}

test("tetris golden: every fixture option reproduces byte-identically", () => {
  const summary = `tetris: ${states}/${states} states, ${optChecks}/${optChecks} options, ${stateSentenceChecks}/${stateSentenceChecks} state sentences byte-identical`;
  if (failures.length) {
    throw new Error(`${summary}\n` + failures.slice(0, 20).join("\n"));
  }
  console.log(summary);
});
