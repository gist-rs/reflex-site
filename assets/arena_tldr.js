/* Arena TL;DR — the expected lane order vs what the benchmark measured.
   Rendered from data/bench.json (publish_bench.py's output), never
   hand-typed: the claim is Reflex · modelless > laya (Rust) > laya (Python) on
   speed and accuracy, and every place the measurement disagrees is SAID,
   not hidden. Checkpoint compared: english (the arena's own). */

const SUITE_ORDER_NOTE = "english checkpoint · p50 per question";

function pick(suite) {
  const km = suite.modelless;
  const rust = suite.laya?.english;
  const py = suite.laya?.["py/english"];
  if (!km || !rust || !py) return null;
  const acc = (l) => l.hard?.accuracy;
  const p50 = (l) => l.latency_p50_ms;
  if ([acc(km), acc(rust), acc(py), p50(km), p50(rust), p50(py)].some((x) => x == null)) return null;
  return {
    name: suite.name,
    km: { acc: acc(km), p50: p50(km) },
    rust: { acc: acc(rust), p50: p50(rust) },
    py: { acc: acc(py), p50: p50(py) },
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
  const meta = bench.meta || {};
  const host = meta.host || meta.hosts?.[0]?.host || "?";

  const kmFaster = rows.filter((r) => r.km.p50 < r.rust.p50);
  const speedup = median(rows.map((r) => r.rust.p50 / r.km.p50));
  const rustFaster = rows.filter((r) => r.rust.p50 < r.py.p50);
  const rustSlower = rows.filter((r) => r.rust.p50 > r.py.p50)
    .sort((a, b) => b.rust.p50 / b.py.p50 - a.rust.p50 / a.py.p50);
  const accEqual = rows.filter((r) => Math.abs(r.rust.acc - r.py.acc) < 1e-9);
  const kmAccAtLeast = rows.filter((r) => r.km.acc >= r.rust.acc);
  const worstAcc = [...rows].sort((a, b) => (a.km.acc - a.rust.acc) - (b.km.acc - b.rust.acc))[0];

  body.innerHTML = "";
  const lead = document.createElement("p");
  lead.innerHTML =
    `Measured on <b>${n}</b> suites · <a href="/bench/">benchmark</a> · engine ${meta.git_sha || "?"} · ${host} · ${SUITE_ORDER_NOTE}`;
  const ul = document.createElement("ul");
  ul.appendChild(row(kmFaster.length === n,
    `<b>Reflex vs laya, speed:</b> faster on <b>${kmFaster.length}/${n}</b>, median <b>${Math.round(speedup).toLocaleString()}×</b>.`));
  const slowList = rustSlower.slice(0, 3)
    .map((r) => `${r.name} ${ms(r.rust.p50)} vs ${ms(r.py.p50)} ms`).join(", ");
  ul.appendChild(row(rustFaster.length === n,
    `<b>Rust vs Python laya, speed:</b> Rust faster on <b>${rustFaster.length}/${n}</b>` +
    (rustSlower.length
      ? `, slower on ${rustSlower.length} (${slowList}) — a bug by our bar, open as <a href="https://github.com/gist-rs/riir-reflex/blob/HEAD/.issues/020_riir_metal_latency_parity.md">riir-reflex Issue 020</a>.`
      : ".")));
  ul.appendChild(row(accEqual.length === n ? null : false,
    `<b>Rust vs Python laya, accuracy:</b> identical on <b>${accEqual.length}/${n}</b> — a parity port, by design.`));
  ul.appendChild(row(kmAccAtLeast.length === n,
    `<b>Reflex vs laya, accuracy:</b> at or above laya on <b>${kmAccAtLeast.length}/${n}</b>` +
    (kmAccAtLeast.length < n
      ? `; trails on the rest (widest: ${worstAcc.name} ${pct(worstAcc.km.acc)} vs ${pct(worstAcc.rust.acc)}) — published, not hidden.`
      : ".")));
  body.append(lead, ul);
}

fetch("/data/bench.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then(render)
  .catch((e) => {
    const body = document.getElementById("tldr-body");
    if (body) body.textContent = `benchmark data unavailable (${e.message}) — see /bench/.`;
  });
