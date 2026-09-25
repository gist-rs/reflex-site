#!/usr/bin/env python3
"""Render the arena's "How each lane decides" figures from their doc source.

SOURCE OF TRUTH: katgpt-rs `.docs/06_game_arenas/tetris_lane_flows.md` (the
Tetris lanes are katgpt-rs's arena book; riir-reflex stays game-free). Each
```mermaid block there carries two header comments:

    %% file: tetris_flow_<lane>.svg      the output name
    %% aria: <one sentence>              the SVG's aria-label

This renders every block through mermaid.ink (the same service + palette the
riir-reflex hero `decision_flow.svg` uses: theme `base`, `#241410` node fill,
`#ff8a4c` ember borders, `#f2e6dd` text, `#b99f8f` lines, `#1d110c` clusters,
transparent background, monospace), post-processes per the Issue-131
conventions (no `@import`, every selector scoped to the SVG's own id,
`role="img"` + the aria sentence), and writes the SAME bytes to both mirrors:

    <katgpt-rs>/.docs/06_game_arenas/<file>      beside the doc
    <reflex-site>/assets/<file>                   what the page embeds

Modes:
    (default)  render + write both mirrors, print a byte report.
    --check    no network: exit 1 if any block's two mirrors differ or are
               missing (a stale mirror ships a stale figure). Never a silent
               green: a source with zero blocks is a finding.

The katgpt-rs checkout: $KATGPT_RS_CHECKOUT, else ../katgpt-rs beside this repo.
"""

import argparse
import base64
import json
import os
import re
import sys
import urllib.request
import zlib
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

SITE = Path(__file__).resolve().parent.parent
DOC_REL = ".docs/06_game_arenas/tetris_lane_flows.md"

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


def katgpt_root() -> Path:
    env = os.environ.get("KATGPT_RS_CHECKOUT")
    return Path(env).expanduser().resolve() if env else (SITE.parent / "katgpt-rs").resolve()


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


def postprocess(svg: str, file: str, aria: str) -> str:
    sid = file.removesuffix(".svg").replace("_", "-")
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
    root = katgpt_root()
    doc = root / DOC_REL
    if not doc.exists():
        print(f"✗ source missing: {doc}")
        return 2
    items = list(blocks(doc.read_text(encoding="utf-8")))
    if not items:
        print(f"✗ {doc} has zero mermaid blocks — nothing rendered is not a pass")
        return 1
    bad = 0
    for file, aria, code in items:
        a, b = doc.parent / file, SITE / "assets" / file
        if args.check:
            if not a.exists() or not b.exists():
                print(f"✗ {file}: missing mirror ({'doc' if not a.exists() else 'site'})")
                bad += 1
            elif a.read_bytes() != b.read_bytes():
                print(f"✗ {file}: mirrors differ — re-render")
                bad += 1
            else:
                print(f"✓ {file} ({b.stat().st_size} B)")
            continue
        svg = postprocess(render(code), file, aria)
        for dst in (a, b):
            dst.write_text(svg, encoding="utf-8", newline="\n")
        print(f"✓ rendered {file} ({len(svg)} B) → both mirrors")
    if args.check:
        print(("✗ " if bad else "✓ ") + f"{len(items) - bad}/{len(items)} figures in sync")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
