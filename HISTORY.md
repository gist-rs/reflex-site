# HISTORY.md — reflex-site

One hash-pinned line per removed issue (the fleet noise-reduction convention:
an issue file is removed once its work is verifiably landed; this file is the
durable record). Full narrative of each: `git log --follow -- .issues/<file>`.

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
