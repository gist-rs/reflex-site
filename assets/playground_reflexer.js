/* Playground — Reflexer: ask the reflexer decision engine a Tetris
   question with NO install, on either host of the SAME wasm bytes:
   Cloudflare (the Worker, REFLEXER_CLOUD — the request leaves this tab) or
   this tab (WebAssembly — nothing leaves). The board is the site's own
   Tetris (assets/games), so the option list is buildTurn's and the answer's
   index lands exactly where the arena boards would play it. */

import * as T from "./games/tetris.js";
import { Rng } from "./games/rng.js";
import {
  REFLEXER_CLOUD, ensureReflexerLocal, probeReflexerCloud, reflexerPlace, reflexerState, latencyRange,
} from "./reflexer_lanes.js";
import { placeRequest } from "./reflexer_host.js";
import { PIECE_COLORS, UNKNOWN_COLOR, withAlpha, newStampGrid, clearRowsGrid } from "./games/tetris_view.js";

const $ = (id) => document.getElementById(id);
const lat = { cloud: [], local: [] };

// The editor's source of truth: the board plus, per filled cell, the piece
// that put it there (null = painted/typed by hand, drawn in the neutral
// UNKNOWN_COLOR). The textarea is a VIEW of `board`, and so is the canvas —
// every edit on either side goes through setBoard() and re-renders both.
let board = T.emptyBoard();
let stamps = newStampGrid();

function parseBoard(text) {
  const rows = text.split("\n").map((r) => r.trim()).filter((r) => r.length);
  if (rows.length !== T.HEIGHT || rows.some((r) => r.length !== T.WIDTH || /[^.#]/.test(r))) {
    throw new Error(`board must be ${T.HEIGHT} rows × ${T.WIDTH} chars of '.' / '#'`);
  }
  return T.fromStrings(rows);
}

const rowsOf = (b) => b.map((row) => row.map((c) => (c ? "#" : ".")).join(""));

// ── drawing (same palette + cell geometry as the arena boards) ───────────

// Size the backing store to the CSS box × devicePixelRatio and draw in CSS
// pixels, so the grid stays crisp on a retina screen.
function ctxOf(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || cv.width;
  const h = cv.clientHeight || cv.height;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function drawGrid(ctx, w, h, cols, rows) {
  const CW = w / cols;
  const CH = h / rows;
  ctx.strokeStyle = "rgba(58,33,23,0.6)";
  ctx.lineWidth = 1;
  for (let c = 1; c < cols; c++) {
    ctx.beginPath(); ctx.moveTo(c * CW, 0); ctx.lineTo(c * CW, h); ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CH); ctx.lineTo(w, r * CH); ctx.stroke();
  }
  return { CW, CH };
}

// A board (+ its stamps), optionally with the landing spot of `ghost`
// ({cells, piece}) in the piece's own color, outlined — "this piece lands
// here", exactly as the arena draws the chosen spot.
function drawBoard(cv, b, st, ghost) {
  const { ctx, w, h } = ctxOf(cv);
  const { CW, CH } = drawGrid(ctx, w, h, T.WIDTH, T.HEIGHT);
  for (let r = 0; r < T.HEIGHT; r++) {
    for (let c = 0; c < T.WIDTH; c++) {
      if (!b[r][c]) continue;
      const pc = st && st[r][c];
      ctx.fillStyle = (pc && PIECE_COLORS[pc]) || UNKNOWN_COLOR;
      ctx.fillRect(c * CW + 1, r * CH + 1, CW - 2, CH - 2);
    }
  }
  if (!ghost) return;
  ctx.fillStyle = withAlpha(PIECE_COLORS[ghost.piece] ?? UNKNOWN_COLOR, 0.92);
  for (const [r, c] of ghost.cells) ctx.fillRect(c * CW + 1, r * CH + 1, CW - 2, CH - 2);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;
  for (const [r, c] of ghost.cells) ctx.strokeRect(c * CW + 1, r * CH + 1, CW - 3, CH - 3);
}

// The piece in its spawn rotation, centered in a 4×4 box.
function drawPiece(cv, p) {
  const { ctx, w, h } = ctxOf(cv);
  const cells = T.rotations(p)[0];
  const rows = 1 + Math.max(...cells.map((c) => c[0]));
  const cols = 1 + Math.max(...cells.map((c) => c[1]));
  const S = Math.floor(Math.min(w, h) / 4);
  const ox = (w - cols * S) / 2;
  const oy = (h - rows * S) / 2;
  ctx.fillStyle = PIECE_COLORS[p] ?? UNKNOWN_COLOR;
  for (const [dy, dx] of cells) ctx.fillRect(ox + dx * S + 1, oy + dy * S + 1, S - 2, S - 2);
}

function renderPieces() {
  drawPiece($("rx-cur-view"), $("rx-cur").value);
  drawPiece($("rx-next-view"), $("rx-next").value);
}

// ── the editor: canvas ⇄ text, one board ─────────────────────────────────

function renderEditor() {
  drawBoard($("rx-canvas"), board, stamps, null);
}

function showBoardError(msg) {
  const err = $("rx-board-err");
  err.hidden = !msg;
  err.textContent = msg || "";
  $("rx-board").setAttribute("aria-invalid", msg ? "true" : "false");
}

// Any change of position invalidates the last answer's picture.
function staleAnswer() {
  drawBoard($("rx-answer-view"), board, stamps, null);
}

// Canvas-side edit → the text mirrors it.
function syncText() {
  $("rx-board").value = rowsOf(board).join("\n");
  showBoardError(null);
}

// Text-side edit → the canvas mirrors it (a cell the text still fills keeps
// its piece color; a newly typed '#' is hand-made, neutral).
function onText() {
  let b;
  try {
    b = parseBoard($("rx-board").value);
  } catch (e) {
    showBoardError(String(e.message));
    return;
  }
  showBoardError(null);
  for (let r = 0; r < T.HEIGHT; r++) {
    for (let c = 0; c < T.WIDTH; c++) {
      if (!b[r][c]) stamps[r][c] = null;
      else if (!board[r][c]) stamps[r][c] = null;
    }
  }
  board = b;
  renderEditor();
  staleAnswer();
}

// Drag to paint: the first cell under the pointer decides the stroke —
// empty → the stroke fills, filled → the stroke erases — and every cell the
// pointer crosses takes that value (a stroke never flickers a cell back).
function wirePainter() {
  const cv = $("rx-canvas");
  let fill = null;
  let last = "";
  const cellAt = (ev) => {
    const rect = cv.getBoundingClientRect();
    const c = Math.floor(((ev.clientX - rect.left) / rect.width) * T.WIDTH);
    const r = Math.floor(((ev.clientY - rect.top) / rect.height) * T.HEIGHT);
    return r >= 0 && r < T.HEIGHT && c >= 0 && c < T.WIDTH ? [r, c] : null;
  };
  const paint = (ev) => {
    const at = cellAt(ev);
    if (!at) return;
    const [r, c] = at;
    const key = `${r},${c}`;
    if (key === last) return;
    last = key;
    if (board[r][c] === fill) return;
    board[r][c] = fill;
    stamps[r][c] = null;
    renderEditor();
    syncText();
    staleAnswer();
  };
  cv.addEventListener("pointerdown", (ev) => {
    const at = cellAt(ev);
    if (!at) return;
    ev.preventDefault();
    cv.setPointerCapture(ev.pointerId);
    fill = !board[at[0]][at[1]];
    last = "";
    paint(ev);
  });
  cv.addEventListener("pointermove", (ev) => {
    if (fill !== null) paint(ev);
  });
  const end = () => {
    fill = null;
    last = "";
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
}

function setBoard(b, st) {
  board = b;
  stamps = st;
  syncText();
  renderEditor();
  staleAnswer();
}

// A plausible mid-game position: n random legal placements from empty,
// stamped by piece so the editor draws it in the arena's colors.
function randomBoard() {
  const rng = new Rng(Date.now() >>> 0);
  const b = T.emptyBoard();
  const st = newStampGrid();
  const n = 8 + rng.u32Below(14);
  for (let i = 0; i < n; i++) {
    const p = T.PIECES[rng.u32Below(7)];
    const opts = T.buildTurn(b, p);
    if (!opts.length) break;
    const opt = opts[rng.u32Below(opts.length)];
    T.place(b, opt.cells);
    for (const [r, c] of opt.cells) st[r][c] = p;
    const full = T.fullRows(b);
    if (full.length) {
      T.clearRows(b, full);
      clearRowsGrid(st, full, null);
    }
  }
  $("rx-cur").value = T.PIECES[rng.u32Below(7)];
  $("rx-next").value = T.PIECES[rng.u32Below(7)];
  renderPieces();
  setBoard(b, st);
}

function render(b, opt) {
  const cells = new Set((opt?.cells ?? []).map(([r, c]) => `${r},${c}`));
  const lines = b.map((row, r) =>
    row.map((c, k) => (cells.has(`${r},${k}`) ? "▓" : c ? "#" : "·")).join(""));
  return lines.join("\n");
}

async function ask(where) {
  const out = $("rx-answer");
  let board;
  try {
    board = parseBoard($("rx-board").value);
  } catch (e) {
    out.textContent = String(e.message);
    return;
  }
  const st = stamps.map((row) => [...row]);
  const cur = $("rx-cur").value;
  const next = $("rx-next").value;
  const opts = T.buildTurn(board, cur);
  if (!opts.length) {
    out.textContent = "top-out — no landing spot fits this piece";
    return;
  }
  const turn = { board: rowsOf(board), cur, next, bag: [], nOptions: opts.length };
  $("rx-request").textContent = JSON.stringify(placeRequest(turn), null, 1).slice(0, 1600);
  out.textContent = where === "cloud" ? "asking Cloudflare…" : "asking this tab…";
  const r = await reflexerPlace(where, turn);
  if (r.error || r.pick == null) {
    out.textContent = `no answer: ${r.error || "abstained"}`;
    return;
  }
  lat[where].push(r.ms);
  const opt = opts[r.pick];
  const how = where === "cloud"
    ? `Cloudflare round trip ${r.ms.toFixed(1)} ms${r.colo ? ` via ${r.colo}` : ""}`
    : `in this tab ${r.ms.toFixed(1)} ms (WebAssembly)`;
  out.textContent =
    `${cur} → spot ${r.pick + 1}/${opts.length} (rot ${opt.rot}, col ${opt.col}) · ${how}\n` +
    `plan searched: ${opts.length} spots × the preview (${next}) × every next piece\n\n` +
    render(board, opt);
  drawBoard($("rx-answer-view"), board, st, { cells: opt.cells, piece: cur });
  renderCaps();
}

function renderCaps() {
  const c = latencyRange(lat.cloud);
  const l = latencyRange(lat.local);
  const colo = reflexerState().colo;
  $("rx-cap-cloud").textContent = c ? `${colo ? `${colo} · ` : ""}${c} round trip` : "Cloudflare — press a button";
  $("rx-cap-cloud").classList.toggle("idle", !c);
  $("rx-cap-local").textContent = l ? `in-tab ${l}` : "in-tab —";
}

(async function main() {
  if (!$("rx-board")) return;
  for (const id of ["rx-cur", "rx-next"]) {
    for (const p of T.PIECES) $(id).append(new Option(p, p));
  }
  wirePainter();
  $("rx-board").addEventListener("input", onText);
  for (const id of ["rx-cur", "rx-next"]) $(id).addEventListener("change", renderPieces);
  randomBoard();
  $("rx-random").addEventListener("click", randomBoard);
  $("rx-clear").addEventListener("click", () => setBoard(T.emptyBoard(), newStampGrid()));
  $("rx-ask-cloud").addEventListener("click", () => ask("cloud"));
  $("rx-ask-local").addEventListener("click", () => ask("local"));
  $("rx-endpoint").textContent = `${REFLEXER_CLOUD}/v1/decide`;
  const [cloud, local] = await Promise.all([probeReflexerCloud(), ensureReflexerLocal()]);
  $("rx-ask-cloud").disabled = cloud !== "ready";
  $("rx-ask-local").disabled = local !== "ready";
  $("rx-status").textContent =
    `Cloudflare ${cloud === "ready" ? `ready${reflexerState().colo ? ` (colo ${reflexerState().colo})` : ""}` : "unreachable"} · ` +
    `wasm local ${local}`;
  renderCaps();
})();
