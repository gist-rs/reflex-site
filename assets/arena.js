/* Reflex arena — the live games. Three lanes (laya | modelless | raw) play
   side by side from the same seeded stream; every decision is a real /decide call to
   the visitor's own engine. Game logic lives in ./games/* — the exact ports
   of the katgpt-rs Plan 607 sims + pinned sentence grammars, golden-checked
   against the committed oracle fixtures. Nothing is scripted. */

import { Rng } from "./games/rng.js";
import * as T from "./games/tetris.js";
import * as F from "./games/flappy.js";
import * as L from "./games/lanes.js";
import { ensureArenaHead, arenaHeadReady, arenaHeadScore, arenaFlappyHeadReady, arenaHeadScoreState, arenaLanesHeadReady, arenaHeadScoreLanes } from "./arena_head.js";

const ENGINE = "http://127.0.0.1:7331";

// ── engine client ────────────────────────────────────────────────────────────

const lanes = { modelless: "unknown", laya: "unknown", raw: "unknown" };

// ── no-engine demo mode ─────────────────────────────────────────────────────
// Without a local engine the boards replay the recorded Plan 607 oracle (the
// same committed fixtures behind the benchmark tables and the golden tests):
// the laya board shows the recorded probabilities, the modelless board plays
// its real out-of-the-box behavior — abstain → labelled random fallback.
// demoMode flips only in bindRun/auto-start after a failed probe; every demo
// surface is labelled (banner, chips, SOURCE readout).
let demoMode = false;
let demo = null; // { tetrisWalk, tetrisHeadWalk, flappyWalk, lanesWalk }

async function loadDemo() {
  if (demo) {
    await ensureArenaHead(demo.tetrisHeadWalk, demo.flappyWalk, demo.lanesWalk);
    return demo;
  }
  const r = await fetch("/arena/demo_oracle.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`demo oracle HTTP ${r.status}`);
  const j = await r.json();
  demo = {
    tetrisWalk: j.tetris_walk || [],
    tetrisHeadWalk: j.tetris_head_walk || [],
    flappyWalk: j.flappy_walk || [],
    lanesWalk: j.lanes_walk || [],
  };
  // Best-effort: boot the browser-live heads and probe them against the
  // recorded games BEFORE any board starts, so a board never switches
  // posture mid-game. Resolves "ready" or "failed" — never throws.
  await ensureArenaHead(demo.tetrisHeadWalk, demo.flappyWalk, demo.lanesWalk);
  return demo;
}

function demoStatusText() {
  if (arenaHeadReady()) {
    return "no local engine — the modelless board PLAYS LIVE in-tab (fitted head · WebAssembly · zero engine); the laya board replays a recorded game; the raw baseline is a live-engine lane (v0.2.3+)";
  }
  return "no local engine — RECORDED DEMO playing (Plan 607 oracle) · start the engine, then press Start to go live";
}

async function probe() {
  const text = $("status-text");
  try {
    const r = await fetch(`${ENGINE}/healthz`, { mode: "cors", cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Newer engines answer JSON with the lane map; an older build answers
    // plain "ok" — the engine is up either way (the json() call is the
    // discriminator, never a verdict on liveness).
    const body = await r.json().catch(() => null);
    if (body && body.lanes) {
      lanes.modelless = body.lanes.modelless === "ready" ? "ready" : "unknown";
      lanes.laya = body.lanes.laya || "off";
      // The raw lane advertises itself (engine v0.2.3+, the X-Reflex-Lane:
      // raw knob); an older engine's lane map simply lacks the key — never
      // guessed at, the board states the gap honestly.
      lanes.raw = body.lanes.raw === "ready" ? "ready" : "absent";
    } else {
      lanes.modelless = "ready";
      lanes.laya = "off";
      lanes.raw = "absent";
    }
  } catch (e) {
    lanes.modelless = "down";
    lanes.laya = "down";
    lanes.raw = "down";
  }
  renderStatus(text);
}

async function renderStatus(text) {
  const chip = (id, state) => {
    const el = $(id);
    el.classList.remove("ok", "warn", "err");
    let cls = "err";
    let label = "no engine";
    if (state === "ready") [cls, label] = ["ok", "ready"];
    else if (state === "loading") [cls, label] = ["warn", "loading…"];
    else if (state === "failed") [cls, label] = ["err", "failed"];
    else if (state === "off") [cls, label] = ["warn", "off (RIIR_REFLEX_LAYA=1)"];
    else if (state === "absent") [cls, label] = ["warn", "needs engine v0.2.3+"];
    else if (state === "unknown") [cls, label] = ["ok", "ready"];
    el.classList.add(cls);
    el.innerHTML = el.innerHTML.replace(/—.*$/, `— ${label}`);
  };
  chip("chip-modelless", lanes.modelless);
  chip("chip-laya", lanes.laya);
  chip("chip-raw", lanes.raw);
  const up = lanes.modelless !== "down";
  const layaArmed = lanes.laya === "ready" || lanes.laya === "loading";
  const rawArmed = lanes.raw === "ready";
  const armed = ["modelless", layaArmed && "laya", rawArmed && "raw"].filter(Boolean);
  text.textContent = demoMode && !up
    ? demoStatusText()
    : up
      ? `local engine detected — ${armed.join(" + ")} armed`
      : "no local engine — start it, then refresh";
  $("launch-box").hidden = up;
  const banner = $("demo-banner");
  if (banner) banner.hidden = up || !demoMode;
  // A public page reaching 127.0.0.1 may be blocked by the browser's
  // local-network permission before CORS is even consulted — surface the
  // allow path when the engine is actually up but the page cannot see it.
  if (!up && window.isSecureContext) {
    try {
      await fetch(`${ENGINE}/healthz`, { mode: "no-cors", cache: "no-store" });
      // A no-cors fetch that doesn't throw means the engine is reachable —
      // the block was the local-network permission, not a missing engine.
      $("pna-hint").hidden = false;
    } catch (e) {
      /* genuinely unreachable — keep the hint hidden */
    }
  }
}

async function decide(state, question, laneHeader) {
  const body = {
    state,
    questions: [{ id: "q0", kind: "noul", prompt: question, options: [] }],
  };
  const headers = { "Content-Type": "application/json" };
  if (laneHeader) headers["X-Reflex-Lane"] = laneHeader;
  const t0 = performance.now();
  const r = await fetch(`${ENGINE}/decide`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const ms = performance.now() - t0;
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
  const a = (json.answers || [])[0];
  if (!a) throw new Error("no answer");
  // The wire's outcome is externally tagged: {"noul":{"yes":true}} — or
  // null when the modelless lane abstained.
  const abstain = a.outcome == null || a.outcome.noul == null;
  return { p: abstain ? null : a.probabilities[0], ms };
}

// The joined-state turn (issue 011, modelless lane only): ONE /decide
// carries the whole turn — the state's sentences one per line, one noul
// question per option in pinned order — and the engine's fitted head
// answers answer i = option i. Used by the lanes board (the head's
// cross-lane feature columns read ALL THREE sentences; a single-lane
// request cannot reproduce it). Resolves [{p, ms}] per option, or throws.
async function decideTurn(state, question, count, laneHeader) {
  const body = {
    state,
    questions: Array.from({ length: count }, (_, i) => ({
      id: `q${i}`, kind: "noul", prompt: question, options: [],
    })),
  };
  const headers = { "Content-Type": "application/json" };
  if (laneHeader) headers["X-Reflex-Lane"] = laneHeader;
  const t0 = performance.now();
  const r = await fetch(`${ENGINE}/decide`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const ms = performance.now() - t0;
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
  const answers = json.answers || [];
  if (answers.length !== count) throw new Error(`expected ${count} answers, got ${answers.length}`);
  return answers.map((a) => {
    const abstain = a.outcome == null || a.outcome.noul == null;
    return { p: abstain ? null : a.probabilities[0], ms };
  });
}

// Fire noul questions for every option; resolves [{p, ms, error}] in order.
// In demo mode there is no engine to ask — the lanes replay recorded data
// (tetris laya: the recorded game; flappy/lanes modelless: the honest
// abstain), EXCEPT the lanes with a browser-live wasm head, which answer
// HERE, in-tab: grammar-gated (tetris: the pinned spot question over the
// option sentence; flappy: the pinned question over the (state, option)
// pair; lanes: the joined-state protocol — the head reads ALL THREE option
// sentences, its cross-lane feature columns count the other lanes), proven
// at load, real per-decision timing.
async function scoreOptions(sentences, question, laneHeader, concurrency, demoPs, demoMs, allowDemoPs, stateSentence) {
  if (demoMode) {
    if (!laneHeader && question === T.SPOT_QUESTION && arenaHeadReady()) {
      return sentences.map((s) => {
        const t1 = performance.now();
        const p = arenaHeadScore(s);
        return { p, ms: performance.now() - t1 };
      });
    }
    if (!laneHeader && stateSentence != null && arenaFlappyHeadReady()) {
      return sentences.map((s) => {
        const t1 = performance.now();
        const p = arenaHeadScoreState(stateSentence, s);
        return { p, ms: performance.now() - t1 };
      });
    }
    if (!laneHeader && stateSentence == null && question === L.QUESTION && arenaLanesHeadReady() && sentences.length === 3) {
      // the joined-state protocol — one call scores the whole turn
      return arenaHeadScoreLanes(sentences[0], sentences[1], sentences[2]);
    }
    const rec = allowDemoPs && demoPs && demoPs.length === sentences.length ? demoPs : null;
    const recMs = allowDemoPs && demoMs && demoMs.length === sentences.length ? demoMs : null;
    return sentences.map((_, i) => ({ p: rec ? rec[i] : null, ms: recMs ? recMs[i] : null }));
  }
  // Live-engine protocol shapes (modelless lane only — the laya lane's
  // measured per-option shape NEVER moves, and raw skips the heads by
  // design): flappy's head needs the (state, option) pair (two lines);
  // lanes' head needs the joined turn (one request, three answers).
  if (!laneHeader && stateSentence != null) {
    const out = new Array(sentences.length);
    let next = 0;
    async function worker() {
      while (next < sentences.length) {
        const i = next++;
        try {
          out[i] = await decide(`${stateSentence}\n${sentences[i]}`, question, laneHeader);
        } catch (e) {
          out[i] = { p: null, ms: null, error: String(e.message || e) };
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, sentences.length) }, worker),
    );
    return out;
  }
  if (!laneHeader && stateSentence == null && question === L.QUESTION && sentences.length === 3) {
    try {
      return await decideTurn(sentences.join("\n"), question, 3, laneHeader);
    } catch (e) {
      const err = String(e.message || e);
      return sentences.map(() => ({ p: null, ms: null, error: err }));
    }
  }
  const out = new Array(sentences.length);
  let next = 0;
  async function worker() {
    while (next < sentences.length) {
      const i = next++;
      try {
        out[i] = await decide(sentences[i], question, laneHeader);
      } catch (e) {
        out[i] = { p: null, ms: null, error: String(e.message || e) };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, sentences.length) }, worker),
  );
  return out;
}

// First-argmax over the non-null p's (lowest index on ties).
function argmax(ps) {
  let best = -1;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] == null) continue;
    if (best === -1 || ps[i] > ps[best]) best = i;
  }
  return best;
}

// The per-lane X-Reflex-Lane value: laya and raw are explicit engine lanes
// (raw skips the fitted heads — the baseline board); the modelless lane is
// the default head-first posture and sends no header.
const LANE_HEADER = { laya: "laya", raw: "raw", modelless: null };

// ── shared helpers ─────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const pad = (n, w) => String(n).padStart(w, "0");
const p50 = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? Math.round(v[Math.floor(v.length / 2)] * 10) / 10 : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setReadout(prefix, fields) {
  for (const [k, v] of Object.entries(fields)) {
    const el = $(`${prefix}-${k}`);
    if (el) el.textContent = v;
  }
}

// The seed control means different things per mode: live it seeds the shared
// piece stream (same seed = same game on both lanes); in the recorded demo the
// stream is fixed bytes and the seed only shuffles the modelless lane's random
// abstain fallback. Relabel so a recording never looks seed-driven.
function markSeedMode(isDemo) {
  const liveHead = arenaHeadReady();
  for (const g of ["tetris", "flappy", "lanes"]) {
    const input = $(`${g}-seed`);
    const label = input?.closest("label");
    if (!label) continue;
    label.classList.toggle("demo-seed", isDemo);
    label.title = isDemo
      ? liveHead
        ? "Seeds the modelless board's live in-tab game (wasm head); the laya board replays a fixed recorded game"
        : "Recorded demo — the board stream is fixed; this seed only shuffles the random abstain fallback"
      : "Seeds the piece stream — the same seed plays the same game on both lanes";
    const word = label.querySelector(".seed-word");
    if (word) word.textContent = isDemo && !liveHead ? "fallback seed" : "seed";
  }
}

const FALLBACK_NOTE = " · abstain → random fallback";
// The raw board's demo posture: it is a live-engine lane with no recorded
// substitute — a replay would be invented data, so the board stays empty,
// labelled.
const RAW_DEMO_NOTE = "raw baseline is a live-engine lane — start the engine to play it";

// ── Tetris board ───────────────────────────────────────────────────────────

class TetrisBoard {
  constructor(lane, ui) {
    this.lane = lane; // "laya" | "modelless"
    this.ui = ui; // {canvas, score, lines, stats, readout}
    this.running = false;
    this.reset(607);
  }

  reset(seed) {
    this.rng = new Rng(seed);
    this.board = T.emptyBoard();
    this.score = 0;
    this.lines = 0;
    this.pieces = 0;
    this.decisions = 0;
    this.abstains = 0;
    this.errors = 0;
    this.latencies = [];
    this.opts = [];
    this.ps = [];
    this.chosen = -1;
    this.over = false;
    this.demoTurn = 0;
    this.render();
    this.renderStats();
    setReadout(this.ui.readout, {
      src: this.srcLabel(), state: "—", q: "—", a: "—", act: "—", t: "—",
    });
  }

  srcLabel() {
    if (this.lane === "raw") return "raw · baseline (heads skipped)";
    if (this.lane === "modelless" && demoMode && arenaHeadReady()) {
      return "modelless · wasm head (in-tab)";
    }
    return demoMode ? `${this.lane} · demo` : this.lane;
  }

  async run(delayMs) {
    this.running = true;
    while (this.running && !this.over) {
      await this.step();
      if (this.running && !this.over && delayMs > 0) await sleep(delayMs);
    }
    this.running = false;
  }

  async step() {
    // Demo: each lane replays ITS OWN recorded game — the laya board the
    // model-based walk (full-argmax play), the modelless board the fitted
    // head's walk (with the recorded per-decision ms) — UNLESS the
    // browser-live wasm head is up, in which case the modelless board
    // PLAYS its own game right here: same grammar, same fit, zero engine.
    // Boards without a head walk fall back to the old labelled abstain
    // behavior.
    const liveHead = demoMode && this.lane === "modelless" && arenaHeadReady();
    // The walk locals are DEMO-ONLY — in live mode `demo` is null and the
    // unguarded `demo.tetrisWalk` below was a live-path TypeError (the T12
    // demo-walk refactor broke the live boards; the live smoke had not run
    // since). Computed only when a demo is actually loaded.
    const headWalk = demoMode && this.lane === "modelless" && demo && demo.tetrisHeadWalk.length > 0;
    const walkArr = demo
      ? (this.lane === "laya" || !headWalk ? demo.tetrisWalk : demo.tetrisHeadWalk)
      : null;
    let demoRec = null;
    if (demoMode && demo && !liveHead) {
      demoRec = this.demoTurn < walkArr.length ? walkArr[this.demoTurn] : null;
      this.demoTurn += 1;
      if (!demoRec) {
        this.over = true;
        setReadout(this.ui.readout, {
          src: this.srcLabel(),
          a: `recorded demo ends here (${this.pieces} pieces) — start the engine for live play`,
          act: "demo complete",
        });
        return;
      }
      this.board = T.fromStrings(demoRec[3]);
    }
    const piece = demoRec ? demoRec[2] : T.PIECES[this.rng.u32Below(7)];
    this.opts = T.buildTurn(this.board, piece);
    if (this.opts.length === 0) {
      this.over = true;
      setReadout(this.ui.readout, {
        a: "top-out — no landing spot fits",
        act: "game over",
      });
      return;
    }
    setReadout(this.ui.readout, {
      src: this.srcLabel(),
      state: this.opts[0].stateSentence,
      q: T.SPOT_QUESTION,
      a: `reading ${this.opts.length} spots…`,
      act: "…",
      t: demoMode && !liveHead ? "recorded" : "…",
    });
    this.chosen = -1;
    this.ps = new Array(this.opts.length).fill(null);
    this.render();

    // Progressive scoring: the heatmap fills as answers arrive. (Demo: the
    // recorded p's arrive at once.)
    const sentences = this.opts.map((o) => o.sentence);
    const t0 = performance.now();
    const results = await scoreOptions(
      sentences,
      T.SPOT_QUESTION,
      LANE_HEADER[this.lane],
      this.lane === "laya" ? 6 : 16,
      demoRec ? demoRec[1] : null,
      demoRec ? demoRec[5] : null,
      this.lane === "laya" || headWalk,
    );
    const wallMs = performance.now() - t0;
    const wall = Math.round(wallMs);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.error) this.errors += 1;
      this.ps[i] = r.p;
      if (r.ms != null) this.latencies.push(r.ms);
    }
    this.render();

    if (!demoMode && results.every((r) => r.error)) {
      // Every request failed — the engine is gone; stop instead of playing
      // an unlabelled random game.
      this.over = true;
      setReadout(this.ui.readout, {
        a: `engine unreachable (${results[0].error})`,
        act: "stopped",
      });
      this.renderStats();
      return;
    }

    // Demo laya replays the recorded argmax pick; the head board argmaxes its
    // own recorded ps (identical to what the recorder placed).
    const forced = demoRec && this.lane === "laya" && !headWalk ? demoRec[4] : null;
    const pick = argmax(this.ps);
    this.decisions += 1;
    if (forced != null && forced >= 0) {
      this.chosen = forced;
      setReadout(this.ui.readout, {
        a: `P(clean) ${this.ps[forced].toFixed(3)} — recorded play, spot ${forced + 1}/${this.opts.length}`,
      });
    } else if (pick === -1) {
      // The honest abstain: no signal, so the game falls back to a random
      // legal spot (labelled — never presented as an engine answer).
      this.abstains += 1;
      this.chosen = this.rng.u32Below(this.opts.length);
      setReadout(this.ui.readout, {
        a: `abstain ×${this.opts.length}${FALLBACK_NOTE}`,
      });
    } else {
      this.chosen = pick;
      const best = Math.max(...this.ps.filter((p) => p != null));
      setReadout(this.ui.readout, {
        a: `P(clean) ${best.toFixed(3)} — spot ${this.chosen + 1}/${this.opts.length}`,
      });
    }
    const opt = this.opts[this.chosen];
    setReadout(this.ui.readout, {
      act: `${piece} → rot ${opt.rot}, col ${opt.col}${
        forced != null && forced >= 0 ? " · recorded" : pick === -1 ? FALLBACK_NOTE : ""
      }`,
      t: liveHead
        ? `wasm · ${this.opts.length} spots in ${wallMs.toFixed(2)} ms (~${Math.max(1, Math.round((wallMs / this.opts.length) * 1000))} µs/spot)`
        : demoMode
          ? `recorded · p50 ${p50(this.latencies) ?? "—"} ms · ${this.opts.length} spots`
          : `p50 ${p50(this.latencies) ?? "—"} ms · ${this.opts.length} spots in ${wall} ms`,
    });
    this.render();

    const cleared = T.commitPlacement(this.board, opt);
    this.lines += cleared;
    this.score += [0, 40, 100, 300, 1200][Math.min(cleared, 4)];
    this.pieces += 1;
    this.render();
    this.renderStats();
  }

  render() {
    const cv = $(this.ui.canvas);
    const ctx = cv.getContext("2d");
    const CW = cv.width / T.WIDTH;
    const CH = cv.height / T.HEIGHT;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = "rgba(58,33,23,0.6)";
    ctx.lineWidth = 1;
    for (let c = 1; c < T.WIDTH; c++) {
      ctx.beginPath(); ctx.moveTo(c * CW, 0); ctx.lineTo(c * CW, cv.height); ctx.stroke();
    }
    for (let r = 1; r < T.HEIGHT; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CH); ctx.lineTo(cv.width, r * CH); ctx.stroke();
    }
    for (let r = 0; r < T.HEIGHT; r++) {
      for (let c = 0; c < T.WIDTH; c++) {
        if (this.board[r][c]) {
          ctx.fillStyle = "#8a5a3a";
          ctx.fillRect(c * CW + 1, r * CH + 1, CW - 2, CH - 2);
        }
      }
    }
    // option heatmap
    for (let i = 0; i < this.opts.length; i++) {
      const opt = this.opts[i];
      const p = this.ps[i];
      const chosen = i === this.chosen;
      const alpha = p == null ? 0.1 : 0.12 + 0.7 * p;
      ctx.fillStyle = chosen ? "rgba(111,191,115,0.85)" : `rgba(224,92,27,${alpha.toFixed(2)})`;
      for (const [r, c] of opt.cells) {
        ctx.fillRect(c * CW + 1, r * CH + 1, CW - 2, CH - 2);
      }
      if (chosen) {
        ctx.strokeStyle = "#6fbf73";
        ctx.lineWidth = 2;
        for (const [r, c] of opt.cells) {
          ctx.strokeRect(c * CW + 1, r * CH + 1, CW - 3, CH - 3);
        }
      }
    }
  }

  renderStats() {
    $(this.ui.score).textContent = pad(this.score, 4);
    $(this.ui.lines).textContent = pad(this.lines, 3);
    $(this.ui.stats).textContent =
      `pieces ${this.pieces} · decisions ${this.decisions}` +
      ` · abstains ${this.abstains} · errors ${this.errors}` +
      ` · p50 ${p50(this.latencies) ?? "—"} ms`;
  }
}

// ── Flappy board ───────────────────────────────────────────────────────────

class FlappyBoard {
  constructor(lane, ui) {
    this.lane = lane;
    this.ui = ui; // {canvas, pipes, crashes, readout}
    this.running = false;
    this.reset(607);
  }

  reset(seed) {
    this.seed = seed;
    this.pipes = 0;
    this.crashes = 0;
    this.draw({ y: 6, v: 0, g: 6, h: 2 }, []);
    $(this.ui.pipes).textContent = pad(0, 3);
    $(this.ui.crashes).textContent = pad(0, 3);
    setReadout(this.ui.readout, { state: "—", a: "—", act: "— " });
  }

  async run() {
    // Demo mode replays the recorded reel — EXCEPT the modelless lane with
    // a live flappy wasm head, which plays its own game right here (the
    // reel stays the laya lane's replay and the head-less fallback).
    if (demoMode && demo && !(this.lane === "modelless" && arenaFlappyHeadReady())) {
      return this.runDemo();
    }
    this.running = true;
    const rng = new Rng(this.seed);
    let y = rng.i32Range(3, F.GRID_H - 3);
    let v = rng.i32Range(-1, 2);
    while (this.running) {
      // Approach: pure coasting with gravity (no decisions), 2-3 ticks —
      // the exact play_game stream shape.
      const approach = rng.i32Range(2, 4);
      let crashed = false;
      for (let j = 0; j < approach; j++) {
        v = Math.max(v - 1, F.V_MIN);
        y += v;
        if (!F.inBounds(y)) { crashed = true; break; }
        this.draw({ y, v, g: null, h: 2 }, []);
        await sleep(140);
      }
      if (crashed) {
        this.crashes += 1;
        $(this.ui.crashes).textContent = pad(this.crashes, 3);
        y = rng.i32Range(3, F.GRID_H - 3);
        v = rng.i32Range(-1, 2);
        continue;
      }
      if (!this.running) break;
      const h = rng.u32Below(2) === 0 ? 2 : 3;
      const g = rng.i32Range(h + 1, F.GRID_H - h);
      const s = { y, v, g, h };
      const turn = F.buildTurn(s);
      setReadout(this.ui.readout, {
        state: F.renderStateSentence(s), a: "deciding…", act: "…",
      });
      const results = await scoreOptions(
        turn.options.map((o) => o.sentence),
        turn.question,
        LANE_HEADER[this.lane],
        2,
        null,
        null,
        false,
        turn.stateSentence,
      );
      if (!this.running) break;
      const ps = results.map((r) => r.p);
      const pick = argmax(ps);
      const idx = pick === -1 ? rng.u32Below(turn.options.length) : pick;
      const note = pick === -1 ? FALLBACK_NOTE : `P(clean) ${ps[idx].toFixed(3)}`;
      setReadout(this.ui.readout, {
        a: `flap ${ps[0]?.toFixed(3) ?? "—"} · coast ${ps[1]?.toFixed(3) ?? "—"} — ${note}`,
        act: turn.options[idx].label,
      });
      this.draw(s, ps, idx);
      await sleep(200);
      const [y2, v2] = F.result(s, turn.options[idx].label);
      if (!F.inBounds(y2) || Math.abs(y2 - g) > h) {
        this.crashes += 1;
        $(this.ui.crashes).textContent = pad(this.crashes, 3);
        this.draw(s, ps, idx, true);
        await sleep(500);
        y = rng.i32Range(3, F.GRID_H - 3);
        v = rng.i32Range(-1, 2);
        continue;
      }
      this.pipes += 1;
      $(this.ui.pipes).textContent = pad(this.pipes, 3);
      y = y2;
      v = v2;
    }
    this.running = false;
  }

  // Demo reel: replay the recorded decision states (independent captures, not
  // a chained flight — disclosed in the banner). laya shows the recorded
  // probabilities; modelless abstains → labelled random action.
  async runDemo() {
    this.running = true;
    const rng = new Rng(this.seed);
    for (const rec of demo.flappyWalk) {
      if (!this.running) break;
      const s = rec[2];
      const turn = F.buildTurn(s);
      setReadout(this.ui.readout, { state: rec[0], a: "deciding…", act: "…" });
      const results = await scoreOptions(
        turn.options.map((o) => o.sentence),
        turn.question,
        LANE_HEADER[this.lane],
        2,
        rec[1],
        null,
        this.lane === "laya",
        turn.stateSentence,
      );
      if (!this.running) break;
      const ps = results.map((r) => r.p);
      const pick = argmax(ps);
      const idx = pick === -1 ? rng.u32Below(turn.options.length) : pick;
      const note = pick === -1 ? FALLBACK_NOTE : `P(clean) ${ps[idx].toFixed(3)}`;
      setReadout(this.ui.readout, {
        a: `flap ${ps[0]?.toFixed(3) ?? "—"} · coast ${ps[1]?.toFixed(3) ?? "—"} — ${note}`,
        act: turn.options[idx].label,
      });
      const [y2] = F.result(s, turn.options[idx].label);
      const crash = !F.inBounds(y2) || Math.abs(y2 - s.g) > s.h;
      this.draw(s, ps, idx, crash);
      if (crash) {
        this.crashes += 1;
        $(this.ui.crashes).textContent = pad(this.crashes, 3);
      } else {
        this.pipes += 1;
        $(this.ui.pipes).textContent = pad(this.pipes, 3);
      }
      await sleep(crash ? 700 : 450);
      this.draw({ y: s.y, v: s.v, g: null, h: 2 }, []);
      await sleep(120);
    }
    if (this.running) {
      setReadout(this.ui.readout, {
        state: "recorded demo reel complete — start the engine for live play",
        a: "—",
        act: "demo complete",
      });
    }
    this.running = false;
  }

  draw(s, ps, chosen, crash) {
    const cv = $(this.ui.canvas);
    const ctx = cv.getContext("2d");
    const COLS = 8;
    const CW = cv.width / COLS;
    const CH = cv.height / F.GRID_H;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (s.g != null) {
      // the pipe's gap band + walls
      ctx.fillStyle = "rgba(138,90,58,0.9)";
      ctx.fillRect(cv.width - CW * 2, 0, CW * 2, (s.g - s.h) * CH);
      const lo = s.g + s.h + 1;
      if (lo < F.GRID_H) {
        ctx.fillRect(cv.width - CW * 2, lo * CH, CW * 2, (F.GRID_H - lo) * CH);
      }
      ctx.fillStyle = "rgba(111,191,115,0.22)";
      ctx.fillRect(cv.width - CW * 2, (s.g - s.h) * CH, CW * 2, (2 * s.h + 1) * CH);
    }
    // each option's resulting cell
    F.ACTIONS.forEach((label, i) => {
      const [y2] = F.result(s, label);
      if (!F.inBounds(y2)) return;
      const p = ps[i];
      ctx.fillStyle =
        i === chosen
          ? (crash ? "rgba(224,92,92,0.9)" : "rgba(111,191,115,0.8)")
          : `rgba(224,92,27,${p == null ? 0.1 : (0.15 + 0.6 * p).toFixed(2)})`;
      ctx.fillRect(CW * 4, y2 * CH + 2, CW - 4, CH - 4);
    });
    // the bird
    ctx.fillStyle = crash ? "#e05c5c" : "#e0b34c";
    ctx.beginPath();
    ctx.arc(CW * 2 + CW / 2, (s.y + 0.5) * CH, Math.min(CW, CH) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Lanes board ────────────────────────────────────────────────────────────

class LanesBoard {
  constructor(lane, ui) {
    this.lane = lane;
    this.ui = ui; // {lanesEl, steps, crashes, readout}
    this.running = false;
    this.reset(607);
  }

  reset(seed) {
    this.seed = seed;
    this.steps = 0;
    this.crashes = 0;
    this.draw(null, [], -1);
    $(this.ui.steps).textContent = pad(0, 3);
    $(this.ui.crashes).textContent = pad(0, 3);
    setReadout(this.ui.readout, { state: "—", a: "—", act: "— " });
  }

  async run() {
    // Demo mode replays the recorded reel — EXCEPT the modelless lane with
    // a live lanes wasm head, which plays its own game right here (the
    // reel stays the laya lane's replay and the head-less fallback).
    if (demoMode && demo && !(this.lane === "modelless" && arenaLanesHeadReady())) return this.runDemo();
    this.running = true;
    const rng = new Rng(this.seed);
    while (this.running) {
      const s = L.sampleState(rng);
      const turn = L.buildTurn(s);
      setReadout(this.ui.readout, {
        state: L.renderStateSentence(s), a: "deciding…", act: "…",
      });
      const results = await scoreOptions(
        turn.options.map((o) => o.sentence),
        turn.question,
        LANE_HEADER[this.lane],
        3,
      );
      if (!this.running) break;
      const ps = results.map((r) => r.p);
      const pick = argmax(ps);
      const idx = pick === -1 ? rng.u32Below(3) : pick;
      setReadout(this.ui.readout, {
        a: ps.map((p, i) => `${L.LANE_NAMES[i]} ${p == null ? "—" : p.toFixed(3)}`).join(" · ") +
          (pick === -1 ? FALLBACK_NOTE : ""),
        act: `${L.LANE_NAMES[idx]} (lane${idx})`,
      });
      this.draw(s, ps, idx);
      await sleep(400);
      const l = s.lanes[idx];
      if (l.kind !== "Clear" && l.dist === "Close") {
        this.crashes += 1;
        $(this.ui.crashes).textContent = pad(this.crashes, 3);
        this.draw(s, ps, idx, true);
        await sleep(600);
      } else {
        this.steps += 1;
        $(this.ui.steps).textContent = pad(this.steps, 3);
      }
    }
    this.running = false;
  }

  // Demo reel: the recorded decision states (see FlappyBoard.runDemo).
  async runDemo() {
    this.running = true;
    const rng = new Rng(this.seed);
    for (const rec of demo.lanesWalk) {
      if (!this.running) break;
      const s = rec[2];
      const turn = L.buildTurn(s);
      setReadout(this.ui.readout, { state: rec[0], a: "deciding…", act: "…" });
      const results = await scoreOptions(
        turn.options.map((o) => o.sentence),
        turn.question,
        LANE_HEADER[this.lane],
        3,
        rec[1],
        null,
        this.lane === "laya",
      );
      if (!this.running) break;
      const ps = results.map((r) => r.p);
      const pick = argmax(ps);
      const idx = pick === -1 ? rng.u32Below(3) : pick;
      setReadout(this.ui.readout, {
        a: ps.map((p, i) => `${L.LANE_NAMES[i]} ${p == null ? "—" : p.toFixed(3)}`).join(" · ") +
          (pick === -1 ? FALLBACK_NOTE : ""),
        act: `${L.LANE_NAMES[idx]} (lane${idx})`,
      });
      const l = s.lanes[idx];
      if (l.kind !== "Clear" && l.dist === "Close") {
        this.crashes += 1;
        $(this.ui.crashes).textContent = pad(this.crashes, 3);
        this.draw(s, ps, idx, true);
      } else {
        this.steps += 1;
        $(this.ui.steps).textContent = pad(this.steps, 3);
        this.draw(s, ps, idx);
      }
      await sleep(500);
    }
    if (this.running) {
      setReadout(this.ui.readout, {
        state: "recorded demo reel complete — start the engine for live play",
        a: "—",
        act: "demo complete",
      });
    }
    this.running = false;
  }

  draw(s, ps, chosen, crash) {
    const box = $(this.ui.lanesEl);
    box.innerHTML = "";
    const lanesState = s ? s.lanes : [null, null, null];
    lanesState.forEach((l, i) => {
      const div = document.createElement("div");
      div.className = "lane" + (l ? (l.kind === "Clear" ? " clear" : " blocked") : "");
      if (i === chosen) div.classList.add("chosen");
      const p = ps[i];
      div.innerHTML =
        `<span class="kind">${l ? (l.kind === "Clear" ? "clear" : String(l.kind)) : "—"}</span>` +
        (l && l.kind !== "Clear" ? `<span>${String(l.dist)}</span>` : "") +
        `<span class="p">${p == null ? "—" : `p ${p.toFixed(3)}`}</span>` +
        (crash && i === chosen ? `<span>✕ crash</span>` : "");
      box.appendChild(div);
    });
  }
}

// ── wiring ─────────────────────────────────────────────────────────────────

const tetris = {
  laya: new TetrisBoard("laya", {
    canvas: "tb-laya", score: "ts-laya", lines: "tl-laya", stats: "tst-laya", readout: "tr-laya",
  }),
  modelless: new TetrisBoard("modelless", {
    canvas: "tb-modelless", score: "ts-modelless", lines: "tl-modelless", stats: "tst-modelless", readout: "tr-modelless",
  }),
  raw: new TetrisBoard("raw", {
    canvas: "tb-raw", score: "ts-raw", lines: "tl-raw", stats: "tst-raw", readout: "tr-raw",
  }),
};
const flappy = {
  laya: new FlappyBoard("laya", {
    canvas: "fb-laya", pipes: "fp-laya", crashes: "fx-laya", readout: "fr-laya",
  }),
  modelless: new FlappyBoard("modelless", {
    canvas: "fb-modelless", pipes: "fp-modelless", crashes: "fx-modelless", readout: "fr-modelless",
  }),
  raw: new FlappyBoard("raw", {
    canvas: "fb-raw", pipes: "fp-raw", crashes: "fx-raw", readout: "fr-raw",
  }),
};
const lanesGame = {
  laya: new LanesBoard("laya", {
    lanesEl: "lb-laya", steps: "lp-laya", crashes: "lx-laya", readout: "lr-laya",
  }),
  modelless: new LanesBoard("modelless", {
    lanesEl: "lb-modelless", steps: "lp-modelless", crashes: "lx-modelless", readout: "lr-modelless",
  }),
  raw: new LanesBoard("raw", {
    lanesEl: "lb-raw", steps: "lp-raw", crashes: "lx-raw", readout: "lr-raw",
  }),
};

function stopAll() {
  for (const b of [...Object.values(tetris), ...Object.values(flappy), ...Object.values(lanesGame)]) {
    b.running = false;
  }
}

function laneReady(lane) {
  if (lane === "modelless") return lanes.modelless === "ready" || lanes.modelless === "unknown";
  if (lane === "raw") return lanes.raw === "ready";
  return lanes.laya === "ready";
}

const LANE_HINT = {
  laya: (state) =>
    `laya lane is ${state}` +
    (state === "off" || state === "down"
      ? " — restart the engine with RIIR_REFLEX_LAYA=1"
      : state === "loading"
        ? " — weights still loading, retry in a minute"
        : ""),
  modelless: () => "engine unreachable — start it with the door open for this origin",
  raw: (state) =>
    state === "down"
      ? "engine unreachable — start it with the door open for this origin"
      : "raw lane needs engine v0.2.3+ (the X-Reflex-Lane: raw knob)",
};

function bindRun(gameName, boards, runArg) {
  const btn = $(`${gameName}-run`);
  const reset = $(`${gameName}-reset`);
  const seedInput = $(`${gameName}-seed`);
  btn.addEventListener("click", async () => {
    demoSession += 1; // any manual press ends the auto-start demo loop
    if (btn.textContent === "Stop") {
      stopAll();
      btn.textContent = "Start";
      return;
    }
    stopAll();
    const seed = Number(seedInput.value) || 607;
    for (const b of Object.values(boards)) b.reset(seed);
    await probe();
    // Engine down? Replay the recorded demo (labelled) instead of idling.
    let isDemo = false;
    if (lanes.modelless === "down") {
      try {
        await loadDemo();
        isDemo = true;
      } catch (e) {
        /* oracle unavailable — fall through to the lane hints */
      }
    }
    demoMode = isDemo;
    markSeedMode(isDemo);
    $("demo-banner").hidden = !isDemo;
    const jobs = [];
    for (const [lane, b] of Object.entries(boards)) {
      if (isDemo && lane === "raw") {
        setReadout(b.ui.readout, {
          state: RAW_DEMO_NOTE, a: "lane unavailable", act: "—",
        });
      } else if (isDemo || laneReady(lane)) {
        jobs.push(b.run(typeof runArg === "function" ? runArg() : undefined));
      } else {
        setReadout(b.ui.readout, {
          state: LANE_HINT[lane](lanes[lane]),
          a: "lane unavailable", act: "—",
        });
      }
    }
    btn.textContent = "Stop";
    await Promise.all(jobs);
    btn.textContent = "Start";
  });
  reset.addEventListener("click", () => {
    stopAll();
    btn.textContent = "Start";
    const seed = Number(seedInput.value) || 607;
    for (const b of Object.values(boards)) b.reset(seed);
  });
}

bindRun("tetris", tetris, () => Number($("tetris-delay").value));
bindRun("flappy", flappy);
bindRun("lanes", lanesGame);

$("tetris-delay").addEventListener("input", (e) => {
  $("tetris-delay-v").textContent = `${(e.target.value / 1000).toFixed(1)}s`;
});

// tabs
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("on"));
    document.querySelectorAll(".game").forEach((x) => x.classList.remove("on"));
    t.classList.add("on");
    $(`game-${t.dataset.game}`).classList.add("on");
  });
});

// copy buttons
document.querySelectorAll("button[data-copy]").forEach((b) => {
  b.addEventListener("click", () => {
    navigator.clipboard?.writeText(b.dataset.copy);
    const t = b.textContent;
    b.textContent = "copied";
    setTimeout(() => (b.textContent = t), 1200);
  });
});

// First paint: probe the engine; with none running, auto-play the recorded
// demo so the arena shows the lanes immediately — and LOOP it (the games
// end; a frozen dead board is not a demo). Any Start/Stop press ends the loop
// via demoSession; Start then re-probes and goes live the moment the engine
// is up.
let demoSession = 0;
(async () => {
  await probe();
  if (lanes.modelless !== "down") return;
  try {
    await loadDemo();
  } catch (e) {
    return; // oracle unavailable — the launch box alone stays
  }
  const session = ++demoSession;
  demoMode = true;
  markSeedMode(true);
  $("demo-banner").hidden = false;
  renderStatus($("status-text"));
  const delay = () => Number($("tetris-delay").value);
  const btn = $("tetris-run");
  while (session === demoSession && demoMode) {
    const seed = Number($("tetris-seed").value) || 607;
    for (const b of Object.values(tetris)) b.reset(seed);
    setReadout(tetris.raw.ui.readout, {
      state: RAW_DEMO_NOTE, a: "lane unavailable", act: "—",
    });
    btn.textContent = "Stop";
    await Promise.all(
      Object.values(tetris).filter((b) => b.lane !== "raw").map((b) => b.run(delay())),
    );
    if (session !== demoSession || !demoMode) break;
    $("status-text").textContent = `${demoStatusText()} · replaying in 3 s`;
    await sleep(3000);
  }
  if (session === demoSession) btn.textContent = "Start";
})();

setInterval(probe, 4000);
