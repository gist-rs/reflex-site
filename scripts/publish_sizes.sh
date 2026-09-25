#!/bin/sh
# Re-publish the disk-footprint report (data/sizes.json + the /#sizes chart)
# — run it whenever a new reflex release ships, the wasm head is rebuilt, or
# a comparison lane's stack moves. The bench chart's republish_bench.sh
# flow, mechanised the same way: self-test first, generate with the refusal
# laws, smoke the render, then the human steps remain (review, commit,
# deploy).
#
# Usage:
#   scripts/publish_sizes.sh          # generate + check + render smoke
#
# Sources:
#   LIVE     gist-rs/reflex latest release (GitHub API + the unpacked
#            darwin-arm64 archive), HF model trees, assets/arena_head.wasm
#   RECORDED data/sizes.measurements.json — venvs / docker / python-runtime
#            facts, re-measured per bench window (see the file's `how` rows)
#
# Needs network (GitHub + Hugging Face). A failed source REFUSES loudly —
# a partial footprint report never renders as a complete one.
set -eu

SITE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

echo "== 1/5 publish_sizes self-test (synthetic sources, no network)"
python3 "$SITE_ROOT/scripts/test_publish_sizes.py"

echo "== 2/5 generate data/sizes.json (live sources; refuses on any failure)"
python3 "$SITE_ROOT/scripts/publish_sizes.py"

echo "== 3/5 structural gate over the committed file"
python3 "$SITE_ROOT/scripts/publish_sizes.py" --check

echo "== 4/5 size-chart render smoke (zero-dep)"
node "$SITE_ROOT/scripts/size_chart_smoke.cjs"

echo "== 5/5 home-page browser smoke (the /#sizes placement + render)"
if node -e "require('playwright')" >/dev/null 2>&1; then
    node "$SITE_ROOT/scripts/home_page_smoke.cjs"
else
    echo "SKIP (loud): playwright not installed — install with:"
    echo "  npm i --no-save playwright && npx playwright install chromium"
    echo "the publish itself is unaffected; run the smoke before deploying"
fi

echo
echo "== done. remaining steps (manual by design):"
echo "   git -C '$SITE_ROOT' diff data/sizes.json   # review the published numbers"
echo "   git -C '$SITE_ROOT' add data/ && git -C '$SITE_ROOT' commit"
echo "   cd '$SITE_ROOT' && npx wrangler deploy      # ships index + data together"
