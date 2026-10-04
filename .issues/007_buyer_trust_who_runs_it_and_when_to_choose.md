# Issue 007 — reflex.gist.rs: buyer/investor cannot find who runs it, how to get help, or a plain "when to choose Reflex"
**Status:** PARTIAL — T1/T2/T3 LANDED 2026-10-05 (About footer + security.txt + privacy box + rendered TL;DR coverage); T4 coordinate-with-1028, T5 owner (policy commitments), T6 open. Filed 2026-10-03 (web trust audit, riir-ai Issue 1028)

**Priority:** P1 — trust / willingness-to-adopt.
**Audience:** buyer / investor, team lead approving a dependency.

## Evidence

- **No operator identity, no contact, no support channel.** No page names who builds or maintains
  Reflex, how to report a bug (beyond GitHub links), or how to get help.
  `https://reflex.gist.rs/.well-known/security.txt` → 404 (rethink.gist.rs has one:
  `security@gist.rs`).
- **No privacy page.** The privacy promise is one bullet in "Notes & sources" ("the engine listens
  on 127.0.0.1:7331, accepts one allowed browser origin, and sends no telemetry"). It is true
  (riir-reflex `src/serve.rs:41,585`), and it is the strongest buying argument on the site, but it
  is buried; the rulebook demo's "Ask Cloudflare" path *does* send the board to a Worker (disclosed
  on /playground/ only).
- **Licence split is unclear** (Issue 005 #7): engine source MIT, binary repo has no LICENSE,
  laya weights Apache-2.0 downloaded at runtime.
- **No roadmap / maturity statement.** Versions are 0.2.x; nothing says what is stable (wire?
  corpus format?) and what may break.
- **The selective-accuracy trade-off is not in the TL;DR.** The hero sells "Decisions in
  microseconds. Honest when it doesn't know." but how often it doesn't know is only in the bench
  tables — e.g. typed_decisions: accuracy 0.5725, calibrated abstain rate **0.717**, selective
  accuracy 0.654 (`data/bench.json` suite `typed_decisions`). A buyer who discovers a 72% abstain
  rate after installing feels misled even though nothing is hidden. Show coverage next to speed.
- **"When should I use which?" exists but is not a comparison.** riir-ai 1028 T3 already plans a
  "How Jev works — and how we do better" section; this issue adds the buyer's version: one table
  Reflex vs an LLM API call vs Jev/CLM-style hosted decision models — cost per 1k decisions,
  latency, data leaves machine?, abstains?, needs training data?, licence. Cells link bench rows;
  no typed numbers.
- **No path to paid help.** Nothing says "when Reflex abstains too often on your domain, Rethink
  (hosted) picks those up — waitlist" (Issue 005 T3).
- **No case study / real use.** The arena games demonstrate speed, not a business decision; one
  worked text example (ticket triage, approve/escalate) with the measured abstain → escalate flow
  would carry more weight with a buyer.

## Proposed fix

1. Footer "About": who runs it, contact, `security.txt`, licence line (engine MIT · binaries terms ·
   third-party weights Apache-2.0).
2. Promote the privacy bullet to a short "What leaves your machine" box on the home page
   (nothing; except the opt-in Cloudflare rulebook demo).
3. TL;DR adds coverage: "answers N% of questions at X% accuracy, abstains on the rest", rendered
   from bench.json.
4. Buyer comparison table (Reflex · LLM API · hosted decision models), cells linked to the board.
5. Stability statement: what is stable at 0.x, deprecation policy for the wire.
6. One worked business example end-to-end (moat-safe — uses only the open Reflex lane).

## Tasks

- [x] T1 About/contact/security.txt/licence line on every page — LANDED 2026-10-05: `.well-known/security.txt` (the rethink.gist.rs precedent — `security@gist.rs`, 1-year expiry, canonical) + a `gf-legal` About block on all 7 pages (gist.rs team + family links, GitHub issues, security contact, licence facts: engine/rulebook/site MIT · binaries gist-rs/reflex · weights Apache-2.0 runtime-downloaded). Wrangler assets serve dot-directories (proven by the rethink site).
- [x] T2 "What leaves your machine" box on the home page — LANDED 2026-10-05: a `.tldr` box in the hero — nothing by default (127.0.0.1:7331, one allowed origin, no telemetry) · one optional upload (playground Ask Cloudflare, stateless Worker, disclosed there) · one optional download (laya weights from HF, SHA-256-verified) · your docs/labels/questions stay local.
- [x] T3 coverage + selective accuracy in the TL;DR (rendered) — LANDED 2026-10-05: `app.js` extends `homeFigure()` — median answer rate + median selective accuracy over the suites carrying `calibrated_abstain` (the product posture), computed in-browser from data/bench.json (numbers law; the site's own `median()` convention, same as the speed figure). Live read: "answers a median 52% of questions at 65% accuracy when it answers and abstains on the rest".
- [ ] T4 buyer comparison table (coordinate with riir-ai 1028 T3's Jev section)
- [ ] T5 stability / versioning statement (owner — a public deprecation policy is an owner commitment)
- [ ] T6 one worked business-decision example
