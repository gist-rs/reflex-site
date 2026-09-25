# reflex-site

The public arena site for **Reflex** (the riir-reflex decision engine) —
static content only, deployed to `reflex.gist.rs` on Cloudflare Workers
static assets.

- `/` — the landing: the measured TL;DR + the averaged all-suites chart, the
  disk-footprint chart (`/#sizes` — every lane priced in measured bytes), the
  how-it-works figure (a .docs-first SVG, mirrored to `assets/`), per-page
  cards, and the agent-skill section.
- `/playground/` — the playground (talks to the visitor's OWN engine on
  `127.0.0.1:7331`; nothing is uploaded) + the three-step start, and the
  **Reflexer** section: a Tetris position asked of the reflexer engine with
  no install — *Ask Cloudflare* (the Worker; the one section that sends
  anything) or *Ask this tab* (the same wasm, in-tab), with the latency
  capsule for each.
- `/bench/` — the per-task arena tables, rendered client-side from
  `data/bench.json`.
- `/arena/` — the live games, four lanes, 2 per row: laya (Python) | laya
  (Rust), KatGPT modelless | raw baseline, under a TL;DR rendered from
  `data/bench.json`. Tetris adds a fifth, replay-only board — **Reflexer**,
  the rulebook search (katgpt-rs Issue 892, `tetris_rulebook_walk`) — a
  final-result panel on top (`assets/arena_charts.js`: score-as-the-game-goes
  + p50-per-spot latency, re-derived from every recorded walk at load, so the
  outcome reads before any replay ends), and the "How each lane picks a spot"
  figures at the bottom — mermaid sources in katgpt-rs
  `.docs/06_game_arenas/tetris_lane_flows.md`, rendered to `assets/` by
  `scripts/render_tetris_flows.py` (`--check` verifies the two mirrors). With an engine connected, laya (Rust), KatGPT modelless
  and raw play on the visitor's machine; laya (Python) — the original torch
  reference, never shipped — always replays its recorded game. Without an
  engine, the KatGPT modelless Tetris, Flappy and
  three-lanes boards still play LIVE in-tab: `assets/arena_head.wasm` is
  the engine's fitted game heads compiled to WebAssembly (`wasm-head/`
  builds them), parity-proven against the recorded engine play before they
  move a piece; the heavier boards replay recorded games from
  `arena/demo_oracle.json`.
- `data/bench.json` — GENERATED from riir-reflex's harness output by
  `scripts/publish_bench.py` (sanitizes machine-local meta). Never
  hand-typed; a hand-typed number on the site is a defect by definition.

## The Reflexer boards (wasm local + Cloudflare)

Tetris row 2 right is **Reflexer · wasm local**, row 3 left is **Reflexer ·
Cloudflare** (beside the raw baseline). One engine, two hosts: the
reflexer engine (gist-rs/riir-reflexer `crates/reflexer-wasm`,
`wasm32-wasip1`) runs in the tab from `assets/reflexer.wasm`, and the SAME
bytes answer `POST /v1/decide` on the reflexer Worker
(`https://reflexer.foxfox.workers.dev`, riir-reflexer
`cloudflare/reflexer-worker`). Both boards play the identical seeded game;
the Cloudflare board's capsule (`assets/latcap.css`, `.latcap.live`) is the
measured browser round trip per decision, live. The four classic lanes carry
a static `rec` capsule re-derived from their recorded walks at load.

`assets/reflexer.wasm` + `assets/reflexer_host.js` are MIRRORS — rebuild them
from the source, never edit them here (`assets/reflexer.mirror.json` records
the source git + sha256):

```sh
../riir-reflexer/cloudflare/reflexer-worker/build.sh --site .
node scripts/reflexer_parity.mjs                                  # wasm in-process: 300/300 picks = the recorded walk
node scripts/reflexer_parity.mjs --url https://reflexer.foxfox.workers.dev   # the Worker, same check + latency
```

Deploy is manual from the M3 through the riir-deployer manifest (both
Workers, one build step that rebuilds the wasm and this mirror together, so
the in-tab board and the Worker never ship different engine bytes).

## Rebuild the wasm heads

`wasm-head/` is a zero-dependency Rust crate (its own workspace — it must
never join katgpt-rs's). After any change:

```sh
cd wasm-head
CARGO_TARGET_DIR=/tmp/reflex_site_wasm_head cargo test                # recipes + anchors + digests + blob regen
CARGO_TARGET_DIR=/tmp/reflex_site_wasm_head cargo build --release --target wasm32-unknown-unknown --lib
npm exec --yes -- wasm-opt -Oz --enable-bulk-memory \
    -o /tmp/arena_head_oz.wasm \
    /tmp/reflex_site_wasm_head/wasm32-unknown-unknown/release/arena_head_wasm.wasm
cp /tmp/arena_head_oz.wasm ../assets/arena_head.wasm
cd .. && node scripts/arena_head_parity.mjs                           # tetris 836/836 bit-exact + flappy 96/100 + lanes 84/100 or DO NOT ship
```

The corpus blobs inside the crate are generated from the digest-pinned
oracle fixtures by `cargo run --bin gen_corpus` (the only step that runs
the LOO λ selection); `cargo test` proves the committed blobs still match.

## Regenerate the demo oracle reels

`scripts/gen_demo_oracle.mjs` rebuilds the flappy/lanes reels (and the
tetris archetype rows) from the katgpt-rs fixtures — MERGE semantics: every
recorded lane game (the four tetris walks + the laya (Python) / raw reel
rows) is owned by `scripts/record_demo_walks.mjs` and is preserved.

> **The four tetris walks are v2-era artifacts.** They were recorded under
> the `laya-tetris-v2` grammar (deepest-fit drop); the site now serves v3
> (from-top, katgpt-rs Issue 884). The no-engine demo keeps replaying them
> under the grammar they were recorded with — `arena_demo_check.mjs` pins
> that — because under v3 enumeration their boards diverge from the first
> covered-column turn (measured: laya 6/70 turns affected, head 10/46, raw
> 24/38 with 9 out-of-range picks). Re-record all four in one session (below)
> to move the demo to v3; until then the DEMO board is v2-labelled while the
> LIVE boards enumerate v3.

Re-record the lane games — all four in ONE session so the laya (Rust) vs
laya (Python) timing is same-box/same-hour (AC power; see riir-reflex
`scripts/bench_preflight.sh`):

```sh
RIIR_REFLEX_LAYA=1 reflex &                       # engine v0.2.3+ (laya + raw lanes)
node scripts/record_demo_walks.mjs http://127.0.0.1:7331 --python ../riir-reflex
node scripts/arena_demo_check.mjs && node scripts/arena_head_parity.mjs && node scripts/arena_demo_smoke.mjs
```

The Reflexer (rulebook search) walk (`tetris_rulebook_walk`, the katgpt-rs Issue 892
hybrid FSM champion) is recorded in katgpt-rs, not against the engine, and
merged after a stream + chain-replay check (`arena_demo_check.mjs` re-checks
it; `gen_demo_oracle.mjs` preserves it):

```sh
(cd ../katgpt-rs && cargo run --release --example tetris_09_site_walk -- --out /tmp/walk.json)
node scripts/merge_rulebook_walk.mjs /tmp/walk.json
```

`--python` points at a riir-reflex checkout: its `scripts/laya_python_lane.py`
(the bench's own torch oracle, `.raw/laya` + the cached weights) scores the
laya (Python) lane; its reels must match the laya (Rust) fixture within 1e-3
or the recorder refuses to write.

## Regenerate the tables

In `riir-reflex`:

```sh
scripts/fetch_datasets.sh            # once
REFLEX_BENCH_HOST=<host-label> \
    cargo run --release --features laya-riir --bin harness
python3 ../reflex-site/scripts/publish_bench.py \
    <results-primary.json> [results-extra.json ...] ../reflex-site
```

One wrapper mechanises the whole flow (self-test -> publish -> docs-mirror
parity -> the bench-page smoke when playwright is installed):

```sh
scripts/republish_bench.sh <results-primary.json> [results-extra.json ...]
```

The home page is NOT a separate number to maintain: its TL;DR + averaged
chart render from `data/bench.json` too (`assets/app.js`), so republishing
the tables IS the home-page update. Land the bench, re-run the harness +
this publish in the same effort, then commit + deploy. A stale publish is
diagnosable from the page itself: `meta.lane_sources` carries the git sha
per lane.

`REFLEX_BENCH_HOST` names the host in results.json meta (the per-host merge
key — use a self-describing label like `m3` or `4090-windows`, not a bare
uname). Machine labels are machine-side; the page spellings are the
publisher's job — `HOST_DISPLAY` renames `m3-ane` → `m3-max-ane` and
`4090-windows` → `4090-win` at load, and the raw files keep their
`REFLEX_BENCH_HOST` labels. The publish script MERGES per-host rows (Issue 018): the FIRST
results doc is the primary (its suites shape the tables; run the superset
run first), every further doc contributes `meta.hosts` rows + per-suite
`extra_host_lanes`. It REFUSES on modelless accuracy drift between hosts
in the FINAL merged state (the cross-host determinism claim — stop and
file, never publish) and EXCLUDES population-mismatched suites
(code_fixtures is repo-tree-relative at runtime) with a note.

Docs apply in argv order, and a doc whose host was already seen UPDATES
only the lanes it declares (Issue 023 T5 — the lane-scoped re-run): a
modelless-only re-run replaces that host's modelless lane and leaves its
laya lanes untouched; the host row keeps the ORIGINAL run's facts and
gains `lane_sources` (the update run's git sha + date per lane). A
previously-published `data/bench.json` is a valid PRIMARY for a
re-publish — its `meta.hosts` seed the seen-host set, so updates keep the
original facts. Both hosts must move to a new engine TOGETHER: the
final-state drift gate refuses a one-host move (a re-run of one host
alone refuses until the other host's doc joins the same publish).

The per-host inputs live in reflex as `.benchmarks/001_phase1_tables/
results.json` (the m3 primary), `.benchmarks/018_4090windows_run/
results.json` (the windows full lane) and
`.benchmarks/023_t5_4090_modelless/results.json` (the windows
modelless-only post-023 re-run). The self-test covers every merge law:
`python3 scripts/test_publish_bench.py`.

Commit + deploy. The provenance (git sha, date, host, protocols) rides
inside `bench.json` and renders on the page — every host in `meta.hosts`
is named in the provenance line.

## Regenerate the size chart

The `/#sizes` section ("What each lane costs on disk") renders from
`data/sizes.json` — every byte count measured, never hand-typed. Re-run the
wrapper whenever a new reflex release ships, the wasm head is rebuilt
(`assets/arena_head.wasm` is a live source), or a comparison lane's stack
moves:

```sh
scripts/publish_sizes.sh
```

Sources, two classes: **LIVE** (refreshed every run — the gist-rs/reflex
latest release via the GitHub API *plus the unpacked darwin-arm64 archive
downloaded and stat'd*, the Hugging Face tree API for every model bytes
figure, the local wasm) and **RECORDED**
(`data/sizes.measurements.json` — the box-specific halves: python venvs,
the vLLM docker image, the m3 oracle's import closure; each row carries
host + date + the exact command, and is re-measured per bench window, not
estimated). Any failed source REFUSES loudly — a partial footprint report
never renders as a complete one. The self-test
(`scripts/test_publish_sizes.py`) covers the merge laws and the refusal
arms; `scripts/size_chart_smoke.cjs` is the zero-dep render check.

## Mirrored docs surfaces

Two files on this site are MIRRORS of the riir-reflex `.docs` book — the
source of truth lives THERE; edit the source, never the mirror:

- `assets/decision_flow.svg` <- `../riir-reflex/.docs/03_decision_flow/decision_flow.svg`
- `skills/reflex-integration/SKILL.md` <- `../riir-reflex/.docs/04_agent_skill/SKILL.md`

After editing a source (or when riir-reflex's guard flags drift):

```sh
python3 scripts/sync_mirror.py          # copy + report (default)
python3 scripts/sync_mirror.py --check  # verify only; exit 1 = drift, 2 = no sibling checkout
```

riir-reflex's `ci_feature_guard.sh` runs `--check` as a layer (skipping
loudly when this checkout is absent beside it), so a forgotten mirror is
caught at the source repo's gate too.

## Deploy

```sh
npx wrangler deploy          # static assets; the reflex.gist.rs custom domain
                             # is dashboard-attached (wrangler.toml has the why)
npx wrangler dev             # local preview
```

No secrets, no bindings, no KV — the worker serves files and nothing else.

## Theme

Dark red rust (`#B7410E` / `#7C1D05` family) — the owner's explicit color
call. No yellow anywhere.
