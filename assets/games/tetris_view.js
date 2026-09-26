// Display layer for the arena's tetris boards — presentation ONLY, zero
// protocol surface. The sim/grammar module (tetris.js) stays the pure,
// golden-pinned port of the Rust sim; everything here is how the arena
// DRAWS it:
//
//   - PIECE_COLORS — the original Tetris piece palette (owner-provided),
//     so every placed block is readable by piece instead of one shared
//     brown;
//   - PieceBag — the guideline 7-bag randomizer for LIVE play (the
//     recorded demo replays are untouched — their piece stream is fixed
//     bytes in the recorded walks);
//   - replayStamps — recorded demo boards carry '#' strings only (no
//     per-cell piece ids), so the arena re-plays the recorded placements
//     to recover WHICH piece occupies each landed cell. It refuses (null)
//     unless the replay reproduces the recorded board exactly — the
//     fallback is the old uniform color, never a fiction.

import * as T from "./tetris.js";
import { Rng } from "./rng.js";

// Original Tetris piece colors, exactly as provided by the owner.
export const PIECE_COLORS = {
  I: "rgb(0, 240, 240)", // Cyan
  J: "rgb(0, 0, 240)", // Blue
  L: "rgb(221, 164, 34)", // Orange
  O: "rgb(241, 239, 47)", // Yellow
  S: "rgb(138, 234, 40)", // Green
  T: "rgb(136, 44, 237)", // Purple
  Z: "rgb(207, 54, 22)", // Red
};

// Fallback for cells whose piece is unknown (a demo replay that refused).
// The pre-colors uniform brown, kept so the degraded board still reads.
export const UNKNOWN_COLOR = "#8a5a3a";

/**
 * The first `n` pieces of a declared walk stream (`meta.stream` prefix):
 * "PieceBag(<seed-rng>)" deals the guideline 7-bag, "PIECES[…]" draws
 * uniform pieces. The single implementation behind the rulebook-walk
 * records — used by the page (flow_walk.js) and the scripts parity checks
 * (scripts/rulebook_walk.mjs re-exports it).
 */
export function streamPieces(stream, seed, n) {
  const rng = new Rng(seed);
  let draw;
  if (stream.startsWith("PieceBag(")) {
    const bag = new PieceBag(rng);
    draw = () => bag.next();
  } else if (stream.startsWith("PIECES[")) {
    draw = () => T.PIECES[rng.u32Below(7)];
  } else {
    throw new Error(`unknown rulebook stream: ${stream}`);
  }
  return Array.from({ length: n }, draw);
}

/** "rgb(r, g, b)" -> "rgba(r, g, b, a)"; anything else passes through. */
export function withAlpha(rgb, a) {
  if (typeof rgb !== "string" || !rgb.startsWith("rgb(")) return rgb;
  return `rgba(${rgb.slice(4, -1)}, ${a})`;
}

/** A HEIGHT×WIDTH grid of null piece ids. */
export function newStampGrid() {
  return Array.from({ length: T.HEIGHT }, () => Array(T.WIDTH).fill(null));
}

/** Mirror of tetris.js clearRows for arbitrary cell values (stamps). */
export function clearRowsGrid(grid, rows, emptyCell) {
  for (const r of rows) {
    for (let rr = r; rr >= 1; rr--) grid[rr] = grid[rr - 1];
    grid[0] = Array(T.WIDTH).fill(emptyCell);
  }
}

// ── the guideline 7-bag piece stream (live play only) ────────────────────

/** Shuffle all seven pieces, deal them out, reshuffle — the original
 * Tetris randomizer. Deterministic: draws come from the board's seeded
 * Rng, so the same seed still plays the same game (note: the stream
 * differs from the old uniform u32Below(7) draw at the same seed). */
export class PieceBag {
  constructor(rng) {
    this.rng = rng;
    this.queue = [];
  }

  next() {
    if (this.queue.length === 0) {
      this.queue = [...T.PIECES];
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = this.rng.u32Below(i + 1);
        [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
      }
    }
    return this.queue.pop();
  }
}

// ── per-cell piece recovery for recorded-demo boards ─────────────────────

function boardsEqual(a, b) {
  for (let r = 0; r < T.HEIGHT; r++) {
    for (let c = 0; c < T.WIDTH; c++) {
      if (!!a[r][c] !== !!b[r][c]) return false;
    }
  }
  return true;
}

/**
 * Re-play the recorded walk's placements `turns` long (records
 * `[_, ps, piece, boardStrings, pick, _]`, pick = the recorded actual
 * choice), starting from the FIRST record's own board (the recorded
 * initial state — the recording may begin mid-game), stamping each placed
 * piece into a grid, and return that grid — or null when the walk cannot
 * be replayed faithfully (an abstain/absent pick, a malformed record, or
 * a replay that does not reproduce `shownBoard` exactly). Cells inherited
 * from the initial state carry null (no piece id is recoverable for them).
 * null means "the caller falls back to UNKNOWN_COLOR", never a guessed
 * stamp.
 */
export function replayStamps(walkArr, turns, shownBoard) {
  const stamps = newStampGrid();
  if (turns <= 0) {
    const first = Array.isArray(walkArr[0]) ? walkArr[0][3] : null;
    if (first && shownBoard && !boardsEqual(T.fromStrings(first), shownBoard)) return null;
    return stamps;
  }
  const start = Array.isArray(walkArr[0]) ? walkArr[0][3] : null;
  if (!Array.isArray(start) || start.length < T.HEIGHT) return null;
  const b = T.fromStrings(start);
  for (let i = 0; i < turns; i++) {
    const rec = walkArr[i];
    if (!Array.isArray(rec) || rec.length < 5) return null;
    const piece = rec[2];
    const pick = rec[4];
    if (!T.PIECES.includes(piece) || !Number.isInteger(pick) || pick < 0) return null;
    const opts = T.buildTurn(b, piece);
    if (pick >= opts.length) return null;
    const opt = opts[pick];
    // Stamp BEFORE the clear (cells are pre-clear positions); the clear
    // then shifts both grids identically.
    for (const [r, c] of opt.cells) stamps[r][c] = piece;
    T.place(b, opt.cells);
    const full = T.fullRows(b);
    if (full.length) {
      T.clearRows(b, full);
      clearRowsGrid(stamps, full, null);
    }
  }
  if (shownBoard && !boardsEqual(b, shownBoard)) return null;
  return stamps;
}
