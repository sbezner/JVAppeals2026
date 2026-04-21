// stats.js — client-side aggregator for stats.html.
// Reads data/reports.json (the lazy-loaded full dataset that feeds
// report.html) and renders JV-wide summary numbers. No pipeline
// dependency; numbers refresh automatically the next time
// reports.json is regenerated.

function $(id) { return document.getElementById(id); }

function fmtInt(n) {
  return (n == null ? 0 : n).toLocaleString();
}

function fmtMoney(n) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function fmtMillions(n) {
  // "$899 million" / "$1.2 billion" — headline-friendly. Under $10M
  // we still round to the nearest million because this is a
  // community-scale readout, not a spreadsheet.
  if (n == null || n <= 0) return "$0";
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(2) + " billion";
  return "$" + Math.round(n / 1_000_000).toLocaleString() + " million";
}

function fmtPct(n, digits = 1) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function pctOfTotal(part, total) {
  if (!total) return 0;
  return Math.round(100 * part / total);
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Ordering of the bucket rows. Matches the map-overlay legend so the
// two reads consistently.
const BUCKETS = [
  { key: "red",    label: "Strong case",             desc: "more than 7% over the per-sqft median" },
  { key: "yellow", label: "Marginal case",           desc: "2–7% over" },
  { key: "green",  label: "Within the noise band",   desc: "skip — not worth filing" },
  { key: "purple", label: "Appraised below the median", desc: "more than 5% under (ARB can adjust up)" },
  { key: "gray",   label: "No comparable homes matched", desc: "review manually" },
];

function renderStats(parcels) {
  // Hero: total appraised value + parcel count.
  const total = parcels.reduce((sum, p) => sum + (p.v || 0), 0);
  $("hero-total").textContent = fmtMillions(total);
  $("hero-count").textContent = fmtInt(parcels.length);

  // Trio of secondary headline stats.
  //   #1 — combined over-assessment: sum of (v − fair) across red+yellow
  //   #2 — average over-assessment for a red-bucket ("strong case") home
  //   #3 — median year-over-year appraisal change across all parcels
  const fileable = parcels.filter((p) =>
    (p.c === "red" || p.c === "yellow") && p.v != null && p.fair != null
  );
  const combinedGap = fileable.reduce((s, p) => s + (p.v - p.fair), 0);
  $("stat-combined").textContent = fmtMillions(combinedGap);

  // Median, not mean — the red-home gap distribution is right-skewed
  // by a handful of luxury-home outliers (one $1.3M parcel alone adds
  // >$1k/parcel to the mean). Median gives "typical red home" what the
  // caption actually promises.
  const reds = parcels.filter((p) => p.c === "red" && p.v != null && p.fair != null);
  const medianRedGap = median(reds.map((p) => p.v - p.fair));
  $("stat-avg-red").textContent = fmtMoney(medianRedGap);

  const yoys = parcels.map((p) => p.yoy).filter((y) => y != null);
  $("stat-yoy").textContent = fmtPct(median(yoys), 1);

  // Bucket ladder.
  const counts = {};
  for (const p of parcels) counts[p.c || "gray"] = (counts[p.c || "gray"] || 0) + 1;

  $("buckets-body").innerHTML = BUCKETS.map((b) => {
    const n = counts[b.key] || 0;
    return (
      `<tr class="bucket-row">` +
        `<td class="bucket-dot"><span class="dot ${b.key}"></span></td>` +
        `<td class="bucket-count">${fmtInt(n)}</td>` +
        `<td class="bucket-pct">(${pctOfTotal(n, parcels.length)}%)</td>` +
        `<td class="bucket-label"><b>${b.label}</b> &mdash; ${b.desc}</td>` +
      `</tr>`
    );
  }).join("");

  // "Also on the map" — secondary flags. The cap-violation line gets
  // the homestead-exposure % layered in so readers see what fraction
  // of homesteaded homes are bumping up against the §23.23 10% cap.
  const caps = parcels.filter((p) => p.cap).length;
  const diffs = parcels.filter((p) => p.dis).length;
  const homesteaded = parcels.filter((p) => p.hs).length;
  const hsWithCapHit = parcels.filter(
    (p) => p.hs && p.yoy != null && p.yoy > 10
  ).length;
  const hsExposurePct = pctOfTotal(hsWithCapHit, homesteaded);

  const notable = [];
  notable.push(
    `<li><b>${fmtInt(caps)} homes (${hsExposurePct}% of homesteaded homes)</b> ` +
      `&mdash; Possible &sect;23.23 homestead-cap claim. A residence ` +
      `homestead with a year-over-year appraisal jump greater than 10% ` +
      `triggers a separate statutory ground on top of the per-sqft test.</li>`
  );
  notable.push(
    `<li><b>${fmtInt(diffs)} homes (${pctOfTotal(diffs, parcels.length)}%)</b> ` +
      `&mdash; Per-sqft and raw-dollar methodologies disagree on the ` +
      `file-vs-skip verdict. The parcel's report shows both numbers ` +
      `side-by-side.</li>`
  );
  $("notable").innerHTML = notable.join("");

  $("stats").hidden = false;
}

function showError(msg) {
  $("stats-error-msg").textContent = msg;
  $("stats-error").hidden = false;
}

async function boot() {
  try {
    // reports.json carries everything the stats page needs — the per-
    // parcel `fair`, `yoy`, `hs`, `cap`, `dis` fields plus the same
    // `v` and `c` that parcels.json has. One fetch suffices.
    const resp = await fetch("data/reports.json", { cache: "default" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const reports = await resp.json();
    const parcels = Object.values(reports || {});
    if (!parcels.length) throw new Error("reports.json is empty");
    renderStats(parcels);
  } catch (e) {
    showError(`Could not load parcel data (${e.message}). Please try again.`);
  }
}

boot();
