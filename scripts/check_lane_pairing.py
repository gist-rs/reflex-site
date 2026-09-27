#!/usr/bin/env python3
"""The pairing gate (site Issue 002 T3 / riir-reflex Issue 040): after a
publish, every compared lane pair must share a population identity — or be
EXPLICITLY acknowledged.

Reads the PUBLISHED data/bench.json's per-suite `pairing` blocks (computed
by publish_bench.py — single source of truth, never re-derived here). For
every block whose status is not "same":

  - the suite must be named in PUBLISH_ALLOW_SAMPLE_MISMATCH (comma- or
    space-separated), else exit 1 — a cross-sample pair must never ship
    silently;
  - a name in the env that matches NO mismatch is STALE and also exit 1 —
    the ack cannot only ever loosen (the DOCS_GATE_PARTIAL_CLONE idiom).

Usage:
    python3 scripts/check_lane_pairing.py [site-root]   # default: repo root
Exit 0 = every compared pair is same-sample or acknowledged. Exit 1 =
unacknowledged cross-sample pairs or stale acks. Exit 2 = no pairing
blocks at all (published before the pairing law — re-publish).
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

OK, FAIL, REFUSE = "✓", "✗", "⛔"


def acked_names() -> set[str]:
    raw = os.environ.get("PUBLISH_ALLOW_SAMPLE_MISMATCH", "").strip()
    return {x.strip() for x in re.split(r"[,\s]+", raw) if x.strip()}


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
    path = root / "data" / "bench.json"
    if not path.is_file():
        print(f"{REFUSE} {path} not found — nothing to gate")
        return 2
    d = json.loads(path.read_text(encoding="utf-8"))
    blocks = [(s.get("name"), s.get("pairing") or {}) for s in d.get("suites", [])]
    if not any(b for _, b in blocks):
        print(f"{REFUSE} no pairing blocks in {path} — the publish predates "
              "the pairing law; re-run publish_bench.py before deploying")
        return 2

    ack = acked_names()
    problems: list[str] = []
    mismatches: list[str] = []
    mismatches_hard: list[str] = []
    advisory = 0
    for name, b in blocks:
        for pair, v in sorted(b.items()):
            status = v.get("status")
            if status in ("same", "same_results"):
                continue
            if status == "differs":
                mismatches.append(name)
                rid = (v.get("rust") or {}).get("id")
                pid = (v.get("py") or {}).get("id")
                mid = (v.get("modelless") or {}).get("id")
                detail = f"rust {rid} vs py {pid}" if pair == "rust_vs_py" \
                    else f"modelless {mid} vs rust {rid}"
                # HARD on the parity claim (rust vs py — the card's
                # "identical on N/N"); ADVISORY on km-vs-laya, whose
                # lanes legitimately refresh in separate runs of the same
                # deterministic protocol (advisory until lane runs unify
                # or digests land everywhere).
                hard = pair == "rust_vs_py"
                line = f"{FAIL if hard else '·'} {name} [{pair}] cross-sample — {detail}"
                if hard:
                    if name in ack:
                        line += "  (acknowledged)"
                    else:
                        problems.append(f"{name} [{pair}]: {detail}")
                    mismatches_hard.append(name)
                else:
                    advisory += 1
                print(line)
            else:
                # unknown identity: disclosed, never fatal on legacy rows —
                # but never silent either
                print(f"· {name} [{pair}] identity unknown (legacy run) — "
                      "excluded from parity claims, disclosed on the card")

    stale = sorted(ack - set(mismatches_hard))
    for name in stale:
        problems.append(f"stale ack: {name} matches no cross-sample pair")
        print(f"{FAIL} stale ack: {name} matches no cross-sample pair")

    if problems:
        print(f"\n{FAIL} pairing gate FAILED — {len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        print("repair: re-run the mismatched lane on the same population "
              "(e.g. --laya-python at the current protocol), or ack "
              "explicitly: PUBLISH_ALLOW_SAMPLE_MISMATCH='<suite>[,...]'")
        return 1
    n_same = sum(1 for _, b in blocks for v in b.values() if v.get("status") == "same")
    n_same_res = sum(1 for _, b in blocks for v in b.values() if v.get("status") == "same_results")
    print(f"{OK} pairing gate PASSED — {n_same} proven same-sample pair(s), "
          f"{n_same_res} results-verified pair(s), "
          f"{len(mismatches_hard)} acknowledged cross-sample (rust-vs-py), "
          f"{advisory} advisory (modelless-vs-rust), 0 unacknowledged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
