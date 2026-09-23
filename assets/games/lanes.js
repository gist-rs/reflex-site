// Three-lanes micro-game — dependency-free ES-module port of katgpt-rs
// `examples/common/lanes_sim.rs`, grammar `laya-lanes-v1` (the committed
// fixture's grammar; unchanged since v1).
//
// THE WORDING PIN (carried from the Rust source): ONE noun per obstacle
// class, never varied — laya's own measured trap ("barrier" 0.75 vs
// "train" 0.45 for the same lane) is a noun-choice effect, and a closed
// grammar that never varies the noun cannot trip it. Do not reword
// anything: every sentence must stay byte-identical to
// katgpt-rs/tests/fixtures/lanes_oracle_laya_en_v1.jsonl — enforced by
// flappy_lanes_golden.test.mjs.
//
// Zero dependencies; no DOM. Decision shape: the runner must commit to a
// lane now. The three options are the lanes in PINNED order [left, middle,
// right]; each option's sentence describes that lane's state; the scorer
// reads p(safe) per lane and the argmax IS the lane.

import { Rng } from './rng.js';

/** Grammar identity. */
export const GRAMMAR_ID = 'laya-lanes-v1';
/** The per-option (noul) question — verbatim fixture `question` text. */
export const QUESTION = 'Is this lane safe to run?';

/** The pinned lane order used in SENTENCES (index 0 = left). */
export const LANE_NAMES = ['left', 'middle', 'right'];
/** The pinned OPTION labels (index = lane). NOTE: labels are lane0/lane1/
 * lane2 while the sentences name left/middle/right — exactly as the Rust
 * dump (option label `format!("lane{lane}")`, sentence LANE_NAMES). */
export const OPTION_LABELS = ['lane0', 'lane1', 'lane2'];

/** THE WORDING PIN — one noun per obstacle class, never varied. */
export const OBSTACLE_NOUNS = {
  Clear: '',
  Barrier: 'a barrier',
  Train: 'a train',
  Rock: 'a rock',
};

const DIST_CLAUSES = { Close: 'close', Far: 'far' };

/** The 8 frozen feature columns in pinned order (lane-local + the state
 * context — this ORDER is part of the committed recipe). */
export const FEATURE_NAMES = [
  'blocked', 'close', 'far',
  'is_barrier', 'is_train', 'is_rock',
  'blocked_neighbors', 'clear_lanes',
];

/** The lane's state clause: "clear ahead" or
 * "blocked {close|far} ahead by {noun}". */
export function laneClause(lane) {
  if (lane.kind === 'Clear') return 'clear ahead';
  return `blocked ${DIST_CLAUSES[lane.dist]} ahead by ${OBSTACLE_NOUNS[lane.kind]}`;
}

/** The per-option sentence: `The {name} lane is {clause}.` */
export function renderOptionSentence(s, laneIdx) {
  return `The ${LANE_NAMES[laneIdx]} lane is ${laneClause(s.lanes[laneIdx])}.`;
}

/** The state context sentence: all three lanes, pinned order, joined
 * with "; " and lowercase "the". */
export function renderStateSentence(s) {
  return `The left lane is ${laneClause(s.lanes[0])}; the middle lane is ${laneClause(s.lanes[1])}; the right lane is ${laneClause(s.lanes[2])}.`;
}

/** The frozen 8-column feature row for one lane (pinned order). */
export function featureRow(s, laneIdx) {
  const l = s.lanes[laneIdx];
  const blocked = l.kind !== 'Clear' ? 1 : 0;
  const bit = (kind) => (l.kind === kind ? 1 : 0);
  let blockedNeighbors = 0;
  let clearLanes = 0;
  for (let i = 0; i < s.lanes.length; i++) {
    const other = s.lanes[i];
    if (other.kind !== 'Clear') {
      if (i !== laneIdx) blockedNeighbors += 1;
    } else {
      clearLanes += 1;
    }
  }
  return [
    blocked,
    blocked === 1 && l.dist === 'Close' ? 1 : 0,
    blocked === 1 && l.dist === 'Far' ? 1 : 0,
    bit('Barrier'),
    bit('Train'),
    bit('Rock'),
    blockedNeighbors,
    clearLanes,
  ];
}

/** The code-arithmetic context policy: clear beats far-blocked beats
 * close-blocked, pinned lowest-index tie-break. Returns the lane index. */
export function clearestPick(s) {
  const rank = (l) => {
    if (l.kind === 'Clear') return 0;
    return l.dist === 'Far' ? 1 : 2;
  };
  let best = 0;
  let bestRank = 3;
  for (let i = 0; i < s.lanes.length; i++) {
    const r = rank(s.lanes[i]);
    if (r < bestRank) {
      bestRank = r;
      best = i;
    }
  }
  return best;
}

/** One seeded lane observation — exact port of sample_lane (draw order:
 * the ~15% clear roll first, then the obstacle kind, then the distance;
 * ~15% clear lanes; close obstacles dominate 60/40). */
function sampleLane(rng) {
  if (rng.u32Below(100) < 15) {
    return { kind: 'Clear', dist: 'Close' };
  }
  const kindRoll = rng.u32Below(3);
  const kind = kindRoll === 0 ? 'Barrier' : kindRoll === 1 ? 'Train' : 'Rock';
  const dist = rng.u32Below(5) < 3 ? 'Close' : 'Far';
  return { kind, dist };
}

/** One seeded lanes state (also the play loop's step sampler). */
export function sampleState(rng) {
  return { lanes: [sampleLane(rng), sampleLane(rng), sampleLane(rng)] };
}

/** Seed the corpus with the obstacle-count distribution biased toward
 * decision-interesting states (1-2 blocked lanes; all-clear and
 * all-blocked states kept but rare via a 1-in-4 extra draw). Deterministic;
 * deduped. Exact port of the Rust enumerator (fastrand stream via rng.js):
 * enumerateStates(607, 100) yields the committed fixture's states in
 * order. Returns [{stateId, state}]. */
export function enumerateStates(seed, n) {
  const rng = new Rng(seed);
  const out = [];
  const seen = new Set();
  while (out.length < n) {
    const s = sampleState(rng);
    const blocked = s.lanes.filter((l) => l.kind !== 'Clear').length;
    // Reject the trivial extremes most of the time (the extra u32 draw is
    // consumed EXACTLY as in Rust: only for blocked == 0 or 3).
    let keep = true;
    if (blocked === 0 || blocked === 3) keep = rng.u32Below(4) === 0;
    if (!keep) continue;
    const key = JSON.stringify(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ stateId: `lanes_${String(out.length).padStart(3, '0')}`, state: s });
  }
  return out;
}

/** One run under `policy(state) -> lane index`: each step draws a seeded
 * state, the policy picks a lane, a close-blocked pick ends the run
 * (far-blocked passes this step). Returns steps survived. */
export function playGame(policy, seed, maxSteps) {
  const rng = new Rng(seed);
  for (let step = 0; step < maxSteps; step++) {
    const s = sampleState(rng);
    const lane = policy(s);
    const l = s.lanes[lane];
    if (l.kind !== 'Clear' && l.dist === 'Close') return step;
  }
  return maxSteps;
}

/** The decision turn as the arena consumes it: the noul question (verbatim
 * fixture `question` text) + the three lane options in PINNED order, each
 * with its sentence and frozen feature row. */
export function buildTurn(s) {
  return {
    question: QUESTION,
    options: OPTION_LABELS.map((label, lane) => ({
      label,
      sentence: renderOptionSentence(s, lane),
      features: featureRow(s, lane),
    })),
  };
}
