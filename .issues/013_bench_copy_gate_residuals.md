# Issue 013 — /bench/ copy-gate residuals: internal ids in data prose, the banned word in a stamped gate line, and the 390 px sideways scroll

**Status:** OPEN — filed 2026-11-06 (M3, zed-m3-deploy); the footer half of the same gate run is FIXED in-tree (Reflexer cell on all 7 pages); this file carries the 3 remaining failures

`public_copy_gate.cjs` went red on `main` BEFORE the 2026-11-06 chart fix (clean-HEAD run: exit 1, the same rows). All three are publisher-side: the strings live in `data/bench.json` prose the page renders verbatim, so the gate's own law applies — fix the engine string at the source, never patch the rendered page.

## Failures + diagnosis

- [ ] T1 internal ids in rendered copy — `["Issue 032","bench 072","Issue 007","Bench 082","issue 011","bench 066","bench 137"]`, all traced into bench.json prose:
      the LANE-CARRY notes (`latency cells carried… (LANE-CARRY, Issue 032)`), the timing `method` rows (`instinct Issue 007`, `rethink Bench 082`), and the JDI caveat (`rethink bench 072 … Issue 032 T10` + `bench 066`/`bench 137`/`issue 011` nearby). Source = publish_bench.py lane notes + the rethink stamp strings riding the results.json files (riir-reflex `.benchmarks/mammoth_local_panel/` notes and the instinct/encoder gate lines). Fix at the SOURCE notes, re-publish both-hosts; the gate re-reads rendered copy, so a republish is the verification.
- [ ] T2 banned word "seal" (1×) — the encoder lane's gate line: "a fresh live re-read of the same sealed head over the same 600-question set". Family law (web-family guide §5, the Issue-008 rename): the crypto step is **lock / locked** — "the same locked head". Same source-and-republish path as T1.
- [ ] T3 /bench/ @390 scrolls sideways (1145 vs 390, every `<details>` open) — measured offenders: `SPAN.bc-hhost` (the `@4090-win`/`@BMO (M5 Ultra)` host tags on hero bar rows) and one wide `SPAN.gf-tag`, plus row links right-edge ≤ 1145. The hero's per-host tagged rows need the family mobile invariant (guide §6): scroll INSIDE their own wrapper or wrap the tag run — never scroll the page.

## Notes

- Pre-existing proof: clean-HEAD gate run 2026-11-06 = exit 1, 10 rows; after the in-tree footer fix = exit 1, these 3 rows (6 footer rows cleared).
- The ids/seal strings are DATA (bench.json), not page copy — the page render path is clean; do not add page-side filters (the gate would pass while the feed still ships ids to readers).
- Republish law: publish_bench.py both-host, the pairing gate re-fires; coordinate the rethink stamp string edits with riir-rethink (their `.research/` caveat text carries the same ids).
