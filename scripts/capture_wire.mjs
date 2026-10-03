// Capture the engine's HTTP wire from the INSTALLED release binary into
// data/wire.json — the only source for every request/response example on the
// site (the home "Ask it" block, /docs/api/, the footer engine stamp). The
// numbers law: never type a wire example; re-run this after each release and
// then `node scripts/render_wire.mjs` to refresh the pages.
//
//   node scripts/capture_wire.mjs                 # uses `reflex` on PATH
//   node scripts/capture_wire.mjs --engine ./reflex
//
// Refuses a binary whose --version stamp is STALE (not the shipped release
// set). Starts its own engine on an OS-free loopback port, so a running
// `reflex` on :7331 is never touched. Asserts the posture each example is
// captioned with (answered / abstained / error status) — a release that
// changes it fails here instead of shipping a wrong caption.
//
// Since v0.2.4 the game heads are MINT-ONLY (the boot fit retired), so this
// script mints throwaway demo heads first — the demo heads are public BY
// DESIGN (arsenal A10) and the mint is deterministic — and boots the engine
// on them; the home page's caption names the mint step. A second engine
// boots on the vendored sample corpus (`first-corpus/`, the walkthrough's
// download) for the `corpus_answered` / `corpus_off` cases (riir-reflex
// Issue 063's serve lane).
import { spawn, execFileSync } from "node:child_process";
import { createServer, connect } from "node:net";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "data/wire.json");
const argEngine = process.argv.indexOf("--engine");
const ENGINE = argEngine > 0 ? process.argv[argEngine + 1] : "reflex";

const fail = (m) => {
  console.error(`capture_wire: FAIL — ${m}`);
  process.exit(1);
};

// ── the build stamp ────────────────────────────────────────────────────────
const stamp = execFileSync(ENGINE, ["--version"], { encoding: "utf8" }).trim();
const [verLine, ...rest] = stamp.split("\n");
const version = /^reflex (\d+\.\d+\.\d+)$/.exec(verLine)?.[1];
if (!version) fail(`unrecognised --version line ${JSON.stringify(verLine)}`);
if (/STALE/.test(stamp)) fail(`build stamp is STALE — not the shipped binary:\n${stamp}`);
const features = rest.find((l) => l.startsWith("compiled features:"))?.slice(18).trim() ?? "";

// ── the demo heads (mint-only since v0.2.4) ───────────────────────────────
// The mint is deterministic (same fixtures + key → byte-identical vessels)
// and the demo heads are public BY DESIGN — this throwaway key anchors
// nothing but this capture. The engine refuses to serve vessels without a
// trust anchor, so the verifying key rides the boot env.
const tmp = mkdtempSync(path.join(os.tmpdir(), "reflex-wire-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
const CAPTURE_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const headsDir = path.join(tmp, "heads");
// The fixtures live in the engine repo (the workstation convention keeps the
// sibling checkout beside this one); mint-heads resolves them relative to CWD.
const { existsSync } = await import("node:fs");
const FIXTURES = path.join(ROOT, "..", "riir-reflex", "assets", "game_heads");
if (!existsSync(path.join(FIXTURES, "tetris_oracle_laya_en_v3.jsonl"))) {
  fail(`the engine fixtures are not at ${FIXTURES} — clone gist-rs/riir-reflex beside this checkout (the mint needs assets/game_heads)`);
}
const mint = JSON.parse(
  execFileSync(ENGINE, ["mint-heads", "--out", headsDir, "--fixtures", FIXTURES, "--key-id", "42", `--key=${CAPTURE_KEY}`], { encoding: "utf8" }).split("\n").filter((l) => l.startsWith("{")).pop(),
);
const HEADS_PUBKEY = mint.verifying_key;

// ── a free loopback port ───────────────────────────────────────────────────
const port = await new Promise((res, rej) => {
  const s = createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
});
const BASE = `http://127.0.0.1:${port}`;
const child = spawn(ENGINE, [], {
  env: {
    ...process.env,
    RIIR_REFLEX_BIND: `127.0.0.1:${port}`,
    RIIR_REFLEX_ALLOWED_ORIGIN: "",
    RIIR_REFLEX_LAYA: "",
    RIIR_REFLEX_HEADS_DIR: headsDir,
    RIIR_REFLEX_HEADS_PUBKEY: HEADS_PUBKEY,
  },
  stdio: ["ignore", "ignore", "pipe"],
});
let log = "";
child.stderr.on("data", (b) => (log += b));
const stop = () => child.kill();
process.on("exit", stop);

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/healthz`)).ok) break;
  } catch {}
  if (i > 100) fail(`engine never answered /healthz on ${BASE}\n${log}`);
  await new Promise((r) => setTimeout(r, 100));
}

// ── the cases ──────────────────────────────────────────────────────────────
// Kept in the order the API page reads them. `expect` is the caption's
// claim, asserted below.
const TETRIS_SPOT =
  "The piece leaves no holes under it on the left edge, sits flat on the surface, and the stack stays low.";
const TICKET =
  "The staging deploy of release candidate 4.2 finished but the error budget is down to 12 percent and two health endpoints are flapping after the rollout. Rollback is one command. Decide what happens next.";
const ROUTE = { id: "route", kind: "choice", prompt: "Route this ticket to the team that owns it.", options: ["deploy-ops", "billing-support"] };

const CASES = [
  { name: "healthz", method: "GET", path: "/healthz", expect: { status: 200 } },
  {
    name: "answered",
    method: "POST",
    path: "/decide",
    body: { state: TETRIS_SPOT, questions: [{ id: "clean", kind: "noul", prompt: "Does the stack look clean?" }] },
    expect: { status: 200, answered: true },
  },
  {
    name: "abstained",
    method: "POST",
    path: "/decide",
    body: {
      state: TICKET,
      questions: [
        ROUTE,
        { id: "promote", kind: "noul", prompt: "Should the rollout be promoted to production right now?" },
        { id: "severity", kind: "score", prompt: "How severe is this situation?", options: ["routine", "needs-attention", "critical"] },
      ],
    },
    expect: { status: 200, answered: false },
  },
  {
    name: "off_corpus",
    method: "POST",
    path: "/decide",
    body: { state: "My sourdough starter stopped rising after I moved it to a colder kitchen.", questions: [ROUTE] },
    expect: { status: 200, answered: false },
  },
  {
    name: "raw_lane",
    method: "POST",
    path: "/decide",
    headers: { "X-Reflex-Lane": "raw" },
    body: { state: TETRIS_SPOT, questions: [{ id: "clean", kind: "noul", prompt: "Does the stack look clean?" }] },
    expect: { status: 200, answered: false },
  },
  { name: "feedback", method: "POST", path: "/feedback", body: "FROM_ANSWERED", expect: { status: 200 } },
  {
    name: "err_too_few_options",
    method: "POST",
    path: "/decide",
    body: { state: "", questions: [{ id: "q", kind: "choice", prompt: "Pick one.", options: ["only"] }] },
    expect: { status: 422 },
  },
  {
    name: "err_noul_with_options",
    method: "POST",
    path: "/decide",
    body: { state: "", questions: [{ id: "q", kind: "noul", prompt: "Ship it?", options: ["yes", "no"] }] },
    expect: { status: 422 },
  },
  { name: "err_malformed", method: "POST", path: "/decide", raw: "not json", expect: { status: 400 } },
  {
    name: "err_unknown_lane",
    method: "POST",
    path: "/decide",
    headers: { "X-Reflex-Lane": "fast" },
    body: { state: "", questions: [] },
    expect: { status: 400 },
  },
  {
    name: "err_laya_off",
    method: "POST",
    path: "/decide",
    headers: { "X-Reflex-Lane": "laya" },
    body: { state: TICKET, questions: [ROUTE] },
    expect: { status: "4xx-5xx" },
  },
  { name: "err_not_found", method: "GET", path: "/v1/decide", expect: { status: 404 } },
  { name: "err_too_large", method: "POST", path: "/decide", oversize: true, expect: { status: 413 } },
];

// A raw request with a declared body over the ceiling: the edge must refuse
// on the header alone (fetch cannot lie about Content-Length, so a socket).
function oversize(declared) {
  return new Promise((res, rej) => {
    const s = connect(port, "127.0.0.1", () =>
      s.write(`POST /decide HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${declared}\r\n\r\n{}`),
    );
    let buf = "";
    s.on("data", (b) => (buf += b));
    s.on("end", () => {
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(buf)?.[1]);
      res({ status, text: buf.split("\r\n\r\n").slice(1).join("\r\n\r\n") });
    });
    s.on("error", rej);
  });
}

const out = {};
for (const c of CASES) {
  let status, text, sent;
  if (c.oversize) {
    // the ceiling is read from the engine's refusal: 4 MiB + 1 must refuse,
    // 4 MiB exactly must not (a declared-but-unsent body times out instead,
    // so only the refusing side is probed live; the boundary rides `limits`).
    ({ status, text } = await oversize(4 * 1024 * 1024 + 1));
    sent = { declared_content_length: 4 * 1024 * 1024 + 1 };
  } else {
    let body = c.body;
    if (body === "FROM_ANSWERED") {
      // Feedback carries the engine's OWN number for a case, never an invented one.
      const a = JSON.parse(out.answered.response).answers[0];
      body = { p: a.confidence, outcome: true };
    }
    sent = c.raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const r = await fetch(`${BASE}${c.path}`, {
      method: c.method,
      headers: { ...(sent !== undefined ? { "Content-Type": "application/json" } : {}), ...(c.headers ?? {}) },
      body: sent,
    });
    status = r.status;
    text = await r.text();
  }
  // ── assert the caption's claim ──
  const want = c.expect.status;
  if (want === "4xx-5xx" ? status < 400 : status !== want) fail(`${c.name}: status ${status}, captioned ${want} — body ${text}`);
  if ("answered" in c.expect) {
    const answers = JSON.parse(text).answers;
    const any = answers.some((a) => a.outcome !== null);
    if (any !== c.expect.answered) fail(`${c.name}: answered=${any}, captioned ${c.expect.answered} — ${text}`);
  }
  out[c.name] = {
    method: c.method,
    path: c.path,
    ...(c.headers ? { headers: c.headers } : {}),
    ...(typeof sent === "string" ? { request: sent } : sent ? { request_meta: sent } : {}),
    status,
    response: text,
  };
}

// ── the corpus posture (riir-reflex Issue 063's serve lane) ──────────────────
// A second engine boots on the vendored sample corpus (the walkthrough's
// download); the two cases it contributes are the first-corpus story:
// in-corpus ANSWERS (distance-gated), off-corpus abstains. The demo engine
// above stays the plain posture, so its cases stay comparable release to
// release.
const CORPUS_DIR = path.join(ROOT, "first-corpus");
const port2 = await new Promise((res, rej) => {
  const s = createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
});
const child2 = spawn(ENGINE, [], {
  env: {
    ...process.env,
    RIIR_REFLEX_BIND: `127.0.0.1:${port2}`,
    RIIR_REFLEX_ALLOWED_ORIGIN: "",
    RIIR_REFLEX_LAYA: "",
    RIIR_REFLEX_HEADS_DIR: headsDir,
    RIIR_REFLEX_HEADS_PUBKEY: HEADS_PUBKEY,
    RIIR_REFLEX_CORPUS: CORPUS_DIR,
  },
  stdio: ["ignore", "ignore", "pipe"],
});
child2.stderr.on("data", (b) => (log += b));
const BASE2 = `http://127.0.0.1:${port2}`;
for (let i = 0; ; i++) {
  try { if ((await fetch(`${BASE2}/healthz`)).ok) break; } catch {}
  if (i > 100) fail(`the corpus engine never answered /healthz\n${log}`);
  await new Promise((r) => setTimeout(r, 100));
}
const CORPUS_CASES = [
  {
    name: "corpus_answered",
    body: {
      state: "our deploy regressed the error budget after the rollout — run the rollback and verify the health endpoints",
      questions: [{
        id: "route", kind: "choice", prompt: "Which runbook applies?",
        options: ["billing", "deploy", "onboarding"],
      }],
    },
    expect: { status: 200, answered: true },
  },
  {
    name: "corpus_off",
    body: {
      state: "my sourdough starter stopped rising after i moved it to a colder kitchen",
      questions: [{
        id: "route", kind: "choice", prompt: "Which runbook applies?",
        options: ["billing", "deploy", "onboarding"],
      }],
    },
    expect: { status: 200, answered: false },
  },
];
for (const c of CORPUS_CASES) {
  const r = await fetch(`${BASE2}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(c.body),
  });
  const text = await r.text();
  if (r.status !== c.expect.status) fail(`${c.name}: status ${r.status}, captioned ${c.expect.status} — ${text}`);
  if ("answered" in c.expect) {
    const any = JSON.parse(text).answers.some((a) => a.outcome !== null);
    if (any !== c.expect.answered) fail(`${c.name}: answered=${any}, captioned ${c.expect.answered} — ${text}`);
  }
  out[c.name] = { method: "POST", path: "/decide", request: JSON.stringify(c.body), status: r.status, response: text };
}
child2.kill();

// Determinism, measured: the same request twice must return byte-identical
// bytes on the modelless lane (the claim the API page makes).
const again = await fetch(`${BASE}/decide`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: out.abstained.request,
});
const deterministic = (await again.text()) === out.abstained.response;
if (!deterministic) fail("the abstained request did not repeat byte-identically");

const doc = {
  _meta: {
    generator: "scripts/capture_wire.mjs",
    engine: `reflex ${version}`,
    version,
    features,
    release_notes: `https://github.com/gist-rs/reflex/releases/tag/v${version}`,
    captured: new Date().toISOString().slice(0, 10),
    deterministic_repeat: deterministic,
    demo_heads_minted: true,
    note: "every request below was sent to a fresh engine; responses are verbatim bytes. The game heads are minted throwaway demo vessels (mint-only since v0.2.4); the corpus cases boot the vendored first-corpus sample.",
  },
  cases: out,
};
writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
console.log(`capture_wire: ${Object.keys(out).length} cases from reflex ${version} → data/wire.json`);
stop();
process.exit(0);
