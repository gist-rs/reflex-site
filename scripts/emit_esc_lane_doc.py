#!/usr/bin/env python3
"""Emit the rethink ESC-composed lane doc (the encoder/Rethink lane cells for
massive_intent_en + banking77) in publish_bench.py's exact extra-doc merge
shape, from the arming fits' results.json (the armed rho rows).

The cells are the SERVING posture (the ESC-composed arm = the production
cheap H2 + the selective mammoth-1 think tier, as served by the rethink
serve since the 2026-11-07 arming). They carry NO timing fields: the fits
measured accuracy only (the think leg's latency was not re-measured in-run;
the posture figure lives in the arming record). The suite rows carry
`test_digest` = the seat population pin, byte-matching the served pins —
no population reset is involved.

Id-free copy law: every string this emits must survive the publisher's
COPY_ID_RE gate (no Plan/Proposal/Issue/Bench + digits patterns, no
"seal" word) — the gate refuses otherwise.

Usage:
    emit_esc_lane_doc.py <massive-results.json> <banking77-results.json> <out.json>
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

MASSIVE_RHO = 0.60
BANKING_RHO = 0.45

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


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    massive = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    banking = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    out_path = Path(sys.argv[3])

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    cells = []
    for results, rho, suite, n in (
        (massive, MASSIVE_RHO, "massive_intent_en", 300),
        (banking, BANKING_RHO, "banking77", 500),
    ):
        r = armed_row(results, rho)
        th = r["thresholds"]
        comp = r["composed_acc"]
        cheap = r["cheap_acc"]
        delta = r["delta"]
        lb95 = r["lb95"]
        cal = r["cal_rate"]
        test_rate = r["test_rate"]
        ft = results["full_teacher"]
        if suite == "massive_intent_en":
            rho_disp = "0.60"
            shadow = (
                "paraphrase shadow read CLEAN: the gain is robust on an "
                "independent paraphrase slice (composed +12.0pp, LB95 "
                "+8.1pp; the teacher's own retention there is within "
                "noise), the 2026-11-07 shadow record"
            )
        else:
            rho_disp = "0.45"
            shadow = (
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
        cell = {
            "lane": "Rethink",
            "model": "ESC-composed H2+mammoth-1",
            "hard": {
                "n": r["cheap_acc"] and results["n_questions"],
                "accuracy": comp,
            },
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
                "git_sha": "486e277",
                "date_utc": "2026-11-07T11:29:28Z",
            },
        }
        cells.append((suite, n, results["test_digest"], cell))

    doc = {
        "meta": {
            "host": "m3",
            "git_sha": "486e277",
            "date_utc": now,
            "profile": "release",
            "laya_feature": True,
            "lane_note": (
                "rethink ESC-composed lane doc (emitted by "
                "scripts/emit_esc_lane_doc.py from the arming fits' "
                "results.json, the 2026-11-07 arming): what the rethink "
                "serve answers on these suites since the ESC arms armed "
                "- the production cheap H2 tier with the selective "
                "mammoth-1 think tier behind the calibrated escalation "
                "gate. Accuracy-only cells (no in-run timing). These "
                "cells supersede the derived tier-fallback cells (the "
                "instinct H2 arm answering); the refused encoder-head "
                "records they carried ride in the publish history."
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
        print(f"  {suite}: composed {c['composed_acc']:.4f} vs cheap "
              f"{c['cheap_acc']:.4f} (delta {c['delta']:+.4f}, LB95 "
              f"{c['paired_lb95']:+.4f}) digest {digest}")


if __name__ == "__main__":
    main()
