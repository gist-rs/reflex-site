PUBLIC BY MIRROR — this file ships to reflex.gist.rs; keep it concept-level (no code, no repo paths, no digests, no measured numbers)

# Rethink — the encoder tier

Rethink is the same Instinct idea one rung deeper: where a bag specialist is too coarse, a trained encoder head thinks — served HOSTED-ONLY from our GPU servers, so the weights never leave controlled hardware.

## What Rethink is

Rethink is a **product**, not a research note: it is built to serve typed
decisions [structured questions that deserve a structured answer, not free
text] over the same wire the open lanes use, and every answer carries a
receipt [a hashed record of exactly what produced the answer]. The hosted
lane is not open yet — rethink.gist.rs marks each step live, test network
or planned. It is also
**private forever** — the source stays ours, and so do the trained heads.

The heads are built to ship inside a **HOSTED-ONLY vessel** [weights that
never leave our servers — you call, we think]: hashed, signed and
encrypted, so a build without the hosted reader cannot open one at all.
That class is structural, not a policy. The vessel format is built but is
not the serving path yet; until it is, heads are plain files checked
against a pinned BLAKE3 digest, and they still run only on our hosts.

## The rung model

**Reflex** is the floor: a modelless engine [no neural network — no
training run] that runs on your machine, answers in µs-class time, and
abstains [says "I don't know" instead of guessing] when it is unsure.
**Instinct** is the idea above the floor: when the engine abstains,
consult a specialist trained for exactly that domain — composed on top,
never instead. **Rethink** is that idea at the encoder tier: where a bag
specialist [a small per-domain scorer over hashed word-count features —
cheap and fast, but blind to word order and nuance] is too coarse, a
trained encoder head reads the question as a whole and thinks — ms-class
thinks, on our GPU hosts.

## Where it runs

On **our GPU hosts only**. Rethink ships its own serve binary to our own
servers — private distribution, never a public download. There is no
binary to fetch, and by design there never will be: the encoder lane does
not compile into a public build, and the heads are to ride vessels the
public reader refuses. "Can I run this myself?" has an honest answer: no — and
that is the whole point of the class.

## How to see it

- **The storefront** — [rethink.gist.rs](https://rethink.gist.rs):
  what the hosted tier does, how your data is handled, and the roadmap
  each step's state lives on. It is live; the hosted API itself is
  still forming — the storefront marks each card live, test network
  or planned.
- **The measured side** — the site's [/bench/](/bench/) Rethink rows:
  every seated cell is the encoder arm measured against the open lanes
  on the same frozen test read — live today, beside the storefront.

The free floor is always on, and always answers first: Rethink is paid
only where the free engine's confidence check [the fused gate — the
calibrated signal that decides whether a specialist is worth consulting]
abstains.

## How escalation works

Only abstentions ever go up: a sure answer never reaches a paid rung.
The step from the specialist rung to the encoder is built, not just
drawn — the hosted serve arms the encoder rung per suite [one benchmark
task], and only where the encoder measured ahead of the rung below on
the public board. A runtime rate guard rides every arming: if the share
of questions escalated drifts outside the band it was measured at, the
lane demotes itself to the cheaper rung and says so in the answer's
receipt. The hosted API that exposes this ladder is still forming; the
board's Rethink rows carry the measured side today.
