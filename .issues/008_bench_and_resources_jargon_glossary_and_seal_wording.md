# Issue 008 — reflex.gist.rs /bench + /resources: internal vocabulary, no glossary, banned "seal" wording
**Status:** OPEN — 2026-10-03 (web trust audit, riir-ai Issue 1028)

**Priority:** P2 — education (design guide §5: explain jargon on first use; >5 terms → glossary;
banned word "seal").
**Audience:** learner new to decision models (primary); buyer skimming the board.

## Evidence — internal references on public pages

| Text | Where |
|---|---|
| "At its **051-era posture** …", "the **pre-076** numbers are restored", "**reflex issue 058** owns the record" | `bench/index.html:330-336` (FAQ "Why does the modelless lane lose on accuracy?") |
| "the product vocabulary follows riir-instinct's naming law (**riir-ai Proposal 051**, owner call 2026-10-01)" | `bench/index.html:244` |
| "made every @m3-max-metal openthai cell quotable from its own run (**riir-reflex Bench 085**)" | `bench/index.html:355` |
| "G2 latency · G4 zero-alloc · **G5 laya parity** — gate record"; "**GOAT**-gated" | home badge + notes |
| seat / seated / posture / record-only / tier-fallback / served tier / ↩ / ▲ / cc / sel-acc / acc@50cov / ECE / conformal-naive floor / transductive line / fused gate / winner law / vessel / rung | /bench Instinct section + FAQ, /resources |

Most are defined *somewhere* on the bench FAQ, but not at first use and not in one place.

## Evidence — "seal" (banned word, guide §5) still rendered

- `bench/index.html:238` "distilled, **BLAKE3-sealed**, hot-swapped"
- `bench/index.html:278` "a **BLAKE3-sealed** distilled specialist"
- `resources/index.html:164` "a **sealed** per-domain specialist scores them"
- `resources/index.html:224` "a HOSTED-ONLY vessel — **checksum-sealed**, tamper-evident"

(The mirrors were converted in `44a8731`; these page bodies were not. Replacement: "locked" /
"BLAKE3-locked" = hashed + signed so any change is detectable. Code-level token-plane rename is
riir-dapps Issue 114.)

## Evidence — claims a learner will misread

- Home hero: "**No model weights**, nothing leaves your machine" — while the same page explains
  "optional per-label linear heads are fitted at build time by a short fixed-order SGD" and the
  arena's Reflex lane is "laya's recorded answers distilled into a tiny linear head". A learner
  reads "no weights" and then sees fitted heads. Say "no neural network / no downloaded model —
  small fitted numbers rebuilt from your documents".
- The rung labels on the family pages skip **R2** (rethink.gist.rs: R0, R1, R3, R4+) — if
  /resources adopts the rung picture (guide §1), number it the same way everywhere or explain the gap.

## Proposed fix

1. Strip plan/issue/proposal/bench ids from rendered copy (keep the history in HISTORY.md and
   `data/changes.json`); rewrite the 2026-10-01 correction as plain prose: "From Sep 28–30 the
   modelless cells were measured on a truncated corpus and read up to 42 points low; re-run on
   full data — see the board change log."
2. One `dl.gf-gloss` box on /bench and /resources: modelless, abstain, calibration, coverage,
   selective accuracy, cc (chance-corrected), ECE, conformal floor, lane, suite, record-only,
   tier-fallback, encoder head, vessel, rung.
3. seal → lock at the four lines above.
4. "No model weights" → accurate learner wording.
5. Add a no-jargon test to the site's checks: rendered HTML contains no
   `\b(Plan|Proposal|Issue|Bench) \d+`, `\d+-era`, `pre-\d+`, or `seal`.

## Tasks

- [ ] T1 remove internal ids from /bench + home (table above)
- [ ] T2 glossary box on /bench and /resources
- [ ] T3 seal → lock (`bench/index.html:238,278`, `resources/index.html:164,224`)
- [ ] T4 hero "No model weights" reworded for learners
- [ ] T5 vocabulary/no-internal-id check in `tests/` (site gate)
