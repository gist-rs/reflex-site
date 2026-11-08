# HISTORY.md — reflex-site

One hash-pinned line per removed issue (the fleet noise-reduction convention:
an issue file is removed once its work is verifiably landed; this file is the
durable record). Full narrative of each: `git log --follow -- .issues/<file>`.

- **2026-11-07 — the bench(esc) publish: the Rethink lane's served answer on massive_intent_en + banking77 is now the ESC-composed arm (0.8833 / 0.8960), live.**
  The encoder-lane cells the derived tier-fallback cells were holding (the instinct H2 arm answering for the rethink serve) are superseded by the REAL serving cells — ESC-composed H2+mammoth-1, the 2026-11-07 armed rho fits (massive rho 0.60: composed 0.8833 vs cheap 0.8400, paired LB95 +0.0137, rate 42.7%; banking77 rho 0.45: composed 0.8960 vs cheap 0.8540, LB95 +0.0137, rate 52.8%), same population pins as every other lane (digest-matched, no reset). Accuracy-only cells (the escalation latency — the teacher's p50 1.4-6.5 s/case — is disclosed in the gate line, never a fabricated p50). The gate lines carry the shadow-read verdicts per suite (massive: paraphrase-robust, teacher retention within noise; banking77: the teacher's 10.2pp paraphrase drop is significant and confounded — the benchmark-conditioned caveat stays). Emit: `scripts/emit_esc_lane_doc.py` (deterministic from the arming fits' results.json; copy-law clean). Publish: the full republish gate chain green (lane-surface, self-test, pairing, docs-mirror, page smoke) — rethink record: riir-rethink `.benchmarks/089_esc_paraphrase_shadow_read/RESULTS.md` + `486e277`. Deploy: Touch-ID (`cf-deploy-reflex`) Version ID `017f880e-4ced-43f4-b6e9-5b222436e957`, 1 new asset (`/data/bench.json`), probed live on reflex.riir.ai (both cells present, HTTP 200). Session: zed-m3-jdi-reax.

- **2026-11-06 — Issue 012 CLOSED (the mammoth-1 board lane): the board deploy landed owner-present — one sst5 encoder cell, live verified.**
  T1–T5 landed by the M3 wave (superseded-by-landed, `11d768a`); T6 the Touch-ID deploy of `origin/main` (`11d768a`) via `cf-deploy-reflex` + kat-secret `exec`: wrangler Version ID `c417aad9-85cd-4820-aef1-dffd93333be8`, 1 new asset (`/data/bench.json`; 174 already up), probed live: `0.5317` (the i662 sst5 BMO encoder-cell re-seat, `52ad378`) on reflex.riir.ai AND workers.dev, live bench.json == origin/main's (44 `mammoth` refs each). The issue's prescribed probe (`/bench/` HTML `grep -c mammoth` > 0) is unachievable by construction — the board is client-rendered (`bench/index.html` fetches `bench.json`, 14 refs; HTML carries no lane names). First attempt the same day timed out at the biometric prompt (nobody home). File removed per the noise rule.

- **2026-11-06 — Issue 013 CLOSED (the copy gate's bench residuals): ids out of the public copy, the locked-head wording, the 390 overflow — the gate first went green since it grew these checks.**
  Landed as one publisher-side pass (`4c3052d`): (T1) publish_bench.py now scrubs internal ticket refs from the published artifact — exact-string COPY_ID_REWRITES (source named per row) + a LOUD REFUSAL on any id pattern the map does not cover, the publish-side mirror of the copy gate; the publisher's own copy constants (timing methods, JDI caveat, LANE-CARRY note) reworded to state the fact, changes.json rows 11–15 reworded; --rederive applied it with cells byte-identical (25 leaf paths, every one a copy string; copy-scrub sites: 22). (T2) the "sealed head" stamp line → locked head (the family word law). (T3) the 390 overflow was three measured laws — the hero's @host tags overflowed their frac()-capped bars (bars clip in-track, tags right-anchored), the instinct iv-nums display:table cell ignored max-width (table cells clip through their own overflow), and the runs strip' nowrap spec chip hit 1129 px (the strip scrolls inside itself, #bench-meta overflow-x:auto). Copy gate PASS (14 renders × 0 FAIL; was 3), chart/home/bench/size smokes PASS. The footer half of the same red (the Reflexer cell, 6 rows) landed the same day in `21cd924`.

- **2026-10-09 — Issue 011 closed (sst5 encoder acc@50 gap): the last record cell re-measured, the field complete on all 9 shared suites.**
  The re-read machinery emits the confidence fields natively now (riir-reflex `197e855` — the acc@X%coverage law hoisted beside `ece_of`; rethink `b285d2e` — bench 066 + the 029 lineage stamp); the stamp tool grew `--from-doc` (instinct `0b926fe`); the earlier same-day stamps (typed/ag_news/xnli) + pplx's filter/hero/tables/summary wiring + the acc-only presence-row split landed at `f1d9953`, the /#sizes pplx row at `32a7ef9`. Rethink acc@50cov: 5/9 → 9/9.

- **2026-10-05 — Issue 008 closed (resolved-issue hygiene): the /bench + /resources jargon and seal-wording audit fully landed, file removed.**
  T1/T2/T4/T5 at `e97247b` (internal ids stripped, the "Words used on this page" glossary, `scripts/public_copy_gate.cjs`) + T3 at `b9416c7` (rendered seal/sealed → lock/locked, the #learn primer glossary); deployed 2026-10-03.

- **2026-10-05 — Issue 007 T4/T6 (buyer-trust completion): the comparison table and the worked example — only the owner's T5 remains.**
  T4: the home `#compare` nine-axis Reflex · LLM API · hosted-decision-model table, every measurable cell linked to its instrument, losses visible. T6: `triage_auto` (answered) + `triage_escalate` (honest `null`) wire cases + the caller-policy block; `capture_wire.mjs` at 17 cases, recaptured byte-identical against the v0.2.4 tag; gates all green.

- **2026-10-05 — Issue 007 T1/T2/T3 (buyer-trust partial): who runs it, what leaves your machine, coverage beside the speed claim.**
  T1 the `gf-legal` About block on all 7 pages + `/.well-known/security.txt` + licence facts; T2 the hero "What leaves your machine" `.tldr` box (nothing by default; two disclosed opt-ins); T3 the TL;DR coverage sentence rendered in-browser from data/bench.json (never typed). T4 waited on riir-ai 1028 T3; T5/T6 stayed open.

- **2026-10-04 — the `#development` model-classes deep dive: the `model_classes.md` mirror pair + two gfflow figures, a developer glossary, the train/freeze table (owner ask).**
  En-route root-cause fix in BOTH `sync_mirror.py` + `resources_page_smoke.cjs`: the fence's unit regex misread the figures' "N steps in path order" desc as an "N s" claim — bare `s` now `\b`-bounded, self-test arms added. Claude REVISE round taken (the gold-only-vs-distillation result left the doc; the cost claim de-measured; conservative marker wording).

- **2026-10-04 — #rethink refined against the storefront roadmap; #reflexer moved under #reflex (owner asks).**
  Two-phase shape (v1 hosted-only keyed API; v2 planned download with leaseable specialists), receipts claim split live-vs-planned, the FAQ answers v2's planned download (not the stale "never a public download"), buy-card matches the storefront's words ("not open yet — nothing is charged today").

- **2026-10-04 — the `#reflexer` relation section + the riir-ai Plan 620 P1 takeover.**
  P1 (the gfflow renderer + generalised walker + trust-flow golden) taken over, completed, landed across three repos: reflex-site `fe69bd2`, riir-rethink `7b86e8b`, riir-ai `0d5f852a1`. riir-reflexer Plan 004: `/resources #reflexer` (relation figure + deep write-up mirror) landed `12538b9`, riir-reflexer `ba943d8`.

- **2026-10-03 — the bekko 400M timing LANDED (riir-reflex bench 115, 067 T1–T5): 9/9 quotable cells, p50 geomean 231.7 ms.**
  No single quiet window existed — landed via per-suite timing docs each fitted to a baseline dip (banking77 via the `[banking77, typed, code_fixtures]` triple); the home p50 chart carries 2 sz-break signs, chart smoke arms re-pinned data-derived; post-mortem `../riir-reflex/.benchmarks/115_bekko400m_timing/RECORD.md`.

- **2026-10-03 — the home summary chart defaults to the SHARED bench + the bekko label derives its size (owner ask).**
  `shared 9 / all 14` toggle: the default plots every lane over the SAME suite set (equal denominator, disclosed); `applyLaneSizes` derives "bekko 400M" from the checkpoint id `hotchpotch/bekko-system-one-v0-400m` — a hand-typed size is a defect; `BenchLanes.color` matches bekko by prefix.

- **2026-10-03 — the size chart grew the model-stack sub-bar + tap-to-expand details (home summary bars too).**
  `publish_sizes.py` emits `model_stack` over a new `recorded_files` source kind (sums asserted, a drifted split refuses); stack palette (encoder violet `#a98bfa`, specialist magenta `#f472b6`, head cyan `#22d3ee`); every bar toggles an expandable detail block — the touch path hover never had; `.bc-grid` gridlines `pointer-events:none`.

- **2026-10-03 — the home latency chart replotted as the SERVED product; no lane ever vanishes (`4b7fe65`, CF `e4466d52`).**
  Own arm + the tier-fallback cell's clock, disclosed ↩k on the label; unfit timing keeps a PRESENCE row with the reason, unjudged cells plot marked ⚠; underlying timing issues: riir-reflex `.issues/065`, riir-rethink `.issues/021`.

- **2026-10-03 — the home latency chart renders Instinct + Rethink again — quotable runs only, coverage on the label (`6ed8f8a`, CF `23c57988`).**
  `latency_quotable` cells only; partial coverage visible on the row label (`· n/14`), no-quotable lanes NAMED in the note, never plotted unverified; new `p50-family` arm in `chart_render_smoke.cjs`.

- **2026-10-03 — the wire re-captured off reflex v0.2.4 + the first-corpus walkthrough LIVE (`cce66a5`, CF `15bd631f`).**
  Corpus serve lane (riir-reflex Issue 063) + the wire id fix (Issue 062; `WIRE_ID_ALLOW` EMPTY, copy gate green); `capture_wire.mjs` now mints throwaway demo vessels (heads mint-only since v0.2.4) and boots the vendored `first-corpus/` sample (`/first-corpus.tar.gz`); 15 cases, captions asserted.

- **2026-10-02 — the six harness_* decision-point suites REMOVED from the bench board (owner call; board `f1731fc`).**
  Wide-eval verdict: the modelless engine reads AT CHANCE on honest 96–100-case populations (the old n=12–16 rows were the inflation); `data/bench.json` 17 → 11 via `--rederive` (surviving cells byte-identical); `publish_bench.py` `RETIRED_SUITES` at every publish path's LOAD boundary; `test_publish_bench` 84/84 (`case_retired_suites_never_publish`).

- **2026-10-02 — the quarantined `/families/` section went LIVE (`38fbae4`, CF `0da6b32e`) — removed the same owner call (section below).**
  Six harness families from `data/families.json`, numbers read from reflex `.benchmarks/105` + instinct `.benchmarks/0051`, never typed, the honesty caveat verbatim (reflex issue 059 / Plan 009 REVISED-2); quarantine asserted by `test_publish_families.py` + `families_page_smoke.cjs`.

- **2026-10-02 — the radar reflects the SERVED product: fallback spokes drawn as triangles (resolves .issues/004's display half).**
  Tier-fallback cells roll up MARKED (`fallback` + `served_by`); coverage/complete still count own suites only; the index averages DRAWN spokes; areas version 3 → 4; the issue's own-arm half stays tracked in riir-instinct issue 014 D1 (the GPU serving deploy).

- **2026-10-02 — the /#sizes legend splits the engine segment by runtime env (owner call).**
  rust ember `#d95926` / python blue `#3987e5` / model green `#199e70`; `engine_kind` per candidate (5 rust, 6 python — vLLM reads python); legend, tooltips, aria-labels follow; data/sizes.json hand-synced, byte counts untouched.

- **2026-10-02 — the Rethink row never reads below the family: serve-refused LOSING records displaced (owner verdict: best-of-family).**
  `publish_bench.py` `apply_fallback_cells` displaces strictly-below record cells with the served fallback, preserving the refused arm verbatim under `displaced_record` + `fallback_note`; the rederive byte-guard holds; massive 0.8267↩ / banking77 0.854↩ / prompt 0.8534↩, emotion 0.885↩ — Rethink ≥ Instinct everywhere; test_publish_bench 81/81.

- **2026-10-02 — the bekko lane's two gaps closed: the /#sizes row + the two missing dataset-board suites.**
  `Bekko-SystemOne-v0 (68M)` ≈ 1.14 GB (venv + LIVE HF tree, the `hf_total` law; the card assigns no license); `typed_decisions` bekko 0.4840 (reflex 0.5725 under the published OC posture) + `code_fixtures` bekko 0.40625 vs reflex 0.375 (a one-question margin, disclosed); determinism byte-identical ×2; record `../riir-reflex/.benchmarks/103_bekko_v0_17m_gate/RECORD.md` §Addendum (reflex `001f46b`); the lane seats 9/9 English suites.

- **2026-10-02 — plan 001 (Jev Decision Index) LANDED; CLOSE-OUT 2026-10-06 (plan file removed, everything decided).**
  Landed: the cc column, below-chance visibility (signed values, `bc-zero` ticks, hollow rings), `areas.timing`, the Efficiency frontier, the append-only EDITIONS digest pin (area/lane-set edits refuse publish + `--rederive` until the edition bumps), `data/changes.json`, and `publish_bench.py --rederive` (derived blocks only, measurement cells byte-identical). Close-out: `compute_abstention` + the `?lane=` abstention line (6,463 abstains — distance_gate 58.4% / score_gate 41.6%, stamps on 3/12 cells); harness half reflex `a7475c7` (issue 060, closed there); Laya JDI citation `39da3de`; `determinism_n` delivered reflex `95c2dac`; og.png optional, not landed; community contribution path owner-gated not-planned.

- **2026-10-01 — the Rethink size row CORRECTED 1.74 GB → 885 MB (owner size audit).**
  The serving posture is english-checkpoint-only (`encoder_serve.rs` hardcodes `Checkpoint::English`; the typed v2 head cannot ride it — the pairing law; the typed cell is the record-only `--encoder-ckpt typed` lane): model = english checkpoint (LIVE) + three servable v1 heads, total 884,939,164 B; the typed checkpoint + full-pool corpus stay as measurement-lane facts.

- **2026-10-01 — the Rethink (encoder arm) lane joined the /#sizes chart.**
  `rethink_encoder` measured end to end: serve-encoder-metal binary + staged suites + laya checkpoints via two new generic source kinds (`hf_subtree_diff`, `sum`) and a single `resolve_model()` dispatch; initial total 1,739,352,761 B — corrected to 885 MB the same day (entry above); the note discloses the encoder class is record-only at the CPU-only deploy shape (instinct issue 014 C1).

- **2026-10-01 — the cc metric rendered every lane "— not run" (user live report, `47f786d`).**
  The hero's `barHtml` called the metric getter without the suite, so cc read null on every cell (acc/tables/radar were fine — the tell); fix: every metric call site passes `(lane, suite)`; the empty cc cell is honest ("no chance baseline", reserving "not run"); `bench_page_smoke` 9b pins it two-sided; live-verified 114 bars.

- **2026-10-01 — #areas shows every selected lane + qualifier-free lane names (owner calls).**
  `compute_areas()` v2: `AREA_LANES` extended to every lane, extra-host lanes roll up under host-tagged keys (`clm@4090-win`, RIG_LABELS legend, one chip per posture-set); LANE_DISPLAY = `Instinct` / `Rethink` with every legacy spelling mapped (dual-spelling law); re-published in place; publish self-test 66/66.

- **2026-09-30 — the modelless lane re-published at the promoted gate posture (reflex Issue 056 close-out); the deploy ships the pending typed-H2 publish too.**
  reflex Bench 096 (m3) + 097 (4090-windows, UNJUDGED-standing) at `d4051c8`: hard accuracy bit-identical on all 15 suites BOTH hosts, gate cells `--gate-fit-calibrated`; deployed from the M3 (the CF-creded box); known gap filed reflex Issue 057 (owner-gated).

- **2026-09-29 — the typed H2 serving posture published (`4b729d4`); DEPLOY PENDING on this box (no CF token).**
  typed hybrid A1 0.6300 → H2(β=0.5, nmin=2, τ=2) 0.6475, stamps re-attributed to instinct `8bbff09`; lane-scoped publish: `PUBLISH_BENCH_LANES=hybrid sh scripts/republish_bench.sh data/bench.json ../riir-instinct/.benchmarks/020_typed_h2_full_pool/hybrid_lane_doc.json`; wrangler needs Node ≥ 22 (box had v20) + `CLOUDFLARE_API_TOKEN` (lives on the M3) — shipping command: `cd reflex-site && npx wrangler deploy`.

- **Issue 003 — 26 published latency cells from runs that judged their own box unfit: RESOLVED 2026-09-30 (unfit cells on the board: 0).**
  T1+T2 (reflex Bench 076+077 m3 re-measure + `carry_beats_incumbent` suppression), T4 per-cell `source_run` stamps, T3 the ANE re-measure (reflex [Bench 098]). En-route find: the ANE lane had been BROKEN at HEAD since reflex `6535b75` — fixed substrate-side riir-infer `7eae0e7` with a regression pin; T5's 4090-laya residual stays a documented defer.

- **Issue 001 — arena four lanes + honest µs timing + bench-driven TL;DR: DONE 2026-09-24.**
  All 7 tasks; verified by `scripts/arena_demo_check.mjs` + `arena_head_parity.mjs` + the page smokes; the two measured gaps tracked in riir-reflex Issue 020 (closed upstream 09-26; the accuracy gap stays published on the TL;DR).

- **Issue 002 — pair TL;DR lanes on population identity, not hope: LANDED 2026-09-27.**
  Identity pairing in `assets/arena_tldr.js` (cases_digest > lane_sources run-id; mismatch = a third disclosed state), `cases_digest` stamping in `scripts/publish_bench.py`, fail-loud `scripts/check_lane_pairing.py` wired into `republish_bench.sh`; root-cause record riir-reflex `.issues/040`.

- **Owner pass 2026-09-29 — Instinct moves to /bench, rig radio, paw lane, yellow ✓.**
  `/bench/#instinct` (the `assets/instinct_flow.svg` figure from `riir-instinct/.docs/03_decision_flow/instinct_flow.md` via the now two-source `scripts/render_tetris_flows.py`; vs-best row + data-driven PoC/GOAT chip, instinct `.issues/008` amendment); the Reflex-vs-laya row's YELLOW ✓ on strict majority (9/14); `window.BenchRig` rig radio in `assets/bench-charts.js`; the paw lanes joined palette/renderers (`accOf` reader; `†` numeric-latency only); both static-server MIME maps gained `.svg`.

- **Owner pass 2026-09-29 (later) — the verdict rows became per-suite loading bars.**
  `assets/instinct.js`: headline + segmented remain bar + one loading bar per suite (fill = Instinct, tick = compared lane, ±delta chip); `bench-charts.js` exposes `window.BenchLanes` (single-sourced palette); two root fixes en route (`.tldr p` display:inline merging the block; the `<i class="iv-host">` intrinsic-width bug → span).

- **Owner pass 2026-09-29 (later) — the Instinct flow figure reflowed to two bands.**
  Source mermaid (`riir-instinct/.docs/03_decision_flow/instinct_flow.md`) reflowed to the hero's flywheel shape (top: the question in — Reflex · modelless, always first, free; bottom: on abstain — the trained add-on, paid only here); viewBox 2304×574 → 1751×730; figures `--check` + `bench_page_smoke.cjs` PASS.

- **Areas & index radar + the Rethink rename + a chance-corrected range metric (2026-09-30).**
  `publish_bench.py` `compute_areas()`: per-lane cc rollups over four curated areas with DATASET chance baselines (ag_news 4, massive 20, banking77 77, sst5 5, emotion 6, xnli 3, prompt 2, typed mean 0.3175, code (1/8+1/2)/2); `bench-charts.js` renders the two radar cards (partials measured-dots-only, never zero) + the cc metric on the range charts; `Instinct (encoder)` → `Rethink (encoder)` per riir-ai Proposal 051 (lane KEY never changes); blocker `.issues/004_rethink_encoder_lane_partial.md`.

- **2026-10-02 — the hero's "Instinct / Rethink — not run" on the five harness families was a laneOf() misclassification (user live report, `50b8ea3`).**
  The Reflex matcher folded derived tier-fallback cells (`model: "modelless"`) into Reflex; repair: the matcher defers any cell whose lane names a product lane (`PRODUCT_LANE_SPELLINGS`), the verdict card tags family arms with the ↩ badge; verified headless, all four smokes green.

## 2026-10-02 — the /families/ quarantined section removed with its suites (same owner call, this commit)

Removed `/families/` + `data/families.json` + the `publish_families.py` / `build_family_lane_doc.py` / `test_publish_families.py` / `families_page_smoke.cjs` pipeline (riir-reflex Plan 009's quarantined our-lanes section, reflex issue 059): with the suites retired upstream (reflex `31b11d2`) and the board rows gone (`f1731fc`) there was nothing left to show. Home link + bench FAQ updated; `publish_bench.py`'s RETIRED_SUITES comment records it and the quarantine gate still forbids the bench publisher from ever naming or ingesting that surface.

## 2026-10-03 — the instinct_flow.svg mirror pair managed (the riir-ai Proposal 053 miss, pre-ratification)

The served figure (live since the 2026-09-29 owner pass) was unmanaged — the miss riir-ai Proposal 053 files. `sync_mirror.py` gained per-pair source roots (riir-reflex PRIMARY, absent → exit 2; riir-instinct SECONDARY, absent checkout = loud per-root skip, never silent green) and now owns `assets/mirror_manifest.json` (per-file repo/src/dst/sha256; git refs deliberately omitted — the 052 Phase-C leak class); self-test 9 arms, three postures live-verified, pair byte-identity sha256 `96a40d5f…`. `render_tetris_flows.py` stays the figure's PRODUCER — after a re-render run `sync_mirror.py`, else a named `MANIFEST-STALE`.

## 2026-10-03 — Issue 009 CLOSED: /bench FAQ typed numbers, locked-claim scope, arena figure polish

Found in the web-family restyle (riir-ai `.docs/13_web_family`). T1/T2 `2fc29eb`: FAQ figures bound via `[data-ot]` from `data/bench.json` (5 reasoned constants in `FAQ_FIGURE_ALLOW`; canary proven on the parent commit), the "BLAKE3-locked / signed" copy scoped to what serves (source fixes riir-instinct `b6425bf`, riir-rethink `47887ff`). T3/T4 `3448505`: arena charts pinned to available width so labels never scale below 1:1 (3.87 px → 11.00 px at 390); Tetris figures re-rendered on family ink + Reflex accent (katgpt-rs mirror `0d4af3dd0`; `render_tetris_flows.py` refuses the retired "rust" palette, gained `--only`). T5 riir-reflex `a84bad6`: the skill's cache path verified against reflex 0.2.3 (`$HOME/.cache/riir-reflex/laya`, `LAYA_WEIGHTS_DIR` / `LAYA_HOME`). Gate `scripts/arena_legibility_smoke.mjs`; `home_page_smoke.cjs` moved to an OS-assigned port; deployed `a83f9c66` + `888a4b7d`; `arena_prod_smoke.mjs` not run (needs a local engine + `RIIR_REFLEX_ALLOWED_ORIGIN`).

## 2026-10-03 — Issue 005 CLOSED: stale and false claims on the Reflex pages

Web trust audit (riir-ai Issue 1028): 14 claims checked by fetching every link on the five pages. T1–T5b `e97247b` + riir-reflex `50d340d` (instinct said private — it is public; Rethink attributed to its own product; storefront linked live; the TL;DR names its N-of-M coverage; `brew trust`; skill re-captured vs 0.2.3). T6a gist-rs/reflex `adaa0aa` + scoop-bucket `caacf62` (the Scoop line is live). #10 `/docs/api/#types` maps yes/no vs `noul` (`295a398`, Issue 006 T2). T6b (owner: "draft it, protect me, publish"): the `reflex` binary is **MIT**, matching its public MIT source — gist-rs/reflex `edc3c99` (LICENSE + README §License, no-warranty + advisory-answers), riir-reflex `d009604` (LICENSE in every release archive); sibling cargo-refine went proprietary EULA the same day (riir-refine `7aee4497`, Issue 144 T5; gist-rs/cargo-refine `c957411`).

## 2026-10-05 — Rethink write-up: escalation lane + storefront-live fix; storefront feed refreshed

Mirrored write-up (`riir-rethink/.docs/05_resources/resources.md` → `docs/rethink/resources.md`) reworded live (the storefront has been live since 2026-10-03) + a concept-level "How escalation works" section — only abstentions escalate, per-suite arming, runtime rate-guard demotion, no suite names/numbers (written to survive rethink Issue 023 T2's licence demotion); `/resources/` carries the same fact, board link only (moat law). Storefront feed rebuilt with `build_why_data.py` (bench sha `aa4bc12e…` → `f82f648b…` at the Bench-123 publish `3529710`; Rethink cells byte-unchanged); `digitFindings` now strips licence identifiers (the smoke flagged the footer's "Apache-2.0"). Gates: sync_mirror 32/32 + --check, resources + copy gates PASS; the feed refresh deploys from riir-rethink, the write-up + page copy here.

## 2026-10-06 — Issues 006 + 007 CLOSED: the developer quickstart and buyer-trust audit items landed; the two owner-gated residues recorded

Both filed 2026-10-03 from riir-ai Issue 1028; everything actionable landed, the residues are owner decisions recorded here so the asks survive file removal. **Issue 006:** T1 `/#try-it` captured request/response blocks · T2 `/docs/api/` (routes, schema, wire types, errors, versioning) · T4 the 5-minute first-corpus walkthrough (v0.2.4 recapture `cce66a5`, `/first-corpus.tar.gz`, `/docs/api/#corpus`) · T5 the footer engine stamp (`[data-wire-version]`) · **T3 OWNER OPEN: the stateless hosted text-wire demo for the playground.** **Issue 007:** T1 About + `.well-known/security.txt` (`security@gist.rs`) · T2 the "What leaves your machine" box · T3 coverage + selective accuracy rendered from `data/bench.json` · T4 the `#compare` table · T6 the `#triage` cases · **T5 OWNER OPEN: the stability / versioning statement.** Issue files removed per the noise rule — this row is the durable record.

## 2026-11-08 — the org-move residue landed + deployed: every served link and install line now names riir-ai (issue 219 A1/A2 residue)

The gist-rs → riir-ai org move (2026-11-07) kept old URLs working via git redirects; this lane moved the SERVED COPY so nothing public names the old org anymore. Landed `8b7d8ca`: the index.html install section's Scoop one-liner (visible text + data-copy) and the served `skills/reflex-integration/SKILL.md` — `scoop bucket add riir-ai https://github.com/riir-ai/scoop-bucket` (the bucket itself moved to riir-ai later the same day, owner; old `bucket add gist-rs` commands keep working via the redirect — hygiene, not breakage). Committed alongside: `riir-refine` release.yml `BUCKET_REPO: riir-ai/scoop-bucket` (`3c0f8f94`), kat-service front-page one-liner + copy-contract org-vocabulary exemption (`49a59d0`, 625 lib tests + clippy green — the prod ceremony deploy is separately owner-gated), and the three dist-repo README lines (`cargo-refine e3ffc3a` / `reflex 54192b8` / `scoop-bucket e10eedc`). **DEPLOYED** (Touch-ID `cf-deploy-reflex`, clean detached worktree at origin/main `8b7d8ca`): Version `84730a68-e01e-44db-921b-8dee3b8e9c00`; probed LIVE: 20 gist-rs refs → 0, all repo links `github.com/riir-ai/*`, `scoop bucket add riir-ai` ×2. Pre-existing flag: `scripts/public_copy_gate.cjs` FAILS on `/bench/ @390` sideways scroll (scrollWidth 422 vs 390) — fails at HEAD^ without this change, belongs to the bench-feed lane. Session: zed-m3 (m3), 1794265200.

## 2026-11-08 — the JDI armed cells DEPLOYED (the 2026-11-08 wave, owner touch)

- **Deployed** (owner Touch-ID `cf-deploy-reflex`): Version `7207a832-79a1-4825-ae1f-63a2d071f1fa`, 3 new assets (`/data/bench.json` + the synced `skills/reflex-integration/SKILL.md` + manifest) on `5ab39cd` (clean detached worktree). Content: the 2026-11-08 JDI arms — winogrande_jdi (ρ 0.45: composed 0.7269 vs cheap 0.4830, LB95 +0.2191) + hellaswag_jdi (ρ 0.10: composed 0.3995 vs 0.2565, LB95 +0.1277) ESC cells + banking77's gold-bearing `macro_f1 0.89328` (record 094). anli/mmlupro stay NO-ARM (no cells). Probed LIVE on reflex.riir.ai: all three `ESC-composed H2+mammoth-1` cells serve with the right hard blocks. The rethink fold consumed the feed same-day: the JDI headline flipped 12.99 → 29.89 (their bench 096). Session: zed-464454b5, 1794150600.
