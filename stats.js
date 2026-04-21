// stats.js — client-side aggregator for stats.html.
// Reads data/parcels.json (the same compact file the map loads) and
// renders JV-wide summary numbers. No pipeline dependency; numbers
// refresh automatically the next time parcels.json is regenerated.

function $(id) { return document.getElementById(id); }

function fmtInt(n) {
  return (n == null ? 0 : n).toLocaleString();
}

function fmtMillions(n) {
  // "$899 million" / "$1.2 billion" — never scientific notation; always
  // headline-friendly. Under $10M we round to the nearest million anyway
  // because this is a community-scale readout, not a spreadsheet.
  if (n == null || n <= 0) return "$0";
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(2) + " billion";
  return "$" + Math.round(n / 1_000_000).toLocaleString() + " million";
}

function pctOfTotal(part, total) {
  if (!total) return 0;
  return Math.round(100 * part / total);
}

// Ordering of the bucket rows. Same visual order as the map-overlay
// legend so the two reads consistently.
const BUCKETS = [
  { key: "red",    label: "Strong case",             desc: "more than 7% over the per-sqft median" },
  { key: "yellow", label: "Marginal case",           desc: "2–7% over" },
  { key: "green",  label: "Within the noise band",   desc: "skip — not worth filing" },
  { key: "purple", label: "Appraised below the median", desc: "more than 5% under (ARB can adjust up)" },
  { key: "gray",   label: "No comparable homes matched", desc: "review manually" },
];

function renderStats(parcels) {
  const total = parcels.reduce((sum, p) => sum + (p.v || 0), 0);
  $("hero-total").textContent = fmtMillions(total);
  $("hero-count").textContent = fmtInt(parcels.length);

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

  // "Also on the map" — secondary flags that don't fit in the bucket
  // ladder but matter for interpretation.
  const caps = parcels.filter((p) => p.cap).length;
  const diffs = parcels.filter((p) => p.dis).length;
  const notable = [];
  notable.push(
    `<li><b>${fmtInt(caps)} homes</b> &mdash; Possible &sect;23.23 homestead-cap ` +
      `claim (homesteaded home with a year-over-year appraisal jump greater than 10%).</li>`
  );
  notable.push(
    `<li><b>${fmtInt(diffs)} homes (${pctOfTotal(diffs, parcels.length)}%)</b> &mdash; ` +
      `Per-sqft and raw-dollar methodologies disagree on the file-vs-skip ` +
      `verdict. The parcel's report shows both numbers side-by-side.</li>`
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
    const resp = await fetch("data/parcels.json", { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const doc = await resp.json();
    if (!doc || !Array.isArray(doc.parcels)) {
      throw new Error("parcels.json is empty or malformed");
    }
    renderStats(doc.parcels);
  } catch (e) {
    showError(`Could not load parcel data (${e.message}). Please try again.`);
  }
}

boot();
