// Record the arena's lane games for the no-engine demo — every lane through
// its REAL scorer, sequential per-option calls (honest per-decision ms):
//
//   tetris_walk        — laya (Rust): the engine's X-Reflex-Lane: laya, TRUE
//                        ARGMAX play
//   tetris_head_walk   — KatGPT modelless: the engine's fitted game head
//   tetris_raw_walk    — raw baseline: X-Reflex-Lane: raw (heads skipped); an
//                        abstain plays a labelled random spot from Rng(SEED+1),
//                        the pick is RECORDED so the replay is exact
//   tetris_python_walk — laya (Python): the ORIGINAL torch reference
//                        (riir-reflex scripts/laya_python_lane.py, the bench's
//                        own oracle) — never shipped, measurement only
//
//   Record shape: [state_sentence, ps (null = abstain), piece, board rows,
//                  pick, ms per option]
//
//   flappy_<lane> / lanes_<lane> (lane = raw | python) — [ps, ms] per row,
//   aligned 1:1 with flappy_walk / lanes_walk (the recorded decision states
//   gen_demo_oracle.mjs owns); python ps are checked against the fixture's
//   laya (Rust) ps before writing.
//
// Every game sees the SAME piece stream (fresh Rng(SEED)). Every walk is
// chain-verified against the site's own enumeration BEFORE writing; the
// flappy/lanes reels + tetris archetype rows are preserved. Timing is a
// transport round-trip either way — HTTP /decide for the engine lanes, the
// oracle's stdin/stdout line for Python — and is disclosed as such in _meta.
//
// Run with the engine up (RIIR_REFLEX_LAYA=1 arms laya; a lane that is not
// ready is skipped and its existing walk kept):
//   node scripts/record_demo_walks.mjs [engine_url] [--python <riir-reflex dir>] [--only=<walk,…>]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Rng } from "../assets/games/rng.js";
import * as T from "../assets/games/tetris.js";
import * as F from "../assets/games/flappy.js";
import * as L from "../assets/games/lanes.js";

const args = process.argv.slice(2);
const pyIdx = args.indexOf("--python");
const PY_REPO = pyIdx >= 0 ? path.resolve(args[pyIdx + 1]) : null;
// --only=tetris_walk,tetris_python_walk re-records just those lanes (every
// other walk is kept byte-for-byte).
const ONLY = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean) ?? null;
const ENGINE = args.find((a, i) => !a.startsWith("--") && i !== pyIdx + 1) ?? "http://127.0.0.1:7331";
const ORACLE = path.resolve(import.meta.dirname, "../arena/demo_oracle.json");
const SEED = 607;
const MAX_TURNS = 80; // demo watchability cap (~48 s at the 0.6 s piece delay)
const PY_FIXTURE_TOL = 1e-3; // rounded-4 reference vs 6-dp fixture + port drift

function argmax(ps) {
  let best = -1;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] == null) continue;
    if (best === -1 || ps[i] > ps[best]) best = i;
  }
  return best;
}

const roundUs = (ms) => Math.round(ms * 1000) / 1000;

function boardRows(board) {
  return board.map((row) => row.map((c) => (c ? "#" : ".")).join(""));
}

// ── scorers: (state, question) → {p | null, ms} ─────────────────────────────

function engineScorer(lane) {
  const score = async (state, question) => {
    const headers = { "Content-Type": "application/json" };
    if (lane) headers["X-Reflex-Lane"] = lane;
    const t0 = performance.now();
    const r = await fetch(`${ENGINE}/decide`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        state,
        questions: [{ id: "q0", kind: "noul", prompt: question, options: [] }],
      }),
    });
    const json = await r.json();
    const ms = performance.now() - t0;
    if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
    const a = (json.answers || [])[0];
    if (!a) throw new Error("no answer");
    // The engine names its device in routing.reason ("… (device metal)");
    // record it so a CPU-posture engine can never publish as the laya lane
    // unlabelled (the 2026-09-25 708 ms walk: CPU engine, loaded box).
    const dev = /\(device ([a-z0-9-]+)\)/.exec(json.routing?.reason ?? "")?.[1];
    if (dev) score.device = dev;
    const abstain = a.outcome == null || a.outcome.noul == null;
    return { p: abstain ? null : a.probabilities[0], ms };
  };
  return score;
}

// The bench's own laya-python oracle, one long-lived process (load once,
// then one JSON line per decision — the harness's exact protocol).
async function pythonScorer(repo) {
  const script = path.join(repo, "scripts", "laya_python_lane.py");
  assert.ok(existsSync(script), `no oracle at ${script}`);
  const py = process.env.LAYA_PYTHON || "python3";
  const device = process.env.LAYA_PY_DEVICE || "mps";
  const child = spawn(py, [script, "english", device], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout });
  const queue = [];
  lines.on("line", (l) => queue.shift()?.(l));
  const nextLine = () => new Promise((res) => queue.push(res));
  const ready = JSON.parse(await nextLine());
  assert.ok(ready.ready, "python oracle did not report ready");
  const score = async (state, question) => {
    const t0 = performance.now();
    child.stdin.write(JSON.stringify({
      state,
      questions: [{ qid: "q0", def: { type: "noul", instructions: question } }],
    }) + "\n");
    const out = JSON.parse(await nextLine());
    const ms = performance.now() - t0;
    return { p: out.answers.q0.p[1], ms };
  };
  score.device = ready.device;
  score.close = () => child.stdin.end();
  return score;
}

// ── tetris: one full game ────────────────────────────────────────────────────
// allowAbstain: an abstain plays a random legal spot from a SEPARATE Rng (the
// piece stream stays identical to every other lane's).
async function recordWalk(name, score, { allowAbstain = false } = {}) {
  const board = T.emptyBoard();
  const rng = new Rng(SEED);
  const fallback = new Rng(SEED + 1);
  const walk = [];
  let score_ = 0, lines = 0, pieces = 0, abstains = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const piece = T.PIECES[rng.u32Below(7)];
    const opts = T.buildTurn(board, piece);
    if (opts.length === 0) break; // natural top-out
    const ps = [];
    const ms = [];
    for (const o of opts) {
      const r = await score(o.sentence, T.SPOT_QUESTION);
      if (r.p == null && !allowAbstain) {
        throw new Error(`${name}: abstained on a grammar-valid sentence (${turn},${o.rot},${o.col})`);
      }
      if (r.p == null) abstains += 1;
      ps.push(r.p);
      ms.push(roundUs(r.ms));
    }
    let pick = argmax(ps);
    if (pick === -1) {
      assert.ok(allowAbstain, `${name}: empty ps`);
      pick = fallback.u32Below(opts.length);
    }
    walk.push([opts[0].stateSentence, ps, piece, boardRows(board), pick, ms]);
    const cleared = T.commitPlacement(board, opts[pick]);
    lines += cleared;
    score_ += [0, 40, 100, 300, 1200][Math.min(cleared, 4)];
    pieces += 1;
  }
  const allMs = walk.flatMap((r) => r[5]).sort((a, b) => a - b);
  const p50 = allMs.length ? allMs[Math.floor(allMs.length / 2)] : null;
  return { walk, summary: { score: score_, lines, pieces, abstains, decisions: allMs.length, p50_ms: p50 } };
}

// Chain-verify exactly like scripts/arena_demo_check.mjs: board + piece from
// record k, the site's own buildTurn must reproduce the record's arity and
// sentence, the pick must be the argmax (or a recorded fallback when every
// option abstained), and placing it must yield record k+1's board.
function verifyWalk(walk, name) {
  assert.ok(walk.length >= 10, `${name}: too short (${walk.length})`);
  for (let k = 0; k < walk.length; k++) {
    const [sentence, ps, piece, rows, pick] = walk[k];
    const board = T.fromStrings(rows);
    const opts = T.buildTurn(board, piece);
    assert.equal(opts.length, ps.length, `${name}[${k}]: arity ${ps.length} vs ${opts.length}`);
    assert.equal(opts[0].stateSentence, sentence, `${name}[${k}]: sentence drift`);
    const am = argmax(ps);
    assert.ok(am === pick || (am === -1 && pick >= 0), `${name}[${k}]: pick is neither argmax nor a fallback`);
    if (k + 1 < walk.length) {
      assert.ok(pick >= 0 && pick < opts.length, `${name}[${k}]: bad pick`);
      const after = board.map((r) => [...r]);
      T.commitPlacement(after, opts[pick]);
      const next = T.fromStrings(walk[k + 1][3]);
      for (let r = 0; r < T.HEIGHT; r++) {
        for (let c = 0; c < T.WIDTH; c++) {
          assert.ok(after[r][c] === next[r][c], `${name}[${k}]: chain broken at (${r},${c})`);
        }
      }
    }
  }
}

// ── flappy / lanes reels: score the recorded states' options ────────────────
async function recordReel(rows, buildTurn, score) {
  const out = [];
  for (const rec of rows) {
    const turn = buildTurn(rec[2]);
    const ps = [];
    const ms = [];
    for (const o of turn.options) {
      const r = await score(o.sentence, turn.question);
      ps.push(r.p == null ? null : Math.round(r.p * 1e6) / 1e6);
      ms.push(roundUs(r.ms));
    }
    out.push([ps, ms]);
  }
  return out;
}

function maxFixtureDelta(reel, rows) {
  let worst = 0;
  reel.forEach(([ps], i) => ps.forEach((p, j) => {
    worst = Math.max(worst, Math.abs(p - rows[i][1][j]));
  }));
  return worst;
}

function reelSummary(reel) {
  const allMs = reel.flatMap((r) => r[1]).sort((a, b) => a - b);
  return {
    rows: reel.length,
    abstains: reel.reduce((n, [ps]) => n + ps.filter((p) => p == null).length, 0),
    p50_ms: allMs.length ? allMs[Math.floor(allMs.length / 2)] : null,
  };
}

// ── probe + record ──────────────────────────────────────────────────────────
const health = await fetch(`${ENGINE}/healthz`, { cache: "no-store" })
  .then((r) => r.json())
  .catch(() => null);
if (!health) {
  console.error(`no engine at ${ENGINE} — start it first (RIIR_REFLEX_LAYA=1 reflex)`);
  process.exit(1);
}
const ready = (l) => health.lanes?.[l] === "ready";
console.log(`engine: ${JSON.stringify(health.lanes)} · python oracle: ${PY_REPO ?? "skipped (no --python)"}`);

const oracle = JSON.parse(readFileSync(ORACLE, "utf8"));
oracle._meta = oracle._meta || { sources: {} };
const recordedAt = new Date().toISOString();
const host = `${os.hostname().split(".")[0]} · ${os.platform()}/${os.arch()}`;

const LANES = [
  { key: "tetris_head_walk", meta: "tetris_head", label: "KatGPT modelless — the corpus-fitted tetris head", ok: ready("modelless"), score: () => engineScorer(null) },
  { key: "tetris_walk", meta: "tetris_laya", label: "laya (Rust) — riir port, engine X-Reflex-Lane: laya, full-argmax play", ok: ready("laya"), score: () => engineScorer("laya") },
  { key: "tetris_raw_walk", meta: "tetris_raw", label: "raw baseline — engine X-Reflex-Lane: raw (heads skipped); abstain → recorded random spot", ok: ready("raw"), score: () => engineScorer("raw"), allowAbstain: true, reels: "raw" },
  { key: "tetris_python_walk", meta: "tetris_python", label: "laya (Python) — the ORIGINAL torch reference (riir-reflex scripts/laya_python_lane.py), measurement only", ok: PY_REPO != null, score: () => pythonScorer(PY_REPO), reels: "python" },
];

for (const lane of LANES) {
  if (ONLY && !ONLY.includes(lane.key)) {
    console.log(`${lane.key}: SKIPPED — not in --only (existing walk kept)`);
    continue;
  }
  if (!lane.ok) {
    console.log(`${lane.key}: SKIPPED — lane not available (existing walk kept)`);
    continue;
  }
  const score = await lane.score();
  console.log(`recording ${lane.key} (seed ${SEED})…`);
  const { walk, summary } = await recordWalk(lane.key, score, { allowAbstain: lane.allowAbstain });
  verifyWalk(walk, lane.key);
  if (lane.key === "tetris_walk" && os.platform() === "darwin" && score.device !== "metal" && !process.env.ALLOW_CPU_LAYA) {
    throw new Error(`tetris_walk: engine laya device is ${score.device ?? "unknown"}, not metal — build with --features laya-riir-metal (ALLOW_CPU_LAYA=1 to publish anyway)`);
  }
  console.log(`  ${lane.key}: ${JSON.stringify(summary)}`);
  oracle[lane.key] = walk;
  // own provenance key per lane (the fixture generator owns `tetris`)
  oracle._meta.sources[lane.meta] = {
    recorder: "scripts/record_demo_walks.mjs",
    lane: lane.label,
    transport: lane.reels === "python"
      ? `stdin/stdout JSONL round-trip (device ${score.device})`
      : `HTTP /decide round-trip${score.device ? ` (device ${score.device})` : ""}`,
    policy: lane.allowAbstain ? "argmax, abstain → Rng(seed+1) random spot" : "argmax",
    seed: SEED,
    recorded_at: recordedAt,
    host,
    question: T.SPOT_QUESTION,
    grammar: T.GRAMMAR_ID,
    summary,
  };
  if (lane.reels) {
    for (const [game, rows, buildTurn] of [
      ["flappy", oracle.flappy_walk, F.buildTurn],
      ["lanes", oracle.lanes_walk, L.buildTurn],
    ]) {
      const reel = await recordReel(rows, buildTurn, score);
      const key = `${game}_${lane.reels}`;
      const sum = reelSummary(reel);
      if (lane.reels === "python") {
        sum.max_delta_vs_rust_fixture = maxFixtureDelta(reel, rows);
        assert.ok(sum.max_delta_vs_rust_fixture <= PY_FIXTURE_TOL,
          `${key}: python drifts ${sum.max_delta_vs_rust_fixture} from the laya (Rust) fixture`);
      }
      oracle[key] = reel;
      oracle._meta.sources[key] = { recorder: "scripts/record_demo_walks.mjs", lane: lane.label, recorded_at: recordedAt, host, summary: sum };
      console.log(`  ${key}: ${JSON.stringify(sum)}`);
    }
  }
  score.close?.();
}

writeFileSync(ORACLE, JSON.stringify(oracle));
console.log(`wrote ${path.relative(process.cwd(), ORACLE)}`);
