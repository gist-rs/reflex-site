// Flappy micro-game — dependency-free ES-module port of katgpt-rs
// `examples/common/flappy_sim.rs`, PINNED to grammar `laya-flappy-v2` (the
// committed fixture's grammar): option sentences carry the position band
// ALONE ("The bird {band}.") — v1's motion clause was a measured confound
// (the v1 oracle went 85/100 to flap regardless of geometry, Bench 879/880),
// and the live Rust grammar has since moved on to v3 (quantized offset +
// neutral post-motion clauses, Issue 876), which is deliberately NOT ported
// here. The state context sentence is unchanged across v1/v2/v3.
//
// All sentences must stay byte-identical to
// katgpt-rs/tests/fixtures/flappy_oracle_laya_en_v2.jsonl — enforced by
// flappy_lanes_golden.test.mjs. Do not reword anything.
//
// Zero dependencies; no DOM. Decision shape: at each pipe the bird is ONE
// tick out; the two candidate resulting states (flap / coast) are rendered
// as closed-grammar sentences; the scorer reads p(clean) per option and the
// argmax IS the action. Option order is PINNED [flap, coast].

import { Rng } from './rng.js';

/** Vertical grid height (y ∈ [0, GRID_H); y = 0 is the ground). */
export const GRID_H = 12;
/** Velocity clamp. */
export const V_MIN = -2;
export const V_MAX = 2;
/** A flap lifts the bird this many cells and sets the velocity: the flap
 * result is (y + FLAP_DY, FLAP_V). */
export const FLAP_DY = 2;
export const FLAP_V = 2;

/** Grammar identity — the committed v2 fixture's grammar (the live Rust
 * constant reads laya-flappy-v3; this port serves the v2 fixture). */
export const GRAMMAR_ID = 'laya-flappy-v2';
/** The per-option (noul) question — verbatim fixture `question` text. */
export const QUESTION = 'Will the bird pass through the gap cleanly?';

/** The pinned option order (index 0 = flap, the lowest-index tie-break's
 * referent). Actions are identified by these label strings. */
export const ACTIONS = ['flap', 'coast'];

/** The 8 frozen feature columns in pinned order (this ORDER is part of the
 * committed recipe — head weights are only meaningful against it). */
export const FEATURE_NAMES = [
  'post_rel', 'post_abs_rel', 'post_v', 'pre_rel',
  'pre_v', 'in_gap', 'edge_margin', 'gap_half',
];

/** The action's resulting state [y', v']. Integer semantics as in Rust
 * (small i32s; JS number arithmetic is exact here). */
export function result(s, action) {
  if (action === 'flap') return [s.y + FLAP_DY, FLAP_V];
  // Coast: advance by current velocity, gravity pulls v down one step.
  return [s.y + s.v, Math.max(s.v - 1, V_MIN)];
}

export function inBounds(y) {
  return y >= 0 && y < GRID_H;
}

/** Where the resulting bird sits relative to the gap — the position
 * clause's quantization. Band boundaries are Rust-exact: rel < -h →
 * below; rel == -h → bottom edge; -h < rel < 0 → lower half; rel == 0 →
 * middle; 0 < rel < h → upper half; rel == h → top edge; rel > h → above. */
export function posBand(rel, h) {
  if (rel < -h) return 'below';
  if (rel === -h) return 'squeezeBottom';
  if (rel < 0) return 'lower';
  if (rel === 0) return 'middle';
  if (rel < h) return 'upper';
  if (rel === h) return 'squeezeTop';
  return 'above';
}

const BAND_CLAUSES = {
  below: 'sinks below the gap',
  squeezeBottom: 'squeezes through the bottom of the gap',
  lower: 'glides through the lower half of the gap',
  middle: 'glides through the middle of the gap',
  upper: 'glides through the upper half of the gap',
  squeezeTop: 'squeezes through the top of the gap',
  above: 'flies above the gap',
};

export function bandClause(band) {
  return BAND_CLAUSES[band];
}

/** The bird's CURRENT motion — state sentence only. v2 option sentences
 * dropped it as a measured confound ("rising" read safe regardless of
 * geometry). */
export function motionClause(v) {
  if (v <= -2) return 'falling fast';
  if (v === -1) return 'falling';
  if (v === 0) return 'flying level';
  if (v === 1) return 'rising';
  return 'climbing fast';
}

export function gapClause(h) {
  return h === 2 ? 'narrow' : 'wide';
}

/** The state context sentence (grammar unchanged across versions):
 * "The bird is {band} the gap center, {motion}. The gap is {width}. The
 * pipe is just ahead." Band wording thresholds: |rel| > 1 → "well",
 * |rel| == 1 → "a little", rel == 0 → "level with". */
export function renderStateSentence(s) {
  const rel = s.y - s.g;
  const band = rel > 1 ? 'well above'
    : rel === 1 ? 'a little above'
      : rel === 0 ? 'level with'
        : rel < -1 ? 'well below'
          : 'a little below';
  return `The bird is ${band} the gap center, ${motionClause(s.v)}. The gap is ${gapClause(s.h)}. The pipe is just ahead.`;
}

/** The frozen v2 option sentence: `The bird {band}.` — the position band
 * ALONE (Rust: render_option_sentence_v2). */
export function renderOptionSentence(s, action) {
  const [y2] = result(s, action);
  return `The bird ${bandClause(posBand(y2 - s.g, s.h))}.`;
}

/** The frozen 8-column feature row for one action (pinned order). */
export function featureRow(s, action) {
  const [y2, v2] = result(s, action);
  const rel2 = y2 - s.g;
  const abs2 = Math.abs(rel2);
  return [
    rel2,
    abs2,
    v2,
    s.y - s.g,
    s.v,
    abs2 <= s.h ? 1 : 0,
    s.h - abs2,
    s.h,
  ];
}

/** The code-arithmetic context policy: the option whose result sits
 * closest to the gap center, lowest-index tie-break (flap). Returns the
 * option index (ACTIONS[index] is the action string). */
export function gapCenterPick(s) {
  let best = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < ACTIONS.length; i++) {
    const abs = Math.abs(result(s, ACTIONS[i])[0] - s.g);
    if (abs < bestAbs) {
      bestAbs = abs;
      best = i;
    }
  }
  return best;
}

/** Seed the corpus with DECISION-INTERESTING states — exact port of the
 * Rust enumerator (the fastrand 2.4.1 stream is reproduced by rng.js), so
 * `enumerateStates(607, 100)` yields the committed fixture's states in
 * order. Same exclusions: bird out of bounds; v == FLAP_V (both actions
 * land on one cell); either result out of bounds; same-band results
 * (identical v2 sentences — the unbounded Below/Above bands tie most
 * often). Deduped. Returns [{stateId, state}]. */
export function enumerateStates(seed, n) {
  const rng = new Rng(seed);
  const out = [];
  const seen = new Set();
  while (out.length < n) {
    const h = rng.u32Below(2) === 0 ? 2 : 3; // rng.u32(..2)
    const g = rng.i32Range(h + 1, GRID_H - h); // rng.i32((h+1)..(GRID_H-h))
    const y = g + rng.i32Range(-4, 5); // rng.i32(-4..5)
    const v = rng.i32Range(V_MIN, V_MAX + 1); // rng.i32(-2..3)
    const s = { y, v, g, h };
    if (!inBounds(s.y)) continue;
    if (s.v === FLAP_V) continue; // degenerate: flap and coast share a cell
    const fy = result(s, 'flap')[0];
    const cy = result(s, 'coast')[0];
    if (!inBounds(fy) || !inBounds(cy)) continue;
    if (posBand(fy - g, h) === posBand(cy - g, h)) continue;
    const key = JSON.stringify(s);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ stateId: `flappy_${String(out.length).padStart(3, '0')}`, state: s });
    }
  }
  return out;
}

/** One flight under `policy(state) -> 'flap' | 'coast'`: seeded approach
 * coast into each pipe, the policy decides at one tick out, the crossing
 * crashes on |rel| > h or on leaving the grid. Returns pipes passed.
 * Exact port of the Rust play_game (same RNG stream shape). */
export function playGame(policy, seed, maxPipes) {
  const rng = new Rng(seed);
  let y = rng.i32Range(3, GRID_H - 3); // rng.i32(3..(GRID_H - 3))
  let v = rng.i32Range(-1, 2); // rng.i32(-1..2)
  let pipes = 0;
  for (let i = 0; i < maxPipes; i++) {
    // Approach: pure coasting with gravity (no decisions), 2-3 ticks.
    const approach = rng.i32Range(2, 4); // rng.i32(2..4)
    for (let j = 0; j < approach; j++) {
      v = Math.max(v - 1, V_MIN);
      y += v;
      if (!inBounds(y)) return pipes;
    }
    const h = rng.u32Below(2) === 0 ? 2 : 3;
    const g = rng.i32Range(h + 1, GRID_H - h);
    const s = { y, v, g, h };
    const action = policy(s);
    const [y2, v2] = result(s, action);
    if (!inBounds(y2)) return pipes;
    if (Math.abs(y2 - g) > h) return pipes;
    pipes += 1;
    y = y2;
    v = v2;
  }
  return pipes;
}

/** The decision turn as the arena consumes it: the noul question (verbatim
 * fixture `question` text) + the two options in PINNED order, each with
 * its v2 sentence and frozen feature row. */
export function buildTurn(s) {
  return {
    question: QUESTION,
    options: ACTIONS.map((label) => ({
      label,
      sentence: renderOptionSentence(s, label),
      features: featureRow(s, label),
    })),
  };
}
