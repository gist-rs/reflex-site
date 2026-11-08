#!/usr/bin/env python3
"""Emit the rethink ESC-composed lane doc (the encoder/Rethink lane cells for
the armed suites) in publish_bench.py's exact extra-doc merge shape, from the
arming fits' results.json (the armed rho rows).

The cells are the SERVING posture (the ESC-composed arm = the production
cheap H2 + the selective mammoth-1 think tier, as served by the rethink
serve since the 2026-11-07 arming - extended by the 2026-11-08 JDI arms).
They carry NO timing fields: the fits measured accuracy only (the think
leg's latency was not re-measured in-run; the posture figure lives in the
arming record). The suite rows carry `test_digest` = the seat population
pin, byte-matching the served pins - no population reset is involved.

Id-free copy law: every string this emits must survive the publisher's
COPY_ID_RE gate (no Plan/Proposal/Issue/Bench + digits patterns, no
"seal" word) - the gate refuses otherwise.

Rows (the 2026-11-08 generalization - the two founding suites ride the
built-in posture text, every further suite is row-driven):

    emit_esc_lane_doc.py --out <out.json> \
        --row suite=massive_intent_en,results=<r.json>,rho=0.60,n=300 \
        --row suite=banking77,results=<r.json>,rho=0.45,n=500,macro_f1=<f> \
        --row suite=winogrande_jdi,results=<r.json>,rho=0.45,n=1267 \
        [--meta-sha <hex>] [--meta-date <iso8601>]

Per-row keys: suite (required) - results (required, the fit's results.json)
- rho (required, the ARMED row) - n (required, the test-slice case count)
- sha / date (optional source_run override; default = the 2026-11-07 arm)
- macro_f1 (optional; only from a GOLD-BEARING record - the hard block
  carries it beside accuracy so the board's macro-F1 benchmarks fold;
  no gold-bearing record = omit the field, the downstream fold answers
  awaiting-metric honestly)
- caveat (optional override of the per-suite shadow/gate prose; the two
  founding suites carry their measured shadow verdicts, further suites
  default to the contamination caveat - public-training unverified -
  which is the HONEST default until a shadow read covers them).

The legacy 2-results positional form still works byte-compatibly:
    emit_esc_lane_doc.py <massive-results.json> <banking77-results.json> <out.json>
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

MASSIVE_RHO = 0.60
BANKING_RHO = 0.45
DEFAULT_SHA = "486e277"
DEFAULT_DATE = "2026-11-07T11:29:28Z"

COPY_ID_RE = re.compile(r"\b(?:Plan|Proposal|Issue|Bench)\s+\d+\b", re.IGNORECASE)
COPY_SEAL_RE = re.compile(r"\bseal(?:ed|s|ing)?\b", re.IGNORECASE)


def check_clean(obj, path=""):
    bad = []

    def walk(o, p):
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, f"{p}.{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f"{p}[{i}]")
        elif isinstance(o, str):
            if COPY_ID_RE.search(o):
                bad.append(f"{p}: id pattern in {o!r}")
            if COPY_SEAL_RE.search(o):
                bad.append(f"{p}: banned word in {o!r}")
    walk(obj, path)
    return bad


def armed_row(results, rho):
    for r in results["runs"]:
        if abs(r["rho"] - rho) < 1e-9:
            return r
    raise SystemExit(f"no armed rho {rho} row in the results")


def shadow_prose(suite):
    """The measured shadow-read verdicts for the two founding arms; every
    further suite defaults to the contamination caveat (public-training
    unverified) - the honest posture until a shadow read covers it."""
    if suite == "massive_intent_en":
        return (
            "paraphrase shadow read CLEAN: the gain is robust on an "
            "independent paraphrase slice (composed +12.0pp, LB95 "
            "+8.1pp; the teacher's own retention there is within "
            "noise), the 2026-11-07 shadow record"
        )
    if suite == "banking77":
        return (
            "paraphrase shadow read MIXED: the teacher's own accuracy "
            "drops 10.2pp on paraphrases (significant, "
            "contamination-consistent but confounded with a benign "
            "formal-style shift over 77 fine intents) while the "
            "composed advantage still grew (+29.2pp); the armed rate "
            "axis transferred out-of-window on that surface (86.8% "
            "escalation, where the production rate guard latches the "
            "cheap-only demotion), so the benchmark-conditioned "
            "caveat stays, 2026-11-07 shadow record"
        )
    return (
        f"contamination caveat: no shadow read covers this arm yet - "
        f"public {suite} mammoth-training unverified, the gain is "
        "benchmark-conditioned until an independent paraphrase or "
        "real-traffic read says otherwise"
    )


def parse_row(spec):
    row = {}
    for field in spec.split(","):
        if "=" not in field:
            raise SystemExit(f"--row field {field!r} is not k=v")
        k, v = field.split("=", 1)
        row[k.strip()] = v.strip()
    for req in ("suite", "results", "rho", "n"):
        if not row.get(req):
            raise SystemExit(f"--row missing required {req!r}: {spec}")
    return row


def build_cell(row, results):
    rho = float(row["rho"])
    suite = row["suite"]
    r = armed_row(results, rho)
    th = r["thresholds"]
    comp = r["composed_acc"]
    cheap = r["cheap_acc"]
    delta = r["delta"]
    lb95 = r["lb95"]
    cal = r["cal_rate"]
    test_rate = r["test_rate"]
    ft = results["full_teacher"]
    rho_disp = f"{rho:.2f}"
    shadow = row.get("caveat") or shadow_prose(suite)
    gate = (
        f"composed {comp:.4f} vs cheap {cheap:.4f} (paired delta "
        f"{delta:+.4f}, LB95 {lb95:+.4f}) at escalation rate "
        f"{test_rate * 100:.1f}% (cal {cal * 100:.1f}%, the armed "
        f"rho {rho_disp} fit, thresholds score {th['score']:.3f} / "
        f"dist {th['distance']:.3f}); full-teacher context "
        f"{ft['acc']:.4f}; escalation answers pay the think tier's "
        "latency (the teacher's local posture, p50 1.4-6.5 s/case) "
        "while the cheap tier answers in microseconds; accuracy-only "
        "cells (the composition latency was not re-measured in-run); "
        f"the {suite} gain reads on the SAME population as every "
        "other lane on this row; " + shadow
    )
    hard = {
        "n": r["cheap_acc"] and results["n_questions"],
        "accuracy": comp,
    }
    mf1 = row.get("macro_f1")
    if mf1 is not None:
        # GOLD-BEARING ONLY: the caller supplies macro-F1 from a record
        # whose test slice carries gold (the board scores some suites by
        # macro-F1; an invented value would be a confident wrong cell).
        hard["macro_f1"] = float(mf1)
    cell = {
        "lane": "Rethink",
        "model": "ESC-composed H2+mammoth-1",
        "hard": hard,
        "serves": f"ESC-composed (rho {rho_disp})",
        "gate": gate,
        "esc": {
            "rho": rho,
            "thresholds": th,
            "cal_rate": cal,
            "test_rate": test_rate,
            "cheap_acc": cheap,
            "composed_acc": comp,
            "delta": delta,
            "paired_lb95": lb95,
            "full_teacher_acc": ft["acc"],
        },
        "source_run": {
            "git_sha": row.get("sha") or DEFAULT_SHA,
            "date_utc": row.get("date") or DEFAULT_DATE,
        },
    }
    return suite, int(row["n"]), results["test_digest"], cell


def main():
    args = sys.argv[1:]
    out_path = None
    meta_sha = None
    meta_date = None
    rows = []
    if args and not args[0].startswith("--"):
        # legacy positional form: <massive-results> <banking-results> <out>
        if len(args) != 3:
            raise SystemExit(__doc__)
        rows = [
            {"suite": "massive_intent_en", "results": args[0], "rho": MASSIVE_RHO, "n": 300},
            {"suite": "banking77", "results": args[1], "rho": BANKING_RHO, "n": 500},
        ]
        out_path = Path(args[2])
    else:
        i = 0
        while i < len(args):
            a = args[i]
            if a == "--out":
                out_path = Path(args[i + 1])
                i += 2
            elif a == "--meta-sha":
                meta_sha = args[i + 1]
                i += 2
            elif a == "--meta-date":
                meta_date = args[i + 1]
                i += 2
            elif a == "--row":
                rows.append(parse_row(args[i + 1]))
                i += 2
            else:
                raise SystemExit(f"unknown arg {a!r}")
    if out_path is None:
        raise SystemExit("--out is required")
    if not rows:
        raise SystemExit("no --row rows given")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    cells = []
    for row in rows:
        results = json.loads(Path(row["results"]).read_text(encoding="utf-8"))
        cells.append(build_cell(row, results))

    doc = {
        "meta": {
            "host": "m3",
            "git_sha": meta_sha or DEFAULT_SHA,
            "date_utc": meta_date or now,
            "profile": "release",
            "laya_feature": True,
            "lane_note": (
                "rethink ESC-composed lane doc (emitted by "
                "scripts/emit_esc_lane_doc.py from the arming fits' "
                "results.json - the 2026-11-07 arming and the 2026-11-08 "
                "JDI arms): what the rethink serve answers on these "
                "suites since the ESC arms armed - the production cheap "
                "H2 tier with the selective mammoth-1 think tier behind "
                "the calibrated escalation gate. Accuracy-only cells (no "
                "in-run timing). These cells supersede the derived "
                "tier-fallback cells (the instinct H2 arm answering); "
                "the refused encoder-head records they carried ride in "
                "the publish history."
            ),
        },
        "suites": [
            {
                "name": suite,
                "n_questions": n,
                "n_cases": n,
                "test_digest": digest,
                "encoder": cell,
            }
            for (suite, n, digest, cell) in cells
        ],
    }

    bad = check_clean(doc)
    if bad:
        for b in bad:
            print(f"REFUSE (copy law): {b}", file=sys.stderr)
        sys.exit(2)

    out_path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    print(f"wrote {out_path}")
    for (suite, n, digest, cell) in cells:
        c = cell["esc"]
        mf1 = cell["hard"].get("macro_f1")
        mf1_s = f" - macro_f1 {mf1:.4f}" if mf1 is not None else ""
        print(f"  {suite}: composed {c['composed_acc']:.4f} vs cheap "
              f"{c['cheap_acc']:.4f} (delta {c['delta']:+.4f}, LB95 "
              f"{c['paired_lb95']:+.4f}){mf1_s} digest {digest}")


if __name__ == "__main__":
    main()
