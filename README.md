# reflex-site

The public arena site for **Reflex** (the riir-reflex decision engine) —
static content only, deployed to `reflex.gist.rs` on Cloudflare Workers
static assets.

- `/` — the landing: the measured TL;DR + the averaged all-suites chart, the
  disk-footprint chart (`/#sizes` — every lane priced in measured bytes), the
  how-it-works figure (a .docs-first SVG, mirrored to `assets/`), per-page
  cards, and the agent-skill section.
- `/resources/` — the education page. It opens with **#learn**, the Jev primer
  (what a decision model is, the Jev wire, a glossary of every term, one
  request/response example, the Jev-vs-Reflex figure `assets/jev_vs_reflex_flow.svg`
  — a site-owned asset, not a mirror — and the Clef "coming" note, digit-free
  until the Clef lane publishes); then the three-name family (Reflex the product, Instinct the idea,
  Rethink the product) with both family flow figures, a qualitative target matrix, and the three
  development flows. Content is DRY-sourced from each lane's `.docs/05_resources/` + decision-flow docs,
  mirrored under `docs/<lane>/` + `assets/` by `scripts/sync_mirror.py`; every measured claim is a link
  into `/bench/` (the numbers law — the render smoke enforces it on visible text).
  Rasters ship WebP-first (`scripts/image_gate.sh` — resized to the layout width
  they render at, e.g. `assets/jev_vs_reflex_story.webp`, the primer's storybook
  illustration, AI-generated with Google Gemini and converted from the original
  JPEG with cwebp at q 80).
- `/playground/` — the playground (talks to the visitor's OWN engine on
  `127.0.0.1:7331`; nothing is uploaded) + the three-step start, and the
  **Reflexer** section: a Tetris position asked of the reflexer engine with
  no install — *Ask Cloudflare* (the Worker; the one section that sends
  anything) or *Ask this tab* (the same wasm, in-tab), with the latency
  capsule for each.
- `/bench/` — the per-task arena tables, rendered client-side from
  `data/bench.json`. The **Areas & index** section adds the radar view:
  one spoke per area (the decision index) and one per benchmark,
  chance-corrected so suites with different option counts share a radius
  (the chances ride `data/bench.json`'s `areas` block, emitted by
  `scripts/publish_bench.py` from the harness's own option construction).
  A product lane's fallback spokes — the served tier's answer where the
  lane's own arm has no seated cell — draw as triangles (▲) with the
  answering tier named in the tooltip, while `coverage` keeps counting
  the lane's own measured suites.
- `/arena/` — the live games, four lanes, 2 per row: laya (Python) | laya
  (Rust), KatGPT modelless | raw baseline, under a TL;DR rendered from
  `data/bench.json`. Tetris adds a fifth, replay-only board — **Reflexer**,
  the rulebook search (katgpt-rs Issue 892, `tetris_rulebook_walk`) — a
  final-result panel on top (`assets/arena_charts.js`: score-as-the-game-goes
  + p50-per-spot latency, re-derived from every recorded walk at load, so the
  outcome reads before any replay ends), and the "How each lane picks a spot"
  figures at the bottom — mermaid sources in katgpt-rs
  `.docs/06_game_arenas/tetris_lane_flows.md`, rendered to `assets/` by
  `scripts/render_tetris_flows.py` (`--check` verifies the two mirrors). The two rulebook
  figures (search + modes) autoplay as step-through walkthroughs
  (`assets/flow_walk.js` — highlights one flow block per step, 3 s each, manual
  play/pause/prev/next/dot controls, a per-step explanation under the graphic,
  and a mini Tetris board BESIDE the flow, replayed from the real recorded
  rulebook walk (`arena/demo_oracle.json` `tetris_rulebook_walk` through the
  site's own `games/tetris.js` — never hand-drawn: the stack, the falling
  piece, the candidate spots and their score brightness all come from the
  record, and each step rings the cells it talks about);
  `scripts/flow_walk_smoke.mjs` is the headless check; the live-page
  `scripts/arena_prod_smoke.mjs` — run green 2026-09-26 against a local
  engine armed `RIIR_REFLEX_ALLOWED_ORIGIN=https://reflex.gist.rs`, both
  lanes ready). With an engine connected, laya (Rust), KatGPT modelless
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
(`https://reflexer.gist.rs`, riir-reflexer
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
node scripts/reflexer_parity.mjs --url https://reflexer.gist.rs   # the Worker, same check + latency
```

Deploy is manual from the M3 through the riir-deployer manifest (both
Workers, one build step that rebuilds the wasm and this mirror together, so
the in-tab board and the Worker never ship different engine bytes).

## Rebuild the wasm heads

`wasm-head/` is a zero-dependency Rust crate (its own workspace — it must
never join katgpt-rs's). After any change:

```sh
scripts/wasm_head_check.sh --write   # clippy both arms (wasm32 + host), cargo test,
                                     # release build + wasm-opt → assets/arena_head.wasm
node scripts/arena_head_parity.mjs   # every game must PASS (tetris bit-exact, flappy +
                                     # lanes on their published anchors) or DO NOT ship
```

Without `--write` the same script is the CHECK: it fails when the shipped
`assets/arena_head.wasm` is not byte-identical to what the source builds (the
build is reproducible), so a source edit whose rebuild was forgotten cannot
ship silently. The counts live in the parity script's output, never here.

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

**The safe default for every re-publish (riir-reflex .issues/034)**: pass
the CURRENT `data/bench.json` as the PRIMARY (first argument) and the fresh
run docs as the extras — the docs then land as lane-scoped updates and every
lane they do not carry (the comparison lanes, other hosts' rows) survives in
place. A fresh-docs publish over an existing table replaces it wholesale and
now REFUSES naming what would be dropped;
`PUBLISH_BENCH_FULL_REPLACE=1` acknowledges a deliberate wholesale
replacement. Both hosts' modelless lanes must still move TOGETHER in one
publish — the cross-host drift gate refuses a one-host engine move.

**Latency the run itself judged unfit does not publish (the Issue-021
wall).** The harness stamps `meta.box_state` into every `results.json`; a doc
whose verdict reads `latency_quotable: false` REFUSES if it would put any of
its own timing on the page. Exits: re-run on a fit box
(`riir-reflex/scripts/bench_preflight.sh`), publish accuracy only
(`PUBLISH_BENCH_LANES=<class>:acc-only`), or acknowledge by host
(`PUBLISH_BENCH_ALLOW_UNQUOTABLE=<host>`; a stale ack refuses). A doc with no
readable box state (the 4090 harness) publishes with a loud UNJUDGED note.
The verdict travels ON THE CELL beside the timing it describes
(`cell.latency_quotable`, true/false/null; absent = unknown) — never read
`meta.box_state`, which belongs to the table's original run. The LANE_CARRY
law is directional (Issue-003 T2): an unfit incumbent's carried timing is
replaced when a fresh QUOTABLE update lands, and carried (verdict included)
whenever the update is not itself quotable. Each host row also records its
runs' dates in `lane_sources` — a per-class summary, not per-suite truth.

**Derived-block-only refresh (plan 001, 2026-10-02):**
`publish_bench.py --rederive ../reflex-site/data/bench.json` rebuilds ONLY the
derived blocks of the published file (pairings, the areas block — cc rollups,
per-lane timing + kind, the edition stamp) without the raw harness docs, and
REFUSES to write unless every suite's measurement cells stay byte-identical.
This is the sanctioned way to land a publisher-side derived-block change; the
ordinary publish (which needs results.json inputs) is for fresh measurements.
The table's EDITION (meta.edition) is forced by the append-only EDITIONS
ledger: the guard passes only when EDITION names the ledger's LAST row and
the computed basis digest (chance table + area membership + lane set)
equals that row's digest — a basis edit refuses every publish AND every
--rederive until a new ledger row is appended, EDITION moves to it, and a
`data/changes.json` row explains the change. On a bump the outgoing edition
freezes to `data/archive/bench-<edition>.json` (on both write paths).

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

An `unknown` host label REFUSES at load (2026-09-28, reflex Bench 082: the 4090's
PowerShell probe cannot resolve `uname -n`, so an unset `REFLEX_BENCH_HOST` lands
`unknown` — merging it would mint a phantom host row; relabel the doc at the run,
never in the merge).

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
gains `lane_sources` (the update run's git sha + date per lane class — a
summary; the per-suite source is the cell's `source_run` stamp, Issue-003
T4). A
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
arms; `scripts/size_chart_smoke.cjs` is the zero-dep render check;
`scripts/home_page_smoke.cjs` is the headless-chromium check (the /#sizes
placement + render against the REAL page — needs playwright locally, the
bench-smoke posture: installed with `npm i --no-save playwright && npx
playwright install chromium`, skipped loudly by the wrapper when absent).

## Regenerate the families section

The `/families/` page (the six harness decision-point families — our
fixtures, our lanes, quarantined from this board) renders from
`data/families.json`, generated by reading the sibling records — nothing
typed (reflex Plan 009 REVISED-2 / reflex issue 059):

```sh
python3 scripts/publish_families.py   # needs both records on disk
```

Sources: reflex `.benchmarks/105_families_wide_eval_tables/results.json`
(the modelless cells) + instinct
`.benchmarks/0051_families_wide_eval/predictions.json` (the hybrid A0
cells); the encoder lane renders "not run" until trained heads exist (an
owner call). The caveat is rendered VERBATIM on the page and carried in
the data file — the section must not ship without it. QUARANTINE:
`publish_bench.py` never reads `families.json`, and the page never fetches
`bench.json` — both asserted by `scripts/test_publish_families.py` (the
self-test, run before every publish) and
`scripts/families_page_smoke.cjs` (the headless-chromium check, same
playwright posture as the bench smoke).

## Mirrored docs surfaces

Thirteen files on this site are MIRRORS of the engines' `.docs` books —
the source of truth lives THERE; edit the source, never the mirror:

- `assets/decision_flow.svg` <- `../riir-reflex/.docs/03_decision_flow/decision_flow.svg`
- `skills/reflex-integration/SKILL.md` <- `../riir-reflex/.docs/04_agent_skill/SKILL.md`
- `docs/reflex/resources.md` + `docs/reflex/dev_flow.md` <- `../riir-reflex/.docs/05_resources/`
- `assets/reflex_dev_flow.svg` <- `../riir-reflex/.docs/05_resources/dev_flow.svg`
- `assets/instinct_flow.svg` <- `../riir-instinct/.docs/03_decision_flow/instinct_flow.svg`
- `docs/instinct/resources.md` + `docs/instinct/dev_flow.md` <- `../riir-instinct/.docs/05_resources/`
- `assets/instinct_dev_flow.svg` <- `../riir-instinct/.docs/05_resources/dev_flow.svg`
- `assets/rethink_flow.svg` <- `../riir-rethink/.docs/03_decision_flow/rethink_flow.svg`
- `docs/rethink/resources.md` + `docs/rethink/dev_flow.md` <- `../riir-rethink/.docs/05_resources/`
- `assets/rethink_dev_flow.svg` <- `../riir-rethink/.docs/05_resources/dev_flow.svg`

The flow figures (decision_flow.svg included, since 2026-10-03) are PRODUCED by `scripts/render_tetris_flows.py` (which
writes both mirrors byte-identically — several repos emit a doc-side
`dev_flow.svg`, so the site copy is renamed per lane and the SVG's internal
id follows the SITE name); this script is the drift detector between
renders.

`sync_mirror.py` carries a per-source-root table (`MIRROR_SOURCES`): the
riir-reflex checkout is PRIMARY (absent → exit 2, the guard's loud-SKIP
lane); a secondary checkout (riir-instinct, riir-rethink) absent is a LOUD
per-root skip, never a silent green and never a red — the mirrors are
committed files, so deploys never need the private checkouts.

**The mirror fence (riir-rethink only).** riir-rethink is PRIVATE forever;
only its two education folders (`.docs/03_decision_flow/`,
`.docs/05_resources/`) are public-by-mirror, and the fence enforces the
narrowness at both ends:

- layer 1 — pair shape: every Rethink source path must sit under `.docs/`
  and end `.md` or `.svg` (asserted every run + a self-test arm);
- layer 2 — content scan at sync AND `--check` time over every Rethink
  source, violations RED (sync refuses the pair, the committed mirror stays
  intact, the run exits 1): non-mermaid code fences, `src/` path
  references, manifest filenames, 64-hex digest-shaped strings, and
  digit-heavy measured claims — the WHOLE text is scanned including inside
  mermaid fences (rendered label text), and SVGs are scanned over their
  visible text (CSS blocks excluded);
- layer 3 — SOURCE-SIDE, not here: the first-line PUBLIC BY MIRROR banner
  in every mirrored Rethink md + the `riir-rethink/BOUNDARY.md` row. The
  scan does NOT check the banner; the source repo owns that guard.

Every mirror's source sha is recorded in `assets/mirror_manifest.json`
(the BOUNDARY law: cross-repo coupling by mirrored bytes with a recorded
source sha). Rows are sha-only — git refs are omitted on EVERY row (one
fixed shape; a ref on any row would publish a private repo's commit hashes
into this public repo), and the check fails any row carrying a key outside
`{repo, src, dst, sha256}`. The script owns the manifest — never hand-edit
it.

After editing a source (or when riir-reflex's guard flags drift):

```sh
python3 scripts/sync_mirror.py          # copy + report (default)
python3 scripts/sync_mirror.py --check  # verify only; exit 1 = drift, 2 = no primary checkout
python3 scripts/sync_mirror.py --self-test
python3 scripts/render_tetris_flows.py --check   # figures: mirrors differ?
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

The gist.rs web family (adopted 2026-10-03): `assets/family.css` is a
byte-identical copy of `riir-ai/.docs/13_web_family/family.css` (re-copy it
when the source moves — never fork a token here) and loads before
`assets/style.css`; `assets/family_hl.js` is likewise a byte-identical copy of
the family code highlighter (every page with a `pre>code` / `.cmd>code`
block loads it; the playground colours its runtime request JSON with
`gfHl.el`); every page sets `<html data-product="reflex">` (accent =
the family Reflex orange), opens with the family bar (`.gf-bar`, Reflex
current) and closes with the family footer (`.gf-foot`). `style.css` keeps its
historical variable names as ALIASES onto the family tokens, so the charts,
arena and playground rules re-theme without a rewrite; chart series named
after a product read `--c-reflex` / `--c-instinct` / `--c-rethink`. Rules:
`riir-ai/.docs/13_web_family/design_guide.md` (390 px never scrolls sideways;
no "seal" vocabulary — "lock/locked").
