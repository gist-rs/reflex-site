// The browser-live Tetris head — the engine's fitted game head compiled to
// WebAssembly, so the latent-first lane plays IN-TAB with zero engine.
//
// What loads here is `arena_head.wasm`: the published fit recipe
// (standardize → ridge at the LOO-selected λ → linear score) re-run at boot
// over the same BLAKE3-pinned oracle corpus the v0.2.2+ engine fits from —
// the fit is bit-identical to the engine's (every op is a correctly-rounded
// IEEE-754 f64 primitive with a pinned accumulation order).
//
// Nothing is trusted without proof. Before any live play, the probe below
// replays the demo's RECORDED head game (hundreds of real engine decisions)
// and requires bit-exact f32 agreement on every single one. Any drift —
// artifact, browser, future corpus — keeps the page on the recorded demo.
// Off-grammar inputs refuse (NaN → null): the honest abstain, never a guess.
import * as T from "./games/tetris.js";

const state = {
  status: "idle", // idle | loading | ready | failed
  promise: null,
  exports: null,
  lambda: null,
  anchor: null,
  bootMs: null,
  probe: null, // { pairs, ms, ok }
};

const enc = new TextEncoder();

function scoreRaw(sentence) {
  const b = enc.encode(sentence);
  const ptr = state.exports.head_alloc(b.length);
  if (ptr === 0) return NaN; // OOM — refuse rather than guess
  new Uint8Array(state.exports.memory.buffer).set(b, ptr);
  const p = state.exports.head_score(ptr, b.length);
  state.exports.head_reset();
  return p;
}

// The probe: replay the recorded head game and require bit-exact f32
// agreement on every decision (the engine's wire serves f32(p); the JSON
// recording carries the shortest decimal that round-trips to that f32, so
// both sides are compared through Math.fround).
function probe(headWalk) {
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
  return { pairs, mismatched, ok: mismatched === 0 && pairs > 0, ms: performance.now() - t0 };
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
  if (rc !== 0 || state.exports.head_ready() !== 1) {
    throw new Error(`head_init refused (${rc})`);
  }
  state.lambda = state.exports.head_lambda();
  state.anchor = state.exports.head_anchor();
  state.bootMs = performance.now() - t0;
}

// Start (once) and await the head's boot + probe. Resolves "ready" or
// "failed" — never throws. The recorded demo stays the fallback either way.
export function ensureArenaHead(headWalk) {
  if (!state.promise) {
    state.status = "loading";
    state.promise = (async () => {
      try {
        await instantiate();
        if (!Array.isArray(headWalk) || headWalk.length === 0) throw new Error("no recorded walk to probe");
        state.probe = probe(headWalk);
        if (!state.probe.ok) throw new Error(`probe failed: ${state.probe.mismatched}/${state.probe.pairs} disagree`);
        state.status = "ready";
        console.log(
          `[arena-head] LIVE — boot ${state.bootMs.toFixed(1)} ms, λ ${state.lambda}, ` +
            `anchor ${state.anchor}/120, probe ${state.probe.pairs}/${state.probe.pairs} bit-exact ` +
            `(${state.probe.ms.toFixed(0)} ms) — the modelless board plays in-tab`,
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

// P(clean) for one spot sentence, or null when the head refuses
// (off-grammar → the honest abstain, exactly like the engine's fall-through).
export function arenaHeadScore(sentence) {
  if (state.status !== "ready") return null;
  const p = scoreRaw(sentence);
  return Number.isFinite(p) ? p : null;
}

export function arenaHeadInfo() {
  return {
    status: state.status,
    lambda: state.lambda,
    anchor: state.anchor,
    bootMs: state.bootMs,
    probe: state.probe,
  };
}
