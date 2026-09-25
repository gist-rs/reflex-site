/* The two Reflexer boards — ONE engine, two hosts, so the boards differ by
   the network hop and nothing else:

   - "Reflexer · wasm local": the reflexer engine (gist-rs/riir-reflexer
     crates/reflexer-wasm) compiled to wasm32-wasip1, running in THIS tab.
   - "Reflexer · Cloudflare": the SAME wasm bytes served by the reflexer
     Worker at REFLEXER_CLOUD — the latency capsule on that board is the
     measured browser round trip per decision, live.

   Both answer the site's own Tetris contract (reflexer_host.js
   placeRequest: hold off, options = buildTurn order as h0i<k>, bag = the
   7-bag remainder after the preview was drawn). scripts/reflexer_parity.mjs
   proves both transports reproduce the recorded rulebook walk 300/300. */

import { Reflexer, placePick, placeRequest } from "./reflexer_host.js";

export const REFLEXER_CLOUD = "https://reflexer.gist.rs";
const GENOME = "68cae9d382014662";
const PROBE_TIMEOUT_MS = 4000;
const DECIDE_TIMEOUT_MS = 8000;

let local = null;
let localBoot = null;
const state = { local: "unknown", cloud: "unknown", colo: null };

export function reflexerState() {
  return state;
}

/** Boot the in-tab engine once; resolves "ready" | "failed", never throws. */
export function ensureReflexerLocal() {
  localBoot ??= (async () => {
    state.local = "loading";
    try {
      const res = fetch("/assets/reflexer.wasm", { cache: "no-cache" });
      const module = WebAssembly.compileStreaming
        ? await WebAssembly.compileStreaming(res).catch(async () => WebAssembly.compile(await (await fetch("/assets/reflexer.wasm")).arrayBuffer()))
        : await WebAssembly.compile(await (await res).arrayBuffer());
      local = await Reflexer.instantiate(module);
      if (local.info.genome !== GENOME) throw new Error(`genome ${local.info.genome} != ${GENOME}`);
      state.local = "ready";
    } catch (e) {
      console.warn("reflexer wasm local failed", e);
      local = null;
      state.local = "failed";
    }
    return state.local;
  })();
  return localBoot;
}

async function withTimeout(ms, fn) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fn(ctl.signal);
  } finally {
    clearTimeout(t);
  }
}

/** Is the Worker up and serving the pinned genome? "ready" | "down". */
export async function probeReflexerCloud() {
  try {
    const info = await withTimeout(PROBE_TIMEOUT_MS, async (signal) => {
      const r = await fetch(`${REFLEXER_CLOUD}/`, { cache: "no-store", signal });
      state.colo = r.headers.get("x-reflexer-colo");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    state.cloud = info.genome === GENOME ? "ready" : "down";
  } catch (e) {
    state.cloud = "down";
  }
  return state.cloud;
}

/** One Tetris decision on `where` ("local" | "cloud").
 * Resolves {pick, ps, ms, colo} or {error}; never throws. `ms` is the
 * in-tab engine call (local) or the full browser round trip (cloud). */
export async function reflexerPlace(where, turn) {
  const req = placeRequest(turn);
  try {
    if (where === "local") {
      if (!local) return { error: `wasm local ${state.local}` };
      const t0 = performance.now();
      let env;
      try {
        env = local.decide(req);
      } catch (e) {
        local = null; // a trap poisons the instance — re-boot next game
        localBoot = null;
        state.local = "failed";
        throw e;
      }
      return shape(env, performance.now() - t0, null);
    }
    const t0 = performance.now();
    return await withTimeout(DECIDE_TIMEOUT_MS, async (signal) => {
      const r = await fetch(`${REFLEXER_CLOUD}/v1/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        cache: "no-store",
        signal,
      });
      const env = await r.json().catch(() => ({ error: { code: "bad_json", message: `HTTP ${r.status}` } }));
      const colo = r.headers.get("x-reflexer-colo");
      if (colo) state.colo = colo;
      return shape(env, performance.now() - t0, colo);
    });
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

function shape(env, ms, colo) {
  if (!env?.response) return { error: env?.error ? `${env.error.code}: ${env.error.message}` : "no response" };
  const a = env.response.answers.find((x) => x.question_id === "place");
  return { pick: placePick(env), ps: a?.probabilities ?? [], ms, colo };
}

/** "p50 18 ms · 11–136 ms" over a latency list (ms), or null. */
export function latencyRange(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const f = (x) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));
  const p50 = v[Math.floor(v.length / 2)];
  return v.length < 3 ? `${f(p50)} ms` : `p50 ${f(p50)} ms · ${f(v[0])}–${f(v.at(-1))} ms`;
}
