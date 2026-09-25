// Reflexer parity — the recorded Reflexer (rulebook search) walk
// (arena/demo_oracle.json `tetris_rulebook_walk`, katgpt-rs
// tetris_09_site_walk.rs, in-process native) re-decided turn by turn through
// the reflexer ENGINE, and every pick must match. Two transports, one check:
//
//   node scripts/reflexer_parity.mjs                 # assets/reflexer.wasm in-process ("wasm local")
//   node scripts/reflexer_parity.mjs --url <worker>  # the Cloudflare Worker ("Reflexer · Cloudflare")
//
// The request is the site's own contract (assets/reflexer_host.js
// placeRequest: hold off, options = buildTurn order as h0i<k>, bag = [] for
// the walk's uniform stream), so a pass proves the arena boards ask the
// engine the question the recorder answered. The URL run also prints the
// round-trip latency distribution the arena capsule shows.
import { readFileSync } from "node:fs";
import path from "node:path";
import * as T from "../assets/games/tetris.js";
import { Reflexer, placePick, placeRequest } from "../assets/reflexer_host.js";
import { streamPieces } from "./rulebook_walk.mjs";

const argv = process.argv.slice(2);
const url = argv.includes("--url") ? argv[argv.indexOf("--url") + 1] : null;
const cap = argv.includes("--cap") ? Number(argv[argv.indexOf("--cap") + 1]) : Infinity;
const root = path.resolve(import.meta.dirname, "..");
const oracle = JSON.parse(readFileSync(path.join(root, "arena/demo_oracle.json"), "utf8"));
const walk = oracle.tetris_rulebook_walk;
const meta = oracle._meta.sources.tetris_rulebook;
if (!meta.stream.startsWith("PIECES[")) throw new Error(`bag remainder not modelled for ${meta.stream}`);
const n = Math.min(walk.length, cap);
const pieces = streamPieces(meta.stream, meta.seed, n + 1);

let decide;
if (url) {
  decide = async (req) => {
    const t0 = performance.now();
    const res = await fetch(new URL("/v1/decide", url), { method: "POST", body: JSON.stringify(req) });
    const env = await res.json();
    return { env, ms: performance.now() - t0, colo: res.headers.get("x-reflexer-colo") };
  };
} else {
  const module = await WebAssembly.compile(readFileSync(path.join(root, "assets/reflexer.wasm")));
  const rx = await Reflexer.instantiate(module);
  decide = async (req) => {
    const t0 = performance.now();
    const env = rx.decide(req);
    return { env, ms: performance.now() - t0 };
  };
}

const board = T.emptyBoard();
const ms = [];
let colo = null;
for (let k = 0; k < n; k++) {
  const [, , piece, rows, pick] = walk[k];
  const opts = T.buildTurn(board, piece);
  const req = placeRequest({ board: rows, cur: piece, next: pieces[k + 1], bag: [], nOptions: opts.length });
  const r = await decide(req);
  if (!r.env.response) throw new Error(`turn ${k}: ${JSON.stringify(r.env.error ?? r.env)}`);
  const got = placePick(r.env);
  if (got !== pick) throw new Error(`turn ${k}: engine picked ${JSON.stringify(got)}, walk recorded ${pick}`);
  ms.push(r.ms);
  colo ??= r.colo;
  T.commitPlacement(board, opts[pick]);
}
ms.sort((a, b) => a - b);
const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(1);
console.log(
  `reflexer parity ${url ? `(worker ${url}${colo ? ` · colo ${colo}` : ""})` : "(assets/reflexer.wasm in-process)"}: ` +
    `${n}/${n} picks identical to the recorded walk · per-decision ms p50 ${q(0.5)} · p90 ${q(0.9)} · min ${ms[0].toFixed(1)} · max ${ms.at(-1).toFixed(1)}`,
);
