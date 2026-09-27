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
    km: { acc: acc(km), p50: p50(km), cell: km },
    rust: { acc: acc(rust), p50: p50(rust), cell: rust },
    py: { acc: acc(py), p50: p50(py), cell: py },
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
  const worstAcc = [...rows].sort((a, b) => (a.km.acc - a.rust.acc) - (b.km.acc - b.rust.acc))[0];

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
  ul.appendChild(row(kmAccAtLeast.length === n,
    `<b>Reflex vs laya, accuracy:</b> at or above laya on <b>${kmAccAtLeast.length}/${n}</b>` +
    (kmAccAtLeast.length < n
      ? `; trails on the rest (widest: ${worstAcc.name} ${pct(worstAcc.km.acc)} vs ${pct(worstAcc.rust.acc)}) — on those, laya is the better pick.`
      : ".")));
  // Reflex vs Instinct — the trained-specialist hybrid lane, compared only
  // on the suites that publish an Instinct arm (the population it has).
  const inst = (bench.suites || [])
    .filter((s) => s.modelless?.hard?.accuracy != null && s.hybrid?.hard?.accuracy != null)
    .map((s) => ({ name: s.name, km: s.modelless.hard.accuracy, inst: s.hybrid.hard.accuracy }));
  if (inst.length) {
    const kmAtLeastInst = inst.filter((r) => r.km >= r.inst);
    const instAhead = inst.filter((r) => r.km < r.inst).sort((a, b) => (a.km - a.inst) - (b.km - b.inst));
    ul.appendChild(row(kmAtLeastInst.length === inst.length,
      `<b>Reflex vs Instinct, accuracy:</b> at or above Instinct on <b>${kmAtLeastInst.length}/${inst.length}</b> suites with an Instinct arm` +
      (instAhead.length
        ? `; Instinct leads on ${instAhead.length} (widest: ${instAhead[0].name} ${pct(instAhead[0].inst)} vs ${pct(instAhead[0].km)}) — where its trained specialists earn the extra download.`
        : ".")));
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
