# 010 — Reframe #instinct: "Rethink vs Others", tie colors, fallback-is-the-design copy

**Status:** LANDED — verdict REVISE addressed + one discovered data-integrity fix (derived fallback rows leaked into the comparator pool); committed+deployed this session.

## Ask (owner, 2026-10-03)

The `#instinct` section on reflex.gist.rs/bench is too harsh on the family now that
Rethink is the promoted product:

- Row 2 verdict "✗ Instinct · Rethink vs best lane — strictly best on 1/12 · trails
  the best on 5 · tied on 6 (a tie sells nothing)" reads as self-flagellation.
- The PoC chip ("...The arena TL;DR stays Reflex's until this flips") judges Rethink
  against its own family — but the fallback Reflex → Instinct → Rethink is the DESIGNED
  rung model ("you pay for thinking, never for re-answering what the free floor already
  knows", rethink.gist.rs/#why). The race that matters is **Rethink vs Others**.
- Color law: win = green, tie = yellow, loss = red.
- Row 1 "Instinct · Rethink vs Reflex" → "Reflex vs Instinct · trained specialists
  (encoderless)" + a Rethink CTA (marketing punchline).

## Verdict (Claude round 1): REVISE — 7 points, all adopted

1. "encoderless" is false on the family UNION (`isHybrid || isEncoder`) → row 1 uses
   **hybrid-only** cells; counts may move; smoke `famOf`/`vsReflexWins` split in the
   same commit.
2. "Rethink vs Others" must say it is the **served rung stack** (a ↩ cell is the
   floor's answer, not an encoder read — the 2026-10-02 badge lesson) → head says
   "the served rung stack"; legend names ↩.
3. Ties count toward GOAT → to-go arithmetic is `tied + trailing`: "11 to go
   (5 behind · 6 level)", not "5 left".
4. Tie yellow collides with the existing yellow `noise` class → ties take
   `var(--warn)`; noise (behind-within-noise) moves to `var(--ember)` with its ≈ glyph.
5. "Reflex vs Instinct — ahead on X" reverses the subject → keep the owner's order,
   make the subject explicit: "the specialists ahead on X/N".
6. Agreed as-is: chip wording (fallback by design), GOAT/`strictlyAll` condition
   unchanged, h2 kept, softened arena-TL;DR sentence kept (placement law enforced by
   `arena_demo_smoke`).
7. Pins: 4 smoke label sites (2 `.test` regexes + 2 `rowMark` labels) + the
   `instinct.js` header comment — one commit.

## Tasks

- [x] `assets/instinct.js` — header comment rewrite; row 1 hybrid-only
      (`Reflex vs Instinct · trained specialists (encoderless), accuracy`) + Rethink CTA
      after the counts; row 2 → `Rethink vs Others, accuracy — the served rung stack:
      best lane on X/N · B to take · T level`; chip → rung-model framing with
      `to-go = tied + trailing`; legend → color law + ↩ rung fallback; `segBar`
      none-label parameterized ("no specialist arm yet" on row 1).
- [x] `bench/index.html` — `.iv-delta.eq` + `.iv-seg .eq` → `var(--warn)`;
      `.iv-delta.noise` → `var(--ember)`; intro paragraph → rung-model consolidation
      with rethink.gist.rs/#why vocabulary ("wins, ties and losses all stay visible").
- [x] `scripts/bench_page_smoke.cjs` — 4 label pins updated; `hybOf` split from
      `famOf`; row-1 mark population = armed-with-hybrid.
- [x] DISCOVERED during verification (the user-visible "1/12" was this bug):
      the row-2 comparator pool had no derived guard — the DERIVED
      tier-fallback rows wearing the Rethink name (they carry the SERVING
      tier's number, e.g. banking77 0.854 = the hybrid's own read) entered
      `others`, so the stack was compared against ITSELF and those suites
      rendered false ties. Page + smoke mirror now refuse
      `derived && lane ∈ {Rethink, Rethink (encoder)}` from the pool
      (`isFamilyServing`). Result on current data: 1/12 → **3/12 strictly
      best** (prompt_injections +8.6 and banking77 +1.2 were hidden wins);
      the smoke's mark-only check had masked it (1/12 and 3/12 both land in
      the gap band).
- [x] Smokes green: `bench_page_smoke.cjs` + `public_copy_gate.cjs` + a
      rendered-DOM probe (tie = rgb(251,191,36) yellow, wins green, deltas
      and heads data-derived).
- [x] Commit + push + wrangler deploy + live verify.

## Notes

- No metric softened: counts, majority-law marks, Wilson noise screen, and the
  GOAT/PoC flip condition (`strictlyAll` vs other lanes) are untouched. Every tie
  and loss stays listed — the rethink #why line "wins, ties and losses all stay
  visible" is the section's own law now.
- Row 1's population shrinks to suites with a hybrid arm (suites measured only by
  the encoder appear in row 2 alone) — the honest cost of the "encoderless" claim.
- Follow-up observation (out of scope here): the charts' lane comparator in
  `bench-charts.js` may have the same derived-row leak — not audited in this issue.
- Data note: `data/bench.json` on disk is NEWER than what the live site showed
  when this was filed (3 wins vs 1) — a sibling landed it after the last deploy;
  this deploy ships it.
