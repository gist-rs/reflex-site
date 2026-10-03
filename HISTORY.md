# HISTORY.md — reflex-site

One hash-pinned line per removed issue (the fleet noise-reduction convention:
an issue file is removed once its work is verifiably landed; this file is the
durable record). Full narrative of each: `git log --follow -- .issues/<file>`.

- **2026-10-03 — the bekko 400M timing LANDED: 9/9 quotable cells, the presence row becomes a real bar (riir-reflex
  bench 115, 067 T1–T5 executed).** The lane's p50 geomean is **231.7 ms** (`areas.timing.bekko` n_used 9/9, zero
  unfit/unjudged); every accuracy cell byte-identical to the published 400M board. The window that landed is NOT one
  quiet 15-min run — the box's baseline (editor + sibling sessions) drifts 3.2→8.8 on minutes and two full-run
  attempts went start-quotable → end-unfit — but **per-suite docs**, each span fitted to a baseline dip, each cell
  stamped with its own doc's verdict; banking77 (registry-order last in ANY doc, its 6.3-min tail always the end
  probe) landed via the `[banking77, typed, code_fixtures]` triple that ends on code_fixtures' 20 s light run.
  Publish: lane-scoped update (current bench.json as primary — the fresh-docs wall fired once, answered as it
  names). Chart truth moved with the data: the home p50 chart now carries **2 sz-break signs** (openthai + bekko's
  767 ms typed cell) — `chart_render_smoke`'s break arm re-pinned 1→2 and its bekko presence-row arm replaced by a
  plots-a-real-bar arm; `bench_page_smoke`'s break-count collector gained the bekko lane it predates (the expected
  count is data-derived and now counts bekko's two past-500 ms cells); publisher self-test 84/84, home + copy gates
  green as-is. Full post-mortem: `../riir-reflex/.benchmarks/115_bekko400m_timing/RECORD.md`.
- **2026-10-03 — the home summary chart defaults to the SHARED bench (the equal basis) and the bekko label names its
  size (owner ask: "top most graph acc … didn't mention what beko size is, i think 400M? also better scope to
  intersected equal max bench which is 9/9").** Two pieces. (1) SCOPE: a `shared 9 / all 14` toggle beside the metric
  buttons; the DEFAULT plots every lane over the SAME suite set — the areas block's curated bench, the equal basis
  the area radar rolls up — so a 9-suite lane and an 8-suite lane finally share one denominator instead of each
  averaging its own suites (the "all" view keeps the old per-lane semantics and its caveat note; both notes and the
  legend disclose the denominator; cc's denominators stay ≤ 9 in both scopes because a suite with no chance baseline
  is skipped, never guessed). Data-derived throughout: the toggle renders only when the data carries the areas basis,
  and the counts on the buttons are the filtered suite counts, never typed. A lane with no cell on the plotted suites
  keeps a presence row (the no-vanishing law) instead of silently dropping out of the shared view. (2) SIZE LABEL:
  `applyLaneSizes` derives "bekko 400M" from the cells' own checkpoint id (`hotchpotch/bekko-system-one-v0-400m`) —
  a hand-typed size on the site is a defect, same law as every number here — applied at the two data-entry seams
  (setLogDomain on both pages; BenchFilter.init on /bench/, which runs first, so the filter chips agree too), and
  `sizedDisplay` re-applies the suffix to the areas rollup's display form so the radar legend agrees. A seat move
  (the 68M era) re-derives on the next publish; disagreeing sizes keep the bare label. `BenchLanes.color` matches
  bekko by prefix so the bare display form (instinct.js's best-lane ticks) still resolves the rose slot. Gates:
  chart_render_smoke (+ the scope arm: default shared → all → shared, denominators open up only at the acc metric,
  bekko 400M on rows + radar legend, palette matches both forms, metric wiring survives the shell re-render),
  home_page_smoke, bench_page_smoke, public_copy_gate — all green.

- **2026-10-03 — the size chart grew the model-stack sub-bar + tap-to-expand details; the home summary bars expand
  too (owner ask: "Instinct · trained specialists and Rethink · encoder arm bar need special stack of model in sub
  bar … each graph need extras line under it to expand to show like current tooltip so in mobile user can click
  instead of hover").** Three pieces. (1) DATA: `publish_sizes.py` emits `model_stack` — the model's component
  split as `{label, kind, bytes}` leaves — backed by a new `recorded_files` source kind that turns a record's own
  `files` array (the same measurement's per-file lstat values, structured; sums asserted against the record total,
  a drifted split refuses loudly) into per-file components. Instinct splits into its six specialist files, Rethink
  into the q8 encoder checkpoint + its three trained heads; lone-model rows name themselves (`stack_label`).
  data/sizes.json hand-synced with the generator-emitted fields — byte counts untouched (110 added lines, zero
  removed). (2) COLORS: a stable stack palette beside the founding env/weights trio — encoder checkpoint violet
  `#a98bfa` (the Rethink lane hue), trained specialist magenta `#f472b6` (Instinct), trained head cyan `#22d3ee`,
  plain weights keep the model green; unknown kinds hash-pick a fallback slot so the same kind is always the same
  color. The chart legend gains every split kind the data actually carries, never a hand-typed set. (3) UI: the
  model segment splits into its colored sub-segments (byte share, a 3px sliver floor + 1px separator — every
  sliver shows ≥2px of its own color after the gap; the shipped-then-fixed history: the first cut kept the old
  2px floor + 2px separator, and the 2px dark separator ate a 2–4px head sliver whole — the user's "can't see
  substack bar" live report, `fix` commit); the per-segment
  tooltip is now the FULL STACK as color-labeled bullets (swatch + label + bytes + the what-line, total, source
  tags) instead of one segment's prose; and every bar — on BOTH home charts (size rows and the summary's per-lane
  rows) — toggles a detail block UNDER its row (click/tap/Enter, `role=button` + `aria-expanded`/`aria-controls`,
  caret in the totals column) carrying the tooltip's content plus the full provenance lines and framework/note —
  the touch path hover never had. En-route: `.bc-grid` gridlines carry `pointer-events:none` (a 1px line over a
  bar stole the hover). Gates: publish_sizes self-test (+3 arms: the six-specialist stack, the 4-leaf rethink
  stack, recorded_files refusing a missing/drifted files array), size_chart_smoke (data-derived segment counts,
  per-kind color law via the exposed `SizeCharts.stackColor`, stack-widths-sum law, bullet labels in the escaped
  attribute, legend slots, 12 tap-to-expand wirings), chart_render_smoke (tap-to-expand wiring on every summary
  row, all metrics), home_page_smoke (real clicks: size bar expands + collapses, 2 stacked sub-bars = the data's
  count, summary bar expands), bench_page_smoke, public_copy_gate — all green.

- **2026-10-03 — the home latency chart replotted as the SERVED product; no lane ever vanishes (`4b7fe65`,
  CF `e4466d52`).** The strict quotable-only pass (`6ed8f8a`) traded the wholesale hide for three new user
  reports the same day: comparison lanes' p50 bars vanished ("we got all latency p50 before"), bekko's top
  accuracy row gained no denominator explanation, and Rethink's latency lost the served shape ("it should be
  lower as Reflex when no abstain — I saw that graph before"). Reworked per suite on the SAME accuracy pick
  (one served run per metric): own arm where it answered + the tier-fallback cell's clock where it declined,
  disclosed ↩k on the label — Rethink reads 93 µs over 8 (↩5 served), the shape the user remembered. Unfit
  timing still never plots (the reflex Issue-021 12× class) but its lane keeps a PRESENCE row with the reason
  (bekko); unjudged cells (4090, no probes) plot again marked ⚠. Note names the own-suites denominator and the
  like-for-like radar; bekko's top accuracy is REAL on the shared nine (0.693 vs 0.669) — the documented
  modelless accuracy tradeoff. Issues for the underlying unfit/unjudged timing: riir-reflex `.issues/065`,
  riir-rethink `.issues/021`.

- **2026-10-03 — the home latency chart renders Instinct + Rethink again — quotable runs only, coverage on the label
  (`6ed8f8a`, CF `23c57988`).** The user read the web-audit's wholesale hide (the `latencyBenchOnly` option) as a
  missing render on the home summary's p50 metric. The rows plot again under the law the areas timing block and the
  frontier already follow — `latency_quotable` cells only: Instinct 3.51 µs geomean over its 9 quotable suites,
  Rethink 16.7 ms over its 2 (the unfit 364 ms typed read and the fallback cells' answering-tier clock stay in the
  suite tables). Partial coverage is VISIBLE on the row label (`· n/14`, accuracy metrics too) instead of
  tooltip-only, lanes with no quotable latency (clm, gliner, agentjev — unjudged 4090; bekko, paw — unfit) are NAMED
  in the note and no longer plot their unverified timing on this chart. Verdict: hiding a partial lane and plotting
  an unverified one were the same defect in opposite directions — the chart now does neither. Smoke: new
  `p50-family` arm in `chart_render_smoke.cjs` pins the two rows, the coverage tags and the named-not-plotted lanes
  (re-pin when the data's quotable verdicts move).

- **2026-10-03 — the wire re-captured off reflex v0.2.4 + the first-corpus walkthrough LIVE
  (`cce66a5`, CF `15bd631f`).** The release carries the corpus serve lane (riir-reflex Issue 063)
  and the wire id fix (Issue 062 — verified: the served head reason reads `game-head/tetris
  (corpus-fitted, decoded arm)`, zero id occurrences on the live pages, `WIRE_ID_ALLOW` EMPTY
  and the copy gate green). Because v0.2.4 makes the game heads MINT-ONLY (the boot fit retired),
  `capture_wire.mjs` now mints throwaway demo vessels first (deterministic; the fixtures resolve
  from the `../riir-reflex` sibling; the home + api captions name the mint step) and boots a second
  engine on the vendored `first-corpus/` sample (the walkthrough's download, `/first-corpus.tar.gz`)
  for the `corpus_answered` / `corpus_off` cases — in-corpus answers, off-corpus abstains, captured
  verbatim. Measured posture change recorded on the home block: the demo corpus still abstains
  everywhere; YOUR corpus is the answers lane. 15 cases, all captions asserted.

- **2026-10-02 — the six harness_* decision-point suites are REMOVED from the bench board (owner
  call; board commit `f1731fc`).** The wide template-disjoint eval delivered the verdict that retired
  them: on the honest wide populations (96–100 cases per family) the modelless engine reads AT CHANCE
  (0.22–0.31 against ~0.2–0.33 random-pick), where the old small-n board rows (0.56–0.92, n=12–16,
  template-shared) were the inflation the wide eval existed to remove. Owner verdict: retire the suites
  entirely; they are deleted from the reflex harness itself (that removal lands upstream, in
  gist-rs/riir-reflex, separately). Landed: `data/bench.json` 17 → 11 suites, rederived in place via
  `--rederive` (surviving measurement cells byte-identical, 9 pairing verdicts, areas/cc/chance_digest
  re-derived, zero `harness_` occurrences in the served file); `publish_bench.py` gains `RETIRED_SUITES`
  + `drop_retired_suites` at the LOAD boundary of every publish path (fresh docs, lane-scoped updates,
  `--rederive`) so no older results doc can re-grow a retired row, with the `meta.divergences` line
  naming them scrubbed in place and the six harness DISCLOSURES rows removed; the bench FAQ now states
  the retirement (no measured numbers in page copy) and the p99 note no longer names the suites.
  Gates: `test_publish_bench` 84/84 (new `case_retired_suites_never_publish` — filter on merge +
  rederive + divergences scrub + no stale DISCLOSURES rows; the tier-fallback fixtures renamed to
  neutral probe_a/probe_b/probe_c with the mechanism coverage kept), bench/home/chart/families/size
  page smokes + `check_lane_pairing` + `arena_demo_check` all green on the new data. The `/families/`
  quarantined page + `data/families.json` are untouched (owner-directed: they render the lanes'
  record, not the board).

- **2026-10-02 — the quarantined `/families/` section is LIVE (`38fbae4`, CF `0da6b32e`).** The six
  harness decision-point families render on their own page from their own `data/families.json`, our
  lanes only (Reflex modelless · Rethink hybrid · Rethink encoder `not run`), the honesty caveat
  rendered VERBATIM (reflex issue 059 / Plan 009 REVISED-2). Numbers are read from the sibling records,
  never typed: reflex `.benchmarks/105` (the wide-eval modelless read) + instinct `.benchmarks/0051`
  (the seat-posture re-baseline). QUARANTINE asserted two ways: `test_publish_families.py` (publish_bench
  never references families.json; bench.json carries no pointer) and `families_page_smoke.cjs` (the page
  never fetches bench.json; six rows; caveat verbatim; naming-law spellings). The board's own family rows
  (the n=12–16 era) predate the wide populations and refresh at the next full republish — the bench FAQ
  says so.

- **2026-10-02 (latest) — the radar reflects the SERVED product: fallback
  spokes drawn as triangles (owner call, resolves .issues/004's display
  half).** The owner read the "All benchmarks" radar with Rethink at 4 drawn
  spokes out of 9 as broken: the tables already show the served answer
  (the tier-fallback cells `apply_fallback_cells` landed earlier the same
  day), but `compute_areas` refused derived cells — the same-day reorder's
  double-count call — so the radar drew holes where the product actually
  answers. Reversal landed in `compute_areas`: a tier-fallback cell ROLLS
  UP MARKED (`fallback` + `served_by` + `record_acc` where a displaced
  record rode the cell), `_lane_block` gains `fallback_suites` +
  `served_coverage` while `coverage`/`complete` keep counting only the
  lane's OWN measured suites (filling the polygon never converts a partial
  lane into a complete one), the index averages the DRAWN spokes (own +
  fallback — Rethink 0.6923 → 0.6881 over 9), areas `version` 3 → 4, and
  the timing note names the fallback population (the tier's latency is
  unjudged here — shown in the tables, never plotted). The renderer draws
  fallback spokes as TRIANGLES (`rd-fb`; hollow when below chance, the
  below-chance ring's language), tooltips name the answering tier (and the
  displaced record's own read), the legend reads "N fallback (▲ = the
  served tier answers)", and the areas card's tooltip marks fallback rows.
  Gates: two new self-test cases (fallback rollup marked + the timing
  note) + `case_displaced_records_leave_the_radar` re-pinned to the new
  law and renamed `case_displaced_records_roll_up_marked`; chart smoke
  gains the data-derived `rd-fb` count + tooltip/legend arms; page smoke
  9d pins triangles + disclosure. Rederived in place (`--rederive`, cells
  byte-identical, 5 triangles on the live data). The issue's own-arm half
  stays tracked in riir-instinct issue 014 D1 (the GPU serving deploy) —
  the site's display question is closed: the board shows what the product
  does, marked where the answer comes from a tier.

- **2026-10-02 — the /#sizes legend splits the engine segment by runtime
  env: rust env in ember #d95926, python env in blue #3987e5, model / weights
  moves to the founding palette's green #199e70 (owner call).** The chart
  previously drew every engine segment ember and every model segment the laya
  lane blue, so a Python-venv lane (laya python reference, gliner, agentjev,
  openthai, bekko, CLM's vLLM image) read the same color as a Rust binary lane.
  The data now carries `engine_kind` per candidate (rust = the five
  Reflex/Instinct/Rethink rows; python = the six venv/docker rows — vLLM is a
  Python serving stack, so the CLM docker image reads python), the chart colors
  the engine segment by it, and model/weights takes the green — the third slot
  of the founding trio, already validated all-pairs on the dark surfaces. The
  legend is three entries; tooltips + aria-labels + the section sub-copy
  follow. Gates: the render smoke pins the env color law (5 rust + 6 python +
  9 model segments, legend wording), the self-test pins the engine_kind
  partition, `--check` validates the field. data/sizes.json hand-synced with
  the same static field the generator emits — byte counts untouched (the LIVE
  sources were not re-fetched for a color change).
- **2026-10-02 — the Rethink row never reads below the family: losing
  refused records displaced by the served answer (owner call, best-of-family).**
  The owner read the board as "Instinct scores higher than Rethink" on
  massive_intent_en / banking77 / prompt_injections and asked whether Rethink
  should not always show the best score, falling back to the serving tier.
  Diagnosis: not a data bug — every one of those cells was a REAL measured
  encoder read seated record-only per the 2026-10-01 progress-display call
  (instinct issue 017), while the 2026-10-02 full-coverage fallback
  (dfef114) filled HOLES only (`a real cell — the lane's own measurement
  wins`), so a serve-refused LOSING record kept the row against the owner's
  own "the chart should reflect the served product" directive. Verdict call
  (owner, three options offered): **best-of-family** — fallback ↩ where the
  encoder loses, violet record cells where it wins, raw losing reads as
  disclosed records. Landed in `publish_bench.py` `apply_fallback_cells`:
  the encoder lane's serve-refused record cells (`record_only` or `serves`
  starting ✗) reading STRICTLY below the seated arm are displaced by the
  served-answer fallback cell, with the refused arm's own measured cell
  preserved verbatim under `displaced_record` and the `fallback_note` naming
  the read + the gap (all numbers from the cells, never typed). At-or-above
  the seated arm the violet record stands (sst5/xnli/ag_news/typed); suites
  with nothing measurable to serve (the thai reference reads) keep their
  records. Three accommodations the derivation forced: (1) `_area_lane_cell`
  skips `derived` cells and `finalize` runs the fallback pass BEFORE
  `compute_areas` — a displaced suite renders as a radar coverage GAP (the
  encoder lane is 4/9 now, its own winning spokes) instead of double-counting
  the seated arm's number; (2) `_measurable` canonicalizes a displaced cell
  to its `displaced_record` — the rederive byte-guard still proves every
  measurement byte-identical ("cells byte-identical" on the live file); (3)
  `instinct.js` `isEncoder` excludes derived cells so the verdict card never
  tags a fallback number violet. bench.json rederived in place: massive 0.8267↩
  (record 0.6567), banking77 0.854↩ (record 0.442), prompt 0.8534↩ (record
  0.8017) — Rethink ≥ Instinct everywhere, emotion unchanged (0.885↩). Page
  copy (bench FAQ + the Naming paragraph) states the display law. Gates:
  test_publish_bench 81/81 (2 new cases — displacement + radar-gap), bench
  page / chart render / home page smokes + arena demo check PASS (arena live
  smoke pre-existing env-red at HEAD: needs the real local engine — verified
  identical on the pristine tree).

- **2026-10-02 (later) — the bekko lane's two gaps closed: the /#sizes row + the
  two missing dataset-board suites (owner ask "beko has no size report and missing
  code_fixtures bench").** **(1) The sizes row** — `Bekko-SystemOne-v0 (68M)` joins
  the /#sizes chart: engine = the lane venv 661,500,299 B (recorded on m3-max-metal,
  the Bench-103 repro pins, lstat convention) + model = the HF tree
  `hotchpotch/bekko-system-one-v0-68m` 476,225,680 B (LIVE tree API) ≈ **1.14 GB
  total** — between laya-typed and the python reference. ⚠ The 68M tree weighs ~476 MB
  on HF, more than the ~244 MB safetensors estimate in the bench record — the repo
  carries more than the one weights file; the row measures what a consumer downloads
  (the gliner/agentjev/openthai `hf_total` law). The card still assigns no license —
  the row's note keeps the measurement-only posture. **(2) The bench cells** —
  `typed_decisions` bekko 0.4840 (n 2000; reflex 0.5725 reproduced in-run under the
  published OC-armed posture, scale 4.0) and `code_fixtures` bekko 0.40625 vs reflex
  0.375 (n 32 — a ONE-QUESTION margin, tie-class, disclosed as such in the bench
  record). The typed refusal in the original run was POOL-SCOPED (the canonical
  `.raw/datasets` pull runs clean; `datasets_t20k`'s typed is the stale one) — the
  repro block in the record now names the pool + the oc-select flag. Determinism
  byte-identical ×2 (the 103 law). The bench.json publish landed via the plan-001
  session's `26fddb9` rederive (cells byte-identical, the sibling-session measurement
  credit in its message); the lane now seats **9/9 English dataset suites**. Full
  record: `../riir-reflex/.benchmarks/103_bekko_v0_17m_gate/RECORD.md` §Addendum
  (reflex `001f46b`). Verified: test_publish_sizes (12 cases + the new bekko arm),
  sizes --check (11 candidates ascending), size_chart_smoke, test_publish_bench 76/76,
  bench_page_smoke, home_page_smoke, check_lane_pairing.

- **2026-10-02 — plan 001 (Jev Decision Index distill) LANDED: the bench board
  gains the honesty mechanics the leaderboard uses — decided by the Claude verdict
  round after the owner lifted the plan-only gate.** T1 + T2.7/8/9 + T3.10 in one
  pass, all gates green (publish self-test 76/76, chart render smoke with the new
  arms, playwright page smoke with six new data-derived arms, pairing gate, mirror
  parity): **(1)** the suite tables gain a **cc column** (one JS formula home,
  `BenchCharts.ccOf` over the published chance basis, pinned to the published
  `per_suite` values by a 95-entry parity arm) and the filter chips carry each
  lane's kind + cc index + coverage; **(2)** below-chance cc is now VISIBLE — the
  verdict caught that `frac()`'s [0,1] clamp made a −3.4% lane draw exactly like a
  lane at chance, so negative cells get signed values, a `bc-zero` tick on bars,
  hollow rings on radar dots, and the published `scale` string names the law
  (Option B — keep negatives — decided over clipping); **(3)** `areas.timing` per
  lane: the curated clock/method table (in-process vs http vs subprocess — two
  clocks never pool silently) + the measured p50 geometric mean over EXACTLY the
  index's suites, quotable-verdict cells only, null disclosed as "not plotted";
  the page renders the Timing methodology table + the **Efficiency frontier** (cc
  index vs p50, log x, Pareto rings scoped to equal-coverage groups, partial lanes
  hollow — 5 lanes plotted, 7 honestly not); **(4)** lane `kind` classification
  (modelless-in-process / trained-head / encoder / http-oracle / python-subprocess /
  compiled-program) with a both-ways completeness test; **(5)** the audit layer:
  **(5)** the audit layer:
  `meta.edition` 2026-10 forced by the append-only EDITIONS ledger digest pin (an
  AREA_CHANCE / area-membership / lane-set edit refuses every publish AND every
  --rederive until the edition bumps + a changes.json row lands — the round-2 verdict
  replaced a single-row pin a digest re-pin could have satisfied; the archive runs on
  both write paths), and the curated `data/changes.json`
  feed renders under Board changes; **(6)** `publish_bench.py --rederive` rebuilds
  only the derived blocks of a published bench.json (the sanctioned refresh — the
  verdict killed the "re-run the publisher" premise) and refuses unless every
  measurement cell stays byte-identical. Per-lane profile view at `?lane=<id>`
  (read-only, never touches the saved filter). Deferred by the verdict: task 6
  abstention-cause mining needs the harness to record the abstain CAUSE first —
  filed as riir-reflex `.issues/060`; task 11 og.png stays optional. The work rode
  a gitignored `.wt-jev` worktree (branch `jev-decision-index`) against the
  concurrent bench-chart session on main.

- **2026-10-01 (later) — the Rethink size row CORRECTED: 1.74 GB → 885 MB
  (owner's size audit: "did Rethink really need that huge encoder?").** The
  first row folded the typed checkpoint + the typed full-pool corpus + the
  typed v2 head into the serving posture; the code says otherwise:
  `encoder_serve.rs` hardcodes `Checkpoint::English` at lane boot (every
  ENC suite encodes with the english checkpoint), and `encoder_arm.rs`'s
  own doc carries the pairing law — "a head trained on the typed cache is
  meaningless over the english encoder" — so the typed v2 head CANNOT ride
  this posture; the typed cell runs through the arena's `--encoder-ckpt
  typed` measurement lane, which is record-only. The corrected row: engine
  = serve-encoder-metal binary + the six t20k suites (28,748,684 B); model
  = english checkpoint (848,195,504, LIVE) + the three servable v1 heads
  (7,994,976, recorded — the typed head excluded with the pairing law
  cited); total 884,939,164 B, sitting just above Reflex + laya · typed
  (851 MB) and well under OpenThai (2.22 GB). The typed checkpoint +
  full-pool corpus stay in sizes.measurements.json as the measurement
  lane's facts, reworded to name what they belong to. Same gates, all
  green (self-test 13/13, --check, render + home smokes).

- **2026-10-01 — the Rethink (encoder arm) lane joined the /#sizes chart
  (owner ask: "Rethink size not report in chart").** The disk-footprint
  report compared 9 lanes and the encoder arm was not among them; a new
  `rethink_encoder` candidate reports the encoder SERVING posture, measured
  end to end: engine = the `serve` binary built with `--features
  serve-encoder-metal` (7,940,160 B, freshly built + lstat'd on this box —
  the build stamp carries arena-laya, serve-encoder, serve-encoder-metal) +
  the staged dataset suites (the six t20k corpora + riir-train's typed
  full-pool dir, 7,151,877 B); model = the laya-english + laya-typed
  checkpoints (LIVE HF tree API — english via a new `hf_subtree_diff` kind:
  whole tree minus the two sibling subtrees, the same arithmetic the
  reflex_laya_typed note already quoted as "848 MB") + the four sealed NLEH
  encoder heads (9,060,980 B, recorded — sst5 t6_s0 / xnli_en / ag_news v1 +
  typed v2, .blake3 sidecars excluded). Two generic source kinds landed for
  it: `hf_subtree_diff` and `sum` (composes LIVE + RECORDED children so one
  bar can carry both); the pre-existing model dispatch refactored into
  `resolve_model()` (one dispatch, sum reuses it recursively). Total
  1,739,352,761 B — between the python reference (1.49 GB) and OpenThai
  (2.22 GB); the note discloses the posture honestly: measured on the GPU
  bench host (M3 Metal), the encoder class is record-only (refused at the
  CPU-only deploy shape, instinct issue 014 C1) — nothing ships until a GPU
  serving deploy exists. Gates: publish self-test 13/13 (three new arms —
  the rethink resolve, the diff kind + its empty-tree refusal, the
  missing-recorded-key-inside-a-sum refusal), sizes --check (10 candidates,
  ascending), size-chart render smoke (10 stacks), home-page browser smoke
  (10 candidates rendered, placement + provenance + TL;DR laws green).
  data/sizes.json regenerated in place (release v0.2.3 unchanged).

- **2026-10-01 — the cc metric rendered every lane "— not run" (user live
  report, `47f786d`).** The chance-corrected acc metric's `get` is
  `(lane, suite)` — `chanceOf(s)` reads the suite's curated baseline from
  `data.areas.suites` — but the hero's `barHtml` called `M.get(l)` without
  the suite, so cc scored null on EVERY cell and every lane collapsed to
  the not-run cell, on every suite, while the acc view, the tables, the
  home summary (`laneStats` — already passed the suite) and the area radar
  (precomputed) were full of scores. That asymmetry was the tell: a
  metric-specific blank board is a transform bug, not missing data and not
  browser state — the rig/lane-filter theories of the earlier report
  (fixed in `6abaeb3`, still a real guard) could not reproduce it because
  they were the wrong layer. Fix: every metric call site passes
  `(lane, suite)` (`barHtml`, `cell` — the latter latent, only ever called
  with acc/p50); the empty cell is honest about WHY ("no chance baseline"
  for cc on the six harness families — a lane that ran but cannot score
  there — reserving "not run" for a lane that never measured the suite);
  the cc note explains the axis and the skip. `bench_page_smoke` 9b pins
  it data-derived (9 chance bars / 6 no-baseline / 2 not-run today),
  proven two-sided — on the pre-fix file it fails with the exact user
  symptom. Live-verified post-deploy: 114 real bars on
  `reflex.gist.rs/bench/?m=cc`, zero not-run on a chance suite.

- **2026-10-01 — #areas shows every selected lane + the qualifier-free lane
  names (owner calls: "should show any selected result" + "rename … to reduce
  noise").** Two landings in one publish. (1) The Areas & index radar now
  rolls up EVERY filterable lane, not only the four product lanes — the
  comparison lanes (clm, gliner, agentjev, openthai, paw, the python laya
  checkpoints) were filter chips with no radar row, so selecting one left
  #areas unchanged. `compute_areas()` v2: `AREA_LANES` extended to every
  lane; acc-only cells (paw/paw-local top-level accuracy) read via the same
  `_cell_acc` the page's accOf uses; a lane the primary host never ran (clm
  / gliner / agentjev / paw-local, all 4090-side) rolls up from
  extra_host_lanes under a host-tagged key (`clm@4090-win`) with `host` on
  the lane block — the radar legend renders `clm · RTX 4090` (RIG_LABELS),
  and one filter chip gates every posture of the lane (the `@host` suffix
  strips for the palette key). Single-host by construction: a lane with any
  primary cell never enters the host pass. 11 lanes roll up (9/9: Reflex,
  Instinct, laya rust, openthai, paw; partial: Rethink 1/9, python 8/9,
  clm/gliner/agentjev 8/9, paw-local 4/9). (2) The lane display spellings
  are the qualifier-free product names — `Instinct` (hybrid arm, NOT
  "Rethink (hybrid)"; the 051-Phase-1 hybrid rebrand is superseded by this
  call) and `Rethink` (encoder arm) — LANE_DISPLAY + AREA_LANES carry the
  new spellings with every legacy spelling mapped (dual-spelling law);
  bench.json re-published in place (the lane-scoped update path) landed
  them in every cell; the JS matchers keep the legacy spellings so an
  un-re-published bench.json still renders; what each name MEANS moved to
  the page's Notes bullet + FAQ lanes answer + References (the
  "described in prose, not in the lane name" ask). Notes readable-ized:
  bold lead-ins on every bullet; the G1 and modelless-near-chance bullets
  dropped (the FAQ entries cover both verbatim); the openthai massive
  latency explainer MOVED to a FAQ entry (it was a why-is-this-number, not
  a reading rule). Sizes-page candidate renamed (`Instinct · trained
  specialists`). Issue 004's naming half marked resolved. Gates: publish
  self-test 66/66 (+3 new area cases: python laya pick, comparison rollup,
  serving-host host-tagged rollup), chart smoke (19 polys / 121 dots / 22
  legend rows, polyline guard now data-derived), pairing gate, mirror
  parity, bench-page smoke (9 armed, vs-Reflex ok 9/9, vs-best gap 3/9 —
  the smoke's Instinct re-derivation dual-spelled too).

- **2026-09-30 — the modelless lane re-published at the promoted gate
  posture (Issue 056's close-out); the deploy ships the pending typed-H2
  publish too.** Lane-scoped publish over `data/bench.json` as primary
  with two coordinated fresh docs — reflex Bench 096 (m3, quotable load
  3.92→4.16) + 097 (4090-windows, UNJUDGED-standing) at `d4051c8`, the
  076+077 flow verbatim (canonical pool, nb/oc/ridge select, heads off):
  hard accuracy bit-identical to every incumbent cell on all 15 suites
  BOTH hosts (cross-host bit-identity re-proven), the gate cells move to
  `--gate-fit-calibrated` (calibrated_abstain == the old fitted raw
  target on every dataset suite — ag_news 0.525, emotion 0.4675, sst5
  0.5817, typed 0.717; raw_abstain 1.0 by construction, the documented
  Bench-095 lever artifact), source stamps to `d4051c8` on both host
  rows. Timing carried per the Issue-032 law (both sides quotable →
  incumbent wins; provenance note on every cell). All gates green:
  publish self-test 52/52, chart smoke, drift gate, pairing, mirror
  parity, bench-page smoke. Deployed from the M3 (the CF-creded box) —
  resolving the 2026-09-29 deploy-pending note: this push serves BOTH
  the typed H2 hybrid cell and the promoted gate posture. Known gap
  filed: reflex Issue 057 (the typed m3 p50 0.517 carry predates the
  1200-row corpus; no corpus-axis LANE_CARRY escape exists —
  owner-gated).

- **2026-09-29 — the typed H2 serving posture published (`4b729d4`); DEPLOY
  PENDING on this box (no CF token — every prior deploy was M3-side).**
  `data/bench.json`'s typed_decisions hybrid cell: A1 0.6300 ->
  H2(beta=0.5,nmin=2,tau=2) 0.6475, `serves` + the certification note follow
  (paired LB95 +0.0580 vs A0'), source stamps re-attributed to instinct
  `8bbff09` (the Benches 019/020 landing). Lane-scoped publish:
  `PUBLISH_BENCH_LANES=hybrid sh scripts/republish_bench.sh data/bench.json
  ../riir-instinct/.benchmarks/020_typed_h2_full_pool/hybrid_lane_doc.json`
  (the 020 merged doc, instinct `9449e10`, was the prepared input that never
  got published). All gates green: publish self-test 52/52, chart smoke,
  pairing gate, mirror parity, bench-page smoke (chip poc - 15 armed -
  vs-Reflex warn 8/15 - vs-best gap 3/15). Node gate on this box: latest
  wrangler requires Node >= 22, the box has v20 - `npx wrangler@3.114.4
  deploy` runs but then needs `CLOUDFLARE_API_TOKEN`, which lives on the M3.
  **The shipping command (M3 or any creded box): `cd reflex-site && npx
  wrangler deploy`** - until then reflex.gist.rs serves the pre-publish
  bytes (verified live: typed hybrid still reads A1 0.63).

- **Issue 003 — 26 published latency cells from runs that judged their own box unfit: RESOLVED 2026-09-30 (unfit cells on the board: 0).**
  T1+T2 landed 2026-09-28 (Bench 076+077 m3 modelless re-measure + the
  `carry_beats_incumbent` suppression); T4 (per-cell `source_run` stamps)
  2026-09-27; T3 (the m3-ane ANE re-measure) 2026-09-30 — reflex
  [Bench 098](../../riir-reflex/.benchmarks/098_ane_quotable_rerun.md):
  preflight-passed spans (5.04/4.64), the five published suites exactly,
  accuracy bit-identical at HEAD `2f6b58c`, p50 within 1 ms,
  prompt_injections' 652 ms cold-compile p99 gone. Published via the
  update path + `PUBLISH_BENCH_LANES=laya` (modelless byproduct dropped —
  the paw-lane law); deployed `4cb76db`, live-verified cache-busted
  (unfit 0 / quotable 5). **En-route find (the re-measure's own gate run
  first, per the lane-change law): the ANE lane had been BROKEN at HEAD
  since 2026-09-26** — reflex `6535b75` (the KV-table lane's e8 table
  converter) added `<model>/table_e8` rows to `assets/ane/manifest.json`
  and riir-infer's `AneManifest::load` required the artifact schema on
  every row; fixed substrate-side (riir-infer `7eae0e7`: parse only
  `<model>/L<n>` rows, skip foreign rows per the loader's own
  schema-grows-freely contract) with a regression pin; G5-ANE parity
  green after (231 s). T5's residual stays a documented defer (the
  4090-laya results doc lives on the 4090; those cells read unjudged
  regardless — no box probes on that host).

- **Issue 001 — arena four lanes + honest µs timing + bench-driven TL;DR: DONE 2026-09-24.**
  All 7 tasks landed (lane labels, 2-per-row grid, sub-ms honest timing, laya (Rust)
  naming, 4-lane demo oracle, TL;DR from `data/bench.json`). Verified by
  `scripts/arena_demo_check.mjs` + `arena_head_parity.mjs` + the page smokes; the
  oracle carries all four lane walks (rust / python / raw / modelless). The two
  measured gaps it surfaced (Rust-vs-Python speed, modelless-vs-laya accuracy) are
  tracked where they live (riir-reflex Issue 020 — closed upstream 09-26; the
  accuracy gap stays published as-is on the TL;DR).

- **Issue 002 — pair TL;DR lanes on population identity, not hope: LANDED 2026-09-27.**
  All 4 tasks landed: identity pairing in `assets/arena_tldr.js` (cases_digest >
  lane_sources run-id; mismatch = a third disclosed state), per-cell `cases_digest`
  stamping in `scripts/publish_bench.py`, the fail-loud `scripts/check_lane_pairing.py`
  wired into `republish_bench.sh`, and the pinned self-test arms. Full root-cause
  record: riir-reflex `.issues/040`.

- **Owner pass 2026-09-29 — Instinct moves to /bench, rig radio, paw lane, yellow ✓.**
  Four owner-directed changes + the prod-grade gaps found en route: (1) the
  "Instinct vs Reflex" TL;DR row MOVED from the arena to a new `/bench/#instinct`
  section (after Protocol) — what Instinct is, the two-mirror flow figure
  (`assets/instinct_flow.svg`, source `riir-instinct/.docs/03_decision_flow/instinct_flow.md`,
  rendered by the now two-source `scripts/render_tetris_flows.py`), the moved row
  plus a new "vs best lane" row (the raised bar: best published lane per suite,
  instinct `.issues/008` amendment) and a data-driven PoC/GOAT chip — the arena
  and home stay Reflex-only until the chip flips; (2) the Reflex-vs-laya accuracy
  row shows a YELLOW ✓ (class `warn`) when Reflex is at-or-above on a strict
  majority of the trio suites (9/14 today), red only on a minority result;
  (3) `/bench/` grows a rig radio (All rigs · M3 Max · RTX 4090) derived from the
  fleet merge — `window.BenchRig` in `assets/bench-charts.js` scopes the hero,
  per-suite charts, tables, log axis and provenance strip; the ANE rows stay in
  the M3 scope (device-suffix rule anchored to the primary host), scope survives
  a reload; (4) the paw lanes (published 2026-09-28/29, rendered by NOTHING — the
  invisible-lane class) joined the palette/renderers with an `accOf` reader for
  their acc-only cell shape, and `†` now only marks numeric latency cells. Base
  `.tldr` li verdict colors moved into `style.css` (they lived only in
  `arena.css`, so the home/bench rows were unstyled). Smoke coverage: rig scopes,
  Instinct section order/figure/chip, paw row counts, the warn rule
  (`bench_page_smoke.cjs`, `arena_demo_smoke.mjs`, `home_page_smoke.cjs`), and
  both static-server MIME maps gained `.svg` (Chromium refuses SVG-in-img at
  octet-stream — production wrangler was never affected). Validation:
  chart_render PASS, bench_page PASS, home_page PASS, arena_demo PASS,
  pairing gate 29/0, publish tests 52/52, figures `--check` in sync.

- **Owner pass 2026-09-29 (later still) — the verdict rows became per-suite loading bars.**
  Owner ask: the two prose rows were unreadable. `assets/instinct.js` now
  renders each verdict as a short headline (same majority-law mark, the
  smoke's re-derivation unchanged) + a segmented "remain" bar (won/tied/
  remain/no-arm, flex = count, hatch = no arm yet) + ONE LINE PER SUITE:
  a loading bar — fill = Instinct (its lane color), tick = the compared
  lane (THAT lane's palette color), the dim span between = the gap — plus
  colored numbers and a ±delta chip. The palette stays single-sourced:
  `bench-charts.js` now exposes `window.BenchLanes` (display-label color
  lookup) instead of instinct.js re-deriving the lane→color map. Two
  findings en route, both fixed at root: (1) style.css's
  `.tldr p { display: inline }` (the arena TL;DR prose shape) merged the
  chip/lead/legend into one flow — `.instinct .tldr > p` restored block;
  (2) the host tag `<i class="iv-host">` measured with broken intrinsic
  width (the synthetic-italic face: the engine sized the cell ~47px
  narrow in flex, grid AND table — a `<span>` measures full) — the host
  tag is a span now. Suite lines are `display: table` (content-sized
  nums cell via the width:1px + nowrap trick, the bar cell takes the
  rest); mobile stacks bar/numbers under the name. Verified: Chromium
  rasters desktop + 420px, `bench_page_smoke.cjs` PASS (marks, chip,
  phrases all re-derived from bench.json), no page errors.

- **Owner pass 2026-09-29 (later) — the Instinct flow figure reflowed to two bands.**
  The owner ask: the one-row LR figure was too wide and rendered small. The
  source mermaid (`riir-instinct/.docs/03_decision_flow/instinct_flow.md`)
  now uses the Reflex hero's flywheel shape — top band "the question in —
  Reflex · modelless, always first, free" (question → embed/route/score →
  fused gate → confident answer), bottom band "on abstain — the trained
  add-on, paid only here" (top-k prune → specialist → fuse → calibrated
  answer), the thresholds + arsenal.toml boxes dotted in from outside — and
  re-rendered to both mirrors by the same script (viewBox 2304×574 →
  1751×730, the hero's ~2.4:1 shape). `bench/index.html` img dims + alt
  updated to match. Verified: Chromium raster of the SVG (UTF-8 intact),
  figures `--check` in sync, `bench_page_smoke.cjs` PASS.

- **Areas & index radar + the Rethink rename + a chance-corrected range metric (2026-09-30).**
  The owner ask: leaderboard-style radar cards on `/bench/` for the four
  product lanes (Reflex · modelless, Instinct (hybrid), Rethink (encoder),
  laya (rust)) across all areas, plus the min–avg–max range-per-lane chart
  on the landing page. Three landings, all data-driven (the hand-typed-
  number law): (1) `publish_bench.py` gains `compute_areas()` — it emits
  `data/bench.json` `areas`: per-lane chance-corrected scores
  (cc = (acc − chance)/(1 − chance)) rolled into four curated areas
  (Language & intent, Sentiment, Reasoning & safety, Decisions & code) over
  the nine product-lane suites, with per-suite chance baselines that are
  DATASET facts read off the harness's own option construction (ag_news 4,
  massive 20 presented/question, banking77 77, sst5 5, emotion 6, xnli 3,
  prompt 2, typed 20-head-type mean 0.3175, code (1/8+1/2)/2 — cited in the
  constant's comment); the page renders the rollups, never re-derives them
  (the compute_pairings precedent). Laya uses the charts' own pick rule
  (best non-multilingual checkpoint: typed on typed_decisions, english
  elsewhere); lanes disclose coverage, and a partial lane's index is the
  mean over what it measured, never padded. (2) `bench-charts.js` renders
  the radar — two cards ("All areas · decision index", "All benchmarks ·
  9 spokes"), polygons only for complete lanes, measured-dots-only for
  partials (the Rethink encoder arm is 1/9, gaps are unmeasured, never
  zero), tooltips with raw accuracy + the chance baseline, the lane filter
  governs it, and the legend names coverage + the partial disclosure in
  both cards. Same landing: a **chance-corrected acc** metric on the
  min–avg–max range charts (home + `/bench/` hero) — the same cc scale, so
  the landing page's ranged bars finally compare a 4-way and a 77-way
  suite on one axis (bars clip at the 0% chance line; tooltips carry exact
  values). (3) The encoder lane rebrands per the riir-instinct naming law
  (riir-ai Proposal 051): display spelling `Instinct (encoder)` →
  `Rethink (encoder)` in LANE_DISPLAY with the legacy spelling mapped
  (the dual-spelling law), the palette label + match updated; the lane KEY
  never changes. The results are still 1/9 (record-only, serve ✗) —
  blocker tracked in `.issues/004_rethink_encoder_lane_partial.md` (051
  Phase 1 + the encoder serving deploy). Verified: test_publish_bench
  63/63 (6 new area-rollup cases), chart_render_smoke (cc + radar arms),
  bench_page_smoke (radar renders, partial disclosed on both cards, the
  filter governs it), home_page_smoke, check_lane_pairing, mirrors --check.

- **2026-10-02 — the hero's "Instinct / Rethink — not run" on the five
  harness families was a laneOf() misclassification, not missing data
  (user live report, `50b8ea3`).** `laneOf()`'s Reflex matcher
  (`l.lane === "KatGPT" || l.model === "modelless"`) classified the
  derived tier-fallback cells (`publish_bench.py apply_fallback_cells` —
  the modelless tier's SERVED answer riding the Instinct/Rethink lane,
  `model: "modelless"`) as Reflex cells: the hero folded them into the
  Reflex lane and rendered "Instinct — not run" / "Rethink — not run" on
  the five harness families, while `instinct.js` (lane-string matchers)
  counted the same cells as family arms and the vs-best card showed
  "22.0% vs 60.0% laya (rust) −38.0". Two classifiers, one data file —
  the tell was `harness_cache_reuse` rendering its Instinct/Rethink bars
  fine (its hybrid cell's model string is the A0 artifact-less spelling,
  not "modelless"). Repair: the katgpt matcher defers any cell whose
  `lane` names a product lane (`PRODUCT_LANE_SPELLINGS` — the same
  spellings the instinct/rethink matchers carry); the verdict card tags
  a tier-fallback family arm with the ↩ badge + hover naming the
  answering tier (the board's bc-fb mark, one surface over), and the
  page smoke's not-run pin gains the hybrid/encoder rows. Verified
  headless: the hero renders ↩ bars on all five families, Reflex keeps
  its own cells (no double count), all four smokes green.

## 2026-10-02 — the /families/ quarantined section removed with its suites (same owner call, this commit)

The `/families/` page + `data/families.json` + the `publish_families.py` /
`build_family_lane_doc.py` / `test_publish_families.py` /
`families_page_smoke.cjs` pipeline existed ONLY to show the six harness
families per lane (Plan 009's "quarantined our-lanes web section", reflex
issue 059) — with the suites retired upstream (reflex `31b11d2`) and the
board rows gone (`f1731fc`), the page had nothing to show and was removed in
the same owner call. The home page's families link and the bench FAQ's
pointer were updated (the FAQ now says the page was removed; the retirement
record lives here). `publish_bench.py`'s RETIRED_SUITES comment records the
removal; its quarantine gate still forbids the bench publisher from ever
naming or ingesting that surface. Verified: the six suites render nowhere on
the site, `/families/` answers the 404 path, all remaining smokes green.

## 2026-10-03 — the instinct_flow.svg mirror pair managed (the Proposal 053 miss, pre-ratification)

`assets/instinct_flow.svg` had been served on `/bench/#instinct` since the
2026-09-29 owner pass but was NOT in `sync_mirror.py`'s table — the site's
copy was unmanaged and could drift from
`riir-instinct/.docs/03_decision_flow/instinct_flow.svg` silently (the live
miss Proposal 053 files, riir-ai). Fixed ungated (the SVG is already public;
nothing new ships): the pairs table is now per-pair source root —
`riir-reflex` stays PRIMARY (absent → exit 2, the guard's loud-SKIP lane,
contract unchanged for the reflex guard + `republish_bench.sh`), and the new
`riir-instinct` root is a SECONDARY whose absent checkout is a LOUD per-root
skip (never a silent green, never a red — the mirrors are committed files;
deploys never need the private checkouts). The new coupling satisfies the
BOUNDARY law at landing: `sync_mirror.py` now owns
`assets/mirror_manifest.json` — per mirrored file: repo, src, dst, sha256
(git refs deliberately omitted on EVERY row: one fixed shape, and
riir-instinct is private until the 052 Phase-C flip — the same leak class
Proposal 053's rounds 2–3 closed for Rethink rows). The manifest covers the
two pre-existing reflex pairs too. Byte-identity of the two SVG copies was
verified (sha256 `96a40d5f…` both sides) before the pair landed. Self-test
grown to 9 arms (sync/check/drift/missing-source/missing-mirror/
manifest-stale/manifest-unlisted/secondary-skip/primary-absent/no-shrink);
all three postures verified live (3/3 rc=0 · absent-instinct skip-loud rc=0 ·
absent-reflex rc=2). `render_tetris_flows.py` remains the PRODUCER of the
instinct figure (writes both mirrors byte-identically); after a re-render,
run `sync_mirror.py` to refresh the manifest — a stale manifest is a named
`MANIFEST-STALE` finding, never silence. Proposal 053's page/nav/DRY-sources
work itself still awaits owner ratification; this lands only its T1.4
byte-identity confirmation + the mirror pair.

## 2026-10-03 — Issue 009 CLOSED: /bench FAQ typed numbers, locked-claim scope, arena figure polish

Found during the web-family restyle (riir-ai `.docs/13_web_family`). Five tasks:

- **T1** (`2fc29eb`): the openthai FAQ's p50s, accuracy, ratio and per-option cost
  bind via `[data-ot]` from `data/bench.json`; `public_copy_gate.cjs` scans every
  opened `details.faq` for typed figures (5 reasoned constants in
  `FAQ_FIGURE_ALLOW`; canary: the parent commit reds on exactly the 5 typed figures).
- **T2** (`2fc29eb`; source fixes riir-instinct `b6425bf`, riir-rethink `47887ff`):
  the "BLAKE3-locked / signed" copy scoped to what serves. Instinct winners are raw
  `.bin` files pinned by BLAKE3 (no signature), the Rethink vessel path is planned,
  and only the Reflex game heads load through a verified signature.
- **T3** (`3448505`): arena charts lay out at the available width (600–920 units),
  pinned to min-width = that width, so labels never scale below 1:1: measured
  **3.87 px → 11.00 px** at 390. The mermaid flow figures scroll inside `.fig-x` /
  `.fw-stage` at a 690 px min-width (16-unit labels, view boxes ≤ ~990 wide); the
  board's "12 rows" label and the pie-legend swatch letters went 9 → 11 px.
- **T4** (`3448505`, katgpt-rs mirror `0d4af3dd0`): the Tetris flow figures are
  re-rendered on the family ink palette + Reflex accent (`render_tetris_flows.py`
  refuses the retired "rust" palette and gained `--only`). `flow_walk.js`
  highlights and board chrome resolve family tokens via `var()` / `color-mix`
  (one palette: the page's). Lane colours re-measured on `--bg-2`, all ≥ 3:1.
- **T5** (riir-reflex `a84bad6`): the skill's cache path is verified against reflex 0.2.3
  (`$HOME/.cache/riir-reflex/laya`, `LAYA_WEIGHTS_DIR` / `LAYA_HOME` overrides).

Gate: `scripts/arena_legibility_smoke.mjs` (labels ≥ 11 px at 390 + 1280,
no sideways scroll, no retired palette literal; canary: the parent commit reds on
all three classes). `home_page_smoke.cjs` now listens on an OS-assigned loopback
port. The fixed 8793 had coexisted with another server on 127.0.0.1:8793 and
timed out at 30 s. Deployed `a83f9c66` (T1/T2/T5) and `888a4b7d` (T3/T4). Live
assets were curl-verified and the live /arena labels measured at 11 px with
no sideways scroll at 390. `arena_prod_smoke.mjs` needs a local engine with
`RIIR_REFLEX_ALLOWED_ORIGIN` and was not run.

## 2026-10-03 — Issue 005 CLOSED: stale and false claims on the Reflex pages

Web trust audit (riir-ai Issue 1028): 14 claims checked by fetching every link on the five pages.

- **T1–T5b** (`e97247b`, riir-reflex `50d340d`): /bench's "riir-instinct, private repo" corrected
  (it is public); Rethink attributed to its own product; the storefront linked live; the TL;DR
  says which N of M suites its ratio covers; the Homebrew line includes `brew trust`; the agent
  skill names the `reflex` command and was re-captured against 0.2.3.
- **T6a** (gist-rs/reflex `adaa0aa`, scoop-bucket `caacf62`): the Scoop line is live.
- **#10** (yes/no vs `noul`): `/docs/api/#types` maps the two names (`295a398`, Issue 006 T2).
- **T6b** (owner: "draft it, protect me, publish"): the binary repo said "MIT OR Apache-2.0"
  while the engine source is MIT. The `reflex` binary is **MIT**, matching its public MIT
  source; a stricter binary licence would not hold over code anyone can build. gist-rs/reflex
  `edc3c99` adds `LICENSE` and a README §License with a no-warranty and advisory-answers note;
  riir-reflex `d009604` puts `LICENSE` in every release archive. Every crate in the binary is
  public MIT (katgpt-*, riir-infer, riir-reflexer), so nothing private ships under that notice.
  The sibling binary, cargo-refine, went the other way the same day: proprietary EULA
  (riir-refine `7aee4497`, Issue 144 T5; gist-rs/cargo-refine `c957411`).

- **2026-10-03 — the #instinct section reframed as "Rethink vs Others" (owner ask: the fallback is the design, stop scoring the family against itself; verdict ping-pong rounds 1–3, AGREE).** Five pieces. (1) ROW 1 is the encoderless claim: hybrid cells only (`isHybrid`), head "Reflex vs Instinct · trained specialists (encoderless), accuracy", the specialists' honest 7/12 (was 8/12 on the union — one win was riding an encoder read), plus the Rethink CTA after the counts. (2) ROW 2 renamed "Rethink vs Others, accuracy — the rung stack (Reflex → Instinct → Rethink; Rethink reads record-only until its serving deploy)": the comparator pool now refuses DERIVED tier-fallback rows wearing the Rethink name (`isFamilyServing`) — they carry the serving tier's own number, so banking77/prompt_injections had been comparing the stack against ITSELF and rendering false ties; the honest board is 3/12 strictly best (two hidden wins surfaced), 5 to take, 4 level; the live "1/12" was this bug. (3) COLOR LAW: green ahead / yellow tied (`--warn`) / red behind; within-noise trails moved to ember with their ≈ glyph; A0-seated suites (the seated arm IS the floor — `hybrid.serves === "A0"`) split out of the ties as their own grey "floor-seated (A0 — no specialist earned a seat) on 5" segment + legend entry + hover, KEPT in the denominator (the mark stays warn; nothing softened). (4) CHIP: rung-model framing ("the fallback to Reflex/Instinct is by design: you pay for thinking only where the floor abstains; the open race is Rethink vs Others") with to-go arithmetic counting ties (9 to go = 5 behind + 4 level); GOAT/`strictlyAll` flip condition untouched. (5) SMOKE: 4 label pins updated, `hybOf`/`hybServesOf` split from `famOf` (row 1's population and A0 classification derive from the data, never suite names), record-only qualifier pinned; bench_page_smoke + public_copy_gate green, rendered-DOM probe verified colors/heads/deltas. The old mark-only smoke check had masked the comparator bug (1/12 and 3/12 share the gap band) — the mirror now computes the same pool, so drift reds. Commits: `c8b2f57` (reframe + comparator-pool leak), `b0b1162` (floor-seated split + record-only qualifier). Follow-up noted, not owed: an explicit smoke arm failing when an A0 cell's accuracy differs from the floor's number (today the count-mismatch path already fails the floor-seated assertion). Issue file removed per this convention; full narrative: `git log --follow -- .issues/010_rethink_vs_others_reframe.md`.
