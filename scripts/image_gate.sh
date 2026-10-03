#!/usr/bin/env bash
# The image linter: WebP-first, with a size-bloat warning list — the rule
# the /resources story illustration landed under (2026-10-03):
#
#   * every raster image that ships on the site is WebP, wherever possible
#     (cwebp is the reference encoder; resize to the layout width it renders
#     at — the paragraph measure on /resources — and ~q 80; imgc is the
#     batch option)
#   * non-WebP rasters (jpg/jpeg/png/gif/bmp/tif/tiff) are WARNED and listed
#     (--strict promotes each one to a failure; svg is not raster and is
#     always fine; avif is allowed beside webp as the modern alternative)
#   * ANY image over the size ceiling fails; over the warn line it lands on
#     the warning list with the resize/quality hint
#   * a scan that finds ZERO images is a blind walk and fails loudly — a
#     green zero is never a verdict (the frontier-report law)
#
# Usage:
#   scripts/image_gate.sh                 # the lint (exit 1 on any failure)
#   scripts/image_gate.sh --strict        # non-WebP rasters fail, not warn
#   scripts/image_gate.sh --root DIR      # scan another tree (self-test uses it)
#   scripts/image_gate.sh --self-test     # prove every detector fires
#
# Thresholds (KB, env-overridable):
#   IMAGE_GATE_WARN_KB  (default 300)  — soft: listed with a hint, exit 0
#   IMAGE_GATE_MAX_KB   (default 1024) — hard: fails the gate
#   IMAGE_GATE_ALLOW    (comma-separated path substrings) — deliberate
#     non-WebP exceptions; disclosed per row, and a row matching nothing
#     is reported STALE (the pin cannot only ever loosen)
set -euo pipefail

ROOT="$(pwd)"
STRICT=0
SELFTEST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --strict) STRICT=1 ;;
    --root)   ROOT="$2"; shift ;;
    --self-test) SELFTEST=1 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

WARN_KB="${IMAGE_GATE_WARN_KB:-300}"
MAX_KB="${IMAGE_GATE_MAX_KB:-1024}"
ALLOW="${IMAGE_GATE_ALLOW:-}"

# list_images DIR → one tracked (or, outside git, found) image path per line.
# `-co` keeps untracked-but-not-ignored files, so a new image is linted
# before its first commit. Excludes never ship: gitignored by construction.
list_images() {
  _dir="$1"
  if git -C "$_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$_dir" ls-files -co --exclude-standard \
      | grep -Ei '\.(webp|avif|jpg|jpeg|png|gif|bmp|tif|tiff)$' || true
  else
    (cd "$_dir" && find . \
      \( -name .git -o -name node_modules -o -name .wrangler \
         -o -name out -o -name target -o -name .pytest_cache \
         -o -name .raw \) -prune -o -type f -print \
      | sed 's|^\./||' | grep -Ei '\.(webp|avif|jpg|jpeg|png|gif|bmp|tif|tiff)$') || true
  fi
}

is_allowed() {
  local p="$1" a
  [ -n "$ALLOW" ] || return 1
  local rows
  IFS=',' read -r -a rows <<< "$ALLOW"
  for a in "${rows[@]}"; do
    [ -n "$a" ] || continue
    # shellcheck disable=SC2053  # deliberate glob match against a substring row
    [[ "$p" == *"$a"* ]] && return 0
  done
  return 1
}

# ── self-test ───────────────────────────────────────────────────────────────
if [ "$SELFTEST" = 1 ]; then
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/image_gate_selftest.XXXXXX")"
  cleanup() { rm -rf "$TMP"; }
  fail_arm() { echo "SELFTEST FAIL: $1" >&2; cleanup; exit 1; }

  # fixtures: ok.webp under the line, warn.webp on the warn list,
  # huge.webp over the ceiling, bad.jpg on the non-WebP list
  mkdir -p "$TMP/assets"
  head -c 512  /dev/zero > "$TMP/assets/ok.webp"
  head -c 1536 /dev/zero > "$TMP/assets/warn.webp"
  head -c 4096 /dev/zero > "$TMP/assets/huge.webp"
  head -c 512  /dev/zero > "$TMP/assets/bad.jpg"

  # arm 1: the full finding set, low thresholds, exit 1 (huge.webp)
  OUT="$(IMAGE_GATE_WARN_KB=1 IMAGE_GATE_MAX_KB=2 "$0" --root "$TMP" 2>&1)" && ARM1_RC=0 || ARM1_RC=$?
  echo "$OUT" | grep -q "bad.jpg"    || fail_arm "arm 1: non-WebP jpg not listed"
  echo "$OUT" | grep -q "warn.webp"  || fail_arm "arm 1: size warn row missing"
  echo "$OUT" | grep -q "huge.webp"  || fail_arm "arm 1: size fail row missing"
  echo "$OUT" | grep -q "WebP-first" || fail_arm "arm 1: webp-first banner missing"
  [ "$ARM1_RC" = 1 ]                 || fail_arm "arm 1: expected exit 1, got $ARM1_RC"
  echo "ok: self-test arm 1 — all three detectors listed, oversized webp fails"

  # arm 2: without huge.webp the same run is warnings-only, exit 0
  rm "$TMP/assets/huge.webp"
  IMAGE_GATE_WARN_KB=1 IMAGE_GATE_MAX_KB=2 "$0" --root "$TMP" >/dev/null 2>&1 \
    || fail_arm "arm 2: warnings-only run must exit 0"
  echo "ok: self-test arm 2 — the warning list alone stays exit 0"

  # arm 3: --strict promotes the non-WebP jpg to a failure
  OUT="$(IMAGE_GATE_WARN_KB=1 IMAGE_GATE_MAX_KB=9999 "$0" --strict --root "$TMP" 2>&1)" \
    && fail_arm "arm 3: strict run must fail on bad.jpg"
  echo "$OUT" | grep -q "strict" || fail_arm "arm 3: strict verdict line missing"
  echo "ok: self-test arm 3 — --strict fails on a non-WebP raster"

  # arm 4: a stale allow row is disclosed (matches nothing)
  OUT="$(IMAGE_GATE_ALLOW=does-not-exist.webp "$0" --root "$TMP" 2>&1)"
  echo "$OUT" | grep -q "STALE" || fail_arm "arm 4: stale allow row not disclosed"
  echo "ok: self-test arm 4 — stale allow row reported"

  # arm 5: an empty tree is a blind walk, never a green zero
  EMPTY="$(mktemp -d "${TMPDIR:-/tmp}/image_gate_empty.XXXXXX")"
  if "$0" --root "$EMPTY" >/dev/null 2>&1; then
    rm -rf "$EMPTY"; fail_arm "arm 5: empty scan must fail"
  fi
  rm -rf "$EMPTY"
  echo "ok: self-test arm 5 — empty scan refuses (blind walk)"

  cleanup
  echo "image_gate self-test: ALL ARMS PASS"
  exit 0
fi

# ── the lint ────────────────────────────────────────────────────────────────
[ -d "$ROOT" ] || { echo "image_gate: no such root: $ROOT" >&2; exit 2; }

echo "▸ image gate (WebP-first) over $ROOT — warn ${WARN_KB} KB, max ${MAX_KB} KB"

IMAGES="$(list_images "$ROOT")"
COUNT="$(printf '%s\n' "$IMAGES" | grep -c . || true)"
if [ "$COUNT" -eq 0 ]; then
  echo "FAIL: blind walk — zero image files under $ROOT (the gate sees nothing;" \
       "if that is wrong, check the root; never a green zero)"
  exit 1
fi
echo "  scan: $COUNT image file(s)"

# the allow list's live/stale disclosure (both directions)
if [ -n "$ALLOW" ]; then
  while IFS= read -r a; do
    [ -n "$a" ] || continue
    if printf '%s\n' "$IMAGES" | grep -qF "$a"; then
      echo "  allow: '$a' matched (deliberate exception in force)"
    else
      echo "  allow: '$a' STALE — matches no image under this root"
    fi
  done <<< "$ALLOW"
fi

FAILS=0
WARN_N=0
while IFS= read -r img; do
  [ -n "$img" ] || continue
  f="$ROOT/$img"
  bytes="$(wc -c < "$f" | tr -d ' ')"
  kb=$(( bytes / 1024 ))
  ext="${img##*.}"
  ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"

  if [ "$ext" != "webp" ] && [ "$ext" != "avif" ]; then
    if is_allowed "$img"; then
      echo "  allowed: $img (${kb} KB, .$ext — deliberate non-WebP exception)"
    elif [ "$STRICT" = 1 ]; then
      echo "  FAIL(non-webp,strict): $img (${kb} KB, .$ext) — convert to WebP" \
           "(cwebp -resize <layout-width> 0 -q 80 in.jpg -o out.webp; imgc for batches)"
      FAILS=$((FAILS + 1))
    else
      echo "  WARN(non-webp): $img (${kb} KB, .$ext) — the site's rule is WebP wherever possible" \
           "(convert with cwebp; imgc for batches; --strict makes this a failure)"
      WARN_N=$((WARN_N + 1))
    fi
  fi

  if [ "$kb" -ge "$MAX_KB" ]; then
    echo "  FAIL(size): $img (${kb} KB >= ${MAX_KB} KB ceiling) — resize to the width it" \
         "renders at and lower quality (q 80 is the house setting)"
    FAILS=$((FAILS + 1))
  elif [ "$kb" -ge "$WARN_KB" ]; then
    echo "  WARN(size): $img (${kb} KB) — on the size warning list; consider resizing to" \
         "the layout width it renders at (2x for retina) and re-encoding at q 80"
    WARN_N=$((WARN_N + 1))
  fi
done <<< "$IMAGES"

if [ "$WARN_N" -gt 0 ]; then
  echo "  warning list: $WARN_N row(s) — soft findings above (exit stays 0; --strict tightens)"
fi

if [ "$FAILS" -gt 0 ]; then
  echo "✗ image gate: $FAILS finding(s) — keep every raster WebP-first and under ${MAX_KB} KB"
  exit 1
fi
echo "✓ image gate: WebP-first clean — no non-WebP rasters outside the allow list," \
     "nothing over ${MAX_KB} KB"
exit 0
