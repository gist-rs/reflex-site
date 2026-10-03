#!/usr/bin/env python3
"""Render the flow figures from their doc sources (two-mirror law).

SOURCES OF TRUTH — one doc per owning repo, each ```mermaid block carrying
two header comments:

    %% file: <name>.svg      the output name in the DOC directory
    %% aria: <one sentence>  the SVG's aria-label

  1. katgpt-rs `.docs/06_game_arenas/tetris_lane_flows.md` — the Tetris lane
     figures (the lanes are katgpt-rs's arena book; riir-reflex stays
     game-free).
  2. riir-instinct `.docs/03_decision_flow/instinct_flow.md` — the Instinct
     composition figure embedded on reflex-site /bench/#instinct (the site
     is Reflex's; the trained add-on's diagram lives with its repo).
  3. riir-reflex `.docs/05_resources/dev_flow.md` — the Reflex development
     loop figure for the /resources education page (ai Proposal 053).
  4. riir-instinct `.docs/05_resources/dev_flow.md` — the Instinct dev
     build flow figure for the same page.
  5. riir-rethink `.docs/03_decision_flow/rethink_flow.md` — the Rethink
     composition figure (one rung deeper), and `.docs/05_resources/
     dev_flow.md` — the Rethink dev flow; both ride the PUBLIC-BY-MIRROR
     fence (sync_mirror.py layer 2 scans the mirrored bytes; the md sources
     carry the source-side banner, layer 3).

Each source carries a RENAME MAP {doc_filename: site_filename} (default {} =
identity): several repos emit a doc-side `dev_flow.svg`, so the SITE copy is
renamed per lane (`reflex_dev_flow.svg`, `instinct_dev_flow.svg`,
`rethink_dev_flow.svg`) and the SVG's internal id is derived from the SITE
name — three figures sharing one doc-side filename must not share one id on
the page.

This renders every block through mermaid.ink (the same service + palette the
riir-reflex hero `decision_flow.svg` uses: theme `base`, `#241410` node fill,
`#ff8a4c` ember borders, `#f2e6dd` text, `#b99f8f` lines, `#1d110c` clusters,
transparent background, monospace), post-processes per the Issue-131
conventions (no `@import`, every selector scoped to the SVG's own id,
`role="img"` + the aria sentence), and writes the SAME bytes to both mirrors:

    <owning repo>/<doc dir>/<doc filename>     beside the doc
    <reflex-site>/assets/<site filename>       what the page embeds

After a re-render, run `scripts/sync_mirror.py` (default mode) in this repo —
it owns `assets/mirror_manifest.json` (the recorded-source-sha manifest), is
the drift detector between renders, and runs the Rethink mirror fence over
the mirrored bytes.

Modes:
    (default)  render + write both mirrors, print a byte report.
    --check    no network: exit 1 if any block's two mirrors differ or are
               missing (a stale mirror ships a stale figure). Never a silent
               green: a source with zero blocks is a finding.

An absent checkout (Cargo.toml probe, the sync_mirror convention) is a LOUD
per-source SKIP — the figures are committed files, so deploys never need the
private checkouts — never a red. A present checkout with a missing doc is a
✗ finding.

Checkouts: $KATGPT_RS_CHECKOUT else ../katgpt-rs; $INSTINCT_CHECKOUT else
../riir-instinct; $REFLEX_CHECKOUT else ../riir-reflex; $RETHINK_CHECKOUT
else ../riir-rethink, all beside this repo.
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request
import zlib
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

SITE = Path(__file__).resolve().parent.parent

def katgpt_root() -> Path:
    env = os.environ.get("KATGPT_RS_CHECKOUT")
    return Path(env).expanduser().resolve() if env else (SITE.parent / "katgpt-rs").resolve()

def instinct_root() -> Path:
    env = os.environ.get("INSTINCT_CHECKOUT")
    return Path(env).expanduser().resolve() if env else (SITE.parent / "riir-instinct").resolve()

def reflex_root() -> Path:
    env = os.environ.get("REFLEX_CHECKOUT")
    return Path(env).expanduser().resolve() if env else (SITE.parent / "riir-reflex").resolve()

def rethink_root() -> Path:
    env = os.environ.get("RETHINK_CHECKOUT")
    return Path(env).expanduser().resolve() if env else (SITE.parent / "riir-rethink").resolve()

# (root resolver, doc rel path, rename map {doc_filename: site_filename}) per
# owning repo, in render order. An empty map is the identity: the doc-side
# filename and the site-side assets/ filename agree.
SOURCES = (
    (katgpt_root, ".docs/06_game_arenas/tetris_lane_flows.md", {}),
    (instinct_root, ".docs/03_decision_flow/instinct_flow.md", {}),
    (reflex_root, ".docs/05_resources/dev_flow.md", {"dev_flow.svg": "reflex_dev_flow.svg"}),
    (instinct_root, ".docs/05_resources/dev_flow.md", {"dev_flow.svg": "instinct_dev_flow.svg"}),
    (rethink_root, ".docs/03_decision_flow/rethink_flow.md", {}),
    (rethink_root, ".docs/05_resources/dev_flow.md", {"dev_flow.svg": "rethink_dev_flow.svg"}),
)

THEME = {
    "theme": "base",
    "themeVariables": {
        "background": "transparent",
        "primaryColor": "#241410",
        "primaryBorderColor": "#ff8a4c",
        "primaryTextColor": "#f2e6dd",
        "secondaryColor": "#1d110c",
        "tertiaryColor": "#1d110c",
        "lineColor": "#b99f8f",
        "textColor": "#f2e6dd",
        "clusterBkg": "#1d110c",
        "clusterBorder": "#3a2117",
        "edgeLabelBackground": "#1d110c",
        "fontFamily": "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
        "fontSize": "16px",
    },
    "flowchart": {"htmlLabels": True, "curve": "basis"},
}


def blocks(md: str):
    """Yield (file, aria, code) for every ```mermaid block with a file header."""
    for m in re.finditer(r"```mermaid\n(.*?)```", md, re.S):
        code = m.group(1)
        f = re.search(r"^%% file:\s*(\S+)\s*$", code, re.M)
        a = re.search(r"^%% aria:\s*(.+?)\s*$", code, re.M)
        if not f or not a:
            raise SystemExit(f"block without %% file:/%% aria: header:\n{code[:200]}")
        body = "\n".join(l for l in code.splitlines() if not l.startswith("%%"))
        yield f.group(1), a.group(1), body


def render(code: str) -> str:
    state = json.dumps({"code": code, "mermaid": THEME}).encode("utf-8")
    pako = base64.urlsafe_b64encode(zlib.compress(state, 9)).decode("ascii")
    url = f"https://mermaid.ink/svg/pako:{pako}?bgColor=!transparent"
    req = urllib.request.Request(url, headers={"User-Agent": "reflex-site-render/1"})
    last = None
    for attempt in range(4):  # mermaid.ink times out intermittently
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8")
        except OSError as e:
            last = e
            print(f"  … mermaid.ink attempt {attempt + 1} failed ({e}); retrying", file=sys.stderr)
    raise SystemExit(f"mermaid.ink unreachable after 4 attempts: {last}")


def postprocess(svg: str, sid_name: str, aria: str) -> str:
    # sid_name is the SITE filename: the internal id must be unique per
    # site figure, and several repos emit a doc-side `dev_flow.svg`.
    sid = sid_name.removesuffix(".svg").replace("_", "-")
    m = re.search(r'<svg[^>]*\bid="([^"]+)"', svg)
    if not m:
        raise SystemExit(f"{file}: rendered SVG has no root id")
    old = m.group(1)
    # Rename EVERY occurrence: the root id, the `#id` selector scope, and the
    # `id_…` prefix mermaid gives the arrow markers (`url(#id_…pointEnd)`) —
    # renaming only the root breaks the marker references (no arrowheads).
    svg = svg.replace(old, sid)
    svg = re.sub(r"@import[^;]+;", "", svg)
    esc = aria.replace("&", "&amp;").replace('"', "&quot;")
    svg = re.sub(r'\s(role|aria-label|aria-labelledby|aria-describedby)="[^"]*"', "", svg, count=0)
    svg = svg.replace("<svg ", f'<svg role="img" aria-label="{esc}" ', 1)
    return svg


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    bad = 0
    for root_fn, rel, rename in SOURCES:
        root = root_fn()
        if not (root / "Cargo.toml").exists():
            print(f"SKIP (loud): {root.name} checkout absent - {rel} UNCHECKED this run")
            continue
        doc = root / rel
        if not doc.exists():
            print(f"✗ source missing: {doc}")
            bad += 1
            continue
        items = list(blocks(doc.read_text(encoding="utf-8")))
        if not items:
            print(f"✗ {doc} has zero mermaid blocks — nothing rendered is not a pass")
            bad += 1
            continue
        for file, aria, code in items:
            site_name = rename.get(file, file)
            a, b = doc.parent / file, SITE / "assets" / site_name
            if args.check:
                if not a.exists() or not b.exists():
                    missing = "doc" if not a.exists() else "site"
                    print(f"✗ {file} -> assets/{site_name}: missing mirror ({missing})")
                    bad += 1
                elif a.read_bytes() != b.read_bytes():
                    print(f"✗ {file} -> assets/{site_name}: mirrors differ — re-render")
                    bad += 1
                else:
                    print(f"✓ {file} -> assets/{site_name} ({b.stat().st_size} B)")
                continue
            svg = postprocess(render(code), site_name, aria)
            for dst in (a, b):
                dst.write_text(svg, encoding="utf-8", newline="\n")
            print(f"✓ rendered {file} -> assets/{site_name} ({len(svg)} B) → both mirrors")
            time.sleep(3)  # politeness: mermaid.ink 503s on a back-to-back burst
    if args.check:
        print(("✗ " if bad else "✓ ") + (f"{bad} figure problem(s)" if bad else "all figures in sync"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
