/* Reflex arena — the live games. Four lanes play side by side from the same
   seeded stream: laya (Python) — the original torch reference, ALWAYS a
   recorded replay (Python never runs in the engine or this page) — laya
   (Rust), KatGPT modelless and the raw baseline, whose every live decision is
   a real /decide call to the visitor's own engine. Game logic lives in ./games/* — the exact ports
   of the katgpt-rs Plan 607 sims + pinned sentence grammars, golden-checked
   against the committed oracle fixtures. Nothing is scripted. */

import { Rng } from "./games/rng.js";
import * as T from "./games/tetris.js";
import {
  PIECE_COLORS, UNKNOWN_COLOR, withAlpha,
  PieceBag, newStampGrid, clearRowsGrid, replayStamps,
} from "./games/tetris_view.js";
import * as F from "./games/flappy.js";
import * as L from "./games/lanes.js";
import { ensureArenaHead, arenaHeadReady, arenaHeadScore, arenaFlappyHeadReady, arenaHeadScoreState, arenaLanesHeadReady, arenaHeadScoreLanes } from "./arena_head.js";

const ENGINE = "http://127.0.0.1:7331";

// ── engine client ────────────────────────────────────────────────────────────

const lanes = { modelless: "unknown", laya: "unknown", raw: "unknown", python: "recorded" };

// Display names — one source, so "laya" never appears without its runtime
// (the Rust port vs the Python reference are different lanes).
const LANE_NAME = {
  python: "laya (Python)",
  laya: "laya (Rust)",
  modelless: "KatGPT modelless",
  raw: "raw baseline",
};

// ── no-engine demo mode ─────────────────────────────────────────────────────
// Without a local engine the boards replay the recorded Plan 607 oracle (the
// same committed fixtures behind the benchmark tables and the golden tests):
// the laya board shows the recorded probabilities, the modelless board plays
// its real out-of-the-box behavior — abstain → labelled random fallback.
// demoMode flips only in bindRun/auto-start after a failed probe; every demo
// surface is labelled (banner, chips, SOURCE readout).
let demoMode = false;
let demo = null; // the recorded games (arena/demo_oracle.json, see loadRecorded)

// The recorded games — needed in demo mode AND live (the laya (Python)
// board is a recorded replay in both). Tetris walks are per lane; the
// flappy/lanes reels share one state list and carry per-lane [ps, ms] rows.
async function loadRecorded() {
  if (demo) return demo;
  const r = await fetch("/arena/demo_oracle.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`demo oracle HTTP ${r.status}`);
  const j = await r.json();
  demo = {
    tetrisWalk: j.tetris_walk || [],
    tetrisHeadWalk: j.tetris_head_walk || [],
    tetrisRawWalk: j.tetris_raw_walk || [],
    tetrisPythonWalk: j.tetris_python_walk || [],
    flappyWalk: j.flappy_walk || [],
    lanesWalk: j.lanes_walk || [],
    reels: {
      flappy: { python: j.flappy_python || [], raw: j.flappy_raw || [] },
      lanes: { python: j.lanes_python || [], raw: j.lanes_raw || [] },
    },
  };
  return demo;
}

// The recorded tetris walk each lane replays.
function tetrisWalkFor(lane) {
  if (!demo) return [];
  return {
    laya: demo.tetrisWalk,
    modelless: demo.tetrisHeadWalk,
    raw: demo.tetrisRawWalk,
    python: demo.tetrisPythonWalk,
  }[lane] || [];
}

async function loadDemo() {
  await loadRecorded();
  // Best-effort: boot the browser-live heads and probe them against the
  // recorded games BEFORE any board starts, so a board never switches
  // posture mid-game. Resolves "ready" or "failed" — never throws.
  await ensureArenaHead(demo.tetrisHeadWalk, demo.flappyWalk, demo.lanesWalk);
  return demo;
}

function demoStatusText() {
  if (arenaHeadReady()) {
    return "no local engine — the KatGPT modelless board PLAYS LIVE in-tab (fitted head · WebAssembly · zero engine); laya (Rust), laya (Python) and the raw baseline replay recorded games";
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
    else if (state === "recorded") [cls, label] = ["warn", "recorded reference"];
    el.classList.add(cls);
    el.innerHTML = el.innerHTML.replace(/—.*$/, `— ${label}`);
  };
  chip("chip-python", lanes.python);
  chip("chip-modelless", lanes.modelless);
  chip("chip-laya", lanes.laya);
  chip("chip-raw", lanes.raw);
  const up = lanes.modelless !== "down";
  const layaArmed = lanes.laya === "ready" || lanes.laya === "loading";
  const rawArmed = lanes.raw === "ready";
  const armed = ["modelless", layaArmed && "laya", rawArmed && "raw"].filter(Boolean).map((l) => LANE_NAME[l]);
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
// In demo mode there is no engine to ask — recorded games replay in their
// boards, never through here — so only the lanes with a browser-live wasm
// head answer, HERE, in-tab: grammar-gated (tetris: the pinned spot question over the
// option sentence; flappy: the pinned question over the (state, option)
// pair; lanes: the joined-state protocol — the head reads ALL THREE option
// sentences, its cross-lane feature columns count the other lanes), proven
// at load, batch-amortized per-decision timing.
async function scoreOptions(sentences, question, laneHeader, concurrency, stateSentence) {
  if (demoMode) {
    if (!laneHeader && question === T.SPOT_QUESTION && arenaHeadReady()) {
      return amortized(sentences, (s) => arenaHeadScore(s));
    }
    if (!laneHeader && stateSentence != null && arenaFlappyHeadReady()) {
      return amortized(sentences, (s) => arenaHeadScoreState(stateSentence, s));
    }
    if (!laneHeader && stateSentence == null && question === L.QUESTION && arenaLanesHeadReady() && sentences.length === 3) {
      // the joined-state protocol — one call scores the whole turn
      return arenaHeadScoreLanes(sentences[0], sentences[1], sentences[2]);
    }
    // No head for this shape: the honest abstain (recorded games never come
    // through here — replays read their own rows).
    return sentences.map(() => ({ p: null, ms: null }));
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

// The in-tab head answers in a few µs, below what performance.now()
// resolves (browsers coarsen it to 5–100 µs), so a per-call timer — even a
// whole ~17-spot batch — reads 0 and printed "p50 0 ms". Score the turn
// once for the answers, then re-score the SAME (pure) batch until the timer
// has run ≥ MIN_TIMED_MS, and give each decision its amortized share: the
// honest per-decision cost, at a cost of ~0.5 ms per turn.
const MIN_TIMED_MS = 0.5;
const MAX_TIMED_REPS = 2000;
function amortized(sentences, score) {
  const n = Math.max(1, sentences.length);
  const t0 = performance.now();
  const ps = sentences.map(score);
  let reps = 1;
  while (performance.now() - t0 < MIN_TIMED_MS && reps < MAX_TIMED_REPS) {
    for (const s of sentences) score(s);
    reps += 1;
  }
  const each = (performance.now() - t0) / (reps * n);
  return ps.map((p) => ({ p, ms: each }));
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
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
// Milliseconds at a precision that keeps microsecond lanes visible: a 12 µs
// decision reads "0.012 ms" (1.2 µs → "0.0012 ms"), never a rounded "0 ms".
const fmtUs = (ms) => (ms == null ? "—" : (ms * 1000).toFixed(ms * 1000 < 10 ? 1 : 0));
const fmtMs = (ms) => {
  if (ms == null) return "—";
  if (ms < 0.01) return ms.toFixed(4);
  if (ms < 1) return ms.toFixed(3);
  if (ms < 10) return ms.toFixed(2);
  if (ms < 100) return ms.toFixed(1);
  return String(Math.round(ms));
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
        ? "Seeds the KatGPT modelless board's live in-tab game (wasm head); laya (Rust), laya (Python) and raw replay fixed recorded games"
        : "Recorded demo — the board stream is fixed; this seed only shuffles the random abstain fallback"
      : "Seeds the piece stream — the same seed plays the same game on every live lane (laya (Python) always replays its recorded seed-607 game)";
    const word = label.querySelector(".seed-word");
    if (word) word.textContent = isDemo && !liveHead ? "fallback seed" : "seed";
  }
}

const FALLBACK_NOTE = " · abstain → random fallback";
// A lane whose recorded game is missing from the oracle stays empty,
// labelled — a stand-in replay would be invented data.
const NO_RECORDING_NOTE = "no recorded game for this lane — start the engine to play it live";

// ── Tetris board ───────────────────────────────────────────────────────────

class TetrisBoard {
  constructor(lane, ui) {
    this.lane = lane; // "python" | "laya" | "modelless" | "raw"
    this.ui = ui; // {canvas, score, lines, stats, readout}
    this.running = false;
    this.reset(607);
  }

  reset(seed) {
    this.rng = new Rng(seed);
    this.bag = new PieceBag(this.rng); // guideline 7-bag live stream
    this.board = T.emptyBoard();
    this.stamps = newStampGrid(); // which piece occupies each landed cell
    this.curPiece = null;
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
    const name = LANE_NAME[this.lane];
    if (this.lane === "python") return `${name} · recorded torch reference (MPS)`;
    if (this.lane === "modelless" && demoMode && arenaHeadReady()) {
      return `${name} · wasm head (in-tab)`;
    }
    const heads = this.lane === "raw" ? " (heads skipped)" : "";
    return demoMode ? `${name}${heads} · recorded` : `${name}${heads} · your engine`;
  }

  // Replay a recorded game? laya (Python) always (it never runs live); in
  // demo mode every lane except the in-tab wasm head.
  replaying() {
    if (this.lane === "python") return true;
    return demoMode && !(this.lane === "modelless" && arenaHeadReady());
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
    // A replaying board (see replaying()) re-traces ITS OWN recorded game —
    // laya (Rust) / laya (Python) full-argmax play, the modelless head's walk,
    // the raw baseline's heads-skipped walk — each with its recorded
    // per-decision ms. The modelless board with the browser-live wasm head up
    // PLAYS its own game right here instead: same grammar, same fit, zero
    // engine.
    const liveHead = demoMode && this.lane === "modelless" && arenaHeadReady();
    const replay = this.replaying();
    // `demo` may be null live (the Python board loads it on its own) — the
    // walk is looked up only when this board actually replays.
    const walkArr = replay ? tetrisWalkFor(this.lane) : null;
    let demoRec = null;
    if (replay) {
      demoRec = this.demoTurn < walkArr.length ? walkArr[this.demoTurn] : null;
      this.demoTurn += 1;
      if (!demoRec) {
        this.over = true;
        setReadout(this.ui.readout, {
          src: this.srcLabel(),
          a: walkArr.length
            ? `recorded game ends here (${this.pieces} pieces)${this.lane === "python" ? "" : " — start the engine for live play"}`
            : NO_RECORDING_NOTE,
          act: walkArr.length ? "recorded game complete" : "—",
        });
        return;
      }
      this.board = T.fromStrings(demoRec[3]);
      // Recover which piece occupies each recorded cell (null → a fresh
      // grid: old cells fall back to the uniform color, never a guessed
      // stamp; the current turn's placement still gets its color).
      this.stamps = replayStamps(walkArr, this.demoTurn - 1, this.board) ?? newStampGrid();
    }
    const piece = demoRec ? demoRec[2] : this.bag.next();
    this.curPiece = piece;
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
      t: replay ? "recorded" : "…",
    });
    this.chosen = -1;
    this.ps = new Array(this.opts.length).fill(null);
    this.render();

    // Progressive scoring: the heatmap fills as answers arrive. (Demo: the
    // recorded p's arrive at once.)
    const sentences = this.opts.map((o) => o.sentence);
    const t0 = performance.now();
    const results = demoRec
      ? demoRec[1].map((p, i) => ({ p, ms: demoRec[5] ? demoRec[5][i] : null }))
      : await scoreOptions(
        sentences,
        T.SPOT_QUESTION,
        LANE_HEADER[this.lane],
        this.lane === "laya" ? 6 : 16,
      );
    const wallMs = performance.now() - t0;
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

    // A replay places the recorded pick — the argmax, or (raw) the recorded
    // random spot when every option abstained — so the board re-traces the
    // recorded game exactly.
    const forced = demoRec ? demoRec[4] : null;
    const pick = argmax(this.ps);
    this.decisions += 1;
    if (forced != null && forced >= 0) {
      this.chosen = forced;
      if (pick === -1) this.abstains += 1;
      setReadout(this.ui.readout, {
        a: pick === -1
          ? `abstain ×${this.opts.length}${FALLBACK_NOTE} — recorded, spot ${forced + 1}/${this.opts.length}`
          : `P(clean) ${this.ps[forced].toFixed(3)} — recorded play, spot ${forced + 1}/${this.opts.length}`,
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
        ? `wasm · ${this.opts.length} spots · ~${fmtUs(results[0]?.ms)} µs/spot (amortized, re-timed ≥ ${MIN_TIMED_MS} ms)`
        : replay
          ? `recorded · p50 ${fmtMs(p50(this.latencies))} ms/spot · ${this.opts.length} spots`
          : `p50 ${fmtMs(p50(this.latencies))} ms/spot · ${this.opts.length} spots in ${fmtMs(wallMs)} ms`,
    });
    this.render();

    // Stamp the placed piece BEFORE the clear (cells are pre-clear
    // positions), then shift the stamp grid exactly like the board.
    for (const [r, c] of opt.cells) this.stamps[r][c] = piece;
    T.place(this.board, opt.cells);
    const full = T.fullRows(this.board);
    if (full.length) {
      T.clearRows(this.board, full);
      clearRowsGrid(this.stamps, full, null);
    }
    const cleared = full.length;
    this.lines += cleared;
    this.score += [0, 40, 100, 300, 1200][Math.min(cleared, 4)];
    this.pieces += 1;
    // The decision is resolved — drop the heatmap so the board shows
    // clean per-piece colors until the next turn's candidates arrive.
    this.opts = [];
    this.ps = [];
    this.chosen = -1;
    this.curPiece = null;
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
          const pc = this.stamps && this.stamps[r][c];
          ctx.fillStyle = (pc && PIECE_COLORS[pc]) || UNKNOWN_COLOR;
          ctx.fillRect(c * CW + 1, r * CH + 1, CW - 2, CH - 2);
        }
      }
    }
    // candidate-spot heatmap: neutral white ghosts (alpha carries
    // P(clean)); the CHOSEN spot renders in the current piece's own color
    // with a white outline — "this piece lands here".
    for (let i = 0; i < this.opts.length; i++) {
      const opt = this.opts[i];
      const p = this.ps[i];
      const chosen = i === this.chosen;
      const alpha = p == null ? 0.06 : 0.05 + 0.35 * p;
      ctx.fillStyle = chosen
        ? withAlpha(PIECE_COLORS[this.curPiece] ?? UNKNOWN_COLOR, 0.92)
        : `rgba(255,255,255,${alpha.toFixed(2)})`;
      for (const [r, c] of opt.cells) {
        ctx.fillRect(c * CW + 1, r * CH + 1, CW - 2, CH - 2);
      }
      if (chosen) {
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
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
      ` · p50 ${fmtMs(p50(this.latencies))} ms`;
  }
}

// The recorded probabilities a lane replays for reel row i: laya (Rust) is
// the fixture's own ps (rec[1]); laya (Python) and raw carry their own
// recorded [ps, ms] rows; modelless without its head (and any lane with no
// recording) abstains — the honest labelled fallback, never invented data.
function reelPs(game, lane, i, rec, n) {
  if (lane === "laya") return rec[1];
  const row = demo?.reels?.[game]?.[lane]?.[i];
  return row && row[0].length === n ? row[0] : new Array(n).fill(null);
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
    if (this.lane === "python" || (demoMode && demo && !(this.lane === "modelless" && arenaFlappyHeadReady()))) {
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
  // a chained flight — disclosed in the banner). Each lane shows ITS recorded
  // probabilities (reelPs); an abstain plays a labelled random action.
  async runDemo() {
    this.running = true;
    const rng = new Rng(this.seed);
    for (const [i, rec] of demo.flappyWalk.entries()) {
      if (!this.running) break;
      const s = rec[2];
      const turn = F.buildTurn(s);
      setReadout(this.ui.readout, { state: rec[0], a: "deciding…", act: "…" });
      await sleep(0);
      if (!this.running) break;
      const ps = reelPs("flappy", this.lane, i, rec, turn.options.length);
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
        state: this.lane === "python" ? "recorded reel complete" : "recorded demo reel complete — start the engine for live play",
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
    if (this.lane === "python" || (demoMode && demo && !(this.lane === "modelless" && arenaLanesHeadReady()))) return this.runDemo();
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
    for (const [i, rec] of demo.lanesWalk.entries()) {
      if (!this.running) break;
      const s = rec[2];
      const turn = L.buildTurn(s);
      setReadout(this.ui.readout, { state: rec[0], a: "deciding…", act: "…" });
      await sleep(0);
      if (!this.running) break;
      const ps = reelPs("lanes", this.lane, i, rec, turn.options.length);
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
        state: this.lane === "python" ? "recorded reel complete" : "recorded demo reel complete — start the engine for live play",
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
  python: new TetrisBoard("python", {
    canvas: "tb-python", score: "ts-python", lines: "tl-python", stats: "tst-python", readout: "tr-python",
  }),
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

// Legend swatches: injected from PIECE_COLORS so the module stays the
// single color source (the HTML carries no color copies).
(function buildPieceLegend() {
  const host = document.querySelector("#pielegend .swatches");
  if (!host) return;
  for (const p of T.PIECES) {
    const s = document.createElement("span");
    s.className = "swatch";
    s.style.background = PIECE_COLORS[p];
    s.textContent = p;
    host.appendChild(s);
  }
})();
const flappy = {
  python: new FlappyBoard("python", {
    canvas: "fb-python", pipes: "fp-python", crashes: "fx-python", readout: "fr-python",
  }),
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
  python: new LanesBoard("python", {
    lanesEl: "lb-python", steps: "lp-python", crashes: "lx-python", readout: "lr-python",
  }),
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
  if (lane === "python") return demo != null; // a recorded replay — needs only the oracle file
  return lanes.laya === "ready";
}

const LANE_HINT = {
  python: () => "the recorded laya (Python) games could not be loaded (arena/demo_oracle.json)",
  laya: (state) =>
    `laya (Rust) lane is ${state}` +
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
    // Live too: the laya (Python) board replays its recorded game.
    if (!isDemo) await loadRecorded().catch(() => {});
    markSeedMode(isDemo);
    $("demo-banner").hidden = !isDemo;
    const jobs = [];
    for (const [lane, b] of Object.entries(boards)) {
      if (isDemo || laneReady(lane)) {
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
    btn.textContent = "Stop";
    await Promise.all(Object.values(tetris).map((b) => b.run(delay())));
    if (session !== demoSession || !demoMode) break;
    $("status-text").textContent = `${demoStatusText()} · replaying in 3 s`;
    await sleep(3000);
  }
  if (session === demoSession) btn.textContent = "Start";
})();

setInterval(probe, 4000);
