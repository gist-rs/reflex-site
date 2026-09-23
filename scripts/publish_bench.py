#!/usr/bin/env python3
"""Publish the harness results to the arena site (Plan 606 T3.2).

Copies riir-reflex's `.benchmarks/001_phase1_tables/results.json` into the
site repo's `data/bench.json` after SANITIZING machine-local fields (the
leak-scan discipline applied to the site: the raw file carries the local
datasets path, e.g. /Users/<user>/... — that never leaves the box).

Usage:
    python3 publish_bench.py <path-to-results.json> <site-repo-root>

The bench page renders whatever bench.json carries — regenerating the site
tables is: re-run the harness in riir-reflex, then run this script, commit,
deploy. A hand-typed number on the site is a defect by definition.
"""

import json
import sys
from pathlib import Path

# meta keys that are machine-local or noise for the public page.
DROP_META_KEYS = ("datasets_dir",)

# Display-only lane spellings. The canonical results.json keeps the machine
# fields ("laya-riir" / "laya-python" / "modelless") — the rename happens
# HERE, the one place every published byte passes through, so a re-publish
# can never drift from the page.
LANE_DISPLAY = {
    "laya-riir": "laya (rust)",
    "laya-python": "laya (python)",
    "modelless": "modelless",
}


def rename_lanes(d):
    for s in d.get("suites", []):
        lanes = ([s["modelless"]] if s.get("modelless") else []) + list(
            (s.get("laya") or {}).values()
        )
        for l in lanes:
            if l.get("lane") == "modelless":
                l["model"] = "none"
            l["lane"] = LANE_DISPLAY.get(l.get("lane"), l.get("lane"))


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, site = Path(sys.argv[1]), Path(sys.argv[2])
    if not src.is_file():
        print(f"error: {src} not found — run the harness first", file=sys.stderr)
        return 1
    d = json.loads(src.read_text(encoding="utf-8"))
    meta = d.get("meta", {})
    for k in DROP_META_KEYS:
        meta.pop(k, None)
    rename_lanes(d)
    # The sanitized file is the ONLY thing the site serves.
    out = site / "data" / "bench.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(d, indent=1) + "\n", encoding="utf-8")
    n_suites = len(d.get("suites", []))
    print(f"published {out} ({n_suites} suites; dropped meta: {', '.join(DROP_META_KEYS)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
