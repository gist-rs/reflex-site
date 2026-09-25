// Golden drift-check: the JS Tetris port vs the committed laya oracle
// fixtures (katgpt-rs tests/fixtures/tetris_oracle_laya_en_v{2,3}.jsonl).
// Every state's option order, cells, features and sentences must reproduce
// byte-identically UNDER THE FIXTURE'S OWN DROP RULE (v2 DEEPEST_FIT, v3
// FROM_TOP — katgpt-rs Issue 884) — the fixture is what the oracle
// answered, so any drift here invalidates the live arena's protocol claim.
// Run: node assets/games/tetris_golden.test.mjs
//
// The fixtures ship IN THIS REPO (tests/fixtures/, verbatim copies of the
// katgpt-rs canonicals) so the test is self-contained; each copy is pinned
// by sha256 — if a canonical ever moves, the pin reds and the copy must be
// re-copied, never hand-edited. TETRIS_FIXTURE_DIR overrides the directory
// for a sibling-checkout run.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.TETRIS_FIXTURE_DIR ?? path.resolve(here, "../../tests/fixtures");

// grammar → (file, sha256 of the verbatim copy, pinned shape).
const FIXTURES = [
  {
    grammar: "laya-tetris-v2",
    file: "tetris_oracle_laya_en_v2.jsonl",
    sha256: "12c46035a7f6b5416c4ce34c86bc9b0b890975aff57944739a24c5869b8fc259",
    states: 120,
    options: 2660,
  },
  {
    grammar: "laya-tetris-v3",
    file: "tetris_oracle_laya_en_v3.jsonl",
    sha256: "eb67bc16c2c6b3732e7a2797d5344a22c3025ea5d3ade1b9e5f87f60da202bb3",
    states: 120,
    options: 2660,
  },
];

const { fromStrings, landingOptions, outcomeFeatures, renderSpotSentence, renderStateSentence, PIECES, dropRuleOf } =
  await import("./tetris.js");

function cmpF(a, b) {
  // Features are integers except landing_height (exact halves/quarters —
  // exact in binary floating point, so === is the honest check).
  if (typeof a === "number") return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function checkFixture(fx) {
  const raw = readFileSync(path.join(DIR, fx.file), "utf8");
  const sha = createHash("sha256").update(raw).digest("hex");
  const rule = dropRuleOf(fx.grammar);
  const failures = [];
  let states = 0;
  let optChecks = 0;
  let stateSentenceChecks = 0;

  if (sha !== fx.sha256) {
    failures.push(
      `fixture sha256 drifted: ${sha} != ${fx.sha256} — re-copy the canonical from katgpt-rs tests/fixtures, never hand-edit`,
    );
  }
  if (rule === null) failures.push(`${fx.grammar}: no drop rule`);

  for (const line of raw.split("\n").filter(Boolean)) {
    const rec = JSON.parse(line);
    if (rec.grammar !== fx.grammar) failures.push(`${rec.state_id}: grammar ${rec.grammar} != ${fx.grammar}`);
    if (rec.state_id === "_meta") continue;
    states += 1;
    const board = fromStrings(rec.board);
    const piece = rec.piece;
    if (!PIECES.includes(piece)) failures.push(`${rec.state_id}: unknown piece ${piece}`);

    const got = landingOptions(board, piece, rule).map((p) => {
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
      if (JSON.stringify(g.p.cells) !== JSON.stringify(w.cells)) failures.push(`${tag}: cells drift`);
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
  // Blindness floors: a parser that reads nothing must not print a pass.
  if (states !== fx.states) failures.push(`states ${states} != pinned ${fx.states}`);
  if (optChecks !== fx.options) failures.push(`options ${optChecks} != pinned ${fx.options}`);
  return { failures, states, optChecks, stateSentenceChecks };
}

for (const fx of FIXTURES) {
  test(`tetris golden ${fx.grammar}: every fixture option reproduces byte-identically`, () => {
    const r = checkFixture(fx);
    const summary = `tetris ${fx.grammar}: ${r.states}/${r.states} states, ${r.optChecks}/${r.optChecks} options, ${r.stateSentenceChecks}/${r.stateSentenceChecks} state sentences byte-identical`;
    if (r.failures.length) {
      throw new Error(`${summary}\n` + r.failures.slice(0, 20).join("\n"));
    }
    console.log(summary);
  });
}

test("tetris golden: the two grammars differ only where v2 tunnelled (Issue 884)", () => {
  // Same boards, same order; v3 moves exactly the options whose v2 rest row
  // is unreachable from the top — every other option is byte-identical.
  const [v2, v3] = FIXTURES.map((fx) =>
    readFileSync(path.join(DIR, fx.file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).slice(1),
  );
  let moved = 0;
  for (let s = 0; s < v2.length; s++) {
    if (JSON.stringify(v2[s].board) !== JSON.stringify(v3[s].board)) throw new Error(`${v2[s].state_id}: board differs`);
    v2[s].options.forEach((o, i) => {
      if (o.row !== v3[s].options[i].row) moved += 1;
    });
  }
  if (moved !== 3) throw new Error(`moved options ${moved} != 3`);
});
