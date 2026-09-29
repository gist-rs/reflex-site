/* instinct.js — the Instinct verdict block on /bench/#instinct, rendered
   from data/bench.json at load (the site's number law: never hand-typed).

   Two rows, told from Instinct's side:

   1. "Instinct vs Reflex" — the row law MOVED here from the arena TL;DR
      (owner call 2026-09-29): the arena stays Reflex's; Reflex is free, so
      Instinct must EARN its place. The MARK follows the majority law (the
      same one the Reflex-vs-laya row uses): green ✓ only when ahead on
      EVERY suite with an arm, YELLOW ✓ on a strict majority, red ✗ on a
      minority or a tie-heavy board — a tie is still no reason to pay, and
      the text names every gap either way. The Bench-068 Wilson screen
      splits within-noise trailing suites out of the gap claim.

   2. "Instinct vs best lane" — the RAISED bar (instinct .issues/008
      amendment, 2026-09-29): free Reflex is the floor, not the bar. The
      competitor is the best published lane per suite — every comparison
      lane included (laya's best non-multilingual checkpoint, clm, gliner,
      agentjev, openthai, paw), any host (accuracy is box-independent, the
      same law the charts' pick() uses). Same majority mark: green only
      when strictly best everywhere (the GOAT chip flips with it), yellow
      on a majority, red ✗ on a minority (3/15 today).

   Status chip: "PoC" until Instinct is strictly ahead of every other lane
   on every suite it covers; when that flips, the chip reads GOAT and the
   row may return to the arena TL;DR (owner call at that point — instinct
   .issues/008 T9). */

fetch("/data/bench.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then(render)
  .catch((e) => {
    const box = document.getElementById("instinct-verdict");
    if (box) box.textContent = `benchmark data unavailable (${e.message}) — see the tables above.`;
  });

const pct = (x) => (x * 100).toFixed(1) + "%";
const nOf = (cell) => (cell && cell.hard && cell.hard.n) || null;
const accOf = (l) => {
  const h = (l && l.hard || {}).accuracy;
  return h != null ? h : (l && l.accuracy);
};
const isModelless = (l) => l.lane === "KatGPT" || l.model === "modelless";
const isHybrid = (l) => l.lane === "Instinct (hybrid)";

// The 95% Wilson score interval (the arena_tldr.js screen, same constants).
function wilson(p, n, z = 1.96) {
  if (!n || p == null) return null;
  const den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const hw = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [c - hw, c + hw];
}
const inWilson = (p, n, x) => {
  const ci = wilson(p, n);
  return ci != null && x >= ci[0] && x <= ci[1];
};

// Every lane cell of a suite, tagged with its host (null = primary run).
function cellsOf(s) {
  const out = [];
  const push = (l, host) => { if (l && accOf(l) != null) out.push([l, host]); };
  if (s.modelless) push(s.modelless, null);
  for (const k of Object.keys(s.laya || {})) push(s.laya[k], null);
  for (const k of ["clm", "gliner", "agentjev", "openthai", "paw", "paw_local", "hybrid"]) push(s[k], null);
  for (const [host, hl] of Object.entries(s.extra_host_lanes || {})) {
    if (hl.modelless) push(hl.modelless, host);
    for (const k of Object.keys(hl.laya || {})) push(hl.laya[k], host);
    for (const k of ["clm", "gliner", "agentjev", "openthai", "paw", "paw_local", "hybrid"]) push(hl[k], host);
  }
  return out;
}

function row(state, text) {
  const li = document.createElement("li");
  li.className = state === true ? "ok" : state === false ? "gap" : state === "warn" ? "warn" : "eq";
  li.innerHTML = `<i>${state === true || state === "warn" ? "✓" : state === false ? "✗" : "="}</i> ${text}`;
  return li;
}
// Widest first, capped so a long tail cannot swamp a row (the arena_tldr law).
const gapList = (xs, fmt) => {
  const shown = xs.slice(0, 5).map(fmt).join(", ");
  return xs.length > 5 ? `${shown}, +${xs.length - 5} more` : shown;
};

function render(bench) {
  const box = document.getElementById("instinct-verdict");
  if (!box) return;
  const suites = bench.suites || [];
  const withKm = suites.filter((s) => accOf(s.modelless) != null);

  // Per suite with an arm: the best hybrid cell (any host), the Reflex row,
  // and the best OTHER published lane (best non-multilingual checkpoint,
  // any host — accuracy is box-independent).
  const armed = [];
  for (const s of withKm) {
    const cells = cellsOf(s);
    const hyb = cells.filter(([l]) => isHybrid(l));
    if (!hyb.length) continue;
    const hybCell = hyb.reduce((a, b) => (accOf(b[0]) > accOf(a[0]) ? b : a));
    const inst = accOf(hybCell[0]);
    const kmCell = cells.find(([l]) => isModelless(l));
    const km = kmCell ? accOf(kmCell[0]) : null;
    const others = cells.filter(([l]) => !isHybrid(l) && l.model !== "multilingual");
    const best = others.reduce((a, b) => (accOf(b[0]) > accOf(a[0]) ? b : a));
    armed.push({
      name: s.name, inst, km, kmN: nOf(kmCell && kmCell[0]), instN: nOf(hybCell[0]),
      bestLane: String(best[0].lane).replace(/ \(reference\)$/, "") === "KatGPT" ? "Reflex" : String(best[0].lane).replace(/ \(reference\)$/, ""),
      bestModel: best[0].model, bestAcc: accOf(best[0]), bestHost: best[1],
      edge: inst - accOf(best[0]),
    });
  }

  box.innerHTML = "";
  const meta = bench.meta || {};
  const newest = window.BenchProv ? BenchProv.latestRun(bench) : null;
  const lead = document.createElement("p");
  lead.className = "cases";
  lead.style.cssText = "margin:0 0 6px";
  lead.innerHTML = `Measured on <b>${armed.length}</b> suites with an Instinct arm` +
    (newest ? ` · latest run ${newest.git_sha} (${(newest.date_utc || "?").slice(0, 10)}) · ${newest.host}` : "") +
    ` · single frozen test read per registered arm.`;
  const ul = document.createElement("ul");

  // ── row 1: vs Reflex (the floor) — the moved arena law, unchanged ──────
  if (armed.length) {
    const ahead = armed.filter((r) => r.km != null && r.inst > r.km)
      .sort((a, b) => (b.inst - b.km) - (a.inst - a.km));
    const notAhead = armed.filter((r) => r.km == null || r.inst <= r.km)
      .sort((a, b) => ((b.km ?? b.inst) - b.inst) - ((a.km ?? a.inst) - a.inst));
    const gaps = notAhead
      .filter((r) => r.km != null && r.km > r.inst)
      .map((r) => ({ name: r.name, gap: r.km - r.inst, acc: r.inst, n: r.instN }))
      .sort((a, b) => b.gap - a.gap);
    const gapsReal = gaps.filter((r) => !inWilson(r.acc, r.n, r.acc + r.gap));
    const gapsNoise = gaps.filter((r) => inWilson(r.acc, r.n, r.acc + r.gap));
    const noArm = suites.length - armed.length; // a suite with no Reflex row is also unsold (thai_*)
    // The majority mark (owner call, matching the Reflex-vs-laya row):
    // green ✓ only when ahead EVERYWHERE, YELLOW ✓ on a strict majority
    // (8/15 today), red ✗ on a minority or a tie-heavy board — the text
    // names every gap either way.
    const vsReflexState = notAhead.length === 0 ? true
      : ahead.length * 2 > armed.length ? "warn" : false;
    ul.appendChild(row(vsReflexState,
      `<b>Instinct vs Reflex, accuracy:</b> ahead of Reflex on <b>${ahead.length}/${armed.length}</b> suites with an Instinct arm` +
      (ahead.length ? ` (widest: ${ahead[0].name} ${pct(ahead[0].inst)} vs ${pct(ahead[0].km)}) — where its trained specialists earn the consult` : "") +
      (gapsReal.length ? `; gap to win the other ${gapsReal.length}: ${gapList(gapsReal, (r) => `${r.name} +${(r.gap * 100).toFixed(1)} pt`)}` : "") +
      (gapsNoise.length ? `; within noise at this n: ${gapsNoise.map((r) => `${r.name} +${(r.gap * 100).toFixed(1)} pt (n=${r.n})`).join(", ")}` : "") +
      (noArm > 0 ? `; no Instinct arm yet on ${noArm} of ${suites.length} published suites.` : ".")));
  }

  // ── row 2: vs the best published lane (the bar) ────────────────────────
  let chip;
  if (armed.length) {
    const best = armed.filter((r) => r.edge > 1e-9).sort((a, b) => b.edge - a.edge);
    const tied = armed.filter((r) => Math.abs(r.edge) <= 1e-9);
    const trailing = armed.filter((r) => r.edge < -1e-9).sort((a, b) => a.edge - b.edge);
    const strictlyAll = best.length === armed.length;
    chip = document.createElement("p");
    chip.style.cssText = "margin:0 0 8px";
    chip.innerHTML = `<span class="chip ${strictlyAll ? "ok" : "poc"}">${strictlyAll ? "GOAT" : "PoC"}</span> ` +
      (strictlyAll
        ? `strictly ahead of every published lane on every suite it covers — the bar for leaving this section is met.`
        : `not yet the best lane on every suite it covers: strictly best on <b>${best.length}/${armed.length}</b>, ` +
          `tied on ${tied.length}, trailing on ${trailing.length} — listed below, never hidden. The arena TL;DR stays Reflex's until this flips.`);
    // Same majority law, one lane wider: the bar is EVERY published lane,
    // so the mark is green only when strictly best everywhere (the GOAT
    // chip flips with it), YELLOW on a strict majority, red ✗ on a
    // minority (3/15 today — most of the board still beats Instinct).
    const vsBestState = strictlyAll ? true
      : best.length * 2 > armed.length ? "warn" : false;
    ul.appendChild(row(vsBestState,
      `<b>Instinct vs best lane, accuracy:</b> the best published lane on <b>${best.length}/${armed.length}</b> suites with an arm` +
      (best.length ? ` (widest: ${best[0].name} ${pct(best[0].inst)} vs ${pct(best[0].bestAcc)} ${best[0].bestLane}${best[0].bestHost ? " @" + best[0].bestHost : ""})` : "") +
      (trailing.length ? `; trails the best on ${trailing.length}: ${gapList(trailing, (r) => `${r.name} −${(Math.abs(r.edge) * 100).toFixed(1)} pt (best: ${r.bestLane} ${pct(r.bestAcc)})`)}` : "") +
      (tied.length ? `; tied on ${tied.length} (a tie sells nothing — the specialist adds nothing measurable there)` : "") +
      "."));
  } else {
    chip = document.createElement("p");
    chip.innerHTML = `<span class="chip poc">PoC</span> no registered arm published yet.`;
  }

  box.append(chip, lead, ul);
}
