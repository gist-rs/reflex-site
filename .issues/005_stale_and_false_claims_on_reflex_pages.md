# Issue 005 — reflex.gist.rs: stale / false statements (private-repo claim, Rethink "incoming", attribution, install lines)
**Status:** MOSTLY RESOLVED — T1–T5b landed in `e97247b` (+ riir-reflex `50d340d`), deployed 2026-10-03; T6a done (gist-rs/reflex `adaa0aa`, scoop-bucket `caacf62`); T6b OPEN, owner-gated (licence terms: MIT vs MIT OR Apache-2.0). Filed 2026-10-03 (web trust audit, riir-ai Issue 1028)

**Priority:** P0 — statements a reader can disprove in one click.
**Audience:** developer + buyer.

## Evidence (fetched 2026-10-03; every link on /, /playground/, /arena/, /bench/, /resources/ was
requested — **all 200**, no dead link; the one non-200 is a template-literal artifact, not a link)

| # | Claim | Where | Verdict | Evidence |
|---|---|---|---|---|
| 1 | "Instinct / Rethink are Reflex's trained sibling lanes (**riir-instinct, private repo**)" | /bench Notes | **FALSE** | `bench/index.html:402`; `https://github.com/gist-rs/riir-instinct` → 200 public (and /resources itself calls it "the open lane") |
| 2 | "Instinct / Rethink — our lanes (**riir-instinct, private repo**)" | /bench References | **FALSE** | `bench/index.html:479` (same) |
| 3 | Rethink attributed to riir-instinct ("Rethink the encoder arm … riir-instinct's naming law") | /bench Instinct section + FAQ | **STALE** | Rethink moved to its own private repo `riir-rethink` (born 2026-10-03, katgpt-rs `116f09d25`); `github.com/gist-rs/riir-rethink` → 404 (private, correct) |
| 4 | "The storefront — rethink.gist.rs — is **incoming; the link may be dark** until it deploys" | /resources | **STALE** | `resources/index.html:250`; `https://rethink.gist.rs/` → 200 (riir-rethink `f0d1c02`) |
| 5 | No page on reflex.gist.rs links the Rethink **storefront** except that stale sentence; the home page links neither rethink.gist.rs nor ai.gist.rs | / | **JOURNEY GAP** | home link list: only GitHub + HF + reflex pages. Guide §1 journey is Reflex → Rethink → Refine → Network; the paid next step is unreachable from the free product (the restyle's family footer, riir-ai 1028 T3, should close this — verify) |
| 6 | Homebrew: `brew tap gist-rs/tap && brew install riir-reflex` | / Install | **INCONSISTENT** — UNVERIFIED on Homebrew 6 | `index.html:221`. The sibling cargo-refine page and README require `brew trust gist-rs/tap` because "Homebrew 6+ refuses to load formulas from an untrusted tap". One of the two install lines is wrong; test on a current Homebrew and align both. The tap formula (`gist-rs/homebrew-tap/Formula/riir-reflex.rb`) carries macOS **and** Linux bottles and installs `reflex`; the gist-rs/reflex README still says "macOS today" (stale) |
| 7 | "Open source, MIT" (Reflex) | /resources | TRUE for the engine (`api.github.com/repos/gist-rs/riir-reflex` → MIT) — but the **binary repo users install from**, `gist-rs/reflex`, has `license: null` | add a LICENSE to gist-rs/reflex (riir-reflex dist) or say "engine source MIT; binaries under <terms>" |
| 8 | "their license ships in every release's THIRD_PARTY_LICENSES.md" | / Notes | TRUE | `reflex-v0.2.3-aarch64-apple-darwin.tar.gz` contains `reflex` + `THIRD_PARTY_LICENSES.md` |
| 9 | gist-rs/reflex README: "Scoop: lands with the first Windows asset" | linked "Binaries" | **STALE** | v0.2.3 ships `reflex-v0.2.3-x86_64-pc-windows-gnu.zip` and `gist-rs/scoop-bucket` already has `riir-reflex.json`. Owner: riir-reflex dist README |
| 9b | The agent skill the home page tells you to curl: `riir-reflex --version`, `riir-reflex  # serves http://127.0.0.1:7331`, "tested against riir-reflex 0.1.1" | `/skills/reflex-integration/SKILL.md` (`skills/reflex-integration/SKILL.md:55-56,69-70,297`) | **FALSE command** | since v0.2.2 the released binary is `reflex` (tarball lists `reflex`; formula `bin.install "reflex"`; the home page says "installs the `reflex` command"). An agent following the skill runs `riir-reflex` → command not found. Re-capture the wire examples against v0.2.3 |
| 10 | "Ask choice, score or **yes/no**" | / hero | TRUE in meaning, but the wire/README type is `noul` (gist-rs/reflex README line 3; `data/bench.json` `by_question_type.noul`) — a developer reading the site then the API sees two names for one thing | Issue 006 T2 |
| 11 | "Typical decision 163 µs — median 191× faster … across **9 suites**" vs chart caption "Over **11** published suites" | / TL;DR | UNCLEAR, not false | both render from `data/bench.json` (11 suites; the ratio presumably uses the 9 with both lanes). Say which 9 |
| 12 | TL;DR latency chart ranks **Instinct 3.51 µs** above **Reflex · modelless 163 µs** | / TL;DR | UNVERIFIED / needs a sentence | Instinct is described as consulted only after Reflex abstains — a reader cannot see how the composed lane is 46× faster than its own first stage. Either explain the timing scope (per-suite subset, clock) or plot it on the bench page only |
| 13 | "G1 calibration beats the conformal floor — 9/9 suites" | / badge | TRUE per data (computed) | `data/bench.json` `g1_verdict` |
| 14 | Engine "Runs on 127.0.0.1:7331 only", CORS via `RIIR_REFLEX_ALLOWED_ORIGIN` | / + playground | TRUE | riir-reflex `src/serve.rs:41,47-53,585` |

## Proposed fix

T1–T4 are text edits; T5 needs one test on a Homebrew 6 box; T6/T7 are owner-repo follow-ups.

## Tasks

- [x] T1 "riir-instinct, private repo" → "riir-instinct (open)" at `bench/index.html:402,479`; Rethink → "riir-rethink (private)" wherever it is attributed
- [x] T2 `resources/index.html:250` → live storefront link, waitlist state from rethink.gist.rs
- [x] T3 home: a "Need answers where Reflex abstains? → Rethink" line + family footer links to rethink.gist.rs and ai.gist.rs
- [x] T4 TL;DR names its 9-of-11 suite basis; Instinct latency row explained or moved to /bench
- [x] T5 verify `brew install riir-reflex` on Homebrew 6; align with cargo-refine (`brew trust`) and add the platform note
- [x] T5b SKILL.md: binary name `reflex`, version line + wire captures refreshed against the current release (skill version bump)
- [x] T6a gist-rs/reflex README Scoop line → the real install (`scoop bucket add gist-rs …` + `scoop install riir-reflex`),
      gist-rs/reflex `adaa0aa`. Manifest `bucket/riir-reflex.json` = 0.2.3, its hash `931be16d…` matches the release's
      `SHA256SUMS` (checked 2026-10-03). Bucket README named only `cargo-heal`: now names cargo-refine + riir-reflex,
      gist-rs/scoop-bucket `caacf62`.
- [ ] T6b LICENSE file in gist-rs/reflex — **OWNER-GATED (licence terms)**, and the terms disagree today: the dist
      README's §License says the binary is "MIT OR Apache-2.0", while riir-reflex `Cargo.toml` says `license = "MIT"`
      and its `LICENSE` is MIT only. Decide one; then the LICENSE file(s) + README § follow.

## Resolution notes (2026-10-03, `e97247b`)

- T1: /bench says Instinct is open source (gist-rs/riir-instinct) and Rethink is the hosted product with
  private source; no "riir-instinct's naming law" attribution of Rethink remains.
- T2: /resources links the live storefront and names its waitlist state; the resources smoke now FAILS on
  an "incoming / may be dark" hedge and requires the rethink.gist.rs link (the old "incoming" arm inverted).
- T3: home "Need more than the floor? → Meet Rethink" card + the family footer (Reflex · Rethink · Refine ·
  Network) on every page (`b9416c7`).
- T4: the TL;DR renders "across N of the M published suites — the ones where both laya lanes (Rust and
  Python) also ran" (both counts from data/bench.json); the home summary drops Instinct/Rethink rows on the
  latency metric only, with a note pointing to /bench#instinct (their timing covers only their own arm's suites).
- T5: `brew tap gist-rs/tap && brew install riir-reflex` verified on Homebrew 7.0.7 (M3) → `reflex 0.2.3`;
  that box had the tap already in `trust.json`, so the fresh-box refusal is not re-observed here — the home
  line and the skill now both read `brew tap … && brew trust gist-rs/tap && brew install riir-reflex`
  (aligned with the cargo-refine page) + "macOS + Linux" (the formula carries both bottles).
- T5b: riir-reflex `50d340d` — skill v2: every command is `reflex`, version stamp 0.2.3, /healthz's JSON
  reply documented; the wire example re-captured live against 0.2.3 (byte-identical to the old capture).

