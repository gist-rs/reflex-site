# Issue 012 — bmo: publish the mammoth-1 lane on /bench/ (the M5 local panel)

**Status:** OPEN — filed 2026-10-30 (M3), queued for **bmo** (pick up when its current load frees; owner call: bmo, not M3/amo)

The board (`data/bench.json`, edition 2026-10-11, primary run 2026-09-24 M3
reflex `8028a10`) has not moved since. The amo/M5 local panel of **mammoth-1**
(Base Labs 27B, MIT — license gate cleared riir-train issue 640 T0) landed
2026-10-24/25 and was never published: riir-reflex
[Bench 162](../../riir-reflex/.benchmarks/162_mammoth_local_panel.md), 12
per-suite docs at `riir-reflex/.benchmarks/mammoth_local_panel/<suite>/results.json`
(riir-reflex `3b9e4d8`), determinism_ok 12/12, board-parity within ±0.023.
Owner call 2026-10-30: **mammoth-1 only** — elephant-1 (Bench 164) is strictly
dominated by mammoth-1 on every suite, a column with no cell of its own.

Expected movement on the board suites (accuracy, board metric):

| suite | Reflex | best ref today | mammoth-1 |
|---|---|---|---|
| massive_intent_en | 84.0 | 93.3 clef | **93.7** (new best ref) |
| banking77 | 85.4 | 95.4 clef | 93.0 |
| xnli_en | 86.0 | 95.7 pplx | 93.0 |
| typed_decisions | 75.5 | 77.2 agentjev | 76.0 |
| sst5 | 52.7 | 60.3 clef | 55.2 |
| prompt_injections | 85.3 | 92.2 pplx | 72.4 (Reflex wins) |
| ag_news | 94.8 | 95.0 laya | 88.8 (Reflex wins) |
| emotion | 88.5 | Reflex | 58.8 (Reflex wins) |

## Tasks

- [ ] T1 `scripts/publish_bench.py`: a `mammoth` lane beside clef/pplx/drex —
      label `mammoth-1 (local)`, host `amo` (M5 Ultra, MPS bf16), transport
      `http-oracle` (the `.raw/mammoth-local/serve_mammoth.py` loopback serve),
      model id from the doc's lane `model`; extend the lane lists (`~L243–302`,
      `~L470–479`, `~L735–768`) + the self-test fixtures; the bench-page lane
      filter + charts pick it up (the pplx-join precedent `f1d9953`)
- [ ] T2 LATENCY QUARANTINE: Bench 162 §box-state — every p50/wall column is
      contention-inflated (sibling train-628 load 13–14) → publish accuracy /
      calibration only; the publisher's Issue-021 wall must REFUSE those
      latency cells (`box_state.latency_quotable=false`), never hand-strip
- [ ] T3 `scripts/republish_bench.sh data/bench.json <12 mammoth results.json>`
      (current board as primary = a lane-scoped update; `PUBLISH_BENCH_LANES`
      per README); steps 1–5 green incl. the pairing gate (same
      `cases_digest` per suite as the board — Bench 162 runs the canonical
      `.raw/datasets`; a mismatch REFUSES, do not ack it blind)
- [ ] T4 read the rendered /bench/ (step-5 chromium smoke + eyes on the 8
      board rows above); the home TL;DR/averaged chart move with it
- [ ] T5 commit + push (`main`), cite the riir-reflex sha of the docs
- [ ] T6 DEPLOY from the **M3**, not bmo — Touch ID needs the M3's GUI
      session (an SSH shell gets LAError -1000). The token is READY:
      `cf-deploy-reflex` (Account API token, Specified Workers →
      `reflex-site`, Editor) sealed 2026-10-30 in the M3's kat-secret store
      (`~/.kat/secrets/cf-deploy-reflex.katsec`). bmo: after T5, hand off
      (message the M3 session / owner) — do NOT look for a token on bmo.
      The M3 agent runs (riir-deployer `touch-deploy` skill):
      ```sh
      git -C ~/git/reflex-site fetch origin
      git -C ~/git/reflex-site worktree add --detach /tmp/reflex-site-deploy origin/main
      cd /tmp/reflex-site-deploy && \
      CLOUDFLARE_ACCOUNT_ID=7e11517c4dd4f6e9cede7da9b60d66eb \
      kat-secret exec cf-deploy-reflex --env CLOUDFLARE_API_TOKEN \
        --why "deploy reflex-site <sha>" -- \
        npx wrangler deploy --message "mammoth-1 board lane (<sha>)"
      git -C ~/git/reflex-site worktree remove --force /tmp/reflex-site-deploy
      ```
      Warn the owner first ("Touch ID prompt incoming for cf-deploy-reflex");
      use `exec`, never `open`. Then probe
      `curl -s https://reflex.riir.ai/bench/ | grep -c mammoth` (> 0) and
      record the wrangler Version ID here.

## Notes for the bmo agent

- bmo has no Zed; sync reflex-site + riir-reflex first (`git fetch` +
  ff-only). No GPU/serve needed — T1–T5 read committed results.json only.
- Do not preempt the live riir-train issue 640 T3b mammoth capture on bmo;
  this is a CPU-light publish, run it when bmo's window frees.
