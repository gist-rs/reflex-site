// bench_provenance.js — the two provenance reads every page shares, so the
// home, arena and bench pages cannot disagree about them. Classic script
// (sets window.BenchProv); the arena's ES modules import it for its side
// effect.
//
// latestRun(d): the NEWEST run that contributed anything to data/bench.json.
//   meta.date_utc / meta.git_sha are the table's ORIGINAL run (Bench 001);
//   lane-scoped updates never replace them, so quoting meta as "measured"
//   dates the page three days early (reflex Bench 067's misreading, found
//   on the live page 2026-09-27). Candidates: meta, every meta.hosts row,
//   and every lane_sources entry — ISO-8601 UTC strings order by text.
//
// latency(cells): the Issue-021 verdict tally over lane cells —
//   {n, unfit, unjudged, unknown}. publish_bench.py stamps
//   cell.latency_quotable from the run the TIMING came from (true / false /
//   null = unjudged); absent = unknown. Never read false as a pass.
(function () {
  "use strict";

  function latestRun(d) {
    const meta = (d && d.meta) || {};
    let best = null;
    const consider = (r, host) => {
      if (!r || typeof r.date_utc !== "string") return;
      if (!best || r.date_utc > best.date_utc) {
        best = { date_utc: r.date_utc, git_sha: r.git_sha || "?", host: host || r.host || "?" };
      }
    };
    consider(meta, meta.host);
    for (const row of meta.hosts || []) {
      consider(row, row.host);
      for (const src of Object.values(row.lane_sources || {})) consider(src, row.host);
    }
    return best;
  }

  function latency(cells) {
    const t = { n: 0, unfit: 0, unjudged: 0, unknown: 0 };
    for (const c of cells) {
      if (!c) continue;
      t.n += 1;
      if (!("latency_quotable" in c)) t.unknown += 1;
      else if (c.latency_quotable === false) t.unfit += 1;
      else if (c.latency_quotable === null) t.unjudged += 1;
    }
    return t;
  }

  // The one sentence every surface prints when a claim rests on timing the
  // run itself judged unfit — shown, never silently counted as a result.
  // `subject` names the lane(s) and counts, e.g. "Reflex's timing on 14/14 suites".
  const unfitNote = (subject) =>
    `${subject} comes from a run whose own box check judged the machine unfit (load) — shown, not quotable; re-measure pending.`;

  window.BenchProv = { latestRun, latency, unfitNote };
})();
