#!/usr/bin/env python3
"""Mirror the engines' docs-first surfaces into this site repo.

Each owning repo's `.docs` book is the SOURCE OF TRUTH; the copies this site
serves are MIRRORS. The pairs table is layer 0 — nothing unlisted is ever
copied — and each pair names its own source root:

    riir-reflex   .docs/03_decision_flow/decision_flow.svg -> assets/decision_flow.svg
    riir-reflex   .docs/04_agent_skill/SKILL.md            -> skills/reflex-integration/SKILL.md
    riir-instinct .docs/03_decision_flow/instinct_flow.svg -> assets/instinct_flow.svg

The landing page renders decision_flow.svg from assets/, the agent-skill
section curl-installs the SKILL.md from skills/, and /bench/#instinct embeds
instinct_flow.svg — a stale mirror ships stale docs.

instinct_flow.svg is PRODUCED by scripts/render_tetris_flows.py (which writes
both mirrors byte-identically); this script is the drift DETECTOR between
renders and owns the recorded-source-sha manifest:

    assets/mirror_manifest.json — per mirrored file: repo, src, dst, sha256
    (the reflex-site BOUNDARY law: cross-repo coupling by mirrored bytes with
    a recorded source sha). Git refs are deliberately OMITTED on every row —
    riir-instinct is private until the 052 Phase-C flip, and ONE fixed row
    shape means the privacy shape cannot regress through a later edit
    (Proposal 053 rounds 2-3). After a re-render, run this script (default
    mode) to refresh the manifest.

Modes:
    (default)   sync: copy each source to its mirror, rewrite the manifest,
                print a byte report.
    --check     verify only: exit 1 with named findings on drift, a missing
                source, a missing mirror, or a manifest that disagrees with
                the mirrored bytes. Never a silent green.
    --self-test temp-fixture arms, both directions (drift / missing source /
                missing mirror / manifest-stale / manifest-unlisted /
                secondary-skip / primary-absent / no-shrink).

Exit codes: 0 = in sync (or synced), 1 = findings, 2 = the PRIMARY checkout
(riir-reflex) itself is absent (nothing to check — riir-reflex's
ci_feature_guard layer treats 2 as its loud SKIP). A SECONDARY checkout
(riir-instinct) absent is a LOUD per-root SKIP, never a silent green and
never a red: the mirrors are committed files; deploys never need the private
checkouts — only editing mirrored content does.

Checkouts: $RIIR_REFLEX_CHECKOUT else ../riir-reflex; $INSTINCT_CHECKOUT
else ../riir-instinct, both beside this repo.
"""

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

SITE_ROOT = Path(__file__).resolve().parent.parent

# (source repo dir beside this site, src path in that repo, dst path in this site)
MIRROR_PAIRS = (
    ("riir-reflex", ".docs/03_decision_flow/decision_flow.svg", "assets/decision_flow.svg"),
    ("riir-reflex", ".docs/04_agent_skill/SKILL.md", "skills/reflex-integration/SKILL.md"),
    # The 2026-09-29 owner-pass Instinct figure — served on /bench/#instinct but
    # UNMANAGED until 2026-10-03: the drift miss Proposal 053 files. Second
    # source root, produced by render_tetris_flows.py; absent checkout = loud
    # skip, never a red (deploys never need it).
    ("riir-instinct", ".docs/03_decision_flow/instinct_flow.svg", "assets/instinct_flow.svg"),
)

PRIMARY_ROOT = "riir-reflex"  # absent -> exit 2 (the riir-reflex guard's loud SKIP lane)
ROOT_ENV_VARS = {
    "riir-reflex": "RIIR_REFLEX_CHECKOUT",
    "riir-instinct": "INSTINCT_CHECKOUT",
}
MANIFEST_REL = "assets/mirror_manifest.json"
MANIFEST_NOTE = (
    "Source sha per mirrored file - cross-repo coupling by mirrored bytes with a"
    " recorded source sha (reflex-site BOUNDARY.md). Git refs are omitted on every"
    " row: one fixed shape, and riir-instinct is private until the 052 Phase-C"
    " flip. Owned by scripts/sync_mirror.py - not hand-edited."
)


def root_for(repo: str) -> Path:
    env = os.environ.get(ROOT_ENV_VARS[repo])
    if env:
        return Path(env).expanduser().resolve()
    return (SITE_ROOT.parent / repo).resolve()


def resolve_roots() -> dict:
    return {repo: root_for(repo) for repo, _, _ in MIRROR_PAIRS}


def checkout_present(root: Path) -> bool:
    return (root / "Cargo.toml").exists()


def manifest_path(site: Path) -> Path:
    return site / MANIFEST_REL


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:12]


def classify(src: Path, dst: Path) -> str:
    if not src.exists():
        return "MISSING-SOURCE"
    if not dst.exists():
        return "MISSING-MIRROR"
    return "OK" if src.read_bytes() == dst.read_bytes() else "DRIFT"


def run_check(site: Path, roots: dict):
    findings, skipped, unverifiable = [], [], set()
    for repo, rel_src, rel_dst in MIRROR_PAIRS:
        root = roots[repo]
        if not checkout_present(root):
            unverifiable.add(repo)
            if repo == PRIMARY_ROOT:
                # The classifier stays honest for the primary root; main()
                # maps this to exit 2 via the same probe.
                findings.append(f"MISSING-SOURCE: {rel_src} (checkout absent: {repo})")
            elif repo not in skipped:
                skipped.append(repo)
            continue
        verdict = classify(root / rel_src, site / rel_dst)
        if verdict != "OK":
            findings.append(f"{verdict}: {rel_src} -> {rel_dst}")
    findings += manifest_findings(site, unverifiable)
    return findings, skipped


def manifest_findings(site: Path, unverifiable: set) -> list:
    path = manifest_path(site)
    if not path.exists():
        return [f"MANIFEST-MISSING: {MANIFEST_REL} (run: python3 scripts/sync_mirror.py)"]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"MANIFEST-UNREADABLE: {MANIFEST_REL} ({exc})"]
    rows = {row.get("dst"): row for row in data.get("files", [])}
    findings, listed = [], set()
    for repo, rel_src, rel_dst in MIRROR_PAIRS:
        listed.add(rel_dst)
        if repo in unverifiable:
            continue  # nothing to verify against; sync preserves the committed row
        row = rows.get(rel_dst)
        if row is None:
            findings.append(f"MANIFEST-ROW-MISSING: {rel_dst}")
            continue
        if row.get("repo") != repo or row.get("src") != rel_src:
            findings.append(f"MANIFEST-ROW-STALE: {rel_dst} (repo/src mismatch - run sync)")
            continue
        dst = site / rel_dst
        if dst.exists() and row.get("sha256") != hashlib.sha256(dst.read_bytes()).hexdigest():
            findings.append(f"MANIFEST-STALE: {rel_dst} (sha mismatch - run sync)")
    for stray in sorted(set(rows) - listed):
        findings.append(f"MANIFEST-UNLISTED: {stray} (not a mirror pair - run sync to drop)")
    return findings


def write_manifest(site: Path, roots: dict) -> list:
    path = manifest_path(site)
    try:
        existing = {
            row.get("dst"): row
            for row in json.loads(path.read_text(encoding="utf-8")).get("files", [])
        }
    except (OSError, ValueError):
        existing = {}
    rows, lines = [], []
    for repo, rel_src, rel_dst in MIRROR_PAIRS:
        if not checkout_present(roots[repo]):
            # Unverifiable this run: preserve the committed row so a partial
            # checkout never shrinks the manifest.
            if rel_dst in existing:
                rows.append(existing[rel_dst])
            continue
        dst = site / rel_dst
        if not dst.exists():
            continue  # REFUSED pair; run_check names it
        row = {
            "repo": repo,
            "src": rel_src,
            "dst": rel_dst,
            "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
        }
        rows.append(row)
        if existing.get(rel_dst, {}).get("sha256") != row["sha256"]:
            lines.append(f"manifest sha updated: {rel_dst}")
    payload = {
        "generated_by": "scripts/sync_mirror.py",
        "note": MANIFEST_NOTE,
        "files": rows,
    }
    text = json.dumps(payload, indent=2) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == text:
        lines.append("manifest already current")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        lines.append(f"wrote {MANIFEST_REL} ({len(rows)} rows)")
    return lines


def run_sync(site: Path, roots: dict) -> list:
    lines = []
    for repo, rel_src, rel_dst in MIRROR_PAIRS:
        root = roots[repo]
        if not checkout_present(root):
            lines.append(f"SKIP (checkout absent): {repo} - {rel_dst} left as committed")
            continue
        src, dst = root / rel_src, site / rel_dst
        if not src.exists():
            lines.append(f"REFUSED (source missing): {repo}/{rel_src}")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        changed = (not dst.exists()) or dst.read_bytes() != src.read_bytes()
        shutil.copyfile(src, dst)
        state = "synced (changed)" if changed else "already identical"
        lines.append(f"{state}: {rel_dst} ({dst.stat().st_size}B sha256:{_sha(dst)})")
    lines += write_manifest(site, roots)
    return lines


def selftest() -> int:
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        roots = {repo: td / repo for repo, _, _ in MIRROR_PAIRS}
        site = td / "site"
        for repo, rel_src, _ in MIRROR_PAIRS:
            src = roots[repo] / rel_src
            src.parent.mkdir(parents=True, exist_ok=True)
            src.write_bytes(rel_src.encode())
            # the checkout probe is Cargo.toml — fixtures must look like checkouts
            (roots[repo] / "Cargo.toml").write_bytes(b"[package]\n")
        # 1) sync populates the mirrors + manifest; check then reads green
        run_sync(site, roots)
        findings, skipped = run_check(site, roots)
        assert findings == [] and skipped == [], (findings, skipped)
        rows = json.loads(manifest_path(site).read_text(encoding="utf-8"))["files"]
        assert len(rows) == len(MIRROR_PAIRS), rows
        # 2) a source edit is DRIFT, not silence
        first_repo, first_src_rel, first_dst_rel = MIRROR_PAIRS[0]
        (roots[first_repo] / first_src_rel).write_bytes(b"changed")
        findings, _ = run_check(site, roots)
        assert len(findings) == 1 and findings[0].startswith("DRIFT: " + first_src_rel), findings
        run_sync(site, roots)
        # 3) a deleted source is a named finding, never a pass
        second_repo, second_src_rel, _ = MIRROR_PAIRS[1]
        (roots[second_repo] / second_src_rel).unlink()
        findings, _ = run_check(site, roots)
        assert any(x.startswith("MISSING-SOURCE: " + second_src_rel) for x in findings), findings
        (roots[second_repo] / second_src_rel).write_bytes(second_src_rel.encode())  # restore
        run_sync(site, roots)
        # 4) a deleted mirror is a named finding (source still present —
        #    MISSING-SOURCE wins when both are gone; arm 3 covers that)
        (site / first_dst_rel).unlink()
        findings, _ = run_check(site, roots)
        assert any(
            x.startswith("MISSING-MIRROR: ") and first_dst_rel in x for x in findings
        ), findings
        run_sync(site, roots)
        # 5) a tampered manifest sha is a named finding, never silence
        data = json.loads(manifest_path(site).read_text(encoding="utf-8"))
        data["files"][0]["sha256"] = "0" * 64
        manifest_path(site).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        findings, _ = run_check(site, roots)
        assert any(x.startswith("MANIFEST-STALE: " + first_dst_rel) for x in findings), findings
        run_sync(site, roots)
        # 6) an unlisted manifest row is a finding (the pairs table is layer 0)
        data = json.loads(manifest_path(site).read_text(encoding="utf-8"))
        data["files"].append(
            {"repo": "elsewhere", "src": "x", "dst": "assets/stray.svg", "sha256": "1" * 64}
        )
        manifest_path(site).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        findings, _ = run_check(site, roots)
        assert any(x.startswith("MANIFEST-UNLISTED: assets/stray.svg") for x in findings), findings
        run_sync(site, roots)
        findings, _ = run_check(site, roots)
        assert findings == [], findings
        # 7) an absent SECONDARY checkout is a loud skip — never a silent green,
        #    never a red; the committed manifest row is preserved
        shutil.rmtree(roots["riir-instinct"])
        findings, skipped = run_check(site, roots)
        assert findings == [] and skipped == ["riir-instinct"], (findings, skipped)
        rows = json.loads(manifest_path(site).read_text(encoding="utf-8"))["files"]
        assert len(rows) == len(MIRROR_PAIRS), rows
        # 8) an absent PRIMARY checkout: the classifier still names its pairs
        #    (main() maps this to exit 2 via the Cargo.toml probe)
        shutil.rmtree(roots[PRIMARY_ROOT])
        findings, skipped = run_check(site, roots)
        primary_pairs = [p for p in MIRROR_PAIRS if p[0] == PRIMARY_ROOT]
        assert skipped == ["riir-instinct"], skipped
        assert (
            sum(1 for x in findings if x.startswith("MISSING-SOURCE: ")) == len(primary_pairs)
        ), findings
        # 9) sync with every checkout absent shrinks NOTHING — the manifest is
        #    committed; a partial box must never erase the other roots' rows
        run_sync(site, roots)
        rows = json.loads(manifest_path(site).read_text(encoding="utf-8"))["files"]
        assert len(rows) == len(MIRROR_PAIRS), rows
    print(
        "self-test PASS (sync/check/drift/missing-source/missing-mirror/"
        "manifest-stale/manifest-unlisted/secondary-skip/primary-absent/no-shrink)"
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="mirror engine .docs surfaces into this site")
    ap.add_argument("--check", action="store_true", help="verify only, no writes")
    ap.add_argument("--self-test", action="store_true", help="temp-fixture arms, both directions")
    args = ap.parse_args()
    if args.self_test:
        return selftest()
    roots = resolve_roots()
    if not checkout_present(roots[PRIMARY_ROOT]):
        print(f"SKIP (exit 2): {PRIMARY_ROOT} checkout not found at {roots[PRIMARY_ROOT]}")
        print(f"set {ROOT_ENV_VARS[PRIMARY_ROOT]} or clone the sibling beside this repo")
        return 2

    def print_skips(skipped):
        for repo in skipped:
            print(f"SKIP (loud): {repo} checkout absent - its mirror pair(s) UNCHECKED this run")

    if args.check:
        findings, skipped = run_check(SITE_ROOT, roots)
        print_skips(skipped)
        if findings:
            print(f"DRIFTED ({len(findings)}):")
            for f in findings:
                print(f"  - {f}")
            print("fix: python3 scripts/sync_mirror.py  (after editing the .docs source)")
            return 1
        checked = sum(1 for repo, _, _ in MIRROR_PAIRS if repo not in skipped)
        print(f"mirrors in sync ({checked}/{len(MIRROR_PAIRS)} pairs + manifest)")
        return 0
    for line in run_sync(SITE_ROOT, roots):
        print(line)
    findings, skipped = run_check(SITE_ROOT, roots)
    print_skips(skipped)
    if findings:
        print(f"{len(findings)} finding(s) remain after sync (missing sources above?)")
        for f in findings:
            print(f"  - {f}")
        return 1
    checked = sum(1 for repo, _, _ in MIRROR_PAIRS if repo not in skipped)
    print(f"mirrors in sync ({checked}/{len(MIRROR_PAIRS)} pairs + manifest)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
