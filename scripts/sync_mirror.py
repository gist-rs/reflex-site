#!/usr/bin/env python3
"""Mirror the engines' docs-first surfaces into this site repo.

Each owning repo's `.docs` book is the SOURCE OF TRUTH; the copies this site
serves are MIRRORS. MIRROR_SOURCES is the per-root table — layer 0, nothing
unlisted is ever copied — one row per source checkout; the flat pair view
(ALL_PAIRS) is derived from it. 12 pairs across three roots:

    riir-reflex   (public, PRIMARY)  5 pairs: decision_flow.svg, SKILL.md,
                                     resources.md, dev_flow.md, dev_flow.svg
    riir-instinct (secondary)        4 pairs: instinct_flow.svg + the same
                                     resources trio
    riir-rethink  (PRIVATE forever — education pairs ONLY)
                                     4 pairs: rethink_flow.svg + the same
                                     resources trio

The landing page renders decision_flow.svg from assets/, the agent-skill
section curl-installs the SKILL.md from skills/, /bench/#instinct embeds
instinct_flow.svg, and the /resources education page serves the mirrored
resources trio from docs/<lane>/ — a stale mirror ships stale docs.

The mirror fence (riir-rethink only — that repo is PRIVATE FOREVER and only
its two education folders are public-by-mirror; riir-rethink/BOUNDARY.md
records the carve-out):

    layer 1  pair shape — every Rethink source path must sit under `.docs/`
             and end `.md` or `.svg`; asserted on every run + a self-test
             arm. Nothing else in the private repo is ever mirrorable by
             construction.
    layer 2  content scan — run at sync AND --check time over every Rethink
             source; a violation is RED, never a warning: sync REFUSES that
             pair (the committed mirror is left intact) and the run exits 1.
               md:  code fences whose info string is not `mermaid`; `src/`
                    path references; manifest filenames (arsenal.toml /
                    deploy.yaml / Cargo.toml); 64-hex digest-shaped strings;
                    digit-heavy measured claims (decimals and unit forms).
                    The WHOLE text is scanned, mermaid fences included —
                    which covers rendered label text (Proposal 053 verdict
                    round 2: a measured figure can ride in through a node
                    label).
               svg: tags stripped, the visible TEXT scanned with the same
                    digit/64-hex/src/manifest checks (no fence check).
    layer 3  SOURCE-SIDE, not here: the first-line PUBLIC BY MIRROR banner
             in every mirrored Rethink md + the riir-rethink/BOUNDARY.md
             row. This scan does NOT check the banner — a source missing it
             is invisible to this script; the source repo owns that guard.

instinct_flow.svg / rethink_flow.svg and the three dev_flow.svg figures are
PRODUCED by scripts/render_tetris_flows.py (which writes both mirrors
byte-identically); this script is the drift DETECTOR between renders and
owns the recorded-source-sha manifest:

    assets/mirror_manifest.json — per mirrored file: repo, src, dst, sha256
    (the reflex-site BOUNDARY law: cross-repo coupling by mirrored bytes with
    a recorded source sha). Git refs are OMITTED on every row — ONE fixed
    shape (Proposal 053 rounds 2-3): riir-rethink is private forever, and a
    ref on any row would publish commit hashes into a public repo, so no row
    ever carries one. run_check fails any row carrying a key outside
    {repo, src, dst, sha256} so the ref cannot return through a later edit.
    After a re-render, run this script (default mode) to refresh it.

Modes:
    (default)   sync: copy each source to its mirror, rewrite the manifest,
                print a byte report. A fence violation REFUSES its pair.
    --check     verify only: exit 1 with named findings on drift, a missing
                source, a missing mirror, a fence violation, or a manifest
                that disagrees with the mirrored bytes (or carries a
                forbidden key). Never a silent green.
    --self-test temp-fixture arms, both directions (drift / missing source /
                missing mirror / manifest-stale / manifest-unlisted /
                secondary-skip / primary-absent / rethink-skip / no-shrink /
                pair-shape / fence / svg-text-scan / manifest-extra-key).

Exit codes: 0 = in sync (or synced), 1 = findings, 2 = the PRIMARY checkout
(riir-reflex) itself is absent (nothing to check — riir-reflex's
ci_feature_guard layer treats 2 as its loud SKIP). A SECONDARY checkout
(riir-instinct, riir-rethink) absent is a LOUD per-root SKIP, never a silent
green and never a red: the mirrors are committed files; deploys never need
the private checkouts — only editing mirrored content does.

Checkouts: $RIIR_REFLEX_CHECKOUT else ../riir-reflex; $INSTINCT_CHECKOUT else
../riir-instinct; $RETHINK_CHECKOUT else ../riir-rethink, all beside this repo.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path, PurePosixPath

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

SITE_ROOT = Path(__file__).resolve().parent.parent

# Per-source-root table (layer 0): (repo dir beside this site, visibility
# note, [(src path in that repo, dst path in this site), ...]). The flat pair
# view ALL_PAIRS is derived below — iterate that, never re-derive by hand.
MIRROR_SOURCES = (
    (
        "riir-reflex",
        "public — PRIMARY (absent checkout = exit 2, the guard's loud-SKIP lane)",
        (
            (".docs/03_decision_flow/decision_flow.svg", "assets/decision_flow.svg"),
            (".docs/04_agent_skill/SKILL.md", "skills/reflex-integration/SKILL.md"),
            (".docs/05_resources/resources.md", "docs/reflex/resources.md"),
            (".docs/05_resources/dev_flow.md", "docs/reflex/dev_flow.md"),
            (".docs/05_resources/dev_flow.svg", "assets/reflex_dev_flow.svg"),
        ),
    ),
    (
        "riir-instinct",
        "secondary — absent checkout = loud skip (produced figure: render_tetris_flows.py)",
        (
            (".docs/03_decision_flow/instinct_flow.svg", "assets/instinct_flow.svg"),
            (".docs/05_resources/resources.md", "docs/instinct/resources.md"),
            (".docs/05_resources/dev_flow.md", "docs/instinct/dev_flow.md"),
            (".docs/05_resources/dev_flow.svg", "assets/instinct_dev_flow.svg"),
        ),
    ),
    (
        "riir-rethink",
        "PRIVATE forever — education pairs ONLY (the mirror fence, layers 1-2 above)",
        (
            (".docs/03_decision_flow/rethink_flow.svg", "assets/rethink_flow.svg"),
            (".docs/05_resources/resources.md", "docs/rethink/resources.md"),
            (".docs/05_resources/dev_flow.md", "docs/rethink/dev_flow.md"),
            (".docs/05_resources/dev_flow.svg", "assets/rethink_dev_flow.svg"),
        ),
    ),
)

ALL_PAIRS = tuple(
    (repo, rel_src, rel_dst)
    for repo, _note, pairs in MIRROR_SOURCES
    for rel_src, rel_dst in pairs
)

PRIMARY_ROOT = "riir-reflex"  # absent -> exit 2 (the riir-reflex guard's loud SKIP lane)
RETHINK_ROOT = "riir-rethink"  # the fence root — the ONLY private mirrored repo
ROOT_ENV_VARS = {
    "riir-reflex": "RIIR_REFLEX_CHECKOUT",
    "riir-instinct": "INSTINCT_CHECKOUT",
    "riir-rethink": "RETHINK_CHECKOUT",
}
MANIFEST_REL = "assets/mirror_manifest.json"
MANIFEST_KEYS = {"repo", "src", "dst", "sha256"}  # a ref key is a leak; run_check fails it
MANIFEST_NOTE = (
    "Source sha per mirrored file - cross-repo coupling by mirrored bytes with a"
    " recorded source sha (reflex-site BOUNDARY.md). Git refs are omitted on every"
    " row - ONE fixed shape: riir-rethink is private forever and a ref on any row"
    " would publish commit hashes into a public repo (Proposal 053 rounds 2-3)."
    " Owned by scripts/sync_mirror.py - not hand-edited."
)

# --- the mirror fence (layer 1 + layer 2), Rethink root only -----------------

FENCE_FORBIDDEN_NAMES = ("arsenal.toml", "deploy.yaml", "Cargo.toml")
_HEX64_RE = re.compile(r"\b[0-9a-fA-F]{64}\b")
_DECIMAL_RE = re.compile(r"\d+\.\d+")
_UNIT_RE = re.compile(r"\d+\s?(?:ms|µs|us|s|tok/s|%)")
_SRC_PATH_RE = re.compile(r"\bsrc/")


def pair_shape_violations(sources) -> list:
    """Layer 1: Rethink sources must sit under .docs/ and end .md or .svg."""
    out = []
    for repo, _note, pairs in sources:
        if repo != RETHINK_ROOT:
            continue
        for rel_src, _rel_dst in pairs:
            p = PurePosixPath(rel_src)
            if p.parts[:1] != (".docs",) or p.suffix not in (".md", ".svg"):
                out.append((repo, rel_src, "must sit under .docs/ and end .md or .svg"))
    return out


def _svg_visible_text(svg: str) -> str:
    # <style>/<script> CONTENT survives tag-stripping, and rendered mermaid
    # CSS is full of styling numbers (stroke-width:3.5px, opacity:0.5) — not
    # visible text, not measured claims. Drop the blocks, then strip tags.
    text = re.sub(r"<(style|script)\b[^>]*>.*?</\1>", " ", svg, flags=re.S)
    text = re.sub(r"<[^>]*>", " ", text)
    for ent, ch in (
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", '"'),
        ("&#39;", "'"),
        ("&amp;", "&"),  # last: &amp;lt; must not decode into a real tag
    ):
        text = text.replace(ent, ch)
    return text


def _md_fence_findings(md: str) -> list:
    """Code fences whose info string is not `mermaid` (bare fences included)."""
    reasons = []
    in_fence = False
    for i, line in enumerate(md.splitlines(), 1):
        s = line.lstrip()
        if not in_fence:
            if s.startswith("```"):
                info = s[3:].strip()
                first = info.split()[0] if info else ""
                if first != "mermaid":
                    reasons.append(f"non-mermaid code fence at line {i} ({info or 'bare fence'})")
                in_fence = True
        elif s.startswith("```"):
            in_fence = False
    return reasons


def _digit_findings(text: str) -> list:
    reasons = []
    for m in _DECIMAL_RE.finditer(text):
        reasons.append(f"measured decimal claim ({m.group(0)})")
    for m in _UNIT_RE.finditer(text):
        reasons.append(f"measured unit claim ({m.group(0)})")
    return reasons


def fence_findings(text: str, is_svg: bool) -> list:
    """Layer 2 reasons for one source's text (svg: visible text only)."""
    reasons = []
    if is_svg:
        text = _svg_visible_text(text)
    else:
        reasons += _md_fence_findings(text)
    if _SRC_PATH_RE.search(text):
        reasons.append("src/ path reference")
    for name in FENCE_FORBIDDEN_NAMES:
        if name in text:
            reasons.append(f"manifest filename reference ({name})")
    if _HEX64_RE.search(text):
        reasons.append("64-hex digest-shaped string")
    reasons += _digit_findings(text)
    return reasons


def fence_findings_for(path: Path) -> list:
    is_svg = path.suffix == ".svg"
    return fence_findings(path.read_text(encoding="utf-8", errors="replace"), is_svg)


def _fence_reasons_line(reasons: list) -> str:
    return "; ".join(reasons[:3]) + ("; …" if len(reasons) > 3 else "")


# --- plumbing -----------------------------------------------------------------


def root_for(repo: str) -> Path:
    env = os.environ.get(ROOT_ENV_VARS[repo])
    if env:
        return Path(env).expanduser().resolve()
    return (SITE_ROOT.parent / repo).resolve()


def resolve_roots() -> dict:
    return {repo: root_for(repo) for repo, _, _ in MIRROR_SOURCES}


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


def run_check(site: Path, roots: dict, sources=MIRROR_SOURCES):
    findings, skipped, unverifiable = [], [], set()
    pairs = [
        (repo, rel_src, rel_dst)
        for repo, _note, prs in sources
        for rel_src, rel_dst in prs
    ]
    bad_shape = {(repo, rel_src) for repo, rel_src, _ in pair_shape_violations(sources)}
    for repo, rel_src, _ in pair_shape_violations(sources):
        findings.append(f"PAIR-SHAPE: {repo}/{rel_src} (must sit under .docs/ and end .md or .svg)")
    for repo, rel_src, rel_dst in pairs:
        if (repo, rel_src) in bad_shape:
            continue  # the shape finding supersedes; nothing to classify
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
        src_path = root / rel_src
        if repo == RETHINK_ROOT and src_path.exists():
            viol = fence_findings_for(src_path)
            if viol:
                # The fence finding supersedes drift classification: the
                # committed mirror is INTACT and must not read as drift.
                findings.append(
                    f"FENCE-VIOLATION: {repo}/{rel_src} ({len(viol)}: {_fence_reasons_line(viol)})"
                )
                continue
        verdict = classify(src_path, site / rel_dst)
        if verdict != "OK":
            findings.append(f"{verdict}: {rel_src} -> {rel_dst}")
    findings += manifest_findings(site, unverifiable, pairs)
    return findings, skipped


def manifest_findings(site: Path, unverifiable: set, pairs=ALL_PAIRS) -> list:
    path = manifest_path(site)
    if not path.exists():
        return [f"MANIFEST-MISSING: {MANIFEST_REL} (run: python3 scripts/sync_mirror.py)"]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"MANIFEST-UNREADABLE: {MANIFEST_REL} ({exc})"]
    rows = {row.get("dst"): row for row in data.get("files", [])}
    findings, listed = [], set()
    for repo, rel_src, rel_dst in pairs:
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
    for row in data.get("files", []):
        extra = set(row) - MANIFEST_KEYS
        if extra:
            findings.append(
                f"MANIFEST-ROW-EXTRA-KEY: {row.get('dst')} ({', '.join(sorted(extra))}"
                " - git refs are forbidden on every row)"
            )
    return findings


def write_manifest(site: Path, roots: dict, pairs=ALL_PAIRS) -> list:
    path = manifest_path(site)
    try:
        existing = {
            row.get("dst"): row
            for row in json.loads(path.read_text(encoding="utf-8")).get("files", [])
        }
    except (OSError, ValueError):
        existing = {}
    rows, lines = [], []
    for repo, rel_src, rel_dst in pairs:
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


def run_sync(site: Path, roots: dict, sources=MIRROR_SOURCES) -> list:
    lines = []
    pairs = [
        (repo, rel_src, rel_dst)
        for repo, _note, prs in sources
        for rel_src, rel_dst in prs
    ]
    bad_shape = {(repo, rel_src) for repo, rel_src, _ in pair_shape_violations(sources)}
    for repo, rel_src, _ in pair_shape_violations(sources):
        lines.append(f"REFUSED (pair-shape): {repo}/{rel_src} - not mirrorable by construction")
    for repo, rel_src, rel_dst in pairs:
        if (repo, rel_src) in bad_shape:
            continue
        root = roots[repo]
        if not checkout_present(root):
            lines.append(f"SKIP (checkout absent): {repo} - {rel_dst} left as committed")
            continue
        src, dst = root / rel_src, site / rel_dst
        if not src.exists():
            lines.append(f"REFUSED (source missing): {repo}/{rel_src}")
            continue
        if repo == RETHINK_ROOT:
            viol = fence_findings_for(src)
            if viol:
                lines.append(
                    f"REFUSED (fence): {repo}/{rel_src} - {len(viol)} finding(s): "
                    f"{_fence_reasons_line(viol)} - mirror left as committed"
                )
                continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        changed = (not dst.exists()) or dst.read_bytes() != src.read_bytes()
        shutil.copyfile(src, dst)
        state = "synced (changed)" if changed else "already identical"
        lines.append(f"{state}: {rel_dst} ({dst.stat().st_size}B sha256:{_sha(dst)})")
    lines += write_manifest(site, roots, pairs)
    return lines


def selftest() -> int:
    def seed_root(roots: dict, repo: str):
        root = roots[repo]
        for rel_src, _ in dict((r, p) for r, _n, p in MIRROR_SOURCES)[repo]:
            src = root / rel_src
            src.parent.mkdir(parents=True, exist_ok=True)
            src.write_bytes(rel_src.encode())
        # the checkout probe is Cargo.toml — fixtures must look like checkouts
        (root / "Cargo.toml").write_bytes(b"[package]\n")

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        roots = {repo: td / repo for repo, _, _ in MIRROR_SOURCES}
        site = td / "site"
        for repo, _, _ in MIRROR_SOURCES:
            seed_root(roots, repo)
        # 1) sync populates the mirrors + manifest; check then reads green
        run_sync(site, roots)
        findings, skipped = run_check(site, roots)
        assert findings == [] and skipped == [], (findings, skipped)
        rows = json.loads(manifest_path(site).read_text(encoding="utf-8"))["files"]
        assert len(rows) == len(ALL_PAIRS), rows
        # 2) a source edit is DRIFT, not silence
        first_repo, first_src_rel, first_dst_rel = ALL_PAIRS[0]
        (roots[first_repo] / first_src_rel).write_bytes(b"changed")
        findings, _ = run_check(site, roots)
        assert len(findings) == 1 and findings[0].startswith("DRIFT: " + first_src_rel), findings
        run_sync(site, roots)
        # 3) a deleted source is a named finding, never a pass
        second_repo, second_src_rel, _ = ALL_PAIRS[1]
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
        assert len(rows) == len(ALL_PAIRS), rows
        # 8) an absent RETHINK checkout is a loud skip too — never a silent
        #    green, never a red; the committed rows are preserved
        shutil.rmtree(roots[RETHINK_ROOT])
        findings, skipped = run_check(site, roots)
        assert findings == [] and skipped == ["riir-instinct", RETHINK_ROOT], (findings, skipped)
        rows = json.loads(manifest_path(site).read_text(encoding="utf-8"))["files"]
        assert len(rows) == len(ALL_PAIRS), rows
        # 9) an absent PRIMARY checkout: the classifier still names its pairs
        #    (main() maps this to exit 2 via the Cargo.toml probe)
        shutil.rmtree(roots[PRIMARY_ROOT])
        findings, skipped = run_check(site, roots)
        primary_pairs = [p for p in ALL_PAIRS if p[0] == PRIMARY_ROOT]
        assert skipped == ["riir-instinct", RETHINK_ROOT], skipped
        assert (
            sum(1 for x in findings if x.startswith("MISSING-SOURCE: ")) == len(primary_pairs)
        ), findings
        # 10) sync with every checkout absent shrinks NOTHING — the manifest is
        #     committed; a partial box must never erase the other roots' rows
        run_sync(site, roots)
        rows = json.loads(manifest_path(site).read_text(encoding="utf-8"))["files"]
        assert len(rows) == len(ALL_PAIRS), rows
        # bring the fence roots back for the fence arms
        seed_root(roots, PRIMARY_ROOT)
        seed_root(roots, "riir-instinct")
        seed_root(roots, RETHINK_ROOT)
        run_sync(site, roots)
        # 11) a pair-shape violation in the table is RED (layer 1)
        bad_sources = []
        for repo, note, prs in MIRROR_SOURCES:
            if repo == RETHINK_ROOT:
                prs = prs + (("src/main.rs", "docs/rethink/main.rs"),)
            bad_sources.append((repo, note, prs))
        bad_sources = tuple(bad_sources)
        findings, _ = run_check(site, roots, sources=bad_sources)
        assert any(x.startswith("PAIR-SHAPE: " + RETHINK_ROOT + "/src/main.rs") for x in findings), findings
        lines = run_sync(site, roots, sources=bad_sources)
        assert any(x.startswith("REFUSED (pair-shape): " + RETHINK_ROOT + "/src/main.rs") for x in lines), lines
        findings, _ = run_check(site, roots)  # the real table is clean
        assert findings == [], findings
        # 12) the content fence (layer 2): a Rust fence / a 64-hex / a "12 ms"
        #     planted in an ALLOWED Rethink md each RED — sync refuses the pair
        #     and the committed mirror is left intact — restore green each time
        rethink_md = next(
            rel for r, rel, _ in ALL_PAIRS if r == RETHINK_ROOT and rel.endswith("resources.md")
        )
        rethink_dst = next(d for r, s, d in ALL_PAIRS if r == RETHINK_ROOT and s == rethink_md)
        committed = (site / rethink_dst).read_bytes()
        for label, planted in (
            ("rust-fence", "\n\n```rust\nlet x = 1;\n```\n"),
            ("64-hex", "\n\ndigest " + "a" * 64 + ".\n"),
            ("unit-claim", "\n\nIt answered in 12 ms.\n"),
        ):
            (roots[RETHINK_ROOT] / rethink_md).write_bytes(
                rethink_md.encode() + planted.encode()
            )
            findings, _ = run_check(site, roots)
            assert findings and findings[0].startswith(
                f"FENCE-VIOLATION: {RETHINK_ROOT}/{rethink_md}"
            ), (label, findings)
            lines = run_sync(site, roots)
            refused = [x for x in lines if x.startswith(f"REFUSED (fence): {RETHINK_ROOT}/{rethink_md}")]
            assert refused, (label, lines)
            assert (site / rethink_dst).read_bytes() == committed, (label, "mirror mutated!")
            (roots[RETHINK_ROOT] / rethink_md).write_bytes(rethink_md.encode())  # restore
        run_sync(site, roots)
        findings, _ = run_check(site, roots)
        assert findings == [], findings
        # 13) the svg text scan: tag attributes are invisible, visible TEXT is
        #     not — the same digit check catches a label-borne figure
        rethink_svg = next(
            rel for r, rel, _ in ALL_PAIRS if r == RETHINK_ROOT and rel.endswith("rethink_flow.svg")
        )
        (roots[RETHINK_ROOT] / rethink_svg).write_bytes(
            rethink_svg.encode() + '\n<rect x="12" y="34" width="56"/>\n'.encode()
        )
        run_sync(site, roots)  # the rect is clean: attribute digits strip with the tag
        findings, _ = run_check(site, roots)
        assert findings == [], findings
        (roots[RETHINK_ROOT] / rethink_svg).write_bytes(
            rethink_svg.encode() + "\n<text>12 ms</text>\n".encode()
        )
        findings, _ = run_check(site, roots)
        assert findings and findings[0].startswith(
            f"FENCE-VIOLATION: {RETHINK_ROOT}/{rethink_svg}"
        ), findings
        (roots[RETHINK_ROOT] / rethink_svg).write_bytes(rethink_svg.encode())  # restore
        run_sync(site, roots)
        # 14) a manifest row carrying a key outside {repo, src, dst, sha256}
        #     is a finding — a git ref leaking in cannot pass silently
        data = json.loads(manifest_path(site).read_text(encoding="utf-8"))
        data["files"][0]["ref"] = "deadbeef" * 8
        manifest_path(site).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        findings, _ = run_check(site, roots)
        assert any(x.startswith("MANIFEST-ROW-EXTRA-KEY: ") for x in findings), findings
        run_sync(site, roots)
        findings, _ = run_check(site, roots)
        assert findings == [], findings
    print(
        "self-test PASS (sync/check/drift/missing-source/missing-mirror/"
        "manifest-stale/manifest-unlisted/secondary-skip/rethink-skip/"
        "primary-absent/no-shrink/pair-shape/fence-rust-fence/fence-64-hex/"
        "fence-unit-claim/svg-text-scan/manifest-extra-key)"
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
        checked = sum(1 for repo, _, _ in ALL_PAIRS if repo not in skipped)
        print(f"mirrors in sync ({checked}/{len(ALL_PAIRS)} pairs + manifest)")
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
    checked = sum(1 for repo, _, _ in ALL_PAIRS if repo not in skipped)
    print(f"mirrors in sync ({checked}/{len(ALL_PAIRS)} pairs + manifest)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
