/* Arena TL;DR — the expected lane order vs what the benchmark measured.
   Rendered from data/bench.json (publish_bench.py's output), never
   hand-typed: the claim is Reflex · modelless > laya (Rust) > laya (Python) on
   speed and accuracy, and every place the measurement disagrees is SAID,
   not hidden. Checkpoint compared: english (the arena's own). */

import "/assets/bench_provenance.js"; // sets window.BenchProv (shared provenance reads)

const SUITE_ORDER_NOTE = "english checkpoint · p50 per question";

function pick(suite) {
  const km = suite.modelless;
  const rust = suite.laya?.english;
  const py = suite.laya?.["py/english"];
  if (!km || !rust || !py) return null;
  const acc = (l) => l.hard?.accuracy;
  const p50 = (l) => l.latency_p50_ms;
  if ([acc(km), acc(rust), acc(py), p50(km), p50(rust), p50(py)].some((x) => x == null)) return null;
  // The pairing verdict is COMPUTED at publish time (publish_bench.py's
  // per-suite `pairing` block — the lane population law, site Issue 002)
  // and only RENDERED here. "differs" = the two lanes answered different
  // question sets — disclosed as not-comparable, never counted as a
  // parity failure or a parity pass.
  const pairing = suite.pairing?.rust_vs_py?.status || "unknown";
  const pid = (v) => (v?.kind === "unknown" ? "?" : String(v?.id || "?").split(" ")[0]);
  const pairDetail = (() => {
    const b = suite.pairing?.rust_vs_py;
    if (!b || b.status !== "differs") return "";
    return `${suite.name}: rust ${pid(b.rust)} vs py ${pid(b.py)}`;
  })();
  return {
    name: suite.name,
    km: { acc: acc(km), p50: p50(km), n: nOf(km), cell: km },
    rust: { acc: acc(rust), p50: p50(rust), n: nOf(rust), cell: rust },
    py: { acc: acc(py), p50: p50(py), n: nOf(py), cell: py },
    pairing,
    pairDetail,
  };
}

const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const ms = (x) => (x < 1 ? x.toFixed(3) : x < 10 ? x.toFixed(2) : String(Math.round(x)));
const pct = (x) => (x * 100).toFixed(1) + "%";
// The 95% Wilson score interval of one lane's accuracy at its own n —
// the same screen Bench 068 ran by hand (reflex .benchmarks/068). A
// trailing suite whose opponent sits INSIDE Reflex's interval is a
// within-noise reading at this sample size, not a demonstrated capability
// gap: with 3 questions of headroom, one authored fixture flips the sign.
// Such suites are DISCLOSED (never hidden, never counted as wins) but
// split out of the "gap to win" claim.
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
const nOf = (cell) => cell?.hard?.n || null;

// A trailing suite is a GAP TO CLOSE, never a verdict for the other lane:
// Reflex already wins latency and bundle size, so the only honest thing to
// say where it trails on accuracy is how far it has to go. Widest first,
// capped so a long tail cannot swamp the row.
const gapList = (xs, cap = 5) => {
  const shown = xs.slice(0, cap)
    .map((r) => (r.gap > 0 ? `${r.name} +${(r.gap * 100).toFixed(1)} pt` : `${r.name} tied`)).join(", ");
  return xs.length > cap ? `${shown}, +${xs.length - cap} more` : shown;
};

function row(ok, text) {
  const li = document.createElement("li");
  li.className = ok === true ? "ok" : ok === false ? "gap" : "eq";
  li.innerHTML = `<i>${ok === true ? "✓" : ok === false ? "✗" : "="}</i> ${text}`;
  return li;
}

function render(bench) {
  const rows = (bench.suites || []).map(pick).filter(Boolean);
  const body = document.getElementById("tldr-body");
  if (!body) return;
  if (!rows.length) {
    body.textContent = "the benchmark data has no suite with all three lanes — see the tables.";
    return;
  }
  const n = rows.length;
  // The NEWEST contributing run — meta is the table's ORIGINAL run, which
  // lane-scoped updates never replace (BenchProv.latestRun).
  const last = window.BenchProv?.latestRun(bench) || {};
  const host = last.host || "?";
  // Issue-021 verdicts of the timing each speed row compares, per lane.
  const LANE_WORD = { km: "Reflex's", rust: "laya (rust)'s", py: "laya (python)'s" };
  const unfitIn = (k) => window.BenchProv
    ? BenchProv.latency(rows.map((r) => r[k].cell)).unfit : 0;
  const unfitParts = (keys) => keys.filter((k) => unfitIn(k))
    .map((k) => `${LANE_WORD[k]} timing on ${unfitIn(k)}/${n} suites`);
  const kmSpeedUnfit = unfitParts(["km", "rust"]);
  const rustPyUnfit = unfitParts(["rust", "py"]);
  const unfitTail = (parts) => parts.length
    ? ` <span class="caveat">⚠ ${BenchProv.unfitNote(parts.join(" and "))}</span>` : "";

  const kmFaster = rows.filter((r) => r.km.p50 < r.rust.p50);
  const speedup = median(rows.map((r) => r.rust.p50 / r.km.p50));
  const rustFaster = rows.filter((r) => r.rust.p50 < r.py.p50);
  const rustSlower = rows.filter((r) => r.rust.p50 > r.py.p50)
    .sort((a, b) => b.rust.p50 / b.py.p50 - a.rust.p50 / a.py.p50);
  // The pairing law: only same-population pairs adjudicate the parity
  // claim (the denominator). Cross-sample and unknown-identity pairs are
  // their own disclosed states, never pooled into either direction.
  const comparable = rows.filter((r) => r.pairing === "same" || r.pairing === "same_results");
  const accEqual = comparable.filter((r) => Math.abs(r.rust.acc - r.py.acc) < 1e-9);
  const accDiff = comparable.filter((r) => Math.abs(r.rust.acc - r.py.acc) >= 1e-9);
  const crossSample = rows.filter((r) => r.pairing === "differs");
  const unknownPair = rows.filter((r) => r.pairing === "unknown");
  const kmAccAtLeast = rows.filter((r) => r.km.acc >= r.rust.acc);
  const kmTrailing = rows.filter((r) => r.km.acc < r.rust.acc)
    .map((r) => ({
      name: r.name,
      gap: r.rust.acc - r.km.acc,
      kmAcc: r.km.acc,
      kmN: r.km.n,
    }))
    .sort((a, b) => b.gap - a.gap);
  // Bench 068's screen, mechanized: a trailing suite whose laya reading
  // sits inside Reflex's 95% Wilson interval (at Reflex's own n) is noise
  // at this sample size, not a demonstrated gap. Both buckets are
  // disclosed; only the first claims "gap to win".
  const kmGaps = kmTrailing.filter((r) => !inWilson(r.kmAcc, r.kmN, r.kmAcc + r.gap));
  const kmNoise = kmTrailing.filter((r) => inWilson(r.kmAcc, r.kmN, r.kmAcc + r.gap));

  body.innerHTML = "";
  const lead = document.createElement("p");
  lead.innerHTML =
    `Measured on <b>${n}</b> suites · <a href="/bench/">benchmark</a> · latest run ${last.git_sha || "?"} (${(last.date_utc || "?").slice(0, 10)}) · ${host} · ${SUITE_ORDER_NOTE}`;
  const ul = document.createElement("ul");
  // A speed row whose timing a run judged unfit is not a ✓: it renders
  // "=" (undecided) with the verdict beside it, never as a clean result.
  ul.appendChild(row(kmSpeedUnfit.length ? null : kmFaster.length === n,
    `<b>Reflex vs laya, speed:</b> faster on <b>${kmFaster.length}/${n}</b>, median <b>${Math.round(speedup).toLocaleString()}×</b>.` +
    unfitTail(kmSpeedUnfit)));
  const slowList = rustSlower.slice(0, 3)
    .map((r) => `${r.name} ${ms(r.rust.p50)} vs ${ms(r.py.p50)} ms`).join(", ");
  ul.appendChild(row(rustPyUnfit.length ? null : rustFaster.length === n,
    `<b>Rust vs Python laya, speed:</b> Rust faster on <b>${rustFaster.length}/${n}</b>` +
    (rustSlower.length
      ? `, slower on ${rustSlower.length} (${slowList}) — a bug by our bar (<a href="https://github.com/gist-rs/riir-reflex/blob/HEAD/HISTORY.md">riir-reflex Issue 020</a> closed on Rust winning every cell).`
      : ".") + unfitTail(rustPyUnfit)));
  const pairLine = crossSample.length
    ? `; ${crossSample.length} pair(s) on different samples — not comparable (${crossSample.map((r) => r.pairDetail).join(", ")})`
    : "";
  const unknownLine = unknownPair.length
    ? `; ${unknownPair.length} unverifiable (legacy runs)`
    : "";
  ul.appendChild(row(
    accDiff.length === 0 ? (comparable.length === 0 ? null : true) : false,
    `<b>Rust vs Python laya, accuracy:</b> identical on <b>${accEqual.length}/${comparable.length}</b> same-sample pair(s)` +
    (accDiff.length ? `, differing on ${accDiff.length} (${accDiff.map((r) => r.name).join(", ")})` : "") +
    pairLine + unknownLine +
    (comparable.length ? " — a parity port, by design." : " — nothing comparable published yet.")));
  const noiseList = (xs) => xs
    .map((r) => `${r.name} +${(r.gap * 100).toFixed(1)} pt (n=${r.kmN})`).join(", ");
  ul.appendChild(row(kmGaps.length === 0,
    `<b>Reflex vs laya, accuracy:</b> at or above laya on <b>${kmAccAtLeast.length}/${n}</b>` +
    (kmGaps.length ? `; gap to win the other ${kmGaps.length}: ${gapList(kmGaps)}` : "") +
    (kmNoise.length
      ? `; within noise at this n: ${noiseList(kmNoise)} — more questions, not a new mechanism`
      : "") +
    "."));
  // Instinct vs Reflex — told from Instinct's side: Reflex is free, so
  // Instinct is the paid lane and must EARN its place by beating Reflex.
  // ✓ only when it is STRICTLY ahead on every suite it has an arm for (a
  // tie is no reason to pay); its leads are the pitch, its gaps are stated
  // as gaps, and its coverage (suites with an arm) is disclosed.
  const withKm = (bench.suites || []).filter((s) => s.modelless?.hard?.accuracy != null);
  const inst = withKm
    .filter((s) => s.hybrid?.hard?.accuracy != null)
    .map((s) => ({ name: s.name, km: s.modelless.hard.accuracy, inst: s.hybrid.hard.accuracy }));
  if (inst.length) {
    const byGap = (a, b) => (b.inst - b.km) - (a.inst - a.km);
    const ahead = inst.filter((r) => r.inst > r.km).sort(byGap);
    const notAhead = inst.filter((r) => r.inst <= r.km).sort((a, b) => byGap(b, a));
    const pt = (r) => `${r.name} ${pct(r.inst)} vs ${pct(r.km)}`;
    const instGaps = notAhead.map((r) => ({
        name: r.name,
        gap: r.km - r.inst,
        instAcc: r.inst,
        instN: nOf(bench.suites.find((s) => s.name === r.name)?.hybrid),
      }))
      .sort((a, b) => b.gap - a.gap);
    const noArm = withKm.length - inst.length;
    // The same Bench-068 screen, one side over: a suite where REFLEX's
    // lead is inside Instinct's interval is disclosed as noise — but the
    // verdict is unchanged (Reflex is free; a statistical tie earns no
    // download, so the row stays ✗ unless Instinct is strictly ahead).
    const instGapsReal = instGaps.filter((r) => !inWilson(r.instAcc, r.instN, r.instAcc + r.gap));
    const instGapsNoise = instGaps.filter((r) => inWilson(r.instAcc, r.instN, r.instAcc + r.gap));
    const instNoiseList = (xs) => xs
      .map((r) => `${r.name} +${(r.gap * 100).toFixed(1)} pt (n=${r.instN})`).join(", ");
    ul.appendChild(row(notAhead.length === 0,
      `<b>Instinct vs Reflex, accuracy:</b> ahead of Reflex on <b>${ahead.length}/${inst.length}</b> suites with an Instinct arm` +
      (ahead.length ? ` (widest: ${pt(ahead[0])}) — where its trained specialists earn the download` : "") +
      (instGapsReal.length
        ? `; gap to win the other ${instGapsReal.length}: ${gapList(instGapsReal)}`
        : "") +
      (instGapsNoise.length
        ? `; within noise at this n: ${instNoiseList(instGapsNoise)}`
        : "") +
      (noArm > 0 ? `; no Instinct arm yet on ${noArm} of ${withKm.length} suites.` : ".")));
  }
  body.append(lead, ul);
}

fetch("/data/bench.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then(render)
  .catch((e) => {
    const body = document.getElementById("tldr-body");
    if (body) body.textContent = `benchmark data unavailable (${e.message}) — see /bench/.`;
  });
