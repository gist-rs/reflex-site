# Issue 006 — reflex.gist.rs: no copy-paste request/response, no API reference, no "first corpus" path on the site
**Status:** OPEN — 2026-10-03 (web trust audit, riir-ai Issue 1028)

**Priority:** P1 — the developer row of design guide §7 ("install command, a working
request/response example, what runs locally vs hosted, limits, source link") is half met.
**Audience:** developer evaluating integration.

## Evidence

- **Install: yes. Request/response: no.** The home page gives install commands and an agent-skill
  curl, but no `curl -X POST http://127.0.0.1:7331/decide -d '…'` with its JSON answer. The only
  place the wire appears is inside the agent skill (`skills/reflex-integration/SKILL.md` — routes
  `POST /decide`, `POST /feedback`, `GET /healthz`), which a human evaluator has no reason to open.
- **The playground needs the engine first.** /playground/ shows "No local engine found" until the
  binary is installed and started with `RIIR_REFLEX_ALLOWED_ORIGIN=https://reflex.gist.rs reflex`.
  The no-install part is a Tetris board (rulebook) — it does not show the product's text decision
  wire. A lazy evaluator never sees a real text answer + abstain without installing.
- **No API reference.** Request/response schema, the three question types and their wire names
  (`choice`, `score`, `noul` — the site calls the last one "yes/no", Issue 005 #10), error shapes,
  limits (max options, max text bytes, concurrency/throughput), and versioning policy are not on
  the site.
- **SDK/language support is unstated.** It is HTTP-only (the skill says "the Rust crate is private
  and never required") — that is a feature for a polyglot developer and the site never says it.
- **"Build your own" is a link-out.** /resources has "Reflex — author a lane" with `dev_flow.md`;
  there is no runnable 5-minute "write 3 docs, label 20 rows, refit, ask" walkthrough with a sample
  corpus to download.
- **No engine changelog.** `data/changes.json` is the *benchmark board's* change log; the engine's
  release notes live only in GitHub releases (v0.2.3, 2026-09-23) and the site never shows the
  current version.

## Proposed fix

1. Home, right under Install: a two-pane "Ask it" block — the `curl POST /decide` request and the
   real response JSON (one answered, one abstained), captured from the release binary by a script
   at publish time (numbers law — never typed).
2. A `/docs/api/` page generated from the same captures: routes, fields, question types (one name
   per type, matching the wire), errors, limits, version policy; "any language with HTTP — no SDK
   needed".
3. Optional: a hosted read-only demo of the **text** wire (same Worker pattern as the rulebook
   demo) so the playground answers a text question without an install — only if the corpus used
   is public and the Worker stays stateless.
4. "Your first corpus in 5 minutes": a downloadable sample corpus + the exact build/refit/ask
   commands.
5. Show "engine vX.Y.Z — release notes" in the header/footer, read from the release metadata.

## Tasks

- [ ] T1 generated request/response block on the home page (answer + abstain)
- [ ] T2 `/docs/api/` reference page (routes, schema, type names, errors, limits, versioning, "HTTP-only, any language")
- [ ] T3 decide: stateless hosted text-wire demo for the playground (owner)
- [ ] T4 5-minute first-corpus walkthrough with a sample corpus
- [ ] T5 current engine version + release-notes link on every page
