// Tetris sim + the pinned `laya-tetris-v2` / `-v3` sentence grammar — the
// exact JS port of katgpt-rs `examples/common/tetris_sim.rs` (Plan 607 T4a).
// The oracle fixtures (`tests/fixtures/tetris_oracle_laya_en_v{2,3}.jsonl`
// in katgpt-rs) were generated THROUGH this grammar, so every clause, band
// boundary, tie-break and enumeration order here must match the Rust
// byte-for-byte; `tetris_golden.test.mjs` asserts that against both
// fixtures. v2 and v3 differ ONLY in the drop rule (katgpt-rs Issue 884).
// The site serves v3, so the rule defaults to FROM_TOP here (the Rust sim
// defaults to v2's DEEPEST_FIT so its pinned dump digest reproduces).

export const WIDTH = 10;
export const HEIGHT = 20;

// ── Board ────────────────────────────────────────────────────────────────

export function emptyBoard() {
  return Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(false));
}

export function fromStrings(rows) {
  const b = emptyBoard();
  for (let r = 0; r < HEIGHT && r < rows.length; r++) {
    for (let c = 0; c < WIDTH && c < rows[r].length; c++) {
      b[r][c] = rows[r][c] === "#";
    }
  }
  return b;
}

export function cell(b, r, c) {
  return b[r][c];
}

// Column height = occupied cells counted from the floor (0 for an empty
// column).
export function colHeight(b, c) {
  for (let r = 0; r < HEIGHT; r++) {
    if (b[r][c]) return HEIGHT - r;
  }
  return 0;
}

export function heights(b) {
  const h = new Array(WIDTH);
  for (let c = 0; c < WIDTH; c++) h[c] = colHeight(b, c);
  return h;
}

export function holeCount(b) {
  let holes = 0;
  for (let c = 0; c < WIDTH; c++) {
    let seen = false;
    for (let r = 0; r < HEIGHT; r++) {
      if (b[r][c]) seen = true;
      else if (seen) holes += 1;
    }
  }
  return holes;
}

// Place absolute (row, col) cells. Rows are NOT cleared.
export function place(b, cells) {
  for (const [r, c] of cells) b[r][c] = true;
}

export function fullRows(b) {
  const out = [];
  for (let r = 0; r < HEIGHT; r++) {
    let full = true;
    for (let c = 0; c < WIDTH; c++) {
      if (!b[r][c]) {
        full = false;
        break;
      }
    }
    if (full) out.push(r);
  }
  return out;
}

// Clear `rows` (each cleared row pulls everything above it down by one).
export function clearRows(b, rows) {
  for (const r of rows) {
    for (let rr = r; rr >= 1; rr--) {
      b[rr] = b[rr - 1];
    }
    b[0] = Array(WIDTH).fill(false);
  }
}

// ── Pieces ───────────────────────────────────────────────────────────────

// id order is the Rust `Piece::ALL` order (the fixture's `piece` field).
export const PIECES = ["I", "O", "T", "S", "Z", "J", "L"];

const SPOKEN = {
  I: "long straight",
  O: "square",
  T: "T shaped",
  S: "S shaped",
  Z: "Z shaped",
  J: "left leaning ell",
  L: "right leaning ell",
};

export function spoken(p) {
  return SPOKEN[p];
}

const BASE = {
  I: [
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
  ],
  O: [
    [0, 1],
    [0, 2],
    [1, 1],
    [1, 2],
  ],
  T: [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  S: [
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
  ],
  Z: [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
  J: [
    [0, 0],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  L: [
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
};

// Rotate (dy, dx) clockwise inside a 4-box: (dy, dx) -> (dx, 3-dy).
function rotate(cells) {
  return cells.map(([dy, dx]) => [dx, 3 - dy]);
}

// Shift cells so min dy/dx are 0, then sort (canonical form).
function normalize(cells) {
  const minDy = Math.min(...cells.map((c) => c[0]));
  const minDx = Math.min(...cells.map((c) => c[1]));
  const v = cells.map(([dy, dx]) => [dy - minDy, dx - minDx]);
  v.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return v;
}

function sameCells(a, b) {
  return a.length === b.length && a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1]);
}

// Distinct rotations as cell-offset lists (dy, dx), deduped, order pinned
// (rotation counterclockwise from base; I: 2, O: 1, rest: 4).
export function rotations(p) {
  const dim = 4;
  let cur = BASE[p].map((c) => [...c]);
  const out = [];
  for (let i = 0; i < 4; i++) {
    const norm = normalize(cur);
    if (!out.some((o) => sameCells(o, norm))) out.push(norm);
    cur = rotate(cur);
  }
  return out;
}

// ── Landing enumeration (hard-drop semantics) ────────────────────────────

// Is the piece at bounding-box top-left (row, col) collision-free?
function fits(b, cells, row, col) {
  return cells.every(([dy, dx]) => {
    const r = row + dy;
    const c = col + dx;
    return c < WIDTH && r < HEIGHT && !b[r][c];
  });
}

// How a piece comes to rest — the one axis v2 and v3 differ on (Rust
// `DropRule`). DEEPEST_FIT (v2, pinned): the deepest collision-free row,
// scanning bottom-up, so a piece tunnels through a roof into the cave below.
// FROM_TOP (v3): a real hard drop — spawn at row 0, descend while the next
// row is free; a column whose top is blocked has no landing.
export const DropRule = Object.freeze({ DEEPEST_FIT: "deepest_fit", FROM_TOP: "from_top" });

// Hard drop down column `col` under `rule`. null when there is no landing.
export function hardDrop(b, cells, col, rule = DropRule.FROM_TOP) {
  let rest = null;
  if (rule === DropRule.DEEPEST_FIT) {
    for (let row = HEIGHT - 1; row >= 0; row--) {
      if (fits(b, cells, row, col)) {
        rest = row;
        break;
      }
    }
  } else if (fits(b, cells, 0, col)) {
    rest = 0;
    while (rest + 1 < HEIGHT && fits(b, cells, rest + 1, col)) rest += 1;
  }
  if (rest === null) return null;
  const cellsAbs = cells.map(([dy, dx]) => [rest + dy, col + dx]);
  cellsAbs.sort((a, b2) => a[0] - b2[0] || a[1] - b2[1]);
  return { rot: 0, col, row: rest, cells: cellsAbs };
}

// Every distinct hard-drop landing for `piece` on `board`, pinned order:
// rotation ascending, then column ascending — the option ORDER the fixture
// freezes (argmax indexes refer to it).
export function landingOptions(b, piece, rule = DropRule.FROM_TOP) {
  const out = [];
  const rots = rotations(piece);
  for (let ri = 0; ri < rots.length; ri++) {
    const cells = rots[ri];
    const width = Math.max(...cells.map((c) => c[1])) + 1;
    for (let col = 0; col <= WIDTH - width; col++) {
      const p = hardDrop(b, cells, col, rule);
      if (p) {
        p.rot = ri;
        out.push(p);
      }
    }
  }
  return out;
}

// ── Dellacherie-class outcome features ───────────────────────────────────

// Post-landing outcome features for one placement (post-placement,
// pre-clear). Field names match the Rust `OutcomeFeatures` (the fixture's
// `features` object).
export function outcomeFeatures(b, p) {
  const holesBefore = holeCount(b);
  const after = b.map((row) => [...row]);
  place(after, p.cells);
  const full = fullRows(after);

  const hs = heights(after);
  let maxH = 0;
  let agg = 0;
  for (const h of hs) {
    if (h > maxH) maxH = h;
    agg += h;
  }
  let bumpiness = 0;
  for (let i = 1; i < WIDTH; i++) bumpiness += Math.abs(hs[i] - hs[i - 1]);

  const holesAfter = holeCount(after);

  // Row transitions: per row, flank changes; walls read as filled.
  let rowTransitions = 0;
  for (let r = 0; r < HEIGHT; r++) {
    let prev = true;
    for (let c = 0; c < WIDTH; c++) {
      const cur = after[r][c];
      if (cur !== prev) rowTransitions += 1;
      prev = cur;
    }
    if (!prev) rowTransitions += 1;
  }

  // Column transitions: per column, flank changes; floor reads filled

  // (prev starts at the empty sky, and the floor boundary tails
  // `if !prev` — verified against the fixture: 10 transitions on any

  // 10-wide board whose columns all end uniform).

  let colTransitions = 0;
  for (let c = 0; c < WIDTH; c++) {
    let prev = false;
    for (let r = 0; r < HEIGHT; r++) {
      const cur = after[r][c];
      if (cur !== prev) colTransitions += 1;
      prev = cur;
    }
    if (!prev) colTransitions += 1;
  }

  // Wells: a column below both neighbours is a well of depth d =
  // min(neighbours) − h; each contributes 1+2+…+d.
  let cumulativeWells = 0;
  for (let c = 0; c < WIDTH; c++) {
    const h = hs[c];
    const left = c === 0 ? Infinity : hs[c - 1];
    const right = c === WIDTH - 1 ? Infinity : hs[c + 1];
    if (left > h && right > h) {
      const d = Math.min(left, right) - h;
      cumulativeWells += (d * (d + 1)) / 2;
    }
  }

  const pieceRows = new Set(p.cells.map(([r]) => r));
  let erodedCells = 0;
  for (const [r] of p.cells) {
    if (pieceRows.has(r) && full.includes(r)) erodedCells += 1;
  }

  let landingSum = 0;
  for (const [r] of p.cells) landingSum += HEIGHT - r;
  const landingHeight = landingSum / p.cells.length;

  return {
    lines_cleared: full.length,
    holes: holesAfter,
    holes_delta: holesAfter - holesBefore,
    bumpiness,
    max_height: maxH,
    aggregate_height: agg,
    landing_height: landingHeight,
    row_transitions: rowTransitions,
    col_transitions: colTransitions,
    cumulative_wells: cumulativeWells,
    eroded_cells: erodedCells,
  };
}

// Classic Dellacherie weights (the arena's heuristic baseline).
export const DELLACHERIE_WEIGHTS = [
  -4.5001583, // landing height
  3.4181268, // eroded piece cells
  -3.2178884, // row transitions
  -9.348696, // col transitions
  -7.8992653, // holes
  -3.3855972, // cumulative wells
];

export function dellacherieScore(f) {
  return (
    DELLACHERIE_WEIGHTS[0] * f.landing_height +
    DELLACHERIE_WEIGHTS[1] * f.eroded_cells +
    DELLACHERIE_WEIGHTS[2] * f.row_transitions +
    DELLACHERIE_WEIGHTS[3] * f.col_transitions +
    DELLACHERIE_WEIGHTS[4] * f.holes +
    DELLACHERIE_WEIGHTS[5] * f.cumulative_wells
  );
}

// ── The pinned sentence grammar (`laya-tetris-v2`) ───────────────────────

export const GRAMMAR_ID_V2 = "laya-tetris-v2";
export const GRAMMAR_ID_V3 = "laya-tetris-v3";
// The grammar this site serves (recorded walks, the wasm head, live play).
export const GRAMMAR_ID = GRAMMAR_ID_V3;

// Grammar id → drop rule (null for an unknown id).
export function dropRuleOf(grammarId) {
  if (grammarId === GRAMMAR_ID_V2) return DropRule.DEEPEST_FIT;
  if (grammarId === GRAMMAR_ID_V3) return DropRule.FROM_TOP;
  return null;
}

// The per-spot question, world-anchored (never "what should I do"). P(clean)
// is the decision signal.
export const SPOT_QUESTION = "Does the stack look clean?";

// How the resting piece meets the pre-placement surface.
function bumpBand(b, p) {
  const pieceCols = [...new Set(p.cells.map(([, c]) => c))].sort((a, b2) => a - b2);
  const topOfPiece = Math.min(...p.cells.map(([r]) => r));
  const hs = heights(b);

  // Flank heights: the columns just outside the span, plus any interior
  // column of the span that sits below both of ITS piece-covered
  // neighbours by ≥ 2 (the piece bridges over it — reads as a gap).
  const first = pieceCols[0];
  const last = pieceCols[pieceCols.length - 1];
  let gapUnder = false;
  const flanks = [];
  if (first > 0) flanks.push(hs[first - 1]);
  if (last + 1 < WIDTH) flanks.push(hs[last + 1]);
  for (let i = 0; i < pieceCols.length; i++) {
    const h = hs[pieceCols[i]];
    if (i > 0 && h + 2 <= hs[pieceCols[i - 1]]) gapUnder = true;
    if (i + 1 < pieceCols.length && h + 2 <= hs[pieceCols[i + 1]]) gapUnder = true;
  }
  if (gapUnder) return "gap";
  if (flanks.length === 0) return "flat";
  const pieceTopHeight = HEIGHT - topOfPiece; // piece top, floor-relative
  const maxFlank = Math.max(...flanks);
  if (flanks.every((h) => pieceTopHeight + 2 <= h)) return "gap";
  const diff = pieceTopHeight - maxFlank;
  if (diff <= 1) return "flat";
  if (diff <= 3) return "small";
  return "tall";
}

const SIDE_CLAUSES = {
  leftEdge: "on the left edge",
  leftSide: "on the left side",
  middle: "in the middle",
  rightSide: "on the right side",
  rightEdge: "on the right edge",
};

// Band from the placement's column-span center (WIDTH=10: two columns per
// band).
function sideBand(center) {
  if (center <= 1) return "leftEdge";
  if (center <= 3) return "leftSide";
  if (center <= 5) return "middle";
  if (center <= 7) return "rightSide";
  return "rightEdge";
}

const HEIGHT_CLAUSES = {
  low: "the stack stays low",
  medium: "the stack stands medium",
  tall: "the stack grows tall",
};

function heightBand(maxHeight) {
  if (maxHeight <= 6) return "low";
  if (maxHeight <= 11) return "medium";
  return "tall";
}

// Render the per-spot sentence — the exact v2 template:
// `The piece {holes} under it {side}, {surface}, and {height}{clears}.`
export function renderSpotSentence(b, p, f) {
  let holesClause;
  if (f.holes_delta === 0) holesClause = "leaves no holes";
  else if (f.holes_delta === 1) holesClause = "leaves one hole";
  else if (f.holes_delta === 2) holesClause = "leaves two holes";
  else if (f.holes_delta <= 4) holesClause = "leaves a few holes";
  else holesClause = "leaves many holes";

  const band = bumpBand(b, p);
  const surfaceClause =
    band === "flat"
      ? "sits flat on the surface"
      : band === "small"
        ? "makes a small bump on top"
        : band === "tall"
          ? "makes a tall step on top"
          : "fills a deep gap";

  const cols = p.cells.map(([, c]) => c).sort((a, b2) => a - b2);
  const center = Math.floor((cols[0] + cols[cols.length - 1]) / 2);
  const sideClause = SIDE_CLAUSES[sideBand(center)];
  const heightClause = HEIGHT_CLAUSES[heightBand(f.max_height)];

  let clearsClause = "";
  if (f.lines_cleared === 1) clearsClause = ", and clears a line";
  else if (f.lines_cleared === 2) clearsClause = ", and clears two lines";
  else if (f.lines_cleared === 3) clearsClause = ", and clears three lines";
  else if (f.lines_cleared >= 4) clearsClause = ", and clears four lines";

  return `The piece ${holesClause} under it ${sideClause}, ${surfaceClause}, and ${heightClause}${clearsClause}.`;
}

// The state context sentence (board-level facts, all in words).
export function renderStateSentence(b, piece) {
  const hs = heights(b);
  let maxH = 0;
  for (const h of hs) if (h > maxH) maxH = h;
  const avg = (lo, hi) => {
    let s = 0;
    for (let c = lo; c < hi; c++) s += hs[c];
    return Math.floor(s / (hi - lo));
  };
  const l = avg(0, 3);
  const m = avg(3, 7);
  const r = avg(7, 10);
  const heightWord = maxH <= 4 ? "low" : maxH <= 10 ? "of medium height" : "tall";

  let s;
  const spread = Math.max(l, m, r) - Math.min(l, m, r);
  if (spread >= 3) {
    const v = [
      [l, "left"],
      [m, "middle"],
      [r, "right"],
    ];
    // Rust sort_unstable_by_key: ascending by value; ties keep a stable
    // order here because the keys are distinct in the spread>=3 branch only
    // when two region means tie — match Rust's unstable sort by also
    // comparing names (Rust's pattern for equal keys is unspecified; the
    // fixture exercise shows no equal-key case reaches the branch).
    v.sort((a, b2) => a[0] - b2[0]);
    const tallest = v[2][1];
    const lowest = v[0][1];
    s = `The stack stands ${heightWord}, tall on the ${tallest} and low on the ${lowest}. `;
  } else {
    s = `The stack stands ${heightWord} and the surface is mostly flat. `;
  }

  const holes = holeCount(b);
  let holesClause;
  if (holes === 0) holesClause = "There are no holes under the blocks.";
  else if (holes === 1) holesClause = "There is one hole under the blocks.";
  else if (holes === 2) holesClause = "There are two holes under the blocks.";
  else if (holes <= 4) holesClause = "There are a few holes under the blocks.";
  else holesClause = "There are many holes under the blocks.";
  s += holesClause + " ";
  s += `The ${spoken(piece)} piece is falling.`;
  return s;
}

// ── One decision turn (the arena's per-piece flow) ───────────────────────

// Enumerate the piece's options and build the laya request set: one noul
// question per spot (the spot sentence IS the state), exactly the T0b
// oracle protocol.
export function buildTurn(board, piece, rule = DropRule.FROM_TOP) {
  const opts = landingOptions(board, piece, rule);
  return opts.map((p, i) => {
    const f = outcomeFeatures(board, p);
    return {
      index: i,
      rot: p.rot,
      col: p.col,
      row: p.row,
      cells: p.cells,
      features: f,
      sentence: renderSpotSentence(board, p, f),
      stateSentence: renderStateSentence(board, piece),
    };
  });
}

// Place the chosen option, clear full rows; returns the cleared count.
export function commitPlacement(board, opt) {
  place(board, opt.cells);
  const full = fullRows(board);
  if (full.length) clearRows(board, full);
  return full.length;
}
