/* instinct.js — the Instinct verdict block on /bench/#instinct, rendered
   from data/bench.json at load (the site's number law: never hand-typed).

   Two verdict groups, each = a short headline (the majority-law mark) + a
   segmented "remain" bar + ONE LINE PER SUITE (owner ask 2026-09-29: the
   prose rows were unreadable). Reframed 2026-10-03 (reflex-site issue 010,
   owner call: the fallback is the design — Rethink races OTHERS, never its
   own rungs; wording consolidated with rethink.gist.rs/#why):

   1. "Reflex vs Instinct · trained specialists (encoderless)" — the
      ENCODERLESS rung only (hybrid cells): what the trained specialists add
      over the free floor. Reflex is free, so the specialist must EARN its
      place. The MARK follows the majority law: green ✓ only when ahead on
      EVERY suite with a hybrid arm, YELLOW ✓ on a strict majority, red ✗
      otherwise — the Bench-068 Wilson screen marks within-noise trails ≈
      on their own lines. Carries the Rethink CTA (the encoder rung, one
      level deeper).

   2. "Rethink vs Others" — the SERVED RUNG STACK (Reflex → Instinct →
      Rethink; where the encoder has no arm of its own, a lower rung's
      answer is what gets served — the ↩ badge) against the best OTHER
      published lane per suite — every comparison lane included (laya's
      best non-multilingual checkpoint, clm, gliner, agentjev, openthai,
      paw), any host (accuracy is box-independent, the same law the charts'
      pick() uses). Same majority mark. The to-go arithmetic counts TIES
      (GOAT = strictly best on every covered suite): "B to take · T level".

   Per-suite line: a loading bar — fill = the contributing arm (Instinct
   magenta, Rethink violet = record-only), a tick at the compared lane's
   accuracy (THAT lane's palette color, one home: BenchLanes in
   bench-charts.js), the dim span between = the gap. Bar and tick follow
   the LANE; the delta follows the VERDICT: green ahead · yellow tied ·
   red behind (≈ = behind within noise).

   Status chip: "PoC" until the stack is strictly ahead of every other lane
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
// (isHybrid/isEncoder/isFamily live with cellsOf — the family law block.)

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
// The family law (owner call 2026-10-01, instinct issue 017 T5 — reversing
// the sst5-era display exclusion): the ENCODER lane (Rethink, serve: ✗,
// record-only) COUNTS as the family's measured arm beside the hybrid lane
// — a measured cell the board hides reads as no progress. The contributing
// arm is marked on its line (the Rethink fill color + a record-only tag)
// so a reader never mistakes a serve-refused arm for the serving posture.
function cellsOf(s) {
  const out = [];
  const push = (l, host) => { if (l && accOf(l) != null) out.push([l, host]); };
  if (s.modelless) push(s.modelless, null);
  for (const k of Object.keys(s.laya || {})) push(s.laya[k], null);
  for (const k of ["clm", "gliner", "agentjev", "openthai", "paw", "paw_local", "hybrid", "encoder"]) push(s[k], null);
  for (const [host, hl] of Object.entries(s.extra_host_lanes || {})) {
    if (hl.modelless) push(hl.modelless, host);
    for (const k of Object.keys(hl.laya || {})) push(hl.laya[k], host);
    for (const k of ["clm", "gliner", "agentjev", "openthai", "paw", "paw_local", "hybrid", "encoder"]) push(hl[k], host);
  }
  return out;
}

// The family's two product lanes: Instinct (hybrid, serving) and Rethink
// (encoder, record-only) — the same matchers the lane palette carries.
// A DERIVED tier-fallback cell never counts as the encoder arm's own
// contribution (the best-of-family display, owner 2026-10-02): it is the
// seated tier's measurement wearing the Rethink row — the hybrid cell
// carries the same number, so the family arm stays magenta, never a
// violet bar on a number the encoder never measured.
const isHybrid = (l) => l.lane === "Instinct" || l.lane === "Instinct (hybrid)";
const isEncoder = (l) => !l.derived && (l.lane === "Rethink" || l.lane === "Rethink (encoder)" || l.lane === "Instinct (encoder)");
const isFamily = (l) => isHybrid(l) || isEncoder(l);
// A DERIVED tier-fallback row wearing the Rethink name carries the SERVING
// tier's number (isEncoder refuses it as a family MEASUREMENT — the ↩ law).
// It must never enter the comparator pool either, or the rung stack gets
// compared against ITSELF: the fallback row carries the family's own best,
// so every suite with a fallback row read as a false "tie" (banking77,
// prompt_injections) instead of the real win over the other lanes.
const isFamilyServing = (l) => isFamily(l) || (!!l.derived && (l.lane === "Rethink" || l.lane === "Rethink (encoder)"));

function row(state, text) {
  const li = document.createElement("li");
  li.className = state === true ? "ok" : state === false ? "gap" : state === "warn" ? "warn" : "eq";
  li.innerHTML = `<i>${state === true || state === "warn" ? "✓" : state === false ? "✗" : "="}</i><div class="iv-main"></div>`;
  li.querySelector(".iv-main").innerHTML = text;
  return li;
}

const ivEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The segmented "remain" bar: one segment per state, flex = the count, so
// the bar IS the fraction (how many won / tied / remain / have no arm yet).
function segBar(parent, up, eq, down, none, noneLabel) {
  const seg = (cls, n, title) => n > 0 || cls === "none"
    ? `<i class="${cls}" style="flex:${Math.max(n, 0.0001)}" title="${ivEsc(title)}"></i>` : "";
  const d = document.createElement("div");
  d.className = "iv-seg";
  d.innerHTML = seg("up", up, `${up} won`) + seg("eq", eq, `${eq} tied`) +
    seg("down", down, `${down} to take`) +
    (none > 0 ? seg("none", none, `${none} of the published suites ${noneLabel || "have no family arm yet"}`) : "");
  parent.appendChild(d);
}

// One suite line: suite | loading bar (fill = Instinct, tick + dim gap
// span = the compared lane, in THAT lane's palette color) | numbers | delta.
function suiteLine(L, r, cmp, opts = {}) {
  const li = document.createElement("li");
  li.className = "iv-line";
  const w = (x) => Math.max(0, Math.min(100, x * 100)).toFixed(2);
  const instW = w(r.inst);
  const cmpW = cmp.acc == null ? null : w(cmp.acc);
  const lo = cmpW == null ? +instW : Math.min(+instW, +cmpW);
  const hi = cmpW == null ? +instW : Math.max(+instW, +cmpW);
  const d = cmp.acc == null ? null : r.inst - cmp.acc;
  let cls = "eq", delta = "±0.0", title = "";
  if (d != null && d > 1e-9) { cls = "up"; delta = `+${(d * 100).toFixed(1)}`; }
  else if (d != null && d < -1e-9) { cls = "down"; delta = `−${(Math.abs(d) * 100).toFixed(1)}`; }
  if (opts.noise && d != null && d < -1e-9) {
    cls = "noise"; delta = `≈ −${(Math.abs(d) * 100).toFixed(1)}`;
    title = ` within noise at this arm's n=${r.instN} (the Bench-068 Wilson screen)`;
  }
  const cmpColor = L.color(cmp.lane);
  // The contributing family arm's color: Instinct magenta (serving) or
  // Rethink violet (record-only) — the line reads in the contributing
  // lane's color, and a record-only arm is TAGGED so it is never mistaken
  // for the serving posture (the honesty half of the 017 display law).
  const armColor = r.viaEncoder ? L.color("Rethink") : L.instinct;
  const roTag = r.viaEncoder ? `<span class="iv-host" title="record-only — the encoder class is refused at serve (issue 014); the serving arm is the hybrid lane's">· record-only</span>` : "";
  // The tier-fallback badge mirrors the board's bc-fb mark: the number IS
  // what the product serves, the hover names the tier that answered.
  const fbTag = r.viaFallback
    ? `<b class="iv-fb" title="${ivEsc(`${r.servedBy || "the modelless tier"} answered — no family arm measured on this suite (full-coverage serving law)`)}">↩</b> `
    : "";
  li.innerHTML =
    `<span class="iv-suite" title="${ivEsc(r.name)}">${ivEsc(r.name)}</span>` +
    `<span class="iv-bar">` +
      `<i class="iv-fill" style="width:${instW}%;background:${armColor}"></i>` +
      (cmpW != null && hi > lo + 1e-9 ? `<i class="iv-gap" style="left:${lo.toFixed(2)}%;width:${(hi - lo).toFixed(2)}%;background:${cmpColor}"></i>` : "") +
      (cmpW != null ? `<b class="iv-tick" style="left:${cmpW}%;background:${cmpColor}"></b>` : "") +
    `</span>` +
    `<span class="iv-nums"><b style="color:${armColor}">${pct(r.inst)}</b> ${fbTag}${roTag} vs ` +
      (cmpW != null
        ? `<span style="color:${cmpColor}">${pct(cmp.acc)} ${ivEsc(cmp.lane)}</span>` +
          (cmp.host ? ` <span class="iv-host">@${ivEsc(cmp.host)}</span>` : "")
        : `<span class="iv-host">no Reflex row</span>`) +
    `</span>` +
    `<span class="iv-delta ${cls}"${title ? ` title="${ivEsc(title.trim())}"` : ""}>${delta}</span>`;
  return li;
}

function linesUl(items) {
  const ul = document.createElement("ul");
  ul.className = "iv-lines";
  for (const el of items) ul.appendChild(el);
  return ul;
}

function render(bench) {
  const box = document.getElementById("instinct-verdict");
  if (!box) return;
  const suites = bench.suites || [];
  const withKm = suites.filter((s) => accOf(s.modelless) != null);

  // Per suite with an arm: the FAMILY's best measured cell — the hybrid
  // lane (Instinct, serving) or the encoder lane (Rethink, record-only;
  // owner call 2026-10-01, issue 017 T5: a measured cell the board hides
  // reads as no progress). The Reflex row, and the best OTHER published
  // lane (best non-multilingual checkpoint, any host) — the family lanes
  // are never their own comparator.
  const armed = [];
  for (const s of withKm) {
    const cells = cellsOf(s);
    const fam = cells.filter(([l]) => isFamily(l));
    if (!fam.length) continue;
    const famCell = fam.reduce((a, b) => (accOf(b[0]) > accOf(a[0]) ? b : a));
    const viaEncoder = isEncoder(famCell[0]);
    // A DERIVED tier-fallback family cell (serves: tier-fallback — the
    // modelless tier's served answer riding the Instinct/Rethink row) is the
    // family's number on the board, but it is not a family MEASUREMENT: the
    // line carries the ↩ badge so it never reads as one (2026-10-02 user
    // report — the card showed "22.0% vs 60.0% laya" with no marker while
    // the hero called the same cell not-run).
    const viaFallback = famCell[0].serves === "tier-fallback";
    const inst = accOf(famCell[0]);
    const kmCell = cells.find(([l]) => isModelless(l));
    const km = kmCell ? accOf(kmCell[0]) : null;
    const others = cells.filter(([l]) => !isFamilyServing(l) && l.model !== "multilingual");
    const best = others.reduce((a, b) => (accOf(b[0]) > accOf(a[0]) ? b : a));
    // Row 1 is the ENCODERLESS claim (issue 010): its cell is the best HYBRID
    // arm only — an encoder read must never be credited to "trained
    // specialists (encoderless)". Suites measured only by the encoder show
    // in row 2 (the rung stack) alone.
    const hybCells = cells.filter(([l]) => isHybrid(l));
    const hybCell = hybCells.length
      ? hybCells.reduce((a, b) => (accOf(b[0]) > accOf(a[0]) ? b : a)) : null;
    armed.push({
      name: s.name, inst, km, kmN: nOf(kmCell && kmCell[0]), instN: nOf(famCell[0]),
      hyb: hybCell ? accOf(hybCell[0]) : null, hybN: nOf(hybCell && hybCell[0]),
      viaEncoder, viaFallback, servedBy: famCell[0].served_by,
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
  lead.innerHTML = `Measured on <b>${armed.length}</b> suites with a family arm (Instinct hybrid \u00b7 Rethink encoder, the best measured cell) ` +
    (newest ? ` · latest run ${newest.git_sha} (${(newest.date_utc || "?").slice(0, 10)}) · ${newest.host}` : "") +
    ` · single frozen test read per registered arm.`;
  const ul = document.createElement("ul");
  const L = window.BenchLanes ||
    { instinct: "#f472b6", reflex: "#ff8a3d", color: () => "#69718a" };
  const noArmTotal = suites.length - armed.length; // a suite with no Reflex row is also unsold (thai_*)

  // ── row 1: Reflex vs the ENCODERLESS specialists (hybrid cells only) ──
  if (armed.length) {
    const hyb = armed.filter((r) => r.hyb != null);
    const hybNoArm = suites.length - hyb.length;
    const ahead = hyb.filter((r) => r.km != null && r.hyb > r.km)
      .sort((a, b) => (b.hyb - b.km) - (a.hyb - a.km));
    const notAhead = hyb.filter((r) => r.km == null || r.hyb <= r.km)
      .sort((a, b) => ((b.km ?? b.hyb) - b.hyb) - ((a.km ?? a.hyb) - a.hyb));
    const tied = notAhead.filter((r) => r.km != null && Math.abs(r.hyb - r.km) <= 1e-9);
    const gaps = notAhead
      .filter((r) => r.km != null && r.km > r.hyb)
      .map((r) => ({ name: r.name, gap: r.km - r.hyb, acc: r.hyb, n: r.hybN }))
      .sort((a, b) => b.gap - a.gap);
    const gapsReal = gaps.filter((r) => !inWilson(r.acc, r.n, r.acc + r.gap));
    const gapsNoise = gaps.filter((r) => inWilson(r.acc, r.n, r.acc + r.gap));
    // The majority mark (owner call, matching the Reflex-vs-laya row):
    // green ✓ only when ahead EVERYWHERE, YELLOW ✓ on a strict majority,
    // red ✗ on a minority or a tie-heavy board — the lines name every gap.
    const vsReflexState = notAhead.length === 0 ? true
      : ahead.length * 2 > hyb.length ? "warn" : false;
    const li = row(vsReflexState,
      `<div class="iv-head"><b>Reflex vs Instinct \u00b7 trained specialists (encoderless), accuracy</b> — the specialists ahead on <b>${ahead.length}/${hyb.length}</b> suites with an arm` +
      (gapsReal.length + gapsNoise.length ? ` · behind on ${gapsReal.length + gapsNoise.length}` +
        (gapsNoise.length ? ` (${gapsNoise.length} ≈ within noise)` : "") : "") +
      (tied.length ? ` · tied on ${tied.length}` : "") +
      (hybNoArm > 0 ? ` · no specialist arm yet on ${hybNoArm} of ${suites.length} published suites.` : ".") +
      ` <a href="https://rethink.gist.rs/">Rethink goes one rung deeper — the trained encoder for what the specialists miss →</a>`);
    const main = li.querySelector(".iv-main");
    segBar(main, ahead.length, tied.length, gapsReal.length + gapsNoise.length, hybNoArm,
      "have no specialist arm yet");
    // Row-1 lines compare the HYBRID cell to the floor; the shim keeps
    // suiteLine's shape (no encoder tag, no fallback badge on this row).
    const hr = (r) => ({ name: r.name, inst: r.hyb, instN: r.hybN, viaEncoder: false, viaFallback: false });
    const lines = [
      ...ahead.map((r) => suiteLine(L, hr(r), { acc: r.km, lane: "Reflex", host: null })),
      ...tied.map((r) => suiteLine(L, hr(r), { acc: r.km, lane: "Reflex", host: null })),
      ...notAhead.filter((r) => r.km != null && r.km > r.hyb).map((r) =>
        suiteLine(L, hr(r), { acc: r.km, lane: "Reflex", host: null },
          { noise: gapsNoise.some((g) => g.name === r.name) })),
      ...notAhead.filter((r) => r.km == null).map((r) => suiteLine(L, hr(r), { acc: null, lane: "Reflex", host: null })),
    ];
    main.appendChild(linesUl(lines));
    ul.appendChild(li);
  }

  // ── row 2: the served rung stack vs every OTHER published lane ────────
  let chip;
  if (armed.length) {
    const best = armed.filter((r) => r.edge > 1e-9).sort((a, b) => b.edge - a.edge);
    const tied = armed.filter((r) => Math.abs(r.edge) <= 1e-9);
    const trailing = armed.filter((r) => r.edge < -1e-9).sort((a, b) => a.edge - b.edge);
    const strictlyAll = best.length === armed.length;
    chip = document.createElement("p");
    chip.style.cssText = "margin:0 0 8px";
    // The fallback to a lower rung is the DESIGN (issue 010 — the rung
    // model at rethink.gist.rs/#why), so the open race is the stack against
    // the other published lanes; ties count toward the to-go (GOAT needs
    // strictly best everywhere).
    chip.innerHTML = `<span class="chip ${strictlyAll ? "ok" : "poc"}">${strictlyAll ? "GOAT" : "PoC"}</span> ` +
      (strictlyAll
        ? `strictly best of every published lane on every suite it covers — the bar for leaving this section is met.`
        : `the rung model, measured in the open — the fallback to Reflex/Instinct is by design: you pay for thinking only where the floor abstains. ` +
          `The open race is <b>Rethink vs Others</b>: best lane on <b>${best.length}/${armed.length}</b> · ` +
          `${tied.length + trailing.length} to go (${trailing.length} behind · ${tied.length} level) — every line below, never hidden.`);
    // Same majority law, one lane wider: the bar is EVERY published lane,
    // so the mark is green only when strictly best everywhere (the GOAT
    // chip flips with it), YELLOW on a strict majority, red ✗ on a
    // minority.
    const vsBestState = strictlyAll ? true
      : best.length * 2 > armed.length ? "warn" : false;
    const li = row(vsBestState,
      `<div class="iv-head"><b>Rethink vs Others, accuracy</b> — the served rung stack (Reflex → Instinct → Rethink): best lane on <b>${best.length}/${armed.length}</b> suites` +
      (trailing.length ? ` · ${trailing.length} to take` : "") +
      (tied.length ? ` · ${tied.length} level` : "") + ".");
    const main = li.querySelector(".iv-main");
    segBar(main, best.length, tied.length, trailing.length, noArmTotal,
      "have no family arm yet");
    const cmpOf = (r) => ({ acc: r.bestAcc, lane: r.bestLane, host: r.bestHost });
    main.appendChild(linesUl([
      ...best.map((r) => suiteLine(L, r, cmpOf(r))),
      ...tied.map((r) => suiteLine(L, r, cmpOf(r))),
      ...trailing.map((r) => suiteLine(L, r, cmpOf(r))),
    ]));
    ul.appendChild(li);
  } else {
    chip = document.createElement("p");
    chip.innerHTML = `<span class="chip poc">PoC</span> no registered arm published yet.`;
  }

  box.append(chip, lead);
  if (armed.length) {
    const legend = document.createElement("p");
    legend.className = "iv-legend";
    legend.innerHTML =
      `per suite: <i class="iv-sw" style="background:${L.instinct}"></i>bar = the contributing family arm (Instinct magenta, Rethink violet = record-only) · <i class="iv-tickdemo"></i>tick = the compared lane (its lane color) · dim span = the gap · the delta reads the verdict: <b style="color:var(--ok)">green ahead</b> · <b style="color:var(--warn)">yellow tied</b> · <b style="color:var(--ember)">red behind</b> (≈ = within noise) · grey hatch = no arm yet · ↩ = the rung fallback — a lower rung answered and is served (by design)`;
    box.append(legend, ul);
  } else {
    box.append(ul);
  }
}
