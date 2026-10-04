// flow_walk_tetris.js — the Tetris board side panel for the arena's two
// rulebook figures ("Reflex · rulebook" search + "The rulebook's modes"), a
// plug-in of the family step-through (assets/flow_walk.js; design guide §8.4
// "a side panel is a plug-in"). Loaded on demand by flow_walk.js for a
// figure carrying data-walk-panel="tetris".
//
// The boards are never hand-drawn: they are replayed from the arena's real
// recorded rulebook walk (arena/demo_oracle.json `tetris_rulebook_walk`,
// seed 607 — the same record scripts/reflexer_parity.mjs checks the engine
// against, using the site's own games/tetris.js enumeration). The chosen
// spot per step, the candidate ghosts (brightness = the record's own
// per-spot score) and the piece colors all come from that record, so the
// illustration cannot drift from what the engine actually played.
//
// These figures are still mermaid SVGs (render_flows.py's legacy path), so
// the steps name mermaid node / edge ids; Plan 620 P2 (group A) moves them to
// gfflow + .walk.json and this panel keeps only the board.

import { registerPanel } from "./flow_walk.js";
import * as T from "./games/tetris.js";
import {
  PIECE_COLORS,
  UNKNOWN_COLOR,
  withAlpha,
  newStampGrid,
  clearRowsGrid,
  streamPieces,
} from "./games/tetris_view.js";

const WALK_KEY = "tetris_rulebook_walk";
const META_KEY = "tetris_rulebook";
const GHOST = "rgb(233, 236, 242)"; // candidate ghosts: the family --text white — MUST stay
// rgb(...) form: withAlpha() expands only "rgb(" strings (the opaque-white bug)

// Chrome colors follow the family tokens (assets/family.css), resolved by the
// CSS engine at paint time — so the walk re-themes with the page and never
// carries a second copy of the palette (reflex-site Issue 009 T4). Piece
// cells keep the games palette; only chrome + highlights live here.
const C = {
  boardBg: "var(--bg-2)",
  boardLine: "var(--line-2)",
  grid: "color-mix(in srgb, var(--text) 5%, transparent)",
  flash: "color-mix(in srgb, var(--text) 28%, transparent)",
  accent: "var(--accent)",
};

// ── the real record → replayed states ───────────────────────────────────

async function loadRecord() {
  const r = await fetch("/arena/demo_oracle.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`demo_oracle.json → ${r.status}`);
  const oracle = await r.json();
  const walk = oracle[WALK_KEY];
  const meta = oracle._meta?.sources?.[META_KEY];
  if (!Array.isArray(walk) || walk.length < 10 || !meta?.stream) {
    throw new Error("tetris_rulebook_walk record missing/short");
  }
  const pieces = streamPieces(meta.stream, meta.seed, walk.length + 1);
  const board = T.emptyBoard();
  const stamps = newStampGrid();
  const states = [];
  for (let k = 0; k < walk.length; k++) {
    const [, ps, piece, , pick] = walk[k];
    const opts = T.buildTurn(board, piece);
    if (pick < 0 || pick >= opts.length) throw new Error(`turn ${k}: bad pick`);
    states.push({
      k,
      piece,
      next: pieces[k + 1],
      opts,
      ps,
      pick,
      board: board.map((row) => [...row]),
      stamps: stamps.map((row) => [...row]),
      holes: T.holeCount(board),
      heights: T.heights(board),
    });
    const opt = opts[pick];
    for (const [rr, cc] of opt.cells) stamps[rr][cc] = piece; // stamp pre-clear
    T.place(board, opt.cells);
    const full = T.fullRows(board);
    states[states.length - 1].postPlace = full.length
      ? {
          board: board.map((row) => [...row]),
          stamps: stamps.map((row) => [...row]),
          full,
          piece,
          cells: opt.cells,
        }
      : null;
    states[states.length - 1].cleared = full.length;
    if (full.length) {
      T.clearRows(board, full);
      clearRowsGrid(stamps, full, null);
    }
  }
  return { states, meta };
}

// ── per-step board specs, all derived from the replayed record ──────────

function spawnCells(piece, rot, col) {
  return T.rotations(piece)[rot].map(([dy, dx]) => [dy, col + dx]);
}

function holeCells(state) {
  const out = [];
  for (let c = 0; c < T.WIDTH; c++) {
    let seen = false;
    for (let r = 0; r < T.HEIGHT; r++) {
      if (state.board[r][c]) seen = true;
      else if (seen) out.push([r, c]);
    }
  }
  return out;
}

function wellOf(heightsArr) {
  // the champion keeps ONE open well — the deepest column wins, ties
  // prefer the right edge (the doc's 9-1 shape)
  let col = 0;
  for (let c = 1; c < T.WIDTH; c++) {
    if (heightsArr[c] <= heightsArr[col]) col = c;
  }
  return col;
}

// a representative clean, flat "build" position: flat 9 + deep well, few holes
function pickBuildState(states) {
  let best = null;
  for (const s of states) {
    const h = s.heights;
    const nine = h.slice(0, 9);
    const flat = Math.max(...nine) - Math.min(...nine);
    const well = Math.min(...nine) - h[9];
    const score = well * 3 - flat * 4 - s.holes * 2;
    if (!best || score > best.score) best = { s, score };
  }
  return best.s;
}

function pickDownstackState(states) {
  let best = states[0];
  for (const s of states) if (s.holes > best.holes) best = s;
  return best;
}

function pickSurviveState(states) {
  let best = states[0];
  for (const s of states) {
    if (Math.max(...s.heights) > Math.max(...best.heights)) best = s;
  }
  return best;
}

function pickRecoveryState(states, after) {
  const startIdx = after.k + 1;
  let fallback = null;
  for (const s of states) {
    if (s.k <= startIdx) continue;
    const maxH = Math.max(...s.heights);
    const rank = s.holes * 3 + maxH;
    if (!fallback || rank < fallback.rank) fallback = { s, rank };
    if (s.holes <= 1 && maxH <= 8) return s;
  }
  return fallback ? fallback.s : pickBuildState(states);
}

// the recorded turn with the biggest clear (a tetris when one exists)
function pickClearTurn(states) {
  let t = Math.min(8, states.length - 1);
  let bestClear = 0;
  for (const s of states) {
    if (s.cleared > bestClear) {
      bestClear = s.cleared;
      t = s.k;
    }
  }
  return { t, cleared: bestClear };
}

function ghostSpecs(state, { ranked }) {
  const maxPs = Math.max(...state.ps);
  return state.opts.map((o, i) => {
    const chosen = i === state.pick;
    const a = chosen ? 0.45 : ranked ? 0.06 + 0.3 * (state.ps[i] / maxPs) : 0.22;
    return { cells: o.cells, chosen, a };
  });
}

function baseBoard(state) {
  return { stamps: state.stamps, fallingPiece: state.piece, falling: null, ghosts: [], hl: [], minis: false, flashRows: null, twelve: false };
}

function rulebookSteps(states) {
  const { t, cleared } = pickClearTurn(states);
  const s = states[t];
  const chosenOpt = s.opts[s.pick];
  const falling = spawnCells(s.piece, chosenOpt.rot, chosenOpt.col);
  const PN = T.PIECES;
  const swatches = PN.map((p) => `<span class="fw-swatch" style="background:${PIECE_COLORS[p]}"></span>`).join("");

  const steps = [
    {
      nodes: ["flowchart-A-0"],
      title: "Look ahead — the falling piece",
      text: "The rulebook never reacts one piece at a time. It starts by listing every legal landing spot for the piece in play — every rotation in every column — and treats each one as a possible future board.",
      board: {
        ...baseBoard(s),
        falling,
        ghosts: ghostSpecs(s, { ranked: false }),
        hl: falling,
        chip: `The real seed-607 position — <b>${s.piece}</b> falls, <b>${s.opts.length} spots</b> to try (rotation × column)`,
      },
    },
    {
      nodes: ["flowchart-B-1"],
      edges: ["L_A_B_0"],
      title: "Chain the preview piece",
      text: "Each candidate board is paired with every landing spot of the preview piece — and the tree is pruned hard: only the best six boards survive each level, so the search stays tiny instead of exploding.",
      board: {
        ...baseBoard(s),
        falling,
        ghosts: ghostSpecs(s, { ranked: true }),
        hl: chosenOpt.cells,
        preview: s.next,
        chip: `The bright spot is the recorded pick; preview <b style="color:${PIECE_COLORS[s.next]}">${s.next}</b> chains on — best 6 kept`,
      },
    },
    {
      nodes: ["flowchart-C-2"],
      edges: ["L_B_C_0"],
      title: "Cover the unknown third piece",
      text: "The piece after that is not known yet. Rather than gamble on a single guess, the plan plays out every piece the bag could still deal — the search branches over all of them.",
      board: {
        ...baseBoard(s),
        falling,
        ghosts: ghostSpecs(s, { ranked: true }),
        minis: true,
        chip: `The third piece is unknown — the plan branches over all 7: ${swatches}`,
      },
    },
    {
      nodes: ["flowchart-V-3"],
      edges: ["L_C_V_0"],
      title: "Score every end board",
      text: "Each final board is scored by the strategy rulebook — holes, bumpiness, stack height, wells, lines cleared — the instincts of a careful human player, written as numbers.",
      board: {
        ...baseBoard(s),
        falling,
        ghosts: ghostSpecs(s, { ranked: true }),
        hl: chosenOpt.cells,
        chip: "Brighter ghost = <b>higher score</b> — the record's own per-spot scores",
      },
    },
    {
      nodes: ["flowchart-G-4"],
      edges: ["L_V_G_0"],
      title: "Average over the unknown · pick the plan",
      text: "A plan is only as good as its worst realistic draw: scores are averaged across the possible third pieces, so a line-clear that needs the I-piece rates low — it usually does not come. The sturdiest plan wins.",
      board: {
        ...baseBoard(s),
        falling,
        ghosts: ghostSpecs(s, { ranked: true }),
        hl: chosenOpt.cells,
        chip: `Averaged over the unknown, the <b>${s.piece}</b> at col ${chosenOpt.col} is the sturdiest recorded plan`,
      },
    },
    {
      nodes: ["flowchart-P-5"],
      edges: ["L_G_P_0"],
      title: "Play the first move — then re-plan",
      text: "Only the winning plan's first move is played; the very next piece restarts the whole search from scratch. All of it runs in about 0.35 ms — a thousand-plus searches would fit inside one 60 Hz frame.",
      board: s.postPlace
        ? {
            ...baseBoard(s),
            stamps: s.postPlace.stamps,
            hl: s.postPlace.cells,
            flashRows: s.postPlace.full,
            chip: `The pick just landed — <b>${cleared ? cleared + " line" + (cleared > 1 ? "s" : "") + " cleared" : "no clear"}</b>, and the next piece restarts the search`,
          }
        : null,
    },
  ];
  return { steps, buildState: pickBuildState(states), states };
}

function modesSteps(states, buildState) {
  const down = pickDownstackState(states);
  const survive = pickSurviveState(states);
  const recovery = pickRecoveryState(states, survive.k > down.k ? survive : down);
  const holes = holeCells(down);
  const wellCol = wellOf(buildState.heights);
  const wellCells = [];
  for (let r = T.HEIGHT - buildState.heights[wellCol]; r < T.HEIGHT; r++) wellCells.push([r, wellCol]);
  const surface = (st) => {
    const out = [];
    for (let c = 0; c < T.WIDTH; c++) {
      for (let r = 0; r < T.HEIGHT; r++) {
        if (st.board[r][c]) { out.push([r, c]); break; }
      }
    }
    return out;
  };

  const steps = [
    {
      nodes: ["flowchart-BU-0"],
      title: "BUILD — the default mode",
      text: "On a clean, low stack it builds a 9-1 stack: nine columns packed flat plus one open well on the right edge, saving I-pieces to clear four lines at once. The 9-1 shape was self-evolved — nobody hand-coded it; it fell out of the training climb.",
      board: {
        ...baseBoard(buildState),
        hl: wellCells,
        twelve: false,
        chip: `A real build position — 9 flat, the open well (col ${wellCol + 1}) stays clear for the I`,
      },
    },
    {
      nodes: ["flowchart-DS-1"],
      edges: ["L_BU_DS_0"],
      title: "Trouble #1 — covered holes → DOWNSTACK",
      text: "Three or more holes buried under the stack and building stops paying: every new piece makes it worse. The mode flips to DOWNSTACK, which deliberately clears the lines sitting above the holes to dig them back out.",
      board: {
        ...baseBoard(down),
        hl: holes,
        chip: `The ringed gaps are <b>${holes.length} covered holes</b> — 3+ flips to DOWNSTACK`,
      },
    },
    {
      nodes: ["flowchart-SV-2"],
      edges: ["L_BU_SV_0"],
      title: "Trouble #2 — tall stack → SURVIVE",
      text: "A stack twelve rows high is one bad piece from topping out. SURVIVE takes any line it can and keeps the board low — scoring gives way to staying alive. (Survive wins when both exits fire at once.)",
      board: {
        ...baseBoard(survive),
        hl: surface(survive),
        twelve: true,
        chip: `The tallest recorded position — <b>${Math.max(...survive.heights)} rows</b> high vs the 12-row trigger line`,
      },
    },
    {
      nodes: ["flowchart-BU-0"],
      edges: ["L_DS_BU_0", "L_SV_BU_0"],
      title: "Recovery — both modes hand back to BUILD",
      text: "Holes dug out, or the stack back under twelve — either way the mode returns to BUILD and the cycle starts over. The board is re-read before every single piece, so the switch is never late.",
      board: {
        ...baseBoard(recovery),
        hl: surface(recovery),
        chip: `Back to ${recovery.holes} hole${recovery.holes === 1 ? "" : "s"} and ${Math.max(...recovery.heights)} rows — BUILD takes over again`,
      },
    },
    {
      nodes: ["flowchart-BU-0", "flowchart-DS-1", "flowchart-SV-2"],
      title: "One search, three weights",
      text: "The modes are not three different AIs — it is the same placement search wearing different score weights: self-evolved builder weights while safe, proven survival weights in trouble. That is the whole trick behind the rulebook lane.",
      board: {
        ...baseBoard(buildState),
        chip: "One search — BUILD vs SURVIVE is only a different set of score weights",
      },
    },
  ];
  return { steps };
}

// ── the mini board renderer ──────────────────────────────────────────────

const NS = "http://www.w3.org/2000/svg";
const CELL = 12;
const PAD = 5;

function svgEl(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
}

function cellRect(r, c, fill, cls, extra) {
  const rect = svgEl("rect", {
    x: PAD + c * CELL + 0.5,
    y: PAD + r * CELL + 0.5,
    width: CELL - 1,
    height: CELL - 1,
    rx: 2,
    fill,
    ...(cls ? { class: cls } : {}),
    ...(extra || {}),
  });
  return rect;
}

function boardSVG(spec) {
  const W = PAD * 2 + T.WIDTH * CELL;
  const H = PAD * 2 + T.HEIGHT * CELL;
  const minisH = spec.minis ? 16 : 0;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H + minisH}`,
    width: W,
    height: H + minisH,
    role: "img",
    "aria-label": "mini tetris board showing the recorded position for this step",
  });
  svg.appendChild(svgEl("rect", { x: 0.5, y: 0.5, width: W - 1, height: H - 1, rx: 6, style: `fill:${C.boardBg};stroke:${C.boardLine}` }));

  // faint grid
  const grid = svgEl("g", { style: `stroke:${C.grid}` });
  for (let c = 1; c < T.WIDTH; c++) grid.appendChild(svgEl("line", { x1: PAD + c * CELL, y1: PAD, x2: PAD + c * CELL, y2: H - PAD }));
  for (let r = 1; r < T.HEIGHT; r++) grid.appendChild(svgEl("line", { x1: PAD, y1: PAD + r * CELL, x2: W - PAD, y2: PAD + r * CELL }));
  svg.appendChild(grid);

  // the stack (recorded stamps — null stamps keep the honest unknown color)
  for (let r = 0; r < T.HEIGHT; r++) {
    for (let c = 0; c < T.WIDTH; c++) {
      const p = spec.stamps?.[r]?.[c];
      if (p) svg.appendChild(cellRect(r, c, PIECE_COLORS[p] ?? UNKNOWN_COLOR, null, { "data-cell": p }));
    }
  }

  // candidate ghosts — resting ≤ 50% alpha, brightness = the record's own
  // per-spot score; on top, a fast sequential scan (transparent → full, one
  // spot at a time in the engine's own option order) so the search's
  // spot-by-spot trying is visible. Flash layer is a second rect so the
  // static brightness still reads between flashes.
  const nOpts = (spec.ghosts || []).length;
  const TRY_PER_MS = 90; // fast scan: ~90 ms per spot
  const tryDur = nOpts * TRY_PER_MS;
  for (const [i, g] of (spec.ghosts || []).entries()) {
    const color = g.chosen ? PIECE_COLORS[spec.fallingPiece] ?? GHOST : GHOST;
    for (const [r, c] of g.cells) {
      svg.appendChild(cellRect(r, c, withAlpha(color, g.a), "fw-ghost", { "data-ghost": g.chosen ? "chosen" : "cand" }));
      const flash = cellRect(r, c, withAlpha(color, 0.95), "fw-try", { "data-try": "" });
      // negative delay starts the cycle mid-way: spot i flashes at i*90 ms
      flash.style.setProperty("--try-delay", `${-i * TRY_PER_MS}ms`);
      flash.style.setProperty("--try-dur", `${tryDur}ms`);
      svg.appendChild(flash);
      if (g.chosen) {
        svg.appendChild(
          svgEl("rect", {
            x: PAD + c * CELL + 0.5,
            y: PAD + r * CELL + 0.5,
            width: CELL - 1,
            height: CELL - 1,
            rx: 2,
            fill: "none",
            stroke: withAlpha(color, 0.95),
            "stroke-width": 1.4,
          }),
        );
      }
    }
  }

  // the falling piece at its spawn, in its own color
  if (spec.falling) {
    for (const [r, c] of spec.falling) {
      if (r >= 0 && r < T.HEIGHT) svg.appendChild(cellRect(r, c, PIECE_COLORS[spec.fallingPiece] ?? UNKNOWN_COLOR, null, { "data-fall": "" }));
    }
  }

  // step highlight: pulsing ember ring on the cells the step talks about
  for (const [r, c] of spec.hl || []) {
    svg.appendChild(
      svgEl("rect", {
        x: PAD + c * CELL - 0.5,
        y: PAD + r * CELL - 0.5,
        width: CELL + 1,
        height: CELL + 1,
        rx: 2.5,
        fill: "none",
        style: `stroke:${C.accent}`,
        "stroke-width": 1.8,
        class: "fw-hl",
        "data-hl": "",
      }),
    );
  }

  // cleared-row flash + the 12-row trigger line
  for (const r of spec.flashRows || []) {
    svg.appendChild(svgEl("rect", { x: PAD, y: PAD + r * CELL, width: T.WIDTH * CELL, height: CELL, style: `fill:${C.flash}`, class: "fw-hl", "data-flash": "" }));
  }
  if (spec.twelve) {
    const y = PAD + (T.HEIGHT - 12) * CELL;
    svg.appendChild(svgEl("line", { x1: PAD, y1: y, x2: W - PAD, y2: y, style: `stroke:${C.accent}`, "stroke-dasharray": "4 3", "stroke-width": 1.2, "data-twelve": "" }));
    const label = svgEl("text", { x: W - PAD - 2, y: y - 3, "text-anchor": "end", style: `fill:${C.accent}`, "font-size": 11, "font-family": "ui-monospace,Menlo,monospace" });
    label.textContent = "12 rows";
    svg.appendChild(label);
  }

  // the 7 unknowns row (branch step)
  if (spec.minis) {
    const shapes = { I: [[0, 0], [0, 1], [0, 2], [0, 3]], O: [[0, 0], [0, 1], [1, 0], [1, 1]], T: [[0, 0], [0, 1], [0, 2], [1, 1]], S: [[0, 1], [0, 2], [1, 0], [1, 1]], Z: [[0, 0], [0, 1], [1, 1], [1, 2]], J: [[0, 0], [1, 0], [1, 1], [1, 2]], L: [[0, 2], [1, 0], [1, 1], [1, 2]] };
    const mc = 3.5; // mini cell — 7 shapes must fit the board's width
    const stride = (W - 2 * PAD) / T.PIECES.length;
    T.PIECES.forEach((p, i) => {
      for (const [dy, dx] of shapes[p]) {
        svg.appendChild(svgEl("rect", {
          x: PAD + i * stride + dx * mc,
          y: H + 5 + dy * mc,
          width: mc - 0.5,
          height: mc - 0.5,
          rx: 1,
          fill: PIECE_COLORS[p],
          "data-mini": p,
        }));
      }
    });
  }
  return svg;
}

function setBoard(host, spec, fallbackText) {
  host.replaceChildren();
  if (!spec) {
    const p = document.createElement("p");
    p.className = "fw-board-chip";
    p.textContent = fallbackText;
    host.appendChild(p);
    return;
  }
  host.appendChild(boardSVG(spec));
  const chip = document.createElement("p");
  chip.className = "fw-board-chip";
  chip.innerHTML = spec.chip || "";
  host.appendChild(chip);
}

// ── the step scripts (flow text unchanged; boards come from the record) ──

const STATIC_WALKS = {
  "tetris_flow_rulebook.svg": {
    intro:
      "No model, no sentences — the rulebook lane searches placements and scores boards with a fixed strategy rulebook. Press play to walk the six steps, or click a dot to jump.",
    introChip: "The real seed-607 recorded position the steps walk through",
  },
  "tetris_flow_modes.svg": {
    intro:
      "Before every piece the rulebook re-reads the board and picks a mode. Press play to walk the full build → trouble → recover cycle, or click a dot to jump.",
    introChip: "Real positions from the recorded seed-607 run",
  },
};

// one record load feeds both figures
let recordP = null;
function records() {
  recordP ??= loadRecord().then(({ states }) => {
    const rb = rulebookSteps(states);
    const md = modesSteps(rb.states, rb.buildState);
    return {
      "tetris_flow_rulebook.svg": rb.steps,
      "tetris_flow_modes.svg": md.steps,
    };
  });
  return recordP;
}

registerPanel("tetris", {
  // → the legacy (mermaid) walk config, or a throw: no record → the figure
  // stays the static <img> (the no-JS fallback)
  async walk(name) {
    const meta = STATIC_WALKS[name];
    if (!meta) return null;
    const steps = (await records())[name];
    if (!steps) return null;
    const introBoard = { ...steps[0].board, ghosts: [], chip: meta.introChip };
    return {
      ...meta,
      steps,
      autoplay: true,
      renderSide(host, cur) {
        setBoard(
          host,
          cur >= 0 ? steps[cur].board : introBoard,
          cur >= 0 ? "board unavailable — the recorded walk could not be replayed" : meta.introChip,
        );
      },
    };
  },
});
