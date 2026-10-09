#!/usr/bin/env python3
"""Derive the reflex-site flow walks' step-through payloads from CAPTURED bytes.

Plan 620 Group R (riir-ai `.plans/620_gf_flow_figures.md`; family design guide
§8.4): every walk step's IN / OUT is a real recorded request/response — a
file written by an instrument, never typed (the §5 numbers law applied to
payloads). This script copy-derives those files from the site's captures:

  data/wire.json          the INSTALLED reflex release binary's verbatim
                          wire (scripts/capture_wire.mjs; answered /
                          abstained / off_corpus / corpus_answered /
                          corpus_off / healthz / feedback cases)
  arena/demo_oracle.json  the arena's recorded games — the rulebook
                          recorder's tetris walk (the Reflexer branch of the
                          relation figure; recorded by the katgpt-rs site
                          walk example, seed stream, replay-verified by
                          scripts/rulebook_walk.mjs)

into data/flows/<figure>/NN_{in,out}.json + a provenance.json per dir (the
renderer prints each payload's provenance line under it in the walk).

The only transform is pretty-printing the JSON for reading; every number
keeps its source text (parsed as a raw token, never through a float). The
Reflexer game-turn payloads repackage the RECORDED record's own fields
(state sentence, piece, board rows, the argmax pick, the per-option wall
time) — no value is invented.

Steps whose surface is not live yet (the hosted Rethink head, the
storefront) reuse a captured PUBLIC request shape and are marked
`illustrative = true` in the owning gfflow block — nothing here invents a
hosted reply or anything behind the public wire (the moat law).

rethink_flow renders on TWO fronts (reflex-site /resources + the rethink
storefront's #how), and a walk payload `src` resolves against EACH site
root — so this script writes the same bytes to BOTH
data/flows/rethink_flow/ dirs.

Usage (from reflex-site):
    python3 scripts/build_flow_walks.py           # write the files
    python3 scripts/build_flow_walks.py --check   # exit 1 if any is stale

Then re-render: python3 scripts/render_flows.py (writes the walk JSON +
the no-JS fallbacks from these payloads).
"""

import argparse
import json
import os
import sys
from pathlib import Path


# Keep this instrument's verdict printable on a non-UTF-8 console
# (katgpt-rs Issue 804 / the 928 drift census): it prints non-ASCII glyphs,
# and print() raises UnicodeEncodeError on e.g. cp874 — the process then dies
# with NO verdict. backslashreplace degrades the glyph visibly and keeps
# ASCII exact, so a verdict line stays greppable. Best-effort: a detached or
# captured stream is left alone rather than made fatal at import.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="backslashreplace")
    except (AttributeError, ValueError):
        pass

SITE = Path(__file__).resolve().parent.parent
RETHINK_SITE = Path(os.environ.get("RETHINK_CHECKOUT", SITE.parent / "riir-rethink")).resolve() / "site"

# (output file, wire case, field) — the wire-derived payloads, per figure
WIRE_PLANS = {
    "decision_flow": (
        ("01_in.json", "answered", "request"),
        ("05a_out.json", "answered", "response"),
        ("05b_in.json", "off_corpus", "request"),
        ("05b_out.json", "off_corpus", "response"),
        ("06_in.json", "feedback", "request"),
        ("06_out.json", "feedback", "response"),
    ),
    "instinct_flow": (
        ("01_in.json", "answered", "request"),
        ("02_in.json", "abstained", "request"),
        ("02_out.json", "abstained", "response"),
        ("03a_out.json", "answered", "response"),
        ("04_in.json", "abstained", "request"),
    ),
    "reflex_dev_flow": (
        ("04_out.json", "healthz", "response"),
        ("05_in.json", "corpus_answered", "request"),
        ("05_out.json", "corpus_answered", "response"),
    ),
    "rethink_dev_flow": (
        ("05_in.json", "abstained", "request"),
    ),
    "jev_vs_reflex_flow": (
        ("01_in.json", "abstained", "request"),
        ("03b_in.json", "answered", "request"),
        ("03b_out.json", "answered", "response"),
        ("03c_in.json", "abstained", "request"),
        ("03c_out.json", "abstained", "response"),
        ("04b_in.json", "abstained", "request"),
    ),
    "rethink_flow": (
        ("01_in.json", "answered", "request"),
        ("02_in.json", "abstained", "request"),
        ("02_out.json", "abstained", "response"),
        ("03a_out.json", "answered", "response"),
        ("03b2_in.json", "abstained", "request"),
    ),
    "reflexer_relation_flow": (
        ("01_in.json", "answered", "request"),
        ("03a_out.json", "answered", "response"),
        ("04_out.json", "answered", "response"),
    ),
}


class Num(str):
    """A JSON number kept as its source text."""


def dump(v, ind=0) -> str:
    pad, pad1 = "  " * ind, "  " * (ind + 1)
    if isinstance(v, Num):
        return str(v)
    if isinstance(v, dict):
        if not v:
            return "{}"
        return "{\n" + ",\n".join(f"{pad1}{json.dumps(k, ensure_ascii=False)}: {dump(x, ind + 1)}" for k, x in v.items()) + f"\n{pad}}}"
    if isinstance(v, list):
        if not v:
            return "[]"
        if all(isinstance(x, Num) for x in v):
            return "[" + ", ".join(map(str, v)) + "]"
        return "[\n" + ",\n".join(f"{pad1}{dump(x, ind + 1)}" for x in v) + f"\n{pad}]"
    return json.dumps(v, ensure_ascii=False)


def pretty(raw: str) -> str:
    return dump(json.loads(raw, parse_float=Num, parse_int=Num)) + "\n"


def build() -> dict:
    """{relative path: text} for every payload file this script owns."""
    wp = SITE / "data" / "wire.json"
    wire = json.loads(wp.read_text(encoding="utf-8"))
    meta = wire["_meta"]
    out: dict[str, str] = {}

    for fig, plan in WIRE_PLANS.items():
        files, prov = {}, {}
        for name, case, field in plan:
            c = wire["cases"][case]
            files[name] = pretty(c[field])
            prov[name] = {
                "from": f"captured from the {meta['engine']} release binary, {meta['captured']} · {c['method']} {c['path']} ({case} {field})",
                "source": "reflex-site data/wire.json",
                "case": case,
                "field": field,
                "engine": meta["engine"],
                "captured": meta["captured"],
            }
        for name, text in files.items():
            out[f"data/flows/{fig}/{name}"] = text
        out[f"data/flows/{fig}/provenance.json"] = json.dumps(prov, indent=1, ensure_ascii=False) + "\n"

    # the Reflexer game-turn payloads: the arena's recorded rulebook walk
    # (replay-verified by scripts/rulebook_walk.mjs) — the record's own
    # fields repackaged, nothing invented.
    oracle = json.loads((SITE / "arena" / "demo_oracle.json").read_text(encoding="utf-8"))
    rb = oracle["_meta"]["sources"]["tetris_rulebook"]
    rec = oracle["tetris_rulebook_walk"][0]
    sentence, _ps, piece, rows, pick, ms = rec
    fig = "reflexer_relation_flow"
    turn_in = {"state_sentence": sentence, "piece": piece, "board": rows}
    pick_out = {"state_sentence": sentence, "piece": piece, "pick": pick, "per_option_ms": ms}
    rb_prov = {
        "02b_in.json": {
            "from": "recorded rulebook game — the arena's replay-verified walk (recorded by the katgpt-rs site-walk example; turn 1)",
            "source": "reflex-site arena/demo_oracle.json",
            "key": "tetris_rulebook_walk[0]",
            "recorder": rb["recorder"],
        },
        "03b_out.json": {
            "from": f"recorded rulebook game — the searched pick (argmax over the rulebook's option scores; turn 1, piece {piece})",
            "source": "reflex-site arena/demo_oracle.json",
            "key": "tetris_rulebook_walk[0]",
            "recorder": rb["recorder"],
        },
    }
    out[f"data/flows/{fig}/02b_in.json"] = dump(turn_in) + "\n"
    out[f"data/flows/{fig}/03b_out.json"] = dump(pick_out) + "\n"
    prov_path = f"data/flows/{fig}/provenance.json"
    prov = json.loads(out[prov_path])
    prov.update(rb_prov)
    out[prov_path] = json.dumps(prov, indent=1, ensure_ascii=False) + "\n"
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if not (SITE / "data" / "wire.json").exists():
        print("SKIP (loud): data/wire.json absent — the flow walk payloads are UNCHECKED this run")
        return 0
    files = build()
    # rethink_flow serves on BOTH fronts: same bytes under the rethink site
    roots = [SITE]
    if RETHINK_SITE.exists():
        roots.append(RETHINK_SITE)
    elif not args.check:
        print(f"SKIP (loud): {RETHINK_SITE} absent — the rethink-site payload copy is UNWRITTEN this run")
    bad = 0
    for root in roots:
        for rel, text in files.items():
            if "rethink_flow" not in rel and root is not SITE:
                continue  # only the two-front figure cross-copies
            p = root / rel
            if args.check:
                if not p.exists() or p.read_text(encoding="utf-8") != text:
                    print(f"✗ {p} is stale — run scripts/build_flow_walks.py")
                    bad += 1
                continue
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8", newline="\n")
            print(f"✓ wrote {p.relative_to(root) if root is SITE else p} ({len(text.encode())} B)")
    if args.check:
        print("✗ flow walk payloads stale" if bad else f"✓ flow walk payloads match the captures ({len(files)} files)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
