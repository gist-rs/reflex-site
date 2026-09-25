#!/usr/bin/env python3
"""Mirror riir-reflex's docs-first surfaces into this site repo.

The `.docs` book in the riir-reflex checkout is the SOURCE OF TRUTH; the
copies this site serves are MIRRORS:

    .docs/03_decision_flow/decision_flow.svg -> assets/decision_flow.svg
    .docs/04_agent_skill/SKILL.md            -> skills/reflex-integration/SKILL.md

The landing page renders the SVG from assets/ and the agent-skill section
curl-installs the SKILL.md from skills/, so a stale mirror ships stale docs.

Modes:
    (default)   sync: copy each source to its mirror, print a byte report.
    --check     verify only: exit 1 with named findings on drift, a missing
                source, or a missing mirror. Never a silent green.
    --self-test temp-fixture arms, both directions (drift / missing source /
                missing mirror / absent checkout).

Exit codes: 0 = in sync (or synced), 1 = findings, 2 = the riir-reflex
checkout itself is absent (nothing to check — riir-reflex's
ci_feature_guard layer treats 2 as its loud SKIP).

The checkout is resolved from $RIIR_REFLEX_CHECKOUT, else ../riir-reflex
beside this repo.
"""

import argparse
import hashlib
import os
import shutil
import sys
import tempfile
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

SITE_ROOT = Path(__file__).resolve().parent.parent

MIRROR_PAIRS = (
    (".docs/03_decision_flow/decision_flow.svg", "assets/decision_flow.svg"),
    (".docs/04_agent_skill/SKILL.md", "skills/reflex-integration/SKILL.md"),
)


def reflex_root() -> Path:
    env = os.environ.get("RIIR_REFLEX_CHECKOUT")
    if env:
        return Path(env).expanduser().resolve()
    return (SITE_ROOT.parent / "riir-reflex").resolve()


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:12]


def classify(src: Path, dst: Path) -> str:
    if not src.exists():
        return "MISSING-SOURCE"
    if not dst.exists():
        return "MISSING-MIRROR"
    return "OK" if src.read_bytes() == dst.read_bytes() else "DRIFT"


def run_check(root: Path, site: Path):
    findings = []
    for rel_src, rel_dst in MIRROR_PAIRS:
        verdict = classify(root / rel_src, site / rel_dst)
        if verdict != "OK":
            findings.append(f"{verdict}: {rel_src} -> {rel_dst}")
    return findings


def run_sync(root: Path, site: Path):
    lines = []
    for rel_src, rel_dst in MIRROR_PAIRS:
        src, dst = root / rel_src, site / rel_dst
        if not src.exists():
            lines.append(f"REFUSED (source missing): {rel_src}")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        changed = (not dst.exists()) or dst.read_bytes() != src.read_bytes()
        shutil.copyfile(src, dst)
        state = "synced (changed)" if changed else "already identical"
        lines.append(f"{state}: {rel_dst} ({dst.stat().st_size}B sha256:{_sha(dst)})")
    return lines


def selftest() -> int:
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        root, site = td / "riir-reflex", td / "site"
        for rel_src, _ in MIRROR_PAIRS:
            (root / rel_src).parent.mkdir(parents=True, exist_ok=True)
            (root / rel_src).write_bytes(rel_src.encode())
        # 1) sync populates the mirrors; check then reads green
        run_sync(root, site)
        assert run_check(root, site) == [], "fresh sync must read green"
        # 2) a source edit is DRIFT, not silence
        first_src = root / MIRROR_PAIRS[0][0]
        first_src.write_bytes(b"changed")
        f = run_check(root, site)
        assert len(f) == 1 and f[0].startswith("DRIFT: " + MIRROR_PAIRS[0][0]), f
        # 3) a deleted source is a named finding, never a pass
        (root / MIRROR_PAIRS[1][0]).unlink()
        f = run_check(root, site)
        assert any(x.startswith("MISSING-SOURCE: " + MIRROR_PAIRS[1][0]) for x in f), f
        # 4) a deleted mirror is a named finding (source still present —
        #    MISSING-SOURCE wins when both are gone, arm 3 covers that)
        (site / MIRROR_PAIRS[0][1]).unlink()
        f = run_check(root, site)
        assert any(x.startswith("MISSING-MIRROR: " + MIRROR_PAIRS[0][0]) for x in f), f
        # 5) an absent checkout reports every pair missing (main() maps this
        #    to exit 2 via the Cargo.toml probe; the classifier stays honest)
        f = run_check(td / "absent", site)
        assert len(f) == len(MIRROR_PAIRS), f
    print("self-test PASS (sync/check/drift/missing-source/missing-mirror/absent-checkout)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="mirror riir-reflex .docs surfaces into this site")
    ap.add_argument("--check", action="store_true", help="verify only, no writes")
    ap.add_argument("--self-test", action="store_true", help="temp-fixture arms, both directions")
    args = ap.parse_args()
    if args.self_test:
        return selftest()
    root = reflex_root()
    if not (root / "Cargo.toml").exists():
        print(f"SKIP (exit 2): riir-reflex checkout not found at {root}")
        print("set RIIR_REFLEX_CHECKOUT or clone the sibling beside this repo")
        return 2
    if args.check:
        findings = run_check(root, SITE_ROOT)
        if findings:
            print(f"DRIFTED ({len(findings)}):")
            for f in findings:
                print(f"  - {f}")
            print("fix: python3 scripts/sync_mirror.py  (after editing the .docs source)")
            return 1
        print(f"mirrors in sync ({len(MIRROR_PAIRS)}/{len(MIRROR_PAIRS)} pairs)")
        return 0
    for line in run_sync(root, SITE_ROOT):
        print(line)
    remaining = run_check(root, SITE_ROOT)
    if remaining:
        print(f"{len(remaining)} finding(s) remain after sync (missing sources above?)")
        for f in remaining:
            print(f"  - {f}")
        return 1
    print(f"mirrors in sync ({len(MIRROR_PAIRS)}/{len(MIRROR_PAIRS)} pairs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
