#!/usr/bin/env python3
"""Render the gist.rs flow figures from their doc sources (two-mirror law).

ONE renderer for every flow figure (riir-ai Plan 620; the spec is the family
design guide §8, riir-ai `.docs/13_web_family/design_guide.md`). Two block
kinds, one source table:

  ```gfflow    the family format (§8.3): TOML describing lanes, numbered
               steps, edges and an optional step-through walk. Rendered
               OFFLINE into deterministic bytes:
                 <file>            the desktop swimlane SVG
                 <file-stem>_m.svg the 390 px numbered card list (laid out at
                                   340 units: 1:1 on a phone column)
                 <file-stem>.walk.json  the walk (only when the block has one)
               The numbering rule (§8.2), the status vocabulary, the lane
               colours and every walk in/out file are VALIDATED — a flow that
               breaks them is refused, never drawn.
  ```mermaid   the legacy path, rendered through mermaid.ink (network). It
               stays only until the last block migrates (Plan 620 P3), then
               it is deleted together with the render_tetris_flows.py shim.
               Each block carries two header comments:
                   %% file: <name>.svg      the output name in the DOC directory
                   %% aria: <one sentence>  the SVG's aria-label

SOURCES OF TRUTH (one doc per owning repo; the SOURCES table below):
  katgpt-rs `.docs/06_game_arenas/tetris_lane_flows.md` (the Tetris lanes),
  riir-reflex `.docs/03_decision_flow/decision_flow.md` (the hero figure —
  only its headered block renders) and `.docs/05_resources/dev_flow.md`,
  riir-instinct `.docs/03_decision_flow/instinct_flow.md` and
  `.docs/05_resources/dev_flow.md`, riir-rethink
  `.docs/03_decision_flow/rethink_flow.md`, `.docs/05_resources/dev_flow.md`
  (both PUBLIC-BY-MIRROR, fenced by sync_mirror.py) and
  `.docs/06_trust_flow/trust_flow.md` (the rethink.gist.rs #trust figure —
  the first gfflow block, the golden test).

Each source names its SITE directory: the reflex-site root for every figure
reflex.gist.rs serves, riir-rethink's `site/` for the trust figure (that
storefront is its own deploy). Every output is written byte-identically to

    <owning repo>/<doc dir>/<doc filename>     beside the doc
    <site dir>/assets/<site filename>          what the page embeds

A RENAME MAP {doc_filename: site_filename} renames the site copy where
several repos emit the same doc-side name (`dev_flow.svg`); the SVG's
internal id derives from the SITE name so figures sharing one doc-side name
never share one id on a page.

gfflow walks: each [[walk]] in/out names a payload file relative to the SITE
dir (`data/flows/<flow>/…`, written by an instrument — never typed, §8.4).
The renderer embeds the payload bytes in the walk JSON (one fetch for the
walker) and fills the no-JS fallback — a <details> list of IN/OUT per step —
into every page of that site carrying the marker pair

    <!-- gfflow:walk <file> -->  …  <!-- /gfflow:walk -->

A `provenance.json` beside the payloads ({file: {"from": "…"}}), when
present, supplies each payload's provenance line.

Colours are the family tokens (family.css) as LITERAL hex in ONE table
(TOKENS): an <img>-embedded SVG cannot read page CSS variables. --check
cross-reads the site's family.css so the table cannot drift silently.

After a re-render, run `scripts/sync_mirror.py` (default mode): it owns
`assets/mirror_manifest.json` and is the drift detector between renders.

Modes:
    (default)   render + write both mirrors (+ walk JSON + page fallbacks).
    --check     no network: run the self-test, then exit 1 if any gfflow block
                fails validation or its committed outputs differ from a fresh
                render, if any page fallback is stale, if an embed's
                width/height disagree with the SVG, or if any mermaid block's
                two mirrors differ or are missing. Never a silent green: a
                source with zero blocks is a finding.
    --self-test the arms over the gfflow validator + renderer (numbering
                accept/refuse, vocabulary, missing payload, 3-line body,
                byte determinism, the 11-unit floor of the card list).
    --only S    restrict to sources whose doc path or checkout name contains
                S. A filter that matches nothing is a red, never a quiet zero.

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
import html
import json
import os
import re
import sys
import tempfile
import time
import tomllib
import urllib.request
import zlib
from pathlib import Path
from typing import Callable, NamedTuple

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="backslashreplace")

SITE = Path(__file__).resolve().parent.parent


def _checkout(env: str, name: str) -> Path:
    v = os.environ.get(env)
    return Path(v).expanduser().resolve() if v else (SITE.parent / name).resolve()


def katgpt_root() -> Path:
    return _checkout("KATGPT_RS_CHECKOUT", "katgpt-rs")


def instinct_root() -> Path:
    return _checkout("INSTINCT_CHECKOUT", "riir-instinct")


def reflex_root() -> Path:
    return _checkout("REFLEX_CHECKOUT", "riir-reflex")


def rethink_root() -> Path:
    return _checkout("RETHINK_CHECKOUT", "riir-rethink")


def reflexer_root() -> Path:
    return _checkout("REFLEXER_CHECKOUT", "riir-reflexer")


def reflex_site() -> Path:
    return SITE


def rethink_site() -> Path:
    return rethink_root() / "site"


class Source(NamedTuple):
    """One owning doc. `palette` applies to its mermaid blocks only ("family:
    <hex>" = the family ink palette with that accent on node borders; the
    retired brown theme is refused). `headered_only` renders only the mermaid
    blocks carrying %% file:/%% aria: headers. `site` is the site root whose
    `assets/` receives the site mirror."""

    root: Callable[[], Path]
    rel: str
    rename: dict
    palette: str | None = None
    headered_only: bool = False
    site: Callable[[], Path] = reflex_site


SOURCES = (
    Source(katgpt_root, ".docs/06_game_arenas/tetris_lane_flows.md", {}, "family:#ff8a3d"),
    Source(reflex_root, ".docs/03_decision_flow/decision_flow.md", {}, "family:#ff8a3d", True),
    Source(instinct_root, ".docs/03_decision_flow/instinct_flow.md", {}, "family:#f472b6"),
    Source(reflex_root, ".docs/05_resources/dev_flow.md", {"dev_flow.svg": "reflex_dev_flow.svg"}, "family:#ff8a3d"),
    Source(instinct_root, ".docs/05_resources/dev_flow.md", {"dev_flow.svg": "instinct_dev_flow.svg"}, "family:#f472b6"),
    Source(rethink_root, ".docs/03_decision_flow/rethink_flow.md", {}, "family:#a98bfa"),
    Source(rethink_root, ".docs/05_resources/dev_flow.md", {"dev_flow.svg": "rethink_dev_flow.svg"}, "family:#a98bfa"),
    # the model-classes education figures (the /resources #development deep dive)
    Source(rethink_root, ".docs/05_resources/model_classes.md", {}, site=reflex_site),
    # the first gfflow block (Plan 620 P1.3): its site is the rethink storefront
    Source(rethink_root, ".docs/06_trust_flow/trust_flow.md", {}, site=rethink_site),
    # the Reflex ↔ Reflexer relation figure (riir-reflexer Plan 004; F16 in 620's table)
    Source(reflexer_root, ".docs/06_resources/resources.md", {}, "family:#ff8a3d"),
)


class FlowError(Exception):
    """A gfflow block the renderer refuses (validation or layout)."""


# ── family tokens: ONE table, literal hex (family.css gist-family v1) ──────

TOKENS = {
    "bg": "#0d0f14", "bg-2": "#11141b", "surface": "#161a23", "surface-2": "#1c212c",
    "line": "#272d3a", "line-2": "#343b4b",
    "text": "#e9ecf2", "text-2": "#c3c8d4", "muted": "#9299ab", "faint": "#69718a",
    "ok": "#4ade80", "warn": "#fbbf24", "bad": "#f87171", "info": "#60a5fa",
    "c-ai": "#5cc8e8", "c-reflex": "#ff8a3d", "c-refine": "#3fd68a", "c-rethink": "#a98bfa", "c-instinct": "#f472b6",
}
LANE_COLORS = {k: TOKENS["c-" + k] for k in ("reflex", "rethink", "ai", "refine", "instinct")}
# status vocabulary (§8.1): word shown, dot colour, hollow ring?
STATUS = {
    "live": ("live", TOKENS["ok"], False),
    "test network": ("test network", TOKENS["info"], False),
    "testnet": ("test network", TOKENS["info"], False),
    "planned": ("planned", TOKENS["muted"], True),
}
# Edges wear --faint, not §8.1's --line-2: on the --bg-2 figure ground a
# --line-2 hairline measured near-invisible, and the hand-drawn reference
# (the look the plan adopts) used --faint. Only a walked edge wears the accent.
EDGE = TOKENS["faint"]
SANS = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif'
MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"


def family_css_findings(css_path: Path) -> list:
    """Cross-read a site's family.css: every TOKENS row must match its value."""
    if not css_path.exists():
        return [f"family.css not found at {css_path} — the token table is unchecked"]
    css = css_path.read_text(encoding="utf-8")
    out = []
    for name, hexv in TOKENS.items():
        m = re.search(r"--" + re.escape(name) + r":\s*(#[0-9a-fA-F]{6})", css)
        if not m:
            out.append(f"token --{name} not found in {css_path.name}")
        elif m.group(1).lower() != hexv:
            out.append(f"token --{name}: table {hexv} != {css_path.name} {m.group(1)}")
    return out


# ── deterministic text metrics (no font engine: a fixed per-char table) ────
# Advance widths in 1/1000 em, Helvetica/Arial metrics. system-ui (SF Pro on
# macOS) runs slightly wider, so sans widths are scaled by SANS_FUDGE; the
# mono stack is a flat 0.6 em (SF Mono / Menlo), non-ASCII counted at 1 em.


def _table(groups) -> dict:
    t = {}
    for chars, w in groups:
        for c in chars:
            t[c] = w
    return t


_EXTRA = (("·", 278), ("—…→←↺↳", 1000), ("–", 556), ("µ", 556), ("●○", 600), ("×≥≤", 584))
SANS_R = _table((
    (" !,./:;I[\\]ft", 278), ("ijl", 222), ("()-r`", 333), ("'", 191), ('"', 355),
    ("#$0123456789?_abdeghnopquL", 556), ("Jckvxyzs", 500), ("+<=>~", 584), ("FTZ", 611),
    ("&ABEKPSVXY", 667), ("CDHNRUw", 722), ("GOQ", 778), ("Mm", 833), ("%", 889),
    ("W", 944), ("@", 1015), ("|", 260), ("{}", 334), ("^", 469), ("*", 389),
    ("“”", 333), ("‘’", 222)) + _EXTRA)
SANS_B = _table((
    (" ,./I[\\]ijl", 278), ("!()-:;`ft", 333), ("'", 238), ('"', 474), ("*r", 389),
    ("#$0123456789Jaceksvxy", 556), ("z", 500), ("+<=>~", 584),
    ("?FLTZbdghnopqu", 611), ("EPSVXY", 667), ("&ABCDHKNRU", 722), ("GOQw", 778),
    ("M", 833), ("%m", 889), ("W", 944), ("@", 975), ("|", 280), ("{}", 389), ("^", 584),
    ("“”", 500), ("‘’", 278)) + _EXTRA)
SANS_FUDGE = 1.08


def text_w(s: str, font: str, size: float) -> float:
    if font == "mono":
        return sum(0.6 if ord(c) < 128 else 1.0 for c in s) * size
    tbl = SANS_B if font == "bold" else SANS_R
    em = sum(tbl.get(c, 600 if ord(c) < 128 else 1000) for c in s) / 1000
    return em * size * SANS_FUDGE


def wrap(s: str, font: str, size: float, width: float) -> list:
    """Greedy word wrap; a single word wider than `width` is refused."""
    lines, cur = [], ""
    for word in s.split():
        if text_w(word, font, size) > width:
            raise FlowError(f"word {word!r} is wider than {width:g} units")
        trial = word if not cur else cur + " " + word
        if text_w(trial, font, size) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def fmt(v: float) -> str:
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def esc(s: str) -> str:
    return html.escape(s, quote=True)


# ── gfflow: parse + validate (§8.2 / §8.3) ────────────────────────────────

GFFLOW_RE = re.compile(r"^```gfflow[ \t]*\n(.*?)^```[ \t]*$", re.S | re.M)
N_RE = re.compile(r"^(\d+)([a-z]?)(?:\.(\d+))?$")
SIDES = ("n", "s", "e", "w")


def desemicolon(text: str) -> str:
    """The spec writes `id = "me";  label = …` on one line; TOML has no `;`.
    Split top-level semicolons (outside strings) into newlines."""
    out, q, i = [], None, 0
    while i < len(text):
        c = text[i]
        if q:
            out.append(c)
            if c == "\\" and q == '"' and i + 1 < len(text):
                out.append(text[i + 1])
                i += 1
            elif c == q:
                q = None
        elif c in "\"'":
            q = c
            out.append(c)
        elif c == "#":  # comment: copy to end of line verbatim
            j = text.find("\n", i)
            j = len(text) if j < 0 else j
            out.append(text[i:j])
            i = j
            continue
        elif c == ";":
            out.append("\n")
        else:
            out.append(c)
        i += 1
    return "".join(out)


def parse_n(n: str):
    m = N_RE.match(n)
    if not m:
        return None
    sub = int(m.group(3)) if m.group(3) else 0
    if sub and not m.group(2):
        return None  # a dotted step continues a LETTERED branch: 3b.1, never 3.1
    return (int(m.group(1)), m.group(2), sub)


def load_flow(src: str) -> dict:
    try:
        doc = tomllib.loads(desemicolon(src))
    except tomllib.TOMLDecodeError as e:
        raise FlowError(f"TOML: {e}") from e
    return doc


def validate(doc: dict, site: Path | None) -> list:
    """Every §8.2/§8.3 finding for one parsed block (empty = accepted)."""
    errs = []
    for k in ("file", "title"):
        if not isinstance(doc.get(k), str) or not doc[k]:
            errs.append(f"missing `{k}`")
    if isinstance(doc.get("file"), str) and not re.match(r"^[a-z0-9_]+\.svg$", doc["file"]):
        errs.append(f"file {doc['file']!r} must be snake_case .svg")
    if "accent" in doc and doc["accent"] not in LANE_COLORS:
        errs.append(f"unknown accent colour {doc['accent']!r} (one of {', '.join(LANE_COLORS)})")
    lanes = doc.get("lane", [])
    steps = doc.get("step", [])
    edges = doc.get("edge", [])
    if not lanes or not steps:
        errs.append("a flow needs at least one [[lane]] and one [[step]]")
    lane_ids = set()
    for ln in lanes:
        if ln.get("id") in lane_ids:
            errs.append(f"duplicate lane id {ln.get('id')!r}")
        lane_ids.add(ln.get("id"))
        if not ln.get("label"):
            errs.append(f"lane {ln.get('id')!r} has no label")
        if ln.get("color") not in LANE_COLORS:
            errs.append(f"lane {ln.get('id')!r}: unknown lane colour {ln.get('color')!r} (one of {', '.join(LANE_COLORS)})")
    by_id, by_n, slots = {}, {}, {}
    for st in steps:
        sid = st.get("id")
        if not sid or not re.match(r"^[a-z][a-z0-9_]*$", str(sid)):
            errs.append(f"step id {sid!r} must be a lower-case identifier")
            continue
        if sid in by_id:
            errs.append(f"duplicate step id {sid!r}")
        by_id[sid] = st
        n = str(st.get("n", ""))
        pn = parse_n(n)
        if pn is None:
            errs.append(f"step {sid!r}: number {n!r} is not `N`, `Na` or `Na.K`")
        elif n in by_n:
            errs.append(f"duplicate step number {n!r} ({by_n[n]} and {sid}) — a letter names ONE alternative")
        else:
            by_n[n] = sid
        if st.get("lane") not in lane_ids:
            errs.append(f"step {sid!r}: unknown lane {st.get('lane')!r}")
        col = st.get("col")
        if not isinstance(col, int) or col < 0:
            errs.append(f"step {sid!r}: col must be an integer ≥ 0")
        elif (st.get("lane"), col) in slots:
            errs.append(f"step {sid!r}: grid slot ({st.get('lane')}, {col}) already holds {slots[(st.get('lane'), col)]!r}")
        else:
            slots[(st.get("lane"), col)] = sid
        if not st.get("title") or not st.get("body"):
            errs.append(f"step {sid!r}: title and body are required")
        if st.get("status") not in STATUS:
            errs.append(f"step {sid!r}: unknown status {st.get('status')!r} (live | test network | planned)")
        tag = st.get("tag")
        if tag is not None and (not isinstance(tag, dict) or tag.get("color") not in LANE_COLORS or not tag.get("text")):
            errs.append(f"step {sid!r}: tag needs text + a lane colour")
    if "1" not in by_n:
        errs.append("no step numbered 1 — the path starts at 1")
    # dotted branch steps: a branch with K>1 steps is Na.1 … Na.K, contiguous,
    # and never also a bare Na (§8.2: dots only when the branch has >1 step)
    groups = {}
    for n in by_n:
        pn = parse_n(n)
        if pn and pn[2]:
            groups.setdefault(pn[:2], []).append(pn[2])
    for (i, a), subs in groups.items():
        if f"{i}{a}" in by_n:
            errs.append(f"branch {i}{a} is numbered both {i}{a} and {i}{a}.K")
        if sorted(subs) != list(range(1, len(subs) + 1)) or len(subs) < 2:
            errs.append(f"branch {i}{a}: dotted steps must run {i}{a}.1 … {i}{a}.K with K ≥ 2 (got {sorted(subs)})")
    fwd_out, fwd_in = {}, {}
    seen_e = set()
    for e in edges:
        f, t = e.get("from"), e.get("to")
        if f not in by_id or t not in by_id:
            errs.append(f"edge {f}->{t}: unknown step")
            continue
        if (f, t) in seen_e:
            errs.append(f"duplicate edge {f}->{t}")
        seen_e.add((f, t))
        for side_key in ("exit", "enter"):
            if side_key in e and e[side_key] not in SIDES:
                errs.append(f"edge {f}->{t}: {side_key} must be one of n/s/e/w")
        if e.get("via") not in (None, "gutter"):
            errs.append(f"edge {f}->{t}: via must be \"gutter\"")
        pf, pt = parse_n(str(by_id[f].get("n"))), parse_n(str(by_id[t].get("n")))
        if not pf or not pt:
            continue
        if e.get("back"):
            if not pt < pf:
                errs.append(f"back edge {f}->{t}: {by_id[t]['n']} is not earlier than {by_id[f]['n']} — a back edge loops to an EARLIER step")
            continue
        fwd_out.setdefault(f, []).append(t)
        fwd_in.setdefault(t, []).append(f)
        (fi, fa, fs), (ti, ta, ts) = pf, pt
        sn, tn = by_id[f]["n"], by_id[t]["n"]
        if ts > 1:
            if not (ti == fi and ta == fa and ts == fs + 1):
                errs.append(f"edge {sn}->{tn}: a branch step {tn} follows {ti}{ta}.{ts - 1}")
        elif ti != fi + 1:
            errs.append(f"edge {sn}->{tn}: a forward edge from {sn} must land on {fi + 1} (any letter) — §8.2")
        elif ts == 1 and not ta:
            errs.append(f"edge {sn}->{tn}: dotted step without a branch letter")
    for f, ts_ in fwd_out.items():
        if len(ts_) < 2:
            continue
        ns = [by_id[t]["n"] for t in ts_]
        pns = [parse_n(str(n)) for n in ns]
        if any(not p or not p[1] for p in pns):
            errs.append(f"step {by_id[f]['n']} branches to {', '.join(ns)} without letters — alternatives take letters (3a, 3b)")
        elif len({p[1] for p in pns}) != len(pns):
            errs.append(f"step {by_id[f]['n']} branches to {', '.join(ns)}: duplicate letter")
        elif len({p[0] for p in pns}) != 1 or any(p[2] > 1 for p in pns):
            errs.append(f"step {by_id[f]['n']} branches to {', '.join(ns)}: alternatives share ONE next number")
    for t, fs_ in fwd_in.items():
        if len(fs_) > 1:
            p = parse_n(str(by_id[t]["n"]))
            if p and (p[1] or p[2]):
                errs.append(f"step {by_id[t]['n']} merges {len(fs_)} branches — a merge resumes at the next INTEGER")
    edge_ids = {f"{e.get('from')}->{e.get('to')}" for e in edges}
    for k, w in enumerate(doc.get("walk", []), 1):
        if not w.get("title") or not w.get("text"):
            errs.append(f"walk {k}: title and text are required")
        ws = w.get("steps") or []
        if not ws or any(s not in by_id for s in ws):
            errs.append(f"walk {k}: steps {ws!r} must name existing steps")
        for eid in w.get("edges", []):
            if eid not in edge_ids:
                errs.append(f"walk {k}: unknown edge {eid!r}")
        for io in ("in", "out"):
            spec = w.get(io)
            if spec is None:
                continue
            if not isinstance(spec, dict) or not spec.get("src") or spec.get("lang") not in ("json", "text", "http", "sh"):
                errs.append(f"walk {k}: `{io}` needs src + lang (json | text | http | sh)")
                continue
            if site is not None and not (site / spec["src"]).is_file():
                errs.append(f"walk {k}: {io} file missing: {spec['src']} (relative to {site})")
    return errs


# ── layout helpers ─────────────────────────────────────────────────────────


class Box(NamedTuple):
    x: float
    y: float
    w: float
    h: float

    @property
    def r(self):
        return self.x + self.w

    @property
    def b(self):
        return self.y + self.h

    def hits(self, o: "Box", pad: float = 0) -> bool:
        return not (o.x >= self.r + pad or o.r <= self.x - pad or o.y >= self.b + pad or o.b <= self.y - pad)


def seg_hits(p, q, box: Box) -> bool:
    """Axis-aligned segment p→q crosses the INTERIOR of box."""
    (x1, y1), (x2, y2) = p, q
    if y1 == y2:
        lo, hi = sorted((x1, x2))
        return box.y < y1 < box.b and lo < box.r and hi > box.x
    lo, hi = sorted((y1, y2))
    return box.x < x1 < box.r and lo < box.b and hi > box.y


def status_text(st: dict) -> str:
    word = STATUS[st["status"]][0]
    return word + (f" · {st['note']}" if st.get("note") else "")


def mix(hex_a: str, hex_b: str, t: float) -> str:
    a = [int(hex_a[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex_b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(a, b))


def badge(n: str, cx: float, cy: float, color: str, cls: str, r: float) -> tuple:
    """A numbered badge in the lane colour with an ink number; returns (svg,
    right edge). One glyph = a circle; `3a` / `3b.1` = a pill."""
    if len(n) == 1:
        return (f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{color}"/>'
                f'<text x="{fmt(cx)}" y="{fmt(cy + 4.5)}" text-anchor="middle" class="{cls}">{esc(n)}</text>'), cx + r
    w = text_w(n, "bold", 13) + 14
    x = cx - r
    return (f'<rect x="{fmt(x)}" y="{fmt(cy - r)}" width="{fmt(w)}" height="{fmt(2 * r)}" rx="{fmt(r)}" fill="{color}"/>'
            f'<text x="{fmt(x + w / 2)}" y="{fmt(cy + 4.5)}" text-anchor="middle" class="{cls}">{esc(n)}</text>'), x + w


def sort_key(n: str):
    return parse_n(n) or (10 ** 6, "", 0)


def gen_desc(doc: dict) -> str:
    lanes = {ln["id"]: ln for ln in doc["lane"]}
    by_id = {s["id"]: s for s in doc["step"]}
    incoming = {}
    for e in doc.get("edge", []):
        if not e.get("back") and e.get("label"):
            incoming.setdefault(e["to"], []).append(e["label"])
    parts = [f"{len(doc['step'])} steps in path order."]
    for st in sorted(doc["step"], key=lambda s: sort_key(s["n"])):
        cond = f"If {' / '.join(incoming[st['id']])}: " if st["id"] in incoming else ""
        parts.append(f"{st['n']}. {cond}{st['title']}: {st['body']} ({lanes[st['lane']]['label'].lower()}; {status_text(st)}).")
    for e in doc.get("edge", []):
        if e.get("back"):
            parts.append(f"From {by_id[e['from']]['n']} back to {by_id[e['to']]['n']}" + (f": {e['label']}." if e.get("label") else "."))
    return " ".join(parts)


def svg_open(sid: str, w: float, h: float, title: str, desc: str, style: str, defs: str) -> list:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" id="{sid}" data-gfflow="1" viewBox="0 0 {fmt(w)} {fmt(h)}" '
        f'width="{fmt(w)}" height="{fmt(h)}" role="img" aria-labelledby="{sid}-t {sid}-d">',
        f'<title id="{sid}-t">{esc(title)}</title>',
        f'<desc id="{sid}-d">{esc(desc)}</desc>',
        f"<style>{style}</style>",
        f"<defs>{defs}</defs>",
    ]


def markers(sid: str, colors: list) -> str:
    out = []
    for i, c in enumerate(colors):
        out.append(f'<marker id="{sid}-a{i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
                   f'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>')
    return "".join(out)


# ── desktop swimlane ───────────────────────────────────────────────────────
# Units: the figure renders at ≈ 0.85 scale inside the 68 rem family wrap, so
# every label is ≥ 13 units (≥ 11 px rendered, §6).

D = dict(card_w=230, pitch=294, x0=30, card_h=108, head=42, foot=16, tag=30, lane_gap=12, top=12,
         title=16, body=13.5, body_lh=19, mono=13, lane=13, badge=13, r=12, pad=16, aside_lines=4)


def render_desktop(doc: dict, sid: str) -> str:
    lanes = doc["lane"]
    steps = doc["step"]
    by_id = {s["id"]: s for s in steps}
    ncols = max(s["col"] for s in steps) + 1
    W = D["x0"] + ncols * D["pitch"] - (D["pitch"] - D["card_w"]) + 26
    lane_y, lane_h, y = {}, {}, D["top"]
    for ln in lanes:
        has_tag = any(s.get("tag") and s["lane"] == ln["id"] for s in steps)
        h = D["head"] + D["card_h"] + (D["tag"] if has_tag else D["foot"])
        lane_y[ln["id"]], lane_h[ln["id"]] = y, h
        y += h + D["lane_gap"]
    H = y - D["lane_gap"] + D["top"]
    color = {ln["id"]: LANE_COLORS[ln["color"]] for ln in lanes}
    box = {}
    for s in steps:
        box[s["id"]] = Box(D["x0"] + s["col"] * D["pitch"], lane_y[s["lane"]] + D["head"], D["card_w"], D["card_h"])
    obstacles = []  # (Box, owner) — labels must avoid these
    out_lanes, out_cards, out_edges = [], [], []
    inner = D["card_w"] - 2 * D["pad"]

    # lanes: band + mono caps label + note; the optional aside in an empty col 0
    for ln in lanes:
        c, ly = color[ln["id"]], lane_y[ln["id"]]
        label = ln["label"].upper()
        lw = text_w(label, "mono", D["lane"]) * 1.08  # letter-spacing .08em
        note = ln.get("note", "")
        out_lanes.append(
            f'<g data-lane="{esc(ln["id"])}"><rect x="10" y="{fmt(ly)}" width="{fmt(W - 20)}" height="{fmt(lane_h[ln["id"]])}" rx="16" '
            f'fill="{c}" fill-opacity=".06" stroke="{c}" stroke-opacity=".4"/>'
            f'<text x="30" y="{fmt(ly + 25)}"><tspan class="lh" fill="{c}">{esc(label)}</tspan>'
            + (f'<tspan class="ln" dx="12">{esc(note)}</tspan>' if note else "") + "</text></g>")
        obstacles.append(Box(30, ly + 10, lw + 12 + text_w(note, "sans", D["body"]), 20))
        if ln.get("aside") and not any(s["lane"] == ln["id"] and s["col"] == 0 for s in steps):
            ax, ay = D["x0"], ly + D["head"] + 18
            parts = []
            if ln.get("aside_title"):
                if text_w(ln["aside_title"], "bold", D["body"]) > D["card_w"]:
                    raise FlowError(f"lane {ln['id']}: aside_title wider than a card")
                parts.append(f'<text x="{fmt(ax)}" y="{fmt(ay)}" class="at">{esc(ln["aside_title"])}</text>')
                ay += 24
            lines = wrap(ln["aside"], "sans", D["body"], D["card_w"])
            if len(lines) > D["aside_lines"]:
                raise FlowError(f"lane {ln['id']}: aside needs {len(lines)} lines (max {D['aside_lines']})")
            for i, line in enumerate(lines):
                parts.append(f'<text x="{fmt(ax)}" y="{fmt(ay + i * D["body_lh"])}" class="d">{esc(line)}</text>')
            out_lanes.append(f'<g data-aside="{esc(ln["id"])}">' + "".join(parts) + "</g>")
            obstacles.append(Box(ax, ly + D["head"], D["card_w"], D["card_h"]))

    # cards
    for s in steps:
        b, c = box[s["id"]], color[s["lane"]]
        bd, right = badge(s["n"], b.x + 22, b.y + 24, c, "n", D["r"])
        tx = right + 10
        if tx + text_w(s["title"], "bold", D["title"]) > b.r - 10:
            raise FlowError(f"step {s['n']}: title {s['title']!r} does not fit one line of a card")
        lines = wrap(s["body"], "sans", D["body"], inner)
        if len(lines) > 2:
            raise FlowError(f"step {s['n']}: body needs {len(lines)} lines (max 2) — shorten it")
        stt = status_text(s)
        if text_w(stt, "mono", D["mono"]) > inner - 14:
            raise FlowError(f"step {s['n']}: status chip {stt!r} is wider than the card")
        _, dot, hollow = STATUS[s["status"]]
        dot_svg = (f'<circle cx="{fmt(b.x + 20)}" cy="{fmt(b.y + 92)}" r="4" fill="none" stroke="{dot}" stroke-width="1.5"/>'
                   if hollow else f'<circle cx="{fmt(b.x + 20)}" cy="{fmt(b.y + 92)}" r="4" fill="{dot}"/>')
        body = "".join(f'<text x="{fmt(b.x + D["pad"])}" y="{fmt(b.y + 55 + i * D["body_lh"])}" class="d">{esc(line)}</text>'
                       for i, line in enumerate(lines))
        tag = ""
        if s.get("tag"):
            tc = LANE_COLORS[s["tag"]["color"]]
            tw = text_w(s["tag"]["text"], "mono", D["mono"]) + 20
            if tw > b.w:
                raise FlowError(f"step {s['n']}: tag wider than the card")
            tx0 = b.x + (b.w - tw) / 2
            tag = (f'<rect x="{fmt(tx0)}" y="{fmt(b.b + 6)}" width="{fmt(tw)}" height="22" rx="11" fill="{tc}" fill-opacity=".12" '
                   f'stroke="{tc}" stroke-opacity=".55"/><text x="{fmt(b.x + b.w / 2)}" y="{fmt(b.b + 21.5)}" text-anchor="middle" '
                   f'class="s" fill="{tc}">{esc(s["tag"]["text"])}</text>')
            obstacles.append(Box(tx0, b.b + 6, tw, 22))
        out_cards.append(
            f'<g data-step="{esc(s["id"])}" data-n="{esc(s["n"])}">'
            f'<rect class="gf-cb" x="{fmt(b.x)}" y="{fmt(b.y)}" width="{fmt(b.w)}" height="{fmt(b.h)}" rx="12" fill="{TOKENS["surface"]}" '
            f'stroke="{c}" stroke-opacity=".6"/>{bd}'
            f'<text x="{fmt(tx)}" y="{fmt(b.y + 29)}" class="t">{esc(s["title"])}</text>{body}{dot_svg}'
            f'<text x="{fmt(b.x + 30)}" y="{fmt(b.y + 96)}" class="s" fill="{dot}">{esc(stt)}</text>{tag}</g>')
        obstacles.append(b)

    # edges: sides, ports, routes
    edges = doc.get("edge", [])
    cards = list(box.values())

    def between(p, q, skip):
        return any(seg_hits(p, q, bx) for k, bx in box.items() if k not in skip)

    plan = []  # (edge, kind, exit side, enter side)
    for e in edges:
        a, t = by_id[e["from"]], by_id[e["to"]]
        A, T = box[a["id"]], box[t["id"]]
        la = [ln["id"] for ln in lanes].index(a["lane"])
        lt = [ln["id"] for ln in lanes].index(t["lane"])
        skip = {a["id"], t["id"]}
        if e.get("via") == "gutter" or (a["col"] == t["col"] and between((A.x + A.w / 2, A.b), (T.x + T.w / 2, T.y), skip)
                                         and la != lt):
            plan.append((e, "gutter", "w", "w"))
        elif e.get("exit") or e.get("enter"):
            plan.append((e, "auto", e.get("exit"), e.get("enter")))
        elif la == lt:
            plan.append((e, "straight", "e" if t["col"] > a["col"] else "w", "w" if t["col"] > a["col"] else "e"))
        elif a["col"] == t["col"]:
            plan.append((e, "straight", "s" if lt > la else "n", "n" if lt > la else "s"))
        else:
            # one bend: horizontal-first, else vertical-first (centre test;
            # the final route is re-checked after the ports are spread)
            hx, vy = ("e" if t["col"] > a["col"] else "w"), ("s" if lt > la else "n")
            ax_ = A.r if hx == "e" else A.x
            tx_ = T.x if hx == "e" else T.r
            ay_ = A.b if vy == "s" else A.y
            ty_ = T.y if vy == "s" else T.b
            h_first = [(ax_, A.y + A.h / 2), (T.x + T.w / 2, A.y + A.h / 2), (T.x + T.w / 2, ty_)]
            v_first = [(A.x + A.w / 2, ay_), (A.x + A.w / 2, T.y + T.h / 2), (tx_, T.y + T.h / 2)]
            if not any(between(q0, q1, skip) for q0, q1 in zip(h_first, h_first[1:])):
                plan.append((e, "bend", hx, "n" if lt > la else "s"))
            elif not any(between(q0, q1, skip) for q0, q1 in zip(v_first, v_first[1:])):
                plan.append((e, "bend", vy, "w" if hx == "e" else "e"))
            else:
                raise FlowError(f"edge {a['n']}->{t['n']}: no one-bend route clears the cards — set exit/enter or via")
    # ports: spread the edges sharing one side of one card, ordered by the
    # other end's position so neighbouring edges do not cross at the card
    side_users = {}
    for i, (e, kind, xs, ns) in enumerate(plan):
        side_users.setdefault((e["from"], xs), []).append((i, e["to"]))
        side_users.setdefault((e["to"], ns), []).append((i, e["from"]))
    port = {}
    for (sid_, side), users in side_users.items():
        b = box[sid_]
        horiz = side in ("n", "s")
        users.sort(key=lambda u: (box[u[1]].x + box[u[1]].w / 2) if horiz else (box[u[1]].y + box[u[1]].h / 2))
        k = len(users)
        for j, (i, _) in enumerate(users):
            if horiz:
                port[(i, sid_, side)] = (b.x + b.w * (j + 1) / (k + 1), b.y if side == "n" else b.b)
            else:
                port[(i, sid_, side)] = (b.x if side == "w" else b.r, b.y + b.h * (j + 1) / (k + 1))
    back_colors = []
    for i, (e, kind, xs, ns) in enumerate(plan):
        tc = color[by_id[e["to"]]["lane"]]
        if e.get("back") and tc not in back_colors:
            back_colors.append(tc)
    labels_placed = []

    def place_label(lines, cands, owner, own_i):
        """First free candidate: clear of cards, labels AND other edges'
        lines; else clear of cards + labels only (the halo keeps a crossing
        line legible); else refused."""
        lh = 17
        others = [(q0, q1) for j, r_ in routes.items() if j != own_i for q0, q1 in zip(r_, r_[1:])]
        words = lines[0].split()
        two = []
        if len(words) > 1:  # a balanced two-line split, tried only after one line
            k = min(range(1, len(words)), key=lambda j: abs(len(" ".join(words[:j])) - len(" ".join(words[j:]))))
            two = [" ".join(words[:k]), " ".join(words[k:])]
        own_ys = [q[1] for q in routes[own_i]]

        def own_above(y_):
            return any(0 < oy - y_ < 14 for oy in own_ys)

        variants = [(lines, c_) for c_ in cands] + ([(two, c_) for c_ in cands] if two else [])
        for strict in (True, False):
            for lines_, (x, y, anchor) in variants:
                w = max(text_w(s_, "mono", D["mono"]) for s_ in lines_)
                x0 = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
                if len(lines_) > 1 and own_above(y):
                    y -= lh * (len(lines_) - 1)  # grow a label ABOVE its line upward
                bx = Box(x0 - 2, y - 13, w + 4, lh * len(lines_) + 2)
                if bx.x < 12 or bx.r > W - 12:
                    continue
                if any(bx.hits(o) for o in obstacles) or any(bx.hits(o) for o in labels_placed):
                    continue
                pad_ = Box(bx.x - 3, bx.y - 3, bx.w + 6, bx.h + 6)
                if any(seg_hits(q0, q1, pad_) for q0, q1 in zip(routes[own_i], routes[own_i][1:])):
                    continue  # never on top of its own line
                if strict and any(seg_hits(q0, q1, Box(bx.x - 3, bx.y - 3, bx.w + 6, bx.h + 6)) for q0, q1 in others):
                    continue
                labels_placed.append(bx)
                return x, y, anchor, lines_
        raise FlowError(f"edge {owner}: no free spot for label {' '.join(lines)!r} — shorten it or set exit/enter")

    routes = {}
    for i, (e, kind, xs, ns) in enumerate(plan):
        a, t = by_id[e["from"]], by_id[e["to"]]
        A, T = box[a["id"]], box[t["id"]]
        p0 = port[(i, a["id"], xs)]
        p1 = port[(i, t["id"], ns)]
        if kind == "straight":
            # align both ends on the side with more users (both cards share
            # the row or the column, so one coordinate fits both)
            ka, kt = len(side_users[(a["id"], xs)]), len(side_users[(t["id"], ns)])
            if xs in ("e", "w"):
                yy = p0[1] if ka >= kt else p1[1]
                pts = [(p0[0], yy), (p1[0], yy)]
            else:
                xx = p0[0] if ka >= kt else p1[0]
                pts = [(xx, p0[1]), (xx, p1[1])]
        elif kind == "gutter":
            gx = min(A.x, T.x) - (D["pitch"] - D["card_w"]) / 2
            pts = [p0, (gx, p0[1]), (gx, p1[1]), p1]
        else:  # bend (or explicit sides): one corner
            if xs in ("e", "w"):
                pts = [p0, (p1[0], p0[1]), p1]
            else:
                pts = [p0, (p0[0], p1[1]), p1]
            for q0, q1 in zip(pts, pts[1:]):
                if between(q0, q1, {a["id"], t["id"]}):
                    raise FlowError(f"edge {a['n']}->{t['n']}: the one-bend route crosses a card — set exit/enter or via")
        routes[i] = pts
    for i, (e, kind, xs, ns) in enumerate(plan):
        a, t = by_id[e["from"]], by_id[e["to"]]
        pts = routes[i]
        c = tc = color[t["lane"]] if e.get("back") else EDGE
        mk = f"url(#{sid}-a{back_colors.index(tc) + 1})" if e.get("back") else f"url(#{sid}-a0)"
        d = "M" + " ".join(f"{fmt(x)},{fmt(y)}" for x, y in pts)
        cls = "eb" if e.get("back") else "e"
        lab = ""
        if e.get("label"):
            lines = [e["label"]]
            # the longest segment carries the label
            segs = sorted(zip(pts, pts[1:]), key=lambda s_: -abs(s_[0][0] - s_[1][0]) - abs(s_[0][1] - s_[1][1]))
            (q0, q1) = segs[0]
            cands = []
            if q0[1] == q1[1]:  # horizontal
                mx, lo = (q0[0] + q1[0]) / 2, min(q0[0], q1[0])
                hi = max(q0[0], q1[0])
                cands = [(mx, q0[1] - 9, "middle"), (mx, q0[1] + 20, "middle"), (lo + 18, q0[1] - 9, "start"),
                         (lo + 18, q0[1] + 20, "start"), (hi - 18, q0[1] - 9, "end"), (hi - 18, q0[1] + 20, "end")]
                seg_len = abs(q1[0] - q0[0])
                if kind == "straight" and text_w(e["label"], "mono", D["mono"]) > seg_len - 6:
                    raise FlowError(f"edge {a['n']}->{t['n']}: label {e['label']!r} is wider than the {fmt(seg_len)}-unit gap")
            else:  # vertical
                lo_, hi_ = sorted((q0[1], q1[1]))
                cands = []
                for f_ in (0.5, 0.3, 0.7, 0.2, 0.8):
                    my = lo_ + (hi_ - lo_) * f_ + 4
                    cands += [(q0[0] + 10, my, "start"), (q0[0] - 10, my, "end")]
            lx, ly, anc, got = place_label(lines, cands, f"{a['n']}->{t['n']}", i)
            fill = f' style="fill:{c}"' if e.get("back") else ""
            lab = "".join(f'<text class="el" x="{fmt(lx)}" y="{fmt(ly + 17 * j)}" text-anchor="{anc}"{fill}>{esc(line)}</text>'
                          for j, line in enumerate(got))
        out_edges.append(f'<g data-edge="{esc(e["from"])}->{esc(e["to"])}"><path class="{cls}" d="{d}" '
                         f'stroke="{c}" marker-end="{mk}"/>{lab}</g>')

    style = (f"#{sid} .lh{{font:700 {D['lane']}px {MONO};letter-spacing:.08em}}"
             f"#{sid} .ln{{font:400 {D['body']}px {SANS};fill:{TOKENS['muted']}}}"
             f"#{sid} .at{{font:600 {D['body']}px {SANS};fill:{TOKENS['text-2']}}}"
             f"#{sid} .t{{font:700 {D['title']}px {SANS};fill:{TOKENS['text']}}}"
             f"#{sid} .d{{font:400 {D['body']}px {SANS};fill:{TOKENS['text-2']}}}"
             f"#{sid} .n{{font:700 {D['badge']}px {SANS};fill:{TOKENS['bg']}}}"
             f"#{sid} .s{{font:500 {D['mono']}px {MONO}}}"
             f"#{sid} .el{{font:500 {D['mono']}px {MONO};fill:{TOKENS['muted']};paint-order:stroke;"
             f"stroke:{TOKENS['bg-2']};stroke-width:4px;stroke-linejoin:round}}"
             f"#{sid} .e{{fill:none;stroke-width:1.6}}"
             f"#{sid} .eb{{fill:none;stroke-width:2}}")
    parts = svg_open(sid, W, H, doc["title"], gen_desc(doc), style, markers(sid, [EDGE] + back_colors))
    parts.append(f'<rect width="{fmt(W)}" height="{fmt(H)}" rx="14" fill="{TOKENS["bg-2"]}"/>')
    parts += out_lanes + out_edges + out_cards
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


# ── the 390 px card list (laid out at 340 units = 1:1 on a phone column) ───

M = dict(W=340, x=4, w=332, pad=18, kicker=12, title=15.5, body=13, body_lh=18, mono=12, gap=40, r=11, min_font=11)


def render_mobile(doc: dict, sid: str) -> str:
    lanes = {ln["id"]: ln for ln in doc["lane"]}
    by_id = {s["id"]: s for s in doc["step"]}
    order = sorted(doc["step"], key=lambda s: sort_key(s["n"]))
    inner = M["w"] - 2 * M["pad"]
    fwd = [e for e in doc.get("edge", []) if not e.get("back")]
    back = [e for e in doc.get("edge", []) if e.get("back")]
    out, y = [], 8.0
    prev = None

    def kicker(s_, with_note):
        ln_ = lanes[s_["lane"]]
        note_ = " · " + ln_["note"].split(" · ")[0].upper() if ln_.get("note") and with_note else ""
        return ln_["label"].upper() + note_

    def fits(with_note):
        return all(text_w(kicker(s_, with_note), "mono", M["kicker"]) + 16 + text_w(status_text(s_), "mono", M["mono"]) + 14
                   <= inner for s_ in order)

    # one status placement for the whole list (never mixed): on the kicker row
    # when every card has room — dropping the lane note from the kicker if
    # that is what makes room — else on its own row in every card
    with_note = fits(True)
    inline_all = with_note or fits(False)
    for s in order:
        c = LANE_COLORS[lanes[s["lane"]]["color"]]
        incoming = [e for e in fwd if e["to"] == s["id"]]
        if prev is not None:
            g = []
            x = M["x"] + 40
            direct = [e for e in incoming if e["from"] == prev["id"]]
            if direct:
                e = direct[0]
                g.append(f'<g data-edge="{esc(e["from"])}->{esc(e["to"])}"><path class="e" d="M{fmt(x)},{fmt(y)} V{fmt(y + M["gap"])}" '
                         f'stroke="{EDGE}" marker-end="url(#{sid}-a0)"/>')
                if e.get("label"):
                    if text_w(e["label"], "mono", M["mono"]) > M["W"] - x - 18:
                        raise FlowError(f"edge {by_id[e['from']]['n']}->{s['n']}: label too wide for the card list")
                    g.append(f'<text class="el" x="{fmt(x + 12)}" y="{fmt(y + M["gap"] / 2 + 4)}">{esc(e["label"])}</text>')
                g.append("</g>")
            for e in incoming:
                if e["from"] == (prev["id"] if direct else None):
                    continue
                note = f"↳ from {by_id[e['from']]['n']}" + (f" · {e['label']}" if e.get("label") else "")
                if text_w(note, "mono", M["mono"]) > M["W"] - x - 18:
                    raise FlowError(f"step {s['n']}: incoming note {note!r} too wide for the card list")
                g.append(f'<g data-edge="{esc(e["from"])}->{esc(e["to"])}"><path class="e" d="M{fmt(x)},{fmt(y + 6)} V{fmt(y + M["gap"] - 6)}" '
                         f'stroke="{EDGE}" stroke-dasharray="3 4"/>'
                         f'<text class="el" x="{fmt(x + 12)}" y="{fmt(y + M["gap"] / 2 + 4)}">{esc(note)}</text></g>')
            out += g
            y += M["gap"]
        top = y
        rows = []
        kick = kicker(s, with_note or not inline_all)
        stt = status_text(s)
        _, dot, hollow = STATUS[s["status"]]
        status_inline = inline_all
        cy = top + 22
        rows.append(f'<text x="{fmt(M["x"] + M["pad"])}" y="{fmt(cy)}" class="k" fill="{c}">{esc(kick)}</text>')

        def status_svg(yy, right_aligned):
            if right_aligned:
                tx = M["x"] + M["w"] - M["pad"]
                cx = tx - text_w(stt, "mono", M["mono"]) - 9
                anchor = ' text-anchor="end"'
            else:
                cx = M["x"] + M["pad"] + 4
                tx = cx + 9
                anchor = ""
            ring = (f'<circle cx="{fmt(cx)}" cy="{fmt(yy - 4)}" r="3.5" fill="none" stroke="{dot}" stroke-width="1.4"/>' if hollow
                    else f'<circle cx="{fmt(cx)}" cy="{fmt(yy - 4)}" r="3.5" fill="{dot}"/>')
            return ring + f'<text x="{fmt(tx)}" y="{fmt(yy)}"{anchor} class="s" fill="{dot}">{esc(stt)}</text>'

        if status_inline:
            rows.append(status_svg(cy, True))
        ty = top + 48
        bd, right = badge(s["n"], M["x"] + 29, ty - 5, c, "n", M["r"])
        if right + 10 + text_w(s["title"], "bold", M["title"]) > M["x"] + M["w"] - M["pad"]:
            raise FlowError(f"step {s['n']}: title too wide for the card list")
        rows.append(bd + f'<text x="{fmt(right + 10)}" y="{fmt(ty)}" class="t">{esc(s["title"])}</text>')
        lines = wrap(s["body"], "sans", M["body"], inner)
        if len(lines) > 2:
            raise FlowError(f"step {s['n']}: body needs {len(lines)} lines in the card list (max 2)")
        yy = ty + 6
        for line in lines:
            yy += M["body_lh"]
            rows.append(f'<text x="{fmt(M["x"] + M["pad"])}" y="{fmt(yy)}" class="d">{esc(line)}</text>')
        outs = [e for e in fwd if e["from"] == s["id"]]
        if len(outs) > 1:  # branch fork chips
            yy += 12
            cx, chips_y = M["x"] + M["pad"], yy
            for e in sorted(outs, key=lambda e_: sort_key(by_id[e_["to"]]["n"])):
                txt = f"→ {by_id[e['to']]['n']}" + (f" · {e['label']}" if e.get("label") else "")
                w = text_w(txt, "mono", M["mono"]) + 16
                if w > inner:
                    raise FlowError(f"step {s['n']}: fork chip {txt!r} too wide")
                if cx + w > M["x"] + M["pad"] + inner:
                    cx, chips_y = M["x"] + M["pad"], chips_y + 26
                rows.append(f'<rect x="{fmt(cx)}" y="{fmt(chips_y)}" width="{fmt(w)}" height="20" rx="10" fill="none" '
                            f'stroke="{TOKENS["line-2"]}"/><text x="{fmt(cx + 8)}" y="{fmt(chips_y + 14)}" class="el">{esc(txt)}</text>')
                cx += w + 6
            yy = chips_y + 20
        if s.get("tag"):
            tc = LANE_COLORS[s["tag"]["color"]]
            tw = text_w(s["tag"]["text"], "mono", M["mono"]) + 16
            yy += 10
            rows.append(f'<rect x="{fmt(M["x"] + M["pad"])}" y="{fmt(yy)}" width="{fmt(tw)}" height="20" rx="10" fill="{tc}" '
                        f'fill-opacity=".12" stroke="{tc}" stroke-opacity=".55"/><text x="{fmt(M["x"] + M["pad"] + 8)}" '
                        f'y="{fmt(yy + 14)}" class="s" fill="{tc}">{esc(s["tag"]["text"])}</text>')
            yy += 20
        if not status_inline:
            yy += 22
            rows.append(status_svg(yy, False))
        h = yy - top + 14
        out.append(f'<g data-step="{esc(s["id"])}" data-n="{esc(s["n"])}">'
                   f'<rect class="gf-cb" x="{fmt(M["x"])}" y="{fmt(top)}" width="{fmt(M["w"])}" height="{fmt(h)}" rx="12" '
                   f'fill="{TOKENS["surface"]}" stroke="{c}" stroke-opacity=".6"/>'
                   f'<rect x="{fmt(M["x"])}" y="{fmt(top + 12)}" width="4" height="{fmt(h - 24)}" rx="2" fill="{c}"/>'
                   + "".join(rows) + "</g>")
        y = top + h
        prev = s
    # back edges → dashed footer notes in the target lane colour
    for e in back:
        tc = LANE_COLORS[lanes[by_id[e["to"]]["lane"]]["color"]]
        txt = f"↺ from {by_id[e['from']]['n']} back to step {by_id[e['to']]['n']}" + (f" · {e['label']}" if e.get("label") else "")
        lines = wrap(txt, "mono", M["mono"], inner)
        if len(lines) > 3:
            raise FlowError(f"back edge {e['from']}->{e['to']}: note needs {len(lines)} lines (max 3)")
        y += 18
        h = 22 + 18 * len(lines)
        out.append(f'<g data-edge="{esc(e["from"])}->{esc(e["to"])}"><rect x="{fmt(M["x"])}" y="{fmt(y)}" width="{fmt(M["w"])}" '
                   f'height="{fmt(h)}" rx="12" fill="{tc}" fill-opacity=".08" stroke="{tc}" stroke-opacity=".5" stroke-dasharray="4 4"/>'
                   + "".join(f'<text x="{fmt(M["x"] + M["pad"])}" y="{fmt(y + 26 + i * 18)}" class="el" style="fill:{tc}">{esc(line)}</text>'
                             for i, line in enumerate(lines)) + "</g>")
        y += h
    H = y + 8
    style = (f"#{sid} .k{{font:600 {M['kicker']}px {MONO};letter-spacing:.04em}}"
             f"#{sid} .t{{font:700 {M['title']}px {SANS};fill:{TOKENS['text']}}}"
             f"#{sid} .d{{font:400 {M['body']}px {SANS};fill:{TOKENS['text-2']}}}"
             f"#{sid} .n{{font:700 {M['mono']}px {SANS};fill:{TOKENS['bg']}}}"
             f"#{sid} .s{{font:600 {M['mono']}px {MONO}}}"
             f"#{sid} .el{{font:500 {M['mono']}px {MONO};fill:{TOKENS['muted']}}}"
             f"#{sid} .e{{fill:none;stroke-width:1.6}}")
    parts = svg_open(sid, M["W"], H, doc["title"], gen_desc(doc), style, markers(sid, [EDGE]))
    parts.append(f'<rect width="{fmt(M["W"])}" height="{fmt(H)}" rx="14" fill="{TOKENS["bg-2"]}"/>')
    parts += out
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


# ── the walk (JSON for the walker + the no-JS <details> fallback) ──────────


def walk_edges(doc: dict, k: int) -> list:
    """Edges a walk step highlights: an explicit `edges` list, else the edges
    entering its steps from any step an EARLIER walk step visited, plus the
    back edges leaving its steps (the loop closing)."""
    w = doc["walk"][k]
    if "edges" in w:
        return list(w["edges"])
    seen = {s for prev in doc["walk"][:k] for s in prev["steps"]}
    cur = set(w["steps"])
    out = []
    for e in doc.get("edge", []):
        eid = f"{e['from']}->{e['to']}"
        if (e["to"] in cur and e["from"] in seen) or (e.get("back") and e["from"] in cur):
            out.append(eid)
    return out


def render_walk(doc: dict, site: Path) -> str:
    lanes = {ln["id"]: ln for ln in doc["lane"]}
    prov_cache = {}

    def payload(spec):
        p = site / spec["src"]
        body = p.read_text(encoding="utf-8")
        if p.parent not in prov_cache:
            pj = p.parent / "provenance.json"
            prov_cache[p.parent] = json.loads(pj.read_text(encoding="utf-8")) if pj.exists() else {}
        out = {"lang": spec["lang"], "src": spec["src"]}
        if spec.get("label"):
            out["label"] = spec["label"]
        frm = spec.get("from") or prov_cache[p.parent].get(p.name, {}).get("from")
        if frm:
            out["from"] = frm
        out["body"] = body.rstrip("\n")
        return out

    steps = {}
    for s in sorted(doc["step"], key=lambda s_: sort_key(s_["n"])):
        steps[s["id"]] = {"n": s["n"], "title": s["title"], "lane": s["lane"],
                          "color": LANE_COLORS[lanes[s["lane"]]["color"]]}
    walk = []
    for k, w in enumerate(doc["walk"]):
        row = {"title": w["title"], "text": w["text"], "steps": list(w["steps"]), "edges": walk_edges(doc, k),
               "illustrative": bool(w.get("illustrative", False))}
        for io in ("in", "out"):
            if w.get(io):
                row[io] = payload(w[io])
        walk.append(row)
    data = {
        "gfflow_walk": 1,
        "generated_by": "reflex-site scripts/render_flows.py",
        "file": doc["file"],
        "title": doc["title"],
        "accent": LANE_COLORS[doc.get("accent", doc["lane"][0]["color"])],
        "intro": doc.get("intro", "Press play to walk the flow one step at a time, or click a dot to jump."),
        "steps": steps,
        "edges": [{"id": f"{e['from']}->{e['to']}", "back": bool(e.get("back"))} for e in doc.get("edge", [])],
        "walk": walk,
    }
    return json.dumps(data, indent=1, ensure_ascii=False) + "\n"


def walk_static_html(doc: dict, walk_json: str) -> str:
    """The no-JS fallback: a <details> list of IN/OUT per walk step."""
    data = json.loads(walk_json)
    li = []
    for k, w in enumerate(data["walk"], 1):
        ns = " · ".join(data["steps"][s]["n"] for s in w["steps"])
        parts = [f'<li><p class="gf-walk-h"><b>{esc(ns)} · {esc(w["title"])}</b>'
                 + (' <span class="gf-walk-illu">○ illustrative · planned</span>' if w["illustrative"] else "") + "</p>",
                 f"<p>{esc(w['text'])}</p>"]
        for io in ("in", "out"):
            if io in w:
                spec = w[io]
                head = io.upper() + (f" · {spec['label']}" if spec.get("label") else "")
                parts.append(f'<p class="gf-walk-io">{esc(head)}</p><pre class="gf-code">{esc(spec["body"])}</pre>')
                if spec.get("from"):
                    parts.append(f'<p class="gf-walk-from">{esc(spec["from"])}</p>')
        li.append("".join(parts) + "</li>")
    return (f'<details class="gf-walk-static" data-walk-static="{esc(doc["file"])}">'
            f"<summary>Step by step: what goes in and what comes out</summary>\n"
            f'<ol class="gf-walk-list">\n' + "\n".join(li) + "\n</ol>\n</details>")


def page_files(site: Path) -> list:
    out = []
    for p in sorted(site.rglob("*.html")):
        rel = p.relative_to(site).parts
        if any(x.startswith(".") or x in ("node_modules", "out") for x in rel[:-1]):
            continue
        out.append(p)
    return out


def fill_pages(site: Path, file: str, snippet: str, write: bool) -> tuple:
    """Fill every `<!-- gfflow:walk FILE -->…<!-- /gfflow:walk -->` block.
    Returns (pages carrying the marker, pages whose block was stale)."""
    pat = re.compile(r"(<!-- gfflow:walk " + re.escape(file) + r" -->).*?(<!-- /gfflow:walk -->)", re.S)
    found, stale = [], []
    for p in page_files(site):
        text = p.read_text(encoding="utf-8")
        if not pat.search(text):
            continue
        found.append(p)
        new = pat.sub(lambda m: m.group(1) + "\n" + snippet + "\n" + m.group(2), text)
        if new != text:
            stale.append(p)
            if write:
                p.write_text(new, encoding="utf-8", newline="\n")
    return found, stale


def embed_findings(site: Path, name: str, svg: str) -> list:
    """An <img>/<source> naming this SVG must carry its true width/height."""
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
    w, h = m.group(1), m.group(2)
    out = []
    tag_re = re.compile(r'<(?:img|source)\b[^>]*?(?:src|srcset)="[^"]*/' + re.escape(name) + r'"[^>]*>', re.S)
    for p in page_files(site):
        for t in tag_re.findall(p.read_text(encoding="utf-8")):
            tw = re.search(r'\bwidth="([\d.]+)"', t)
            th = re.search(r'\bheight="([\d.]+)"', t)
            if tw and th and (tw.group(1), th.group(1)) != (w, h):
                out.append(f"{p.relative_to(site)}: <{re.match(r'<(\w+)', t).group(1)}> {name} is {tw.group(1)}×{th.group(1)}, the SVG is {w}×{h}")
    return out


def render_block(doc: dict, sid_base: str, site: Path | None) -> dict:
    """Validate + render one block → {filename: text}. Raises FlowError."""
    errs = validate(doc, site)
    if errs:
        raise FlowError("; ".join(errs))
    stem = doc["file"].removesuffix(".svg")
    out = {doc["file"]: render_desktop(doc, sid_base.replace("_", "-")),
           stem + "_m.svg": render_mobile(doc, (sid_base + "_m").replace("_", "-"))}
    if doc.get("walk"):
        out[stem + ".walk.json"] = render_walk(doc, site)
    return out


def gfflow_blocks(md: str) -> list:
    return [m.group(1) for m in GFFLOW_RE.finditer(md)]


# ── legacy mermaid path (deleted with the last migrated block, Plan 620 P3) ─

FONT_FAMILY = MONO
# Label size in SVG user units. The arena's figure min-width (assets/arena.css
# .lanefig) is derived from it so a label never renders below 11 px at 390 px.
FONT_SIZE_PX = 16
FLOWCHART = {"htmlLabels": True, "curve": "basis"}


def family_theme(accent: str) -> dict:
    return {
        "theme": "base",
        "themeVariables": {
            "background": "transparent",
            "primaryColor": TOKENS["surface-2"],
            "primaryBorderColor": accent,
            "primaryTextColor": TOKENS["text"],
            "secondaryColor": TOKENS["surface"],
            "tertiaryColor": TOKENS["surface"],
            "lineColor": TOKENS["muted"],
            "textColor": TOKENS["text"],
            "clusterBkg": TOKENS["surface"],
            "clusterBorder": TOKENS["line-2"],
            "edgeLabelBackground": TOKENS["bg-2"],
            "fontFamily": FONT_FAMILY,
            "fontSize": f"{FONT_SIZE_PX}px",
        },
        "flowchart": dict(FLOWCHART),
    }


def theme_for(palette: str) -> dict:
    if palette and palette.startswith("family:"):
        return family_theme(palette.split(":", 1)[1])
    raise SystemExit(f"unknown palette {palette!r}")


def blocks(md: str, headered_only: bool = False):
    """Yield (file, aria, code) for every ```mermaid block with a file header."""
    for m in re.finditer(r"```mermaid\n(.*?)```", md, re.S):
        code = m.group(1)
        f = re.search(r"^%% file:\s*(\S+)\s*$", code, re.M)
        a = re.search(r"^%% aria:\s*(.+?)\s*$", code, re.M)
        if headered_only and not f and not a:
            continue
        if not f or not a:
            raise SystemExit(f"block without %% file:/%% aria: header:\n{code[:200]}")
        body = "\n".join(l for l in code.splitlines() if not l.startswith("%%"))
        yield f.group(1), a.group(1), body


def render_mermaid(code: str, theme: dict) -> str:
    state = json.dumps({"code": code, "mermaid": theme}).encode("utf-8")
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
    sid = sid_name.removesuffix(".svg").replace("_", "-")
    m = re.search(r'<svg[^>]*\bid="([^"]+)"', svg)
    if not m:
        raise SystemExit(f"{sid_name}: rendered SVG has no root id")
    old = m.group(1)
    # rename EVERY occurrence: root id, `#id` selector scope, marker ids
    svg = svg.replace(old, sid)
    svg = re.sub(r"@import[^;]+;", "", svg)
    a = aria.replace("&", "&amp;").replace('"', "&quot;")
    svg = re.sub(r'\s(role|aria-label|aria-labelledby|aria-describedby)="[^"]*"', "", svg, count=0)
    svg = svg.replace("<svg ", f'<svg role="img" aria-label="{a}" ', 1)
    return svg


# ── self-test ──────────────────────────────────────────────────────────────

_ST_BASE = """
file = "t_flow.svg"; title = "Self-test flow"; accent = "rethink"
[[lane]]
id = "me"; label = "Your machine"; note = "private · free"; color = "reflex"
[[lane]]
id = "host"; label = "Our hosts"; note = "managed"; color = "rethink"
[[step]]
id = "ask"; n = "1"; lane = "me"; col = 0; title = "Ask"; body = "a question, typed"; status = "live"
[[step]]
id = "floor"; n = "2"; lane = "me"; col = 1; title = "Floor"; body = "answers, or says “not sure”"; status = "live"
[[step]]
id = "sure"; n = "3a"; lane = "me"; col = 2; title = "Answer"; body = "stays here"; status = "live"
[[step]]
id = "head"; n = "3b.1"; lane = "host"; col = 1; title = "Head"; body = "only not-sure cases"; status = "planned"; note = "API planned"
[[step]]
id = "meter"; n = "3b.2"; lane = "host"; col = 2; title = "Meter"; body = "metered"; status = "test network"
[[step]]
id = "check"; n = "4"; lane = "me"; col = 3; title = "Check"; body = "re-run it"; status = "testnet"
[[edge]]
from = "ask"; to = "floor"
[[edge]]
from = "floor"; to = "sure"; label = "sure"
[[edge]]
from = "floor"; to = "head"; label = "not sure"
[[edge]]
from = "head"; to = "meter"; label = "metered"
[[edge]]
from = "sure"; to = "check"
[[edge]]
from = "meter"; to = "check"
[[edge]]
from = "meter"; to = "head"; back = true; label = "loop"
[[walk]]
title = "Ask"; text = "You ask."; steps = ["ask"]
in = { lang = "json", src = "data/in.json", label = "POST /x" }
"""


def selftest() -> int:
    arms = []

    def arm(name, fn):
        try:
            fn()
        except AssertionError as e:
            raise SystemExit(f"self-test ✗ {name}: {e}") from e
        arms.append(name)

    with tempfile.TemporaryDirectory() as td:
        site = Path(td)
        (site / "data").mkdir()
        (site / "data/in.json").write_text('{"q": 1}\n', encoding="utf-8")

        def errs_of(src):
            return validate(load_flow(src), site)

        def refused(src, needle):
            e = errs_of(src)
            assert any(needle in x for x in e), f"want a finding containing {needle!r}, got {e}"

        def sub(old, new):
            assert old in _ST_BASE, old
            return _ST_BASE.replace(old, new, 1)

        arm("accept: branches 3a/3b.1, dotted 3b.2, merge at 4, back edge", lambda: _assert_eq(errs_of(_ST_BASE), []))
        arm("semicolon shorthand keeps `;` inside strings", lambda: _assert_eq(
            load_flow('a = "x; y"; b = 2\n'), {"a": "x; y", "b": 2}))
        arm("refuse: gap (1 → 3)", lambda: refused(sub('id = "floor"; n = "2"', 'id = "floor"; n = "9"'), "must land on"))
        arm("refuse: duplicate letter", lambda: refused(sub('id = "head"; n = "3b.1"', 'id = "head"; n = "3a"'), "duplicate step number"))
        arm("refuse: branch without letters", lambda: refused(
            sub('id = "sure"; n = "3a"', 'id = "sure"; n = "3"'), "without letters"))
        arm("accept: back edge is exempt from n → n+1", lambda: _assert_eq(
            [x for x in errs_of(_ST_BASE) if "meter" in x or "loop" in x], []))
        arm("refuse: back edge to a LATER step", lambda: refused(
            sub('from = "meter"; to = "head"; back = true', 'from = "ask"; to = "check"; back = true'), "EARLIER"))
        arm("refuse: dotted branch gap (3b.1 → 3b.3)", lambda: refused(
            sub('id = "meter"; n = "3b.2"', 'id = "meter"; n = "3b.3"'), "3b.1 … 3b.K"))
        arm("refuse: merge into a lettered step", lambda: refused(
            sub('id = "check"; n = "4"', 'id = "check"; n = "4a"'), "merges"))
        arm("refuse: unknown status", lambda: refused(sub('status = "testnet"', 'status = "beta"'), "unknown status"))
        arm("refuse: unknown lane colour", lambda: refused(sub('color = "rethink"', 'color = "purple"'), "unknown lane colour"))
        arm("refuse: missing walk IN file", lambda: refused(sub('src = "data/in.json"', 'src = "data/nope.json"'), "file missing"))

        def body3():
            long = "word " * 40
            doc = load_flow(sub('body = "stays here"', f'body = "{long.strip()}"'))
            try:
                render_block(doc, "t_flow", site)
            except FlowError as e:
                assert "max 2" in str(e), e
                return
            raise AssertionError("a 3-line body rendered")
        arm("refuse: a body needing 3 lines", body3)

        def determinism():
            a = render_block(load_flow(_ST_BASE), "t_flow", site)
            b = render_block(load_flow(_ST_BASE), "t_flow", site)
            assert a == b, "two renders differ"
            assert set(a) == {"t_flow.svg", "t_flow_m.svg", "t_flow.walk.json"}, sorted(a)
            for k, v in a.items():
                if k.endswith(".svg"):
                    assert 'data-gfflow="1"' in v and 'role="img"' in v and "<title" in v and "<desc" in v, k
                    assert 'data-step="floor"' in v, k
            assert 'data-edge="floor->head"' in a["t_flow.svg"]
            w = json.loads(a["t_flow.walk.json"])
            assert w["walk"][0]["in"]["body"] == '{"q": 1}', w["walk"][0]
        arm("byte determinism + root attrs + walker hooks", determinism)

        def mobile_floor():
            svg = render_block(load_flow(_ST_BASE), "t_flow", site)["t_flow_m.svg"]
            assert 'viewBox="0 0 340 ' in svg, "card list not laid out at 340 units"
            sizes = [float(x) for x in re.findall(r"font:\d+ ([\d.]+)px", svg)]
            sizes += [float(x) for x in re.findall(r'font-size="([\d.]+)"', svg)]
            assert sizes and min(sizes) >= M["min_font"], f"label sizes {sorted(set(sizes))}"
        arm("_m.svg: no text below 11 units at 340 wide", mobile_floor)

        def fallback():
            doc = load_flow(_ST_BASE)
            out = render_block(doc, "t_flow", site)
            html_ = walk_static_html(doc, out["t_flow.walk.json"])
            page = site / "index.html"
            page.write_text("<p>\n<!-- gfflow:walk t_flow.svg -->\nOLD\n<!-- /gfflow:walk -->\n</p>\n", encoding="utf-8")
            found, stale = fill_pages(site, "t_flow.svg", html_, write=False)
            assert found == [page] and stale == [page], (found, stale)
            fill_pages(site, "t_flow.svg", html_, write=True)
            assert fill_pages(site, "t_flow.svg", html_, write=False)[1] == [], "refill not idempotent"
            assert "<pre class=\"gf-code\">{&quot;q&quot;: 1}</pre>" in page.read_text(encoding="utf-8")
        arm("no-JS fallback fills + detects a stale page", fallback)

        def tokens():
            css = site / "family.css"
            css.write_text("".join(f"--{k}:{v};" for k, v in TOKENS.items()), encoding="utf-8")
            assert family_css_findings(css) == []
            css.write_text(css.read_text(encoding="utf-8").replace(TOKENS["ok"], "#000000"), encoding="utf-8")
            assert family_css_findings(css), "a drifted token read clean"
        arm("token table cross-read (both directions)", tokens)
    print(f"self-test PASS ({len(arms)} arms: " + " · ".join(arms) + ")")
    return 0


def _assert_eq(a, b):
    assert a == b, f"{a!r} != {b!r}"


# ── main ───────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--only", metavar="S", help="only sources whose doc path or checkout name contains S")
    args = ap.parse_args()
    if args.self_test:
        return selftest()
    if args.check:
        selftest()
    bad = 0
    picked = 0
    sites_checked = set()
    for src in SOURCES:
        root = src.root()
        if args.only and args.only not in src.rel and args.only not in root.name:
            continue
        picked += 1
        if not (root / "Cargo.toml").exists():
            print(f"SKIP (loud): {root.name} checkout absent - {src.rel} UNCHECKED this run")
            continue
        doc = root / src.rel
        if not doc.exists():
            print(f"✗ source missing: {doc}")
            bad += 1
            continue
        site = src.site()
        assets = site / "assets"
        md = doc.read_text(encoding="utf-8")
        mer = list(blocks(md, src.headered_only))
        gff = gfflow_blocks(md)
        if not mer and not gff:
            print(f"✗ {doc} has zero flow blocks — nothing rendered is not a pass")
            bad += 1
            continue
        if args.check and gff and site not in sites_checked:
            sites_checked.add(site)
            for f in family_css_findings(site / ("assets/family.css" if (site / "assets/family.css").exists() else "family.css")):
                print(f"✗ {f}")
                bad += 1
        for body in gff:
            try:
                flow = load_flow(body)
                name = flow.get("file", "?")
                site_name = src.rename.get(name, name)
                out = render_block(flow, site_name.removesuffix(".svg"), site)
            except FlowError as e:
                print(f"✗ {src.rel}: gfflow block refused — {e}")
                bad += 1
                continue
            snippet = walk_static_html(flow, out[next(k for k in out if k.endswith(".walk.json"))]) if flow.get("walk") else None
            for fname, text in out.items():
                sname = src.rename.get(fname, fname)
                a, b = doc.parent / fname, assets / sname
                data = text.encode("utf-8")
                if args.check:
                    for p in (a, b):
                        if not p.exists():
                            print(f"✗ {p} missing — re-render")
                            bad += 1
                        elif p.read_bytes() != data:
                            print(f"✗ {p} differs from a fresh render — re-render")
                            bad += 1
                    if fname.endswith(".svg"):
                        for f in embed_findings(site, sname, text):
                            print(f"✗ {f}")
                            bad += 1
                    if a.exists() and b.exists() and a.read_bytes() == data == b.read_bytes():
                        print(f"✓ {fname} -> {site.name}/assets/{sname} ({len(data)} B, fresh)")
                else:
                    for p in (a, b):
                        p.parent.mkdir(parents=True, exist_ok=True)
                        p.write_bytes(data)
                    print(f"✓ rendered {fname} -> {site.name}/assets/{sname} ({len(data)} B) → both mirrors")
            if snippet is not None:
                found, stale = fill_pages(site, flow["file"], snippet, write=not args.check)
                if not found:
                    print(f"✗ {flow['file']}: the walk has no no-JS fallback — add <!-- gfflow:walk {flow['file']} --> to a page in {site}")
                    bad += 1
                elif args.check and stale:
                    for p in stale:
                        print(f"✗ {p.relative_to(site)}: stale walk fallback for {flow['file']} — re-render")
                        bad += 1
                elif stale:
                    for p in stale:
                        print(f"✓ filled the walk fallback in {p.relative_to(site)}")
        for file, aria, code in mer:
            site_name = src.rename.get(file, file)
            a, b = doc.parent / file, assets / site_name
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
            svg = postprocess(render_mermaid(code, theme_for(src.palette)), site_name, aria)
            for dst in (a, b):
                dst.write_text(svg, encoding="utf-8", newline="\n")
            print(f"✓ rendered {file} -> assets/{site_name} ({len(svg)} B) → both mirrors")
            time.sleep(3)  # politeness: mermaid.ink 503s on a back-to-back burst
    if args.only and not picked:
        print(f"✗ --only {args.only!r} matched no source")
        bad += 1
    if args.check:
        print(("✗ " if bad else "✓ ") + (f"{bad} figure problem(s)" if bad else "all figures in sync"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
