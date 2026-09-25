// Tests for the tetris DISPLAY layer (tetris_view.js) — the piece colors,
// the 7-bag live stream, and the recorded-walk stamp replay. Run:
//   node assets/games/tetris_view.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

const {
  PIECE_COLORS, UNKNOWN_COLOR, PieceBag, withAlpha,
  newStampGrid, clearRowsGrid, replayStamps, reachableFromTop, liveOptions,
} = await import("./tetris_view.js");
const T = await import("./tetris.js");
const { Rng } = await import("./rng.js");

test("piece colors pin the original tetris palette (owner-provided)", () => {
  assert.deepEqual(Object.keys(PIECE_COLORS).sort(), [...T.PIECES].sort());
  assert.deepEqual(PIECE_COLORS, {
    I: "rgb(0, 240, 240)", // Cyan
    J: "rgb(0, 0, 240)", // Blue
    L: "rgb(221, 164, 34)", // Orange
    O: "rgb(241, 239, 47)", // Yellow
    S: "rgb(138, 234, 40)", // Green
    T: "rgb(136, 44, 237)", // Purple
    Z: "rgb(207, 54, 22)", // Red
  });
  assert.equal(UNKNOWN_COLOR, "#8a5a3a");
});

test("withAlpha rewrites only the rgb() form", () => {
  assert.equal(withAlpha("rgb(0, 240, 240)", 0.92), "rgba(0, 240, 240, 0.92)");
  assert.equal(withAlpha("#8a5a3a", 0.5), "#8a5a3a");
  assert.equal(withAlpha(undefined, 0.5), undefined);
});

test("7-bag: every window of 7 consecutive draws is a full permutation", () => {
  const bag = new PieceBag(new Rng(607));
  const draws = Array.from({ length: 70 * 7 }, () => bag.next());
  const want = [...T.PIECES].sort().join(",");
  for (let w = 0; w + 7 <= draws.length; w += 7) {
    assert.equal(
      draws.slice(w, w + 7).sort().join(","),
      want,
      `window at ${w} is not a 7-bag permutation`,
    );
  }
});

test("7-bag is deterministic for a seed", () => {
  const a = Array.from({ length: 21 }, () => new PieceBag(new Rng(42)).next());
  // fresh bags with the same seed deal the same first pieces
  const b = Array.from({ length: 21 }, () => new PieceBag(new Rng(42)).next());
  assert.deepEqual(a, b);
});

test("clearRowsGrid mirrors clearRows for arbitrary cell values", () => {
  const g = newStampGrid();
  g[2][3] = "T";
  g[3][4] = "Z";
  clearRowsGrid(g, [3], null);
  assert.equal(g[3][3], "T"); // row 2 pulled into row 3
  assert.equal(g[2][3], null); // row 0 refilled
});

test("replayStamps recovers per-piece cells across a line clear", () => {
  // Row 19 pre-filled except column 0; a vertical I at col 0 lands over
  // rows 16..19, completes the row, and the clear pulls its upper three
  // cells (and their stamps) down one.
  const rows = [...Array.from({ length: 19 }, () => ".........."), ".#########"];
  const b0 = T.fromStrings(rows);
  const opts = T.buildTurn(b0, "I");
  const pick = opts.findIndex((o) => o.rot === 1 && o.col === 0);
  assert.ok(pick >= 0, "vertical I at col 0 must be a legal option");

  const work = T.fromStrings(rows);
  const opt = opts[pick];
  T.place(work, opt.cells);
  const full = T.fullRows(work);
  assert.deepEqual(full, [19]);
  T.clearRows(work, full);

  const stamps = replayStamps([[null, null, "I", rows, pick, null]], 1, work);
  assert.ok(stamps, "replay must succeed against its own outcome");
  for (let r = 0; r < T.HEIGHT; r++) {
    for (let c = 0; c < T.WIDTH; c++) {
      if (work[r][c]) assert.equal(stamps[r][c], "I", `cell ${r},${c} must carry I`);
      else assert.equal(stamps[r][c], null);
    }
  }
  // the piece's surviving cells are exactly the shifted ones
  for (const [r, c] of opt.cells) {
    if (r === 19) continue; // cleared with the completed row
    assert.equal(work[r + 1][c], true, `I cell ${r},${c} shifted to ${r + 1}`);
  }
});

test("replayStamps refuses fiction: abstain pick or board mismatch → null", () => {
  const rows = [...Array.from({ length: 19 }, () => ".........."), ".........."];
  // pick -1 (an abstain fallback the replay cannot reproduce)
  assert.equal(replayStamps([[null, null, "T", rows, -1, null]], 1, null), null);
  // a shown board that disagrees with the replay
  const b = T.fromStrings(rows);
  b[19][0] = true;
  assert.equal(replayStamps([[null, null, "T", rows, 0, null]], 1, b), null);
  // malformed record
  assert.equal(replayStamps([["not", "a", "record"]], 1, null), null);
});

test("recorded demo walk replays with per-piece stamps end to end", () => {
  const demoPath = path.resolve(here, "../../arena/demo_oracle.json");
  const j = JSON.parse(readFileSync(demoPath, "utf8"));
  for (const [name, key] of [["laya walk", "tetris_walk"], ["head walk", "tetris_head_walk"]]) {
    const walk = j[key] || [];
    assert.ok(walk.length > 10, `${name} should be recorded`);
    let replayed = 0;
    for (let k = 0; k < walk.length; k++) {
      const shown = T.fromStrings(walk[k][3]);
      const stamps = replayStamps(walk, k, shown);
      if (stamps === null) continue; // honest refusal (abstain picks) — allowed
      replayed += 1;
      for (let r = 0; r < T.HEIGHT; r++) {
        for (let c = 0; c < T.WIDTH; c++) {
          if (shown[r][c]) {
            assert.ok(
              stamps[r][c] && T.PIECES.includes(stamps[r][c]),
              `${name}: unstamped cell at turn ${k} (${r},${c})`,
            );
          }
        }
      }
    }
    console.log(`${name}: ${replayed}/${walk.length} turns replayed with stamps`);
    assert.ok(replayed > 0, `${name}: at least the clean prefix must replay`);
  }
});

// ── live-play drop rule (katgpt-rs Issue 884) ────────────────────────────

const emptyBoard = () => Array.from({ length: T.HEIGHT }, () => Array(T.WIDTH).fill(false));

test("reachableFromTop: an O under a solid roof is a tunnelled spot", () => {
  const b = emptyBoard();
  const roof = T.HEIGHT - 3;
  for (let c = 0; c < 4; c++) b[roof][c] = true;
  const opts = T.buildTurn(b, "O");
  const cave = opts.find((o) => o.col === 0);
  // The pinned sim rests it in the cave BELOW the roof (the v2 semantics)...
  assert.equal(cave.row, roof + 1);
  assert.equal(reachableFromTop(b, cave), false);
  // ...and the live set drops exactly the spots whose column is roofed.
  const live = liveOptions(b, opts);
  assert.deepEqual(live.map((o) => o.col), opts.filter((o) => o.col >= 4).map((o) => o.col));
  // Two-sided: with the roof open at col 0-1 the same spot is reachable.
  b[roof][0] = b[roof][1] = false;
  const open = T.buildTurn(b, "O").find((o) => o.col === 0);
  assert.equal(reachableFromTop(b, open), true);
});

test("reachableFromTop: every spot on an empty board is reachable", () => {
  const b = emptyBoard();
  for (const piece of T.PIECES) {
    const opts = T.buildTurn(b, piece);
    assert.equal(liveOptions(b, opts).length, opts.length, piece);
  }
});

test("pinned corpus: exactly 3 of 2660 v2 options are tunnelled (Issue 884)", () => {
  const fx = path.resolve(here, "../../tests/fixtures/tetris_oracle_laya_en_v2.jsonl");
  const rows = readFileSync(fx, "utf8").trim().split("\n").map(JSON.parse).filter((r) => r.board);
  let options = 0;
  let tunnelled = 0;
  for (const r of rows) {
    const b = T.fromStrings(r.board);
    const opts = T.buildTurn(b, r.piece);
    options += opts.length;
    tunnelled += opts.length - liveOptions(b, opts).length;
  }
  assert.equal(options, 2660);
  assert.equal(tunnelled, 3);
});
