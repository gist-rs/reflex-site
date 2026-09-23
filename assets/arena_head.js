// The arena's browser-live game heads — the engine's fitted game heads
// compiled to WebAssembly, so the latent-first lane plays IN-TAB with zero
// engine.
//
// What loads here is `arena_head.wasm`: the published fit recipes
// (standardize → ridge at the LOO-selected λ → linear score) re-run at boot
// over the same digest-pinned oracle corpora the v0.2.3+ engine fits from —
// the fits are bit-identical to the engine's (every op is a correctly-rounded
// IEEE-754 f64 primitive with a pinned accumulation order).
//
// Nothing is trusted without proof. Before any live play, the probes below
// replay the demo's RECORDED head game (hundreds of real engine decisions)
// and require bit-exact f32 agreement on every single one (tetris), plus
// the published 96/100 oracle agreement over the flappy corpus reel. Any
// drift — artifact, browser, future corpus — keeps the page on the recorded
// demo. Off-grammar inputs refuse (NaN → null): the honest abstain, never a
// guess.
import * as T from "./games/tetris.js";
import * as F from "./games/flappy.js";
import * as L from "./games/lanes.js";

const state = {
  status: "idle", // idle | loading | ready | failed
  promise: null,
  exports: null,
  tetris: { lambda: null, anchor: null },
  flappy: { lambda: null, anchor: null },
  lanes: { lambda: null, anchor: null },
  bootMs: null,
  probeTetris: null, // { pairs, mismatched, ms, ok }
  probeFlappy: null, // { agree, ms, ok }
  probeLanes: null, // { agree, ms, ok }
};

const enc = new TextEncoder();

function write(s) {
  const b = enc.encode(s);
  const ptr = state.exports.head_alloc(b.length);
  if (ptr === 0) return null; // OOM — refuse rather than guess
  new Uint8Array(state.exports.memory.buffer).set(b, ptr);
  return [ptr, b.length];
}

function scoreRaw(sentence) {
  const w = write(sentence);
  if (!w) return NaN;
  const p = state.exports.head_score(w[0], w[1]);
  state.exports.head_reset();
  return p;
}

function scoreStateRaw(stateSentence, optionSentence) {
  const s = write(stateSentence);
  const o = write(optionSentence);
  if (!s || !o) return NaN;
  const p = state.exports.head_score_state(s[0], s[1], o[0], o[1]);
  state.exports.head_reset();
  return p;
}

// One lanes turn: the THREE option sentences in pinned lane order are
// written once, then each lane is scored through the joined-state export
// (the head's cross-lane feature columns read the other lanes' sentences).
// Per-lane wall ms — each call decodes all three sentences + scores one
// lane, so the timing is the honest per-decision cost.
function scoreLanesRaw(s0, s1, s2) {
  const a = write(s0);
  const b = write(s1);
  const c = write(s2);
  if (!a || !b || !c) {
    state.exports.head_reset();
    return [NaN, NaN, NaN];
  }
  const out = [];
  for (let lane = 0; lane < 3; lane++) {
    const t1 = performance.now();
    const p = state.exports.head_score_lanes(a[0], a[1], b[0], b[1], c[0], c[1], lane);
    out.push({ p, ms: performance.now() - t1 });
  }
  state.exports.head_reset();
  return out;
}

// The tetris probe: replay the recorded head game and require bit-exact f32
// agreement on every decision (the engine's wire serves f32(p); the JSON
// recording carries the shortest decimal that round-trips to that f32, so
// both sides are compared through Math.fround).
function probeTetris(headWalk) {
  const t0 = performance.now();
  let pairs = 0;
  let mismatched = 0;
  for (let turn = 0; turn < headWalk.length; turn++) {
    const [, ps, piece, rows] = headWalk[turn];
    const board = T.fromStrings(rows);
    const opts = T.buildTurn(board, piece);
    if (opts.length !== ps.length) return { pairs, ok: false, ms: performance.now() - t0 };
    for (let i = 0; i < opts.length; i++) {
      const p = scoreRaw(opts[i].sentence);
      pairs += 1;
      if (!Number.isFinite(p) || Math.fround(p) !== Math.fround(ps[i])) mismatched += 1;
    }
  }
  return {
    pairs,
    mismatched,
    ok: mismatched === 0 && pairs > 0,
    ms: performance.now() - t0,
  };
}

// The flappy probe: the corpus reel IS the v3 fixture (state + oracle ps).
// Rebuild each turn's option sentences with the site's own renderer and
// require the head's argmax to match the recorded oracle decision on
// exactly the published 96 of 100 (the boot anchor cross-checks).
function probeFlappy(flappyWalk) {
  const t0 = performance.now();
  let agree = 0;
  for (const [stateSentence, ps, structured] of flappyWalk) {
    const turn = F.buildTurn(structured);
    if (turn.stateSentence !== stateSentence) {
      return { agree, ok: false, ms: performance.now() - t0 };
    }
    const scored = turn.options.map((o) => scoreStateRaw(stateSentence, o.sentence));
    let want = 0;
    for (let i = 1; i < ps.length; i++) if (ps[i] > ps[want]) want = i;
    let got = 0;
    for (let i = 1; i < scored.length; i++) if (scored[i] > scored[got]) got = i;
    if (Number.isFinite(scored[0]) && Number.isFinite(scored[1]) && got === want) agree += 1;
  }
  return { agree, ok: agree === state.exports.head_flappy_anchor(), ms: performance.now() - t0 };
}

// The lanes probe: the corpus reel IS the lanes fixture (the demo rebuilds
// each turn's three option sentences with the site's own renderer —
// golden-proven byte-identical to the fixture's) and requires the wasm
// head's argmax to match the recorded oracle decision on exactly the
// published 84 of 100 (the boot anchor cross-checks).
function probeLanes(lanesWalk) {
  const t0 = performance.now();
  let agree = 0;
  for (const [stateSentence, ps, structured] of lanesWalk) {
    // the state context sentence must reproduce from the structured state
    if (L.renderStateSentence(structured) !== stateSentence) {
      return { agree, ok: false, ms: performance.now() - t0 };
    }
    const turn = L.buildTurn(structured);
    const scored = scoreLanesRaw(
      turn.options[0].sentence,
      turn.options[1].sentence,
      turn.options[2].sentence,
    );
    let want = 0;
    for (let i = 1; i < ps.length; i++) if (ps[i] > ps[want]) want = i;
    let got = 0;
    for (let i = 1; i < scored.length; i++) if (scored[i].p > scored[got].p) got = i;
    if (scored.every((r) => Number.isFinite(r.p)) && got === want) agree += 1;
  }
  return { agree, ok: agree === state.exports.head_lanes_anchor(), ms: performance.now() - t0 };
}

async function instantiate() {
  const t0 = performance.now();
  const url = new URL("arena_head.wasm", import.meta.url).href;
  let res;
  try {
    res = await WebAssembly.instantiateStreaming(fetch(url));
  } catch (e) {
    // wrong MIME or old browser — fall back to the buffered path
    res = await WebAssembly.instantiate(await (await fetch(url)).arrayBuffer());
  }
  state.exports = res.instance.exports;
  const rc = state.exports.head_init();
  if ((state.exports.head_ready() & 1) !== 1) {
    throw new Error(`tetris head refused (${rc})`);
  }
  state.tetris.lambda = state.exports.head_lambda();
  state.tetris.anchor = state.exports.head_anchor();
  state.flappy.lambda = state.exports.head_flappy_lambda();
  state.flappy.anchor = state.exports.head_flappy_anchor();
  if ((state.exports.head_ready() & 4) === 4) {
    state.lanes.lambda = state.exports.head_lanes_lambda();
    state.lanes.anchor = state.exports.head_lanes_anchor();
  }
  state.bootMs = performance.now() - t0;
}

// Start (once) and await the heads' boot + probes. Resolves "ready" (the
// tetris head — the flappy/lanes heads may independently fail) or "failed"
// — never throws. The recorded demo stays the fallback either way.
export function ensureArenaHead(headWalk, flappyWalk, lanesWalk) {
  if (!state.promise) {
    state.status = "loading";
    state.promise = (async () => {
      try {
        await instantiate();
        if (!Array.isArray(headWalk) || headWalk.length === 0) throw new Error("no recorded walk to probe");
        state.probeTetris = probeTetris(headWalk);
        if (!state.probeTetris.ok) throw new Error(`tetris probe failed: ${state.probeTetris.mismatched}/${state.probeTetris.pairs} disagree`);
        if (Array.isArray(flappyWalk) && flappyWalk.length > 0 && (state.exports.head_ready() & 2) === 2) {
          state.probeFlappy = probeFlappy(flappyWalk);
          if (!state.probeFlappy.ok) {
            console.warn(`[arena-head] flappy probe failed (${state.probeFlappy.agree}/100) — flappy stays recorded; tetris plays`);
          }
        }
        if (Array.isArray(lanesWalk) && lanesWalk.length > 0 && (state.exports.head_ready() & 4) === 4) {
          state.probeLanes = probeLanes(lanesWalk);
          if (!state.probeLanes.ok) {
            console.warn(`[arena-head] lanes probe failed (${state.probeLanes.agree}/100) — lanes stays recorded; tetris plays`);
          }
        }
        state.status = "ready";
        console.log(
          `[arena-head] LIVE — boot ${state.bootMs.toFixed(1)} ms, ` +
            `tetris λ ${state.tetris.lambda} anchor ${state.tetris.anchor}/120 ` +
            `probe ${state.probeTetris.pairs}/${state.probeTetris.pairs} bit-exact (${state.probeTetris.ms.toFixed(0)} ms)` +
            (state.probeFlappy?.ok
              ? `, flappy λ ${state.flappy.lambda} anchor ${state.flappy.anchor}/100 agreement ${state.probeFlappy.agree}/100 (${state.probeFlappy.ms.toFixed(0)} ms)`
              : ", flappy unavailable — recorded reel stays") +
            (state.probeLanes?.ok
              ? `, lanes λ ${state.lanes.lambda} anchor ${state.lanes.anchor}/100 agreement ${state.probeLanes.agree}/100 (${state.probeLanes.ms.toFixed(0)} ms)`
              : ", lanes unavailable — recorded reel stays"),
        );
      } catch (e) {
        state.status = "failed";
        console.warn(`[arena-head] unavailable — staying on the recorded demo (${e.message})`);
      }
      return state.status;
    })();
  }
  return state.promise;
}

// Synchronous gates for the game loop.
export function arenaHeadReady() {
  return state.status === "ready";
}

// The flappy head passed its own probe (independent of tetris's).
export function arenaFlappyHeadReady() {
  return state.status === "ready" && state.probeFlappy?.ok === true;
}

// The lanes head passed its own probe (independent of the others).
export function arenaLanesHeadReady() {
  return state.status === "ready" && state.probeLanes?.ok === true;
}

// P(clean) for one tetris spot sentence, or null when the head refuses
// (off-grammar → the honest abstain, exactly like the engine's fall-through).
export function arenaHeadScore(sentence) {
  if (state.status !== "ready") return null;
  const p = scoreRaw(sentence);
  return Number.isFinite(p) ? p : null;
}

// P(clean) for one flappy (state, option) sentence pair, or null on refusal.
export function arenaHeadScoreState(stateSentence, optionSentence) {
  if (state.status !== "ready" || !arenaFlappyHeadReady()) return null;
  const p = scoreStateRaw(stateSentence, optionSentence);
  return Number.isFinite(p) ? p : null;
}

// One lanes turn scored through the joined-state protocol: all three option
// sentences (pinned lane order), one P(safe) per lane. Returns [{p, ms} × 3]
// (p null on refusal), or null when the lanes head is unavailable.
export function arenaHeadScoreLanes(s0, s1, s2) {
  if (state.status !== "ready" || !arenaLanesHeadReady()) return null;
  return scoreLanesRaw(s0, s1, s2).map(({ p, ms }) => ({
    p: Number.isFinite(p) ? p : null,
    ms,
  }));
}

export function arenaHeadInfo() {
  return { status: state.status, bootMs: state.bootMs, tetris: state.tetris, flappy: state.flappy, lanes: state.lanes, probeTetris: state.probeTetris, probeFlappy: state.probeFlappy, probeLanes: state.probeLanes };
}
