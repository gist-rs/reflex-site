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

const $ = (id) => document.getElementById(id);
const lat = { cloud: [], local: [] };

function readBoard() {
  const rows = $("rx-board").value.split("\n").map((r) => r.trim()).filter((r) => r.length);
  if (rows.length !== T.HEIGHT || rows.some((r) => r.length !== T.WIDTH || /[^.#]/.test(r))) {
    throw new Error(`board must be ${T.HEIGHT} rows × ${T.WIDTH} chars of '.' / '#'`);
  }
  return T.fromStrings(rows);
}

const rowsOf = (b) => b.map((row) => row.map((c) => (c ? "#" : ".")).join(""));

// A plausible mid-game position: n random legal placements from empty.
function randomBoard() {
  const rng = new Rng(Date.now() >>> 0);
  const b = T.emptyBoard();
  const n = 8 + rng.u32Below(14);
  for (let i = 0; i < n; i++) {
    const opts = T.buildTurn(b, T.PIECES[rng.u32Below(7)]);
    if (!opts.length) break;
    T.commitPlacement(b, opts[rng.u32Below(opts.length)]);
  }
  $("rx-board").value = rowsOf(b).join("\n");
  $("rx-cur").value = T.PIECES[rng.u32Below(7)];
  $("rx-next").value = T.PIECES[rng.u32Below(7)];
}

function render(board, opt) {
  const cells = new Set((opt?.cells ?? []).map(([r, c]) => `${r},${c}`));
  const lines = board.map((row, r) =>
    row.map((c, k) => (cells.has(`${r},${k}`) ? "▓" : c ? "#" : "·")).join(""));
  return lines.join("\n");
}

async function ask(where) {
  const out = $("rx-answer");
  let board;
  try {
    board = readBoard();
  } catch (e) {
    out.textContent = String(e.message);
    return;
  }
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
  randomBoard();
  $("rx-random").addEventListener("click", randomBoard);
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
