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
#   3. publish_bench.py over the given docs
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
python3 "$SITE_ROOT/scripts/test_publish_bench.py"

echo "== 2/5 chart render smoke (pre-publish state)"
node "$SITE_ROOT/scripts/chart_render_smoke.cjs"

echo "== 3/5 publish ($# doc(s))"
python3 "$SITE_ROOT/scripts/publish_bench.py" "$@" "$SITE_ROOT"

echo "== 4/5 docs-mirror parity"
python3 "$SITE_ROOT/scripts/sync_mirror.py" --check

echo "== 5/5 bench-page smoke"
if node -e "require('playwright')" >/dev/null 2>&1; then
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
