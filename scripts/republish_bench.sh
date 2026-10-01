#!/bin/sh
# Re-publish the site's bench data from a riir-reflex harness run — the
# README §"Regenerate the tables" flow, mechanised, with the checks that
# keep the published page honest. The home-page TL;DR + averaged chart and
# the /bench/ tables ALL render from data/bench.json, so this one publish
# is what updates both.
#
# Usage:
#   scripts/republish_bench.sh <results-primary.json> [results-extra.json ...]
#
# Docs apply in argv order (the first doc shapes the tables; a previously
# published data/bench.json is a valid primary for a lane-scoped update).
#
# Steps:
#   1. publish_bench self-test (the merge laws; no network)
#   2. chart render smoke (zero-dep: the landing summary chart against the
#      CURRENT data/bench.json — pre-publish state)
#   3. publish_bench.py over the given docs (refuses latency a doc's own
#      box_state judged NOT QUOTABLE — the Issue-021 wall)
#   3.5 pairing gate — cross-sample lane pairs refuse (ack via
#      PUBLISH_ALLOW_SAMPLE_MISMATCH naming the suites; stale acks red too)
#   4. docs-mirror parity (--check): decision_flow.svg + the agent SKILL.md
#   5. bench-page smoke in headless chromium — SKIPPED LOUDLY when
#      playwright is not installed (never silently)
#   6. prints the human steps that remain: review, commit, deploy
set -eu

SITE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REFLEX="${RIIR_REFLEX_CHECKOUT:-$SITE_ROOT/../riir-reflex}"

if [ "$#" -lt 1 ]; then
    echo "usage: scripts/republish_bench.sh <results-primary.json> [results-extra.json ...]" >&2
    exit 2
fi

echo "== 1/5 publish_bench self-test"
# Env-clean: the merge-law self-test must be deterministic regardless of the
# caller lane-scoping/ack env — with PUBLISH_BENCH_LANES exported (the
# documented usage), the scoping filtered the test own extras and its
# update assertions failed. Steps 3/3.5 keep the env deliberately.
# PUBLISH_BENCH_CORPUS_RESET joins the env-clean (Issue 057): the ack is
# publish-scoped, and inside the self-test its fixtures publish no such
# suite, so the stale-ack refusal fires and step 1 dies.
# PUBLISH_BENCH_ALLOW_UNQUOTABLE joins for the same reason (2026-10-01,
# the Issue-058 republish: the ack leaked into the self-test's stale-ack
# case and made it pass-by-refusal — the exact leak class 099's env-clean
# closed for CORPUS_RESET, one env over).
env -u PUBLISH_BENCH_LANES -u PUBLISH_ALLOW_SAMPLE_MISMATCH \
    -u PUBLISH_BENCH_CORPUS_RESET -u PUBLISH_BENCH_ALLOW_UNQUOTABLE \
    python3 "$SITE_ROOT/scripts/test_publish_bench.py"

echo "== 2/5 chart render smoke (pre-publish state)"
node "$SITE_ROOT/scripts/chart_render_smoke.cjs"

echo "== 3/5 publish ($# doc(s))"
python3 "$SITE_ROOT/scripts/publish_bench.py" "$@" "$SITE_ROOT"

echo "== 3.5/5 pairing gate (the lane population law)"
python3 "$SITE_ROOT/scripts/check_lane_pairing.py" "$SITE_ROOT"

echo "== 4/5 docs-mirror parity"
python3 "$SITE_ROOT/scripts/sync_mirror.py" --check

echo "== 5/5 bench-page smoke"
if (cd "$SITE_ROOT" && node -e "require('playwright')" >/dev/null 2>&1); then
    node "$SITE_ROOT/scripts/bench_page_smoke.cjs"
else
    echo "SKIP (loud): playwright not installed — install with:"
    echo "  npm i --no-save playwright && npx playwright install chromium"
    echo "the publish itself is unaffected; run the smoke before deploying"
fi

echo
echo "== done. remaining steps (manual by design):"
echo "   git -C '$SITE_ROOT' diff data/bench.json   # review the published numbers"
echo "   git -C '$SITE_ROOT' add data/bench.json && git -C '$SITE_ROOT' commit"
echo "   cd '$SITE_ROOT' && npx wrangler deploy      # ships index/bench/data together"
