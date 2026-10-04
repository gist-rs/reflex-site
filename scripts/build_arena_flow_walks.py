#!/usr/bin/env python3
"""Derive the Tetris lane figures' step-through payloads from RECORDED walks.

The /arena "how each lane picks a spot" figures (katgpt-rs
`.docs/06_game_arenas/tetris_lane_flows.md`, rendered by render_flows.py)
walk with IN/OUT payloads — and payloads are captured, never typed (the
family design guide §8.4: the §5 numbers law applied to payloads; riir-ai
Plan 620 Group A). The capture is `arena/demo_oracle.json`: the four lane
games recorded by scripts/record_demo_walks.mjs / katgpt-rs
examples/tetris_09_site_walk.rs, each row

    [state sentence, ps per spot (null = abstain), piece, board rows,
     pick, ms per spot]

plus `_meta.sources.<lane>` provenance (recorder, seed, grammar, summary).

This script copy-derives the payload files under data/flows/tetris_*/ and
records where each came from in provenance.json (the renderer prints that
line under the payload in the walk).

What derives from what (never typed):
  sentence lanes (laya / modelless / raw) — the OPENING turn of each
      lane's recorded game: every lane plays the same seed-607 stream, so
      turn 0 is the same board, the same piece, the same sentence — and
      three different picks. That comparison is the teaching payload.
  rulebook — the recorded turn with the biggest clear (the same turn
      assets/flow_walk_tetris.js replays its board panel from, so the
      payload and the board beside it are the same position), plus the
      replay-derived lines/score at that turn.
  modes — the same four recorded positions the board panel shows
      (build / downstack / survive / recovery), with the trigger facts
      (covered holes, stack height) counted off those boards and the
      thresholds read off the champion's recorded genome string.

The board replay is a minimal Python port of the placement core in
assets/games/tetris.js (shapes, rotations, FROM_TOP hard drop, place,
clear) — and it is NEVER trusted: every run re-asserts, turn by turn, that
replaying each recorded pick reproduces the NEXT turn's recorded board
(the same chain check scripts/rulebook_walk.mjs runs in JS). If the port
and the site's enumeration ever disagree, this script fails loudly
instead of deriving payloads from a wrong replay.

Usage (from reflex-site):
    python3 scripts/build_arena_flow_walks.py          # write the files
    python3 scripts/build_arena_flow_walks.py --check  # exit 1 if stale
"""

import argparse
import json
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
ORACLE = SITE / "arena" / "demo_oracle.json"
OUT_ROOT = SITE / "data" / "flows"

WIDTH, HEIGHT = 10, 20

# assets/games/tetris.js BASE — the canonical shapes (dy, dx), top-left box
BASE = {
    "I": [(1, 0), (1, 1), (1, 2), (1, 3)],
    "O": [(0, 1), (0, 2), (1, 1), (1, 2)],
    "T": [(0, 1), (1, 0), (1, 1), (1, 2)],
    "S": [(0, 1), (0, 2), (1, 0), (1, 1)],
    "Z": [(0, 0), (0, 1), (1, 1), (1, 2)],
    "J": [(0, 0), (1, 0), (1, 1), (1, 2)],
    "L": [(0, 2), (1, 0), (1, 1), (1, 2)],
}


def _rotate(cells):
    return [(dx, 3 - dy) for dy, dx in cells]


def _normalize(cells):
    min_dy = min(c[0] for c in cells)
    min_dx = min(c[1] for c in cells)
    return sorted((dy - min_dy, dx - min_dx) for dy, dx in cells)


def rotations(piece):
    cur = list(BASE[piece])
    out = []
    for _ in range(4):
        norm = _normalize(cur)
        if norm not in out:
            out.append(norm)
        cur = _rotate(cur)
    return out


def _fits(board, cells, row, col):
    for dy, dx in cells:
        r, c = row + dy, col + dx
        if not (c < WIDTH and r < HEIGHT and not board[r][c]):
            return False
    return True


def hard_drop(board, cells, col):
    """FROM_TOP (grammar v3): spawn at row 0, descend while the next row fits."""
    rest = None
    if _fits(board, cells, 0, col):
        rest = 0
        while rest + 1 < HEIGHT and _fits(board, cells, rest + 1, col):
            rest += 1
    if rest is None:
        return None
    return sorted((rest + dy, col + dx) for dy, dx in cells)


def landing_options(board, piece):
    out = []
    for ri, cells in enumerate(rotations(piece)):
        width = max(c[1] for c in cells) + 1
        for col in range(WIDTH - width + 1):
            dropped = hard_drop(board, cells, col)
            if dropped is not None:
                out.append((ri, col, dropped))
    return out


def clear_rows(board, rows):
    """tetris.js clearRows, verbatim: each cleared row pulls everything
    above it down by one (rows ABOVE fall — a list removal does the
    opposite and was the first port's bug)."""
    for r in rows:
        for rr in range(r, 0, -1):
            board[rr] = board[rr - 1]
        board[0] = [False] * WIDTH


def commit(board, cells):
    """Place + clear; returns the cleared row count."""
    for r, c in cells:
        board[r][c] = True
    full = full_rows(board)
    if full:
        clear_rows(board, full)
    return len(full)


def full_rows(board):
    return [r for r, row in enumerate(board) if all(row)]


def heights(board):
    out = []
    for c in range(WIDTH):
        h = 0
        for r in range(HEIGHT):
            if board[r][c]:
                h = HEIGHT - r
                break
        out.append(h)
    return out


def hole_count(board):
    holes = 0
    for c in range(WIDTH):
        seen = False
        for r in range(HEIGHT):
            if board[r][c]:
                seen = True
            elif seen:
                holes += 1
    return holes


def replay(walk, name):
    """Replay a recorded game; assert the board chain at every turn.

    Mirrors assets/flow_walk_tetris.js loadRecord: for each turn, enumerate
    the options, place the recorded pick, clear full rows. The next turn's
    recorded board must equal the replayed one — the port is verified
    against the record itself, never trusted.
    """
    states = []
    board = [[False] * WIDTH for _ in range(HEIGHT)]
    score = 0
    lines = 0
    for k, (sentence, ps, piece, rows, pick, *rest) in enumerate(walk):
        shown = [[ch == "#" for ch in row] for row in rows]
        for r in range(HEIGHT):
            for c in range(WIDTH):
                if board[r][c] != shown[r][c]:
                    raise SystemExit(
                        f"{name}[{k}]: replay board drift at ({r},{c}) — the "
                        "Python placement port disagrees with the record"
                    )
        opts = landing_options(board, piece)
        if len(opts) != len(ps):
            raise SystemExit(f"{name}[{k}]: arity {len(ps)} vs replayed {len(opts)}")
        if not 0 <= pick < len(opts):
            raise SystemExit(f"{name}[{k}]: bad pick {pick}")
        states.append({
            "k": k,
            "sentence": sentence,
            "ps": ps,
            "piece": piece,
            "pick": pick,
            "ms": rest[0] if rest else None,
            "board": [row[:] for row in board],
            "holes": hole_count(board),
            "heights": heights(board),
            "score_so_far": score,
            "lines_so_far": lines,
        })
        cleared = commit(board, opts[pick][2])
        states[-1]["cleared"] = cleared
        lines += cleared
        score += [0, 40, 100, 300, 1200][min(cleared, 4)]
    return states


# ── the panel's position picks (assets/flow_walk_tetris.js), mirrored ──────
# These must select the SAME turns the board panel shows, so a payload and
# the board beside it are the same recorded position.


def pick_build_state(states):
    best = None
    for s in states:
        h = s["heights"]
        nine = h[:9]
        flat = max(nine) - min(nine)
        well = min(nine) - h[9]
        score = well * 3 - flat * 4 - s["holes"] * 2
        if best is None or score > best[1]:
            best = (s, score)
    return best[0]


def pick_downstack_state(states):
    return max(states, key=lambda s: s["holes"])


def pick_survive_state(states):
    return max(states, key=lambda s: max(s["heights"]))


def pick_recovery_state(states, after):
    start = after["k"] + 1
    fallback = None
    for s in states:
        if s["k"] <= start:
            continue
        max_h = max(s["heights"])
        rank = s["holes"] * 3 + max_h
        if fallback is None or rank < fallback[1]:
            fallback = (s, rank)
        if s["holes"] <= 1 and max_h <= 8:
            return s
    return fallback[0] if fallback else pick_build_state(states)


def pick_clear_turn(states):
    t = min(8, len(states) - 1)
    best_clear = 0
    for s in states:
        if s["cleared"] > best_clear:
            best_clear = s["cleared"]
            t = s["k"]
    return t, best_clear


# ── payload rendering (raw JSON tokens, the build_flow_walks.py law) ───────


class Num(str):
    """A JSON number kept as its source text."""


def dump(v, ind=0):
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


def pretty(obj):
    return dump(json.loads(json.dumps(obj), parse_float=Num, parse_int=Num)) + "\n"


def board_txt(rows):
    return ["".join("#" if ch == "#" else "." for ch in row) for row in rows]


def from_record_rows(rows):
    return rows  # the record already carries ".........." strings


def lane_from(meta_key):
    m = META["sources"][meta_key]
    bits = [f"recorded from the {m['lane'].split(' — ')[0]} lane"]
    bits.append(f"seed {m.get('seed', '?')}")
    bits.append(m.get("recorded_at", "")[:10])
    bits.append(f"arena/demo_oracle.json _meta.sources.{meta_key} · {m.get('recorder', '')}")
    return ", ".join(b for b in bits if b)


META = None


def build():
    oracle = json.loads(ORACLE.read_text(encoding="utf-8"))
    global META
    META = oracle["_meta"]

    files = {}

    def emit(flow, name, obj, prov_from, extra=None):
        p = f"tetris_{flow}/{name}"
        files[p] = pretty(obj)
        row = {"from": prov_from, "source": "arena/demo_oracle.json"}
        if extra:
            row.update(extra)
        prov[p] = row

    prov = {}

    # ── the three sentence lanes: the shared opening turn ──────────────────
    for flow, key, meta_key in (
        ("laya", "tetris_walk", "tetris_laya"),
        ("modelless", "tetris_head_walk", "tetris_head"),
        ("raw", "tetris_raw_walk", "tetris_raw"),
    ):
        states = replay(oracle[key], key)  # verifies the chain en route
        s = states[0]
        m = META["sources"][meta_key]
        frm = lane_from(meta_key)
        emit(flow, "01_in.json", {
            "grammar": m.get("grammar"),
            "question": m.get("question"),
            "state": s["sentence"],
            "piece": s["piece"],
            "board": from_record_rows(oracle[key][0][3]),
            "landing_spots": len(s["ps"]),
        }, frm + " · the opening turn (turn 0)", {"turn": 0, "lane": meta_key})
        out = {
            "p_clean_per_spot": s["ps"],
            "pick": s["pick"],
        }
        if all(p is None for p in s["ps"]):
            out["abstained"] = True
            out["policy"] = m.get("policy")
        emit(flow, "01_out.json", out, frm + " · the opening turn's answer", {"turn": 0, "lane": meta_key})

    # ── the rulebook: the recorded clear turn (the panel's own pick) ───────
    key = "tetris_rulebook_walk"
    states = replay(oracle[key], key)
    t, cleared = pick_clear_turn(states)
    s = states[t]
    m = META["sources"]["tetris_rulebook"]
    frm = lane_from("tetris_rulebook")
    emit("rulebook", "01_in.json", {
        "lane": "Reflex · rulebook (the search champion)",
        "genome_id": m.get("genome_id"),
        "piece": s["piece"],
        "board": from_record_rows(oracle[key][t][3]),
        "landing_spots": len(s["ps"]),
        "depth": 3,
    }, frm + f" · turn {t} (the recorded turn with the biggest clear)", {"turn": t})
    emit("rulebook", "01_out.json", {
        "spot_scores": s["ps"],
        "pick": s["pick"],
        "ms_per_decision": s["ms"],
        "scores_note": m.get("probs"),
    }, frm + f" · turn {t}'s answer (scores are the recorded display map)", {"turn": t})
    emit("rulebook", "02_out.json", {
        "lines_cleared": s["cleared"],
        "lines_so_far": s["lines_so_far"] + s["cleared"],
        "score_so_far": s["score_so_far"] + [0, 40, 100, 300, 1200][min(s["cleared"], 4)],
        "pieces_so_far": t + 1,
    }, frm + f" · after turn {t}'s pick lands (replayed off the record)", {"turn": t})

    # ── the modes: the panel's four positions + the genome's triggers ─────
    build_state = pick_build_state(states)
    down = pick_downstack_state(states)
    survive = pick_survive_state(states)
    recovery = pick_recovery_state(states, survive if survive["k"] > down["k"] else down)
    genome = m.get("genome", "")
    # dh=3 (downstack holes), sh=12 (survive height) off the recorded genome
    def genome_val(tag):
        i = genome.find(f"{tag}=")
        return int(genome[i + len(tag) + 1:].split()[0].rstrip(";")) if i >= 0 else None
    dh, sh = genome_val("dh"), genome_val("sh")
    rows_of = lambda st: from_record_rows(oracle[key][st["k"]][3])
    emit("modes", "01_in.json", {
        "mode": "BUILD",
        "board": rows_of(build_state),
        "covered_holes": build_state["holes"],
        "stack_height": max(build_state["heights"]),
    }, frm + f" · turn {build_state['k']} (the strongest 9-1 build position)", {"turn": build_state["k"]})
    emit("modes", "02_in.json", {
        "board": rows_of(down),
        "covered_holes": down["holes"],
    }, frm + f" · turn {down['k']} (the most-buried recorded position)", {"turn": down["k"]})
    emit("modes", "02_out.json", {
        "mode": "DOWNSTACK",
        "covered_holes": down["holes"],
        "trigger_at_holes": dh,
    }, frm + f" · counted off turn {down['k']}'s board; threshold from the recorded genome")
    emit("modes", "03_in.json", {
        "board": rows_of(survive),
        "stack_height": max(survive["heights"]),
    }, frm + f" · turn {survive['k']} (the tallest recorded position)", {"turn": survive["k"]})
    emit("modes", "03_out.json", {
        "mode": "SURVIVE",
        "stack_height": max(survive["heights"]),
        "trigger_at_rows": sh,
    }, frm + f" · measured off turn {survive['k']}'s board; threshold from the recorded genome")
    emit("modes", "04_in.json", {
        "mode": "BUILD (recovered)",
        "board": rows_of(recovery),
        "covered_holes": recovery["holes"],
        "stack_height": max(recovery["heights"]),
    }, frm + f" · turn {recovery['k']} (holes dug out, stack back under {sh})", {"turn": recovery["k"]})

    out = {}
    for rel, text in files.items():
        out[OUT_ROOT / rel] = text
    return out, prov


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if not ORACLE.exists():
        print(f"SKIP (loud): {ORACLE} absent — the arena walk payloads are UNCHECKED this run")
        return 0
    files, prov = build()
    # provenance.json per flow dir
    by_dir = {}
    for rel, row in prov.items():
        by_dir.setdefault(Path(rel).parent, {})[Path(rel).name] = row
    bad = 0
    for p, text in sorted(files.items()):
        if args.check:
            if not p.exists() or p.read_text(encoding="utf-8") != text:
                print(f"✗ {p.relative_to(SITE)} is stale — run scripts/build_arena_flow_walks.py")
                bad += 1
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8", newline="\n")
        print(f"✓ wrote {p.relative_to(SITE)} ({len(text.encode())} B)")
    for d, rows in sorted(by_dir.items()):
        text = json.dumps(rows, indent=1, ensure_ascii=False) + "\n"
        p = OUT_ROOT / d / "provenance.json"
        if args.check:
            if not p.exists() or p.read_text(encoding="utf-8") != text:
                print(f"✗ {p.relative_to(SITE)} is stale — run scripts/build_arena_flow_walks.py")
                bad += 1
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8", newline="\n")
        print(f"✓ wrote {p.relative_to(SITE)}")
    if args.check:
        n = len(files) + len(by_dir)
        print("✗ arena walk payloads stale" if bad else f"✓ arena walk payloads match the recorded walks ({n} files)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
