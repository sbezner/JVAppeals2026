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

// Compact dollar format for table cells where the full "million" suffix
// is too wordy. Handles small magnitudes honestly ($127K, $3.2M, $1.4B)
// so a small-neighborhood gap doesn't read as "$0M" → "no gap."
function fmtMoneyCompact(n) {
  if (n == null || n <= 0) return "$0";
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 10_000_000) return "$" + Math.round(n / 1_000_000) + "M";
  if (n >= 999_500) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1_000) + "K";
  return "$" + Math.round(n);
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

// Bucket a single over-% into its CSS class (matches findings.py).
function overPctBucket(pct) {
  if (pct > 7) return "red";
  if (pct >= 2) return "yellow";
  if (pct >= -5) return "green";
  return "purple";
}

// Build an inline-SVG histogram of over-% values across the whole JV
// dataset. Pure SVG — no chart library. 2.5% bin width gives ~44 bars
// across the -40..+70% range (covers >99.9% of parcels). Each bar is
// colored by the bucket its left-edge sits in, so the histogram
// visually explains the same bucket ladder that appears below it.
function buildDistributionSVG(pcts) {
  const LO = -40, HI = 70, BIN_WIDTH = 2.5;
  const bins = [];
  for (let left = LO; left < HI; left += BIN_WIDTH) {
    bins.push({ left, right: left + BIN_WIDTH, count: 0 });
  }
  for (const p of pcts) {
    if (p < LO || p >= HI) continue;
    const idx = Math.floor((p - LO) / BIN_WIDTH);
    if (idx >= 0 && idx < bins.length) bins[idx].count++;
  }
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const med = median(pcts);

  // Coordinate space. Using a wide viewBox so the bars stay rectangular
  // at letterbox aspect ratios; the CSS width: 100% scales it to the
  // available card width.
  const VB_W = 660, VB_H = 220;
  const PAD_L = 20, PAD_R = 20, PAD_T = 28, PAD_B = 42;
  const CHART_W = VB_W - PAD_L - PAD_R;
  const CHART_H = VB_H - PAD_T - PAD_B;

  const xScale = (pct) => PAD_L + ((pct - LO) / (HI - LO)) * CHART_W;
  const yScale = (count) => PAD_T + CHART_H - (count / maxCount) * CHART_H;
  const barW = CHART_W / bins.length;

  // Bars (one <rect> per bin).
  const bars = bins.map((b) => {
    const x = xScale(b.left);
    const y = yScale(b.count);
    const h = PAD_T + CHART_H - y;
    if (b.count === 0) return "";
    return (
      `<rect class="chart-bar chart-bar-${overPctBucket(b.left)}" ` +
      `x="${(x + 0.5).toFixed(1)}" y="${y.toFixed(1)}" ` +
      `width="${(barW - 1).toFixed(1)}" height="${h.toFixed(1)}"/>`
    );
  }).join("");

  // Bucket-cutoff dashed verticals at the statutory thresholds.
  const cutoffs = [-5, 2, 7];
  const cutoffLines = cutoffs.map((c) => {
    const x = xScale(c).toFixed(1);
    return `<line class="chart-cutoff" x1="${x}" y1="${PAD_T}" x2="${x}" y2="${PAD_T + CHART_H}"/>`;
  }).join("");

  // City-wide median marker + label.
  const medX = xScale(med).toFixed(1);
  const medLabel = `median ${med >= 0 ? "+" : ""}${med.toFixed(1)}%`;
  const medianEls =
    `<line class="chart-median" x1="${medX}" y1="${PAD_T - 4}" x2="${medX}" y2="${PAD_T + CHART_H}"/>` +
    `<text class="chart-median-label" x="${medX}" y="${(PAD_T - 8).toFixed(1)}" text-anchor="middle">${medLabel}</text>`;

  // Baseline (x-axis line).
  const baseline = `<line class="chart-baseline" x1="${PAD_L}" y1="${PAD_T + CHART_H}" x2="${PAD_L + CHART_W}" y2="${PAD_T + CHART_H}"/>`;

  // X-axis ticks + labels every 10%.
  const ticks = [-40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70];
  const xAxis = ticks.map((t) => {
    const x = xScale(t).toFixed(1);
    const label = (t > 0 ? "+" : "") + t + "%";
    return (
      `<line class="chart-axis-tick" x1="${x}" y1="${PAD_T + CHART_H}" x2="${x}" y2="${PAD_T + CHART_H + 4}"/>` +
      `<text class="chart-axis-label" x="${x}" y="${PAD_T + CHART_H + 18}" text-anchor="middle">${label}</text>`
    );
  }).join("");

  return (
    `<svg class="chart-svg" viewBox="0 0 ${VB_W} ${VB_H}" ` +
    `preserveAspectRatio="xMidYMid meet" role="img" ` +
    `aria-label="Distribution of over-assessment percentages across ${fmtInt(pcts.length)} Jersey Village parcels, ranging from ${LO}% to ${HI}%, with a median of ${med.toFixed(1)}%.">` +
      bars + cutoffLines + baseline + xAxis + medianEls +
    `</svg>`
  );
}

function renderDistributionChart(parcels) {
  const pcts = parcels.map((p) => p.p).filter((p) => p != null);
  if (!pcts.length) {
    $("chart").innerHTML = `<p class="chart-empty">No comp-matched parcels available to chart.</p>`;
    return;
  }
  $("chart").innerHTML = buildDistributionSVG(pcts);
  const med = median(pcts);
  $("chart-caption").innerHTML =
    `<b>median: ${med >= 0 ? "+" : ""}${med.toFixed(1)}%</b> &middot; ` +
    `${fmtInt(pcts.length)} parcels with matched comps`;
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

// For a group of parcels, pick the most common street name to serve as
// a human-readable label for the HCAD neighborhood code. Strips the
// leading house number from each address and counts. If no address
// resolves cleanly, falls back to "various streets."
function nbhdLabel(parcelsInNbhd) {
  const streets = new Map();
  for (const p of parcelsInNbhd) {
    const addr = (p.d || "").trim();
    if (!addr) continue;
    const m = addr.match(/^\d+\s+(.+?)$/);
    if (!m) continue;
    const street = m[1].toUpperCase();
    streets.set(street, (streets.get(street) || 0) + 1);
  }
  let best = null, bestCount = 0;
  for (const [street, count] of streets) {
    if (count > bestCount) { best = street; bestCount = count; }
  }
  return best || "various streets";
}

// Group parcels by HCAD neighborhood code, compute per-group aggregates,
// and render a table. Shows where §41.43(b)(3) cases cluster — useful
// for local press, neighborhood advocacy, and context for homeowners
// who want to know how their subdivision compares citywide.
// Filters out nbhds with fewer than 10 parcels (sample too small to
// generalize from).
function renderNbhdBreakdown(parcels) {
  const MIN_N = 10;
  const groups = new Map();
  for (const p of parcels) {
    if (!p.nbhd || p.p == null) continue; // skip gray (no over-% computed)
    if (!groups.has(p.nbhd)) groups.set(p.nbhd, []);
    groups.get(p.nbhd).push(p);
  }

  const rows = [];
  for (const [nbhd, group] of groups) {
    if (group.length < MIN_N) continue;
    const fileCount = group.filter((p) => p.c === "red" || p.c === "yellow").length;
    const caseRate = 100 * fileCount / group.length;
    const medOver = median(group.map((p) => p.p).filter((v) => v != null));
    const gap = group
      .filter((p) => (p.c === "red" || p.c === "yellow") && p.v != null && p.fair != null)
      .reduce((s, p) => s + (p.v - p.fair), 0);
    rows.push({
      nbhd, label: nbhdLabel(group),
      count: group.length, caseRate, medOver, gap,
    });
  }

  if (!rows.length) {
    $("nbhd-body").innerHTML = `<tr><td colspan="5" class="nbhd-empty">No neighborhoods with ≥${MIN_N} matched parcels.</td></tr>`;
    return;
  }

  // Sort by case rate, descending — the most-over-assessed neighborhoods
  // come first. Break ties with raw # of homes (larger first).
  rows.sort((a, b) => (b.caseRate - a.caseRate) || (b.count - a.count));

  $("nbhd-body").innerHTML = rows.map((r) => (
    `<tr>` +
      `<td class="nbhd-label">` +
        `<b>${r.label}</b>` +
        `<span class="nbhd-code">nbhd ${r.nbhd}</span>` +
      `</td>` +
      `<td class="num">${fmtInt(r.count)}</td>` +
      `<td class="num">${Math.round(r.caseRate)}%</td>` +
      `<td class="num">${fmtPct(r.medOver, 1)}</td>` +
      `<td class="num">${fmtMoneyCompact(r.gap)}</td>` +
    `</tr>`
  )).join("");

  // Footer "Total" row. Computed from every parcel in every shown
  // neighborhood (not from the per-row totals, which are each already
  // rounded). This is what closes the gap between the per-row cells
  // and the $40M hero stat — same dataset, same aggregation rule,
  // no rounding drift.
  const shownParcels = [];
  for (const [nbhd, group] of groups) {
    if (group.length >= MIN_N) shownParcels.push(...group);
  }
  const tFile = shownParcels.filter((p) => p.c === "red" || p.c === "yellow");
  const tCaseRate = shownParcels.length ? 100 * tFile.length / shownParcels.length : 0;
  const tMedOver = median(shownParcels.map((p) => p.p).filter((v) => v != null));
  const tGap = tFile
    .filter((p) => p.v != null && p.fair != null)
    .reduce((s, p) => s + (p.v - p.fair), 0);

  $("nbhd-foot").innerHTML = (
    `<tr class="nbhd-total">` +
      `<td class="nbhd-label">` +
        `<b>Total</b>` +
        `<span class="nbhd-code">all matched JV parcels</span>` +
      `</td>` +
      `<td class="num">${fmtInt(shownParcels.length)}</td>` +
      `<td class="num">${Math.round(tCaseRate)}%</td>` +
      `<td class="num">${fmtPct(tMedOver, 1)}</td>` +
      `<td class="num">${fmtMoneyCompact(tGap)}</td>` +
    `</tr>`
  );
}

function renderStats(parcels) {
  // Hero: total appraised value + parcel count.
  const total = parcels.reduce((sum, p) => sum + (p.v || 0), 0);
  $("hero-total").textContent = fmtMillions(total);
  $("hero-count").textContent = fmtInt(parcels.length);

  // Pair of secondary headline stats:
  //   #1 — combined over-assessment: sum of (v − fair) across red+yellow
  //   #3 — median year-over-year appraisal change across all parcels
  const fileable = parcels.filter((p) =>
    (p.c === "red" || p.c === "yellow") && p.v != null && p.fair != null
  );
  const combinedGap = fileable.reduce((s, p) => s + (p.v - p.fair), 0);
  $("stat-combined").textContent = fmtMillions(combinedGap);

  const yoys = parcels.map((p) => p.yoy).filter((y) => y != null);
  $("stat-yoy").textContent = fmtPct(median(yoys), 1);

  // Distribution histogram (renders after the trio, before the bucket
  // ladder — the visual speaks the same language as the ladder below).
  renderDistributionChart(parcels);

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

  renderNbhdBreakdown(parcels);

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
