// The Tetris "final result" charts — rendered from the recorded games in
// arena/demo_oracle.json at page load, so the outcome is visible before any
// replay finishes. Two charts, one measure each (never a dual axis):
//
//   1. score as each recorded game goes — cumulative guideline score vs
//      pieces placed, one line per lane, end-marked (✕ topped out, ● capped
//      and still alive), crosshair + tooltip.
//   2. time to judge one landing spot — the recorded p50 ms/spot per lane
//      (the same quantity every board's stats line shows), log scale.
//
// Scores are RE-DERIVED from each walk (recorded board + recorded pick →
// the site's own landingOptions + line clears), and cross-checked against the
// recorder's summary; a mismatch is shown, never hidden.
//
// Color follows the LANE (the bench-charts palette: KatGPT orange, laya
// Rust blue, laya Python green) + the rulebook lane's magenta (#c4579e,
// validated all-pairs against the three on #1d110c: normal-vision ΔE ≥ 16,
// CVD pass) + the raw baseline in the de-emphasis gray — it is the floor.

import * as T from "./games/tetris.js";

export const CHART_LANES = [
  { key: "rulebook", label: "KatGPT rulebook search", walk: "tetris_rulebook_walk", meta: "tetris_rulebook", color: "#c4579e" },
  { key: "laya", label: "laya (Rust)", walk: "tetris_walk", meta: "tetris_laya", color: "#3987e5" },
  { key: "python", label: "laya (Python)", walk: "tetris_python_walk", meta: "tetris_python", color: "#199e70" },
  { key: "modelless", label: "KatGPT modelless", walk: "tetris_head_walk", meta: "tetris_head", color: "#d95926" },
  { key: "raw", label: "raw baseline", walk: "tetris_raw_walk", meta: "tetris_raw", color: "#8a7468" },
];

const LINE_SCORE = [0, 40, 100, 300, 1200];
const NS = "http://www.w3.org/2000/svg";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtInt = (v) => Math.round(v).toLocaleString("en-US");
function fmtMs(ms) {
  if (ms >= 100) return `${Math.round(ms)} ms`;
  if (ms >= 1) return `${ms.toFixed(1)} ms`;
  if (ms >= 0.01) return `${ms.toFixed(2)} ms`;
  return `${(ms * 1000).toFixed(1)} µs`;
}

/** Re-derive one lane's game from its walk: cumulative score per piece. */
export function deriveGame(walk) {
  const scores = [0];
  let score = 0;
  let lines = 0;
  let tetrises = 0;
  let pieceMs = [];
  for (const row of walk) {
    const board = T.fromStrings(row[3]);
    const opts = T.buildTurn(board, row[2]);
    const opt = opts[row[4]];
    if (!opt) break; // a recorded pick outside the option set — stop, don't invent
    const cleared = T.commitPlacement(board, opt);
    lines += cleared;
    if (cleared === 4) tetrises += 1;
    score += LINE_SCORE[Math.min(cleared, 4)];
    scores.push(score);
    if (Array.isArray(row[5])) pieceMs.push(row[5].reduce((a, b) => a + (b ?? 0), 0));
  }
  return { scores, score, lines, tetrises, pieces: scores.length - 1, pieceMs };
}

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

let tip;
function tooltip() {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "bc-tip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  return tip;
}
function showTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html;
  t.style.display = "block";
  const w = t.offsetWidth;
  t.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 14)) + "px";
  t.style.top = Math.max(8, y - t.offsetHeight - 12) + "px";
}
const hideTip = () => { if (tip) tip.style.display = "none"; };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// ── chart 1: score as each game goes ─────────────────────────────────────
function scoreChart(host, games) {
  const W = 920, H = 300, L = 64, R = 190, TOP = 14, B = 34;
  const pw = W - L - R, ph = H - TOP - B;
  const xMax = Math.max(...games.map((g) => g.game.pieces), 1);
  const yStep = niceMax(Math.max(...games.map((g) => g.game.score), 40) / 5);
  const yMax = Math.ceil(Math.max(...games.map((g) => g.game.score), 40) / yStep) * yStep;
  const yTicks = Math.round(yMax / yStep);
  const X = (i) => L + (i / xMax) * pw;
  const Y = (v) => TOP + ph - (v / yMax) * ph;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "ac-svg", role: "img",
    "aria-label": "Score as each recorded game goes: " + games.map((g) =>
      `${g.lane.label} ${fmtInt(g.game.score)} points over ${g.game.pieces} pieces${g.toppedOut ? ", topped out" : ", capped and still alive"}`).join("; ") });
  // recessive grid + axes
  for (let k = 0; k <= yTicks; k++) {
    const v = yStep * k, y = Y(v);
    svg.append(el("line", { x1: L, x2: L + pw, y1: y, y2: y, class: "ac-grid" }));
    svg.append(el("text", { x: L - 8, y: y + 4, class: "ac-tick", "text-anchor": "end" }, fmtInt(v)));
  }
  const xStep = niceMax(xMax / 6);
  for (let i = 0; i <= xMax; i += xStep) {
    svg.append(el("text", { x: X(i), y: TOP + ph + 18, class: "ac-tick", "text-anchor": "middle" }, String(i)));
  }
  svg.append(el("text", { x: L + pw / 2, y: H - 2, class: "ac-axis", "text-anchor": "middle" }, "pieces placed"));
  svg.append(el("text", { x: 12, y: TOP + ph / 2, class: "ac-axis", "text-anchor": "middle", transform: `rotate(-90 12 ${TOP + ph / 2})` }, "score"));
  // lines — draw the floor first so the lanes sit on top
  const order = [...games].reverse();
  for (const g of order) {
    const d = g.game.scores.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
    svg.append(el("path", { d, class: "ac-line", stroke: g.lane.color }));
  }
  // end marks + direct labels. Placed bottom-up so the pile of games that
  // ended near zero stacks ABOVE the axis instead of spilling under it.
  const ends = games.map((g) => ({ g, x: X(g.game.pieces), y: Y(g.game.score) }))
    .sort((a, b) => b.y - a.y);
  let lastY = Infinity;
  for (const e of ends) {
    const ly = Math.min(e.y + 4, lastY - 15);
    lastY = ly;
    const { g } = e;
    if (g.toppedOut) {
      svg.append(el("path", { d: `M${e.x - 5},${e.y - 5}L${e.x + 5},${e.y + 5}M${e.x - 5},${e.y + 5}L${e.x + 5},${e.y - 5}`, class: "ac-x", stroke: g.lane.color }));
    } else {
      svg.append(el("circle", { cx: e.x, cy: e.y, r: 5, fill: g.lane.color, class: "ac-dot" }));
    }
    const lx = L + pw + 12;
    svg.append(el("line", { x1: e.x + 7, x2: lx - 3, y1: e.y, y2: ly - 4, class: "ac-leader" }));
    const t = el("text", { x: lx, y: ly, class: "ac-label" });
    t.append(el("tspan", { class: "ac-strong" }, fmtInt(g.game.score)));
    t.append(el("tspan", {}, `  ${g.lane.label}`));
    svg.append(t);
  }
  // crosshair + tooltip
  const cross = el("line", { x1: 0, x2: 0, y1: TOP, y2: TOP + ph, class: "ac-cross", visibility: "hidden" });
  svg.append(cross);
  const hit = el("rect", { x: L, y: TOP, width: pw, height: ph, fill: "transparent" });
  svg.append(hit);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(xMax, Math.round(((sx - L) / pw) * xMax)));
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i));
    cross.setAttribute("visibility", "visible");
    const rows = games.map((g) => {
      const alive = i <= g.game.pieces;
      const v = alive ? g.game.scores[i] : null;
      return `<span class="bc-sw" style="background:${g.lane.color}"></span>${esc(g.lane.label)}: ` +
        (alive ? `<b>${fmtInt(v)}</b>` : `<span class="bc-mut">${g.toppedOut ? "topped out" : "capped"} at ${g.game.pieces}</span>`);
    }).join("<br>");
    showTip(`<span class="bc-mut">after piece ${i}</span><br>${rows}`, ev.clientX, ev.clientY);
  };
  hit.addEventListener("mousemove", move);
  hit.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
  host.append(svg);
}

// ── chart 2: time to judge one spot (log scale) ──────────────────────────
// The device a model lane ran on, read from the recorder's transport line
// ("… (device metal)") — a latency bar without its device is not comparable.
const DEVICE_NAME = { metal: "Metal", mps: "MPS", cpu: "CPU", cuda: "CUDA", ane: "ANE" };
const deviceOf = (meta) => /\(device ([a-z0-9-]+)\)/.exec(meta?.transport ?? "")?.[1] ?? null;
const rowLabel = (g) => (g.device && (g.lane.key === "laya" || g.lane.key === "python")
  ? `${g.lane.label} · ${DEVICE_NAME[g.device] ?? g.device}` : g.lane.label);

function latencyChart(host, games) {
  // Fastest first (owner call) — the bars read as a ranking; color still
  // follows the lane, never the rank.
  const rows = games.filter((g) => g.p50 != null).sort((a, b) => a.p50 - b.p50);
  const W = 920, rowH = 30, L = 190, R = 110, TOP = 6, B = 30;
  const H = TOP + rows.length * rowH + B;
  const pw = W - L - R;
  const lo = 1e-3, hi = 1e4; // 1 µs … 10 s
  const X = (ms) => L + ((Math.log10(Math.max(ms, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * pw;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "ac-svg", role: "img",
    "aria-label": "Time to judge one landing spot, p50, log scale: " + rows.map((g) => `${rowLabel(g)} ${fmtMs(g.p50)}`).join("; ") });
  for (const [ms, lab] of [[1e-3, "1 µs"], [1e-2, "10 µs"], [1e-1, "100 µs"], [1, "1 ms"], [10, "10 ms"], [100, "100 ms"], [1e3, "1 s"], [1e4, "10 s"]]) {
    svg.append(el("line", { x1: X(ms), x2: X(ms), y1: TOP, y2: TOP + rows.length * rowH, class: "ac-grid" }));
    svg.append(el("text", { x: X(ms), y: H - 8, class: "ac-tick", "text-anchor": "middle" }, lab));
  }
  rows.forEach((g, k) => {
    const y = TOP + k * rowH + rowH / 2;
    svg.append(el("text", { x: L - 10, y: y + 4, class: "ac-rowlabel", "text-anchor": "end" }, rowLabel(g)));
    const x0 = X(lo), x1 = X(g.p50);
    const bar = el("rect", { x: x0, y: y - 5, width: Math.max(2, x1 - x0), height: 10, rx: 4, fill: g.lane.color, class: "ac-bar", tabindex: 0 });
    svg.append(bar);
    svg.append(el("text", { x: x1 + 8, y: y + 4, class: "ac-label ac-strong" }, fmtMs(g.p50)));
    const tipHtml = `<span class="bc-sw" style="background:${g.lane.color}"></span><b>${esc(rowLabel(g))}</b><br>` +
      `p50 ${esc(fmtMs(g.p50))} per spot · ${esc(g.note)}`;
    bar.addEventListener("mousemove", (ev) => showTip(tipHtml, ev.clientX, ev.clientY));
    bar.addEventListener("mouseleave", hideTip);
  });
  host.append(svg);
}

function tableView(host, games) {
  const d = document.createElement("details");
  d.className = "ac-table";
  d.innerHTML = `<summary>table view</summary><table><thead><tr><th>lane</th><th>score</th><th>lines</th><th>tetrises</th><th>pieces</th><th>ended</th><th>p50 per spot</th></tr></thead><tbody>` +
    games.map((g) => `<tr><td><span class="bc-sw" style="background:${g.lane.color}"></span>${esc(g.lane.label)}</td>` +
      `<td>${fmtInt(g.game.score)}</td><td>${g.game.lines}</td><td>${g.game.tetrises}</td><td>${g.game.pieces}</td>` +
      `<td>${g.toppedOut ? "topped out" : "capped — still alive"}</td><td>${g.p50 != null ? esc(fmtMs(g.p50)) : "—"}</td></tr>`).join("") +
    `</tbody></table>`;
  host.append(d);
}

/** Render both charts into #tetris-results from the loaded oracle JSON. */
export function renderTetrisResults(j) {
  const host = document.getElementById("tetris-results-charts");
  if (!host || !j) return;
  host.textContent = "";
  const games = [];
  const notes = [];
  for (const lane of CHART_LANES) {
    const walk = j[lane.walk];
    const meta = j._meta?.sources?.[lane.meta];
    if (!walk || !walk.length || !meta) continue;
    const game = deriveGame(walk);
    const sum = meta.summary || {};
    if (sum.score != null && sum.score !== game.score) {
      notes.push(`${lane.label}: re-derived score ${game.score} ≠ recorded ${sum.score}`);
    }
    // Topped out = the recorder says so, or the game ended before a cap it
    // declares; a walk that stops at its declared cap is "still alive".
    const toppedOut = sum.topped_out != null ? !!sum.topped_out : lane.key !== "rulebook";
    const device = deviceOf(meta);
    const note = lane.key === "laya"
      ? `HTTP round-trip, one spot at a time — riir port on ${DEVICE_NAME[device] ?? device ?? "an unrecorded device"}`
      : lane.key === "python" ? `stdin/stdout, torch on ${DEVICE_NAME[device] ?? device ?? "an unrecorded device"}, one spot at a time`
        : lane.key === "rulebook" ? "one 3-piece search per piece, divided evenly over its spots — no model"
          : lane.key === "modelless" ? "HTTP round-trip to the engine (the in-tab wasm head is ~1 µs)"
            : "HTTP round-trip, heads skipped";
    // p50 per SPOT from the walk's own per-spot rows — one quantity for
    // every lane (the rulebook recorder's summary p50 is per DECISION; the
    // laya/head/raw summaries are per spot). Cross-checked where the
    // summary is per spot; a disagreement is shown, not smoothed over.
    const spotMs = walk.flatMap((r) => (Array.isArray(r[5]) ? r[5] : [])).filter((v) => v != null).sort((a, b) => a - b);
    const p50 = spotMs.length ? spotMs[Math.floor((spotMs.length - 1) / 2)] : null;
    if (lane.key !== "rulebook" && sum.p50_ms != null && p50 != null && Math.abs(p50 - sum.p50_ms) > 0.02 * sum.p50_ms) {
      notes.push(`${lane.label}: walk p50 ${fmtMs(p50)} ≠ recorded ${fmtMs(sum.p50_ms)}`);
    }
    const perPiece = lane.key === "rulebook" && sum.p50_ms != null ? ` · ${fmtMs(sum.p50_ms)} per piece` : "";
    games.push({ lane, game, toppedOut, p50, device, note: note + perPiece });
  }
  if (!games.length) {
    host.textContent = "recorded games unavailable";
    return;
  }
  const legend = document.createElement("div");
  legend.className = "bc-legend ac-legend";
  legend.innerHTML = games.map((g) => `<span><i class="bc-sw" style="background:${g.lane.color}"></i>${esc(g.lane.label)}</span>`).join("") +
    `<span class="bc-mut">✕ topped out · ● capped, still alive</span>`;
  host.append(legend);
  const c1 = document.createElement("figure");
  c1.className = "ac-fig";
  c1.innerHTML = `<figcaption>Score as each recorded game goes <span class="bc-mut">(seed 607 · guideline 40/100/300/1200)</span></figcaption>`;
  host.append(c1);
  scoreChart(c1, games);
  const c2 = document.createElement("figure");
  c2.className = "ac-fig";
  c2.innerHTML = `<figcaption>Time to judge one landing spot <span class="bc-mut">(p50 as recorded · log scale — each step is 10×)</span></figcaption>`;
  host.append(c2);
  latencyChart(c2, games);
  tableView(host, games);
  if (notes.length) {
    const n = document.createElement("p");
    n.className = "ac-warn";
    n.textContent = "⚠ " + notes.join(" · ");
    host.append(n);
  }
}
