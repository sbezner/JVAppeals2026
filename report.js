// report.js — populates report.html from data/reports.json based on ?a=<account>.
// All static text (headings, steps, rebuttals, disclaimer) lives in the HTML.
// This file only fills in the parcel-specific slots: address, bottom line,
// facts table, comp table, and hearing script.

const COLOR_LABEL = {
  red:    { verdict: "You have statutory grounds to appeal under §41.43(b)(3).", css: "red",
            banner: "FILE", bannerSub: "Strong unequal-appraisal case under §41.43(b)(3)." },
  yellow: { verdict: "The appeal case is thin but presentable under §41.43(b)(3).", css: "yellow",
            banner: "Consider filing", bannerSub: "Marginal case — a reduction is possible but not guaranteed." },
  green:  { verdict: "This is within the normal noise of comp selection; filing is unlikely to change the value.", css: "green",
            banner: "Skip", bannerSub: "Within the noise band — not worth filing in either direction." },
  purple: { verdict: "Your appraisal is well below the median of similar homes — the ARB has authority to adjust values UPWARD as well as downward, so filing here risks an increase. Strongly recommend NOT filing.", css: "purple",
            banner: "DO NOT FILE", bannerSub: "Your appraisal is below the median — the ARB can adjust values upward." },
  gray:   { verdict: "No unequal-appraisal case is available from the standard filters — review by hand if it matters to you.", css: "gray",
            banner: "Review manually", bannerSub: "Fewer than 5 comparable homes matched — hand-pick comps on hcad.org." },
};

// Comp-basket coefficient of variation (CV) → verbal confidence label.
// CV = stdev/mean of comp $/sqft. Lower = comps cluster tightly → median is
// trustworthy. Wider spread → median is shaky and any one comp could swing
// the case.
function confidenceLabel(cv) {
  if (cv == null) return null;
  if (cv < 10) return { label: "tight", desc: "comps cluster within a few percent — the median is solid." };
  if (cv < 15) return { label: "moderate", desc: "comps vary modestly — the median is reasonable but not airtight." };
  return { label: "wide", desc: "comps vary widely — the median is less reliable; review individual comp choices before filing." };
}

function $(id) { return document.getElementById(id); }

function escape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMoney(n) {
  if (n == null) return "";
  return "$" + Math.round(n).toLocaleString();
}

function fmtPsf(n) {
  if (n == null) return "";
  return "$" + Number(n).toFixed(2);
}

function fmtInt(n) {
  if (n == null) return "";
  return Math.round(n).toLocaleString();
}

function showError(msg) {
  $("report").hidden = true;
  $("report-error-msg").textContent = msg;
  $("report-error").hidden = false;
}

function renderFacts(p) {
  const addr = `${p.d || ""}${p.z ? `, Jersey Village, TX ${p.z}` : ", Jersey Village, TX"}`;
  const appraisedCell = p.v != null && p.psf != null
    ? `${fmtMoney(p.v)} <span class="psf-inline">(${fmtPsf(p.psf)}/sqft)</span>`
    : fmtMoney(p.v);
  const rows = [
    ["HCAD Account", p.a],
    ["Site Address", addr],
    ["Living Area", p.sqft != null ? `${fmtInt(p.sqft)} sqft` : ""],
    ["Year Built", p.year != null ? String(p.year) : ""],
    ["Grade / Class", p.grade || ""],
    ["Neighborhood Code", p.nbhd || ""],
    ["2026 Appraised Value", appraisedCell],
  ];
  $("facts-body").innerHTML = rows
    .map(([k, v], i) =>
      `<tr><th scope="row">${escape(k)}</th>` +
      // Last row uses innerHTML for the inline psf span; others are text.
      `<td>${i === rows.length - 1 ? v : escape(v)}</td></tr>`)
    .join("");
}

function renderBottomLine(p) {
  const verdict = (COLOR_LABEL[p.c] || COLOR_LABEL.gray).verdict;
  if (p.med_psf == null || p.p == null) {
    $("bottomline").innerHTML =
      `HCAD's 2026 appraisal of <b>${fmtMoney(p.v)}</b>. ` +
      `No comparable properties could be matched automatically for this parcel. ${escape(verdict)}`;
    return;
  }
  const direction = p.p > 0 ? "above" : "below";
  $("bottomline").innerHTML =
    `Your 2026 appraisal of <b>${fmtMoney(p.v)}</b> (<b>${fmtPsf(p.psf)}/sqft</b>) is ` +
    `<b>${Math.abs(p.p).toFixed(1)}% ${direction}</b> the median of 5 ` +
    `comparable homes (<b>${fmtPsf(p.med_psf)}/sqft</b>, implying a fair value of ` +
    `<b>${fmtMoney(p.fair)}</b> at your ${fmtInt(p.sqft)} sqft). ` +
    escape(verdict);
}

function renderComps(p) {
  const body = $("comps-body");
  const foot = $("comps-foot");
  // Subject row.
  const subjectRow = `<tr class="subject-row">
    <td>Subject</td>
    <td>${escape(p.a)}</td>
    <td class="num">${fmtInt(p.sqft)}</td>
    <td class="num">${escape(p.year)}</td>
    <td>${escape(p.grade)}</td>
    <td class="num">${fmtPsf(p.psf)}</td>
    <td class="num">${fmtMoney(p.v)}</td>
  </tr>`;
  // Comp rows.
  const compRows = p.comps.map((c, i) => `<tr>
    <td>${i + 1}</td>
    <td>${escape(c.a)}</td>
    <td class="num">${fmtInt(c.sqft)}</td>
    <td class="num">${escape(c.year)}</td>
    <td>${escape(c.grade)}</td>
    <td class="num">${fmtPsf(c.psf)}</td>
    <td class="num">${fmtMoney(c.v)}</td>
  </tr>`).join("");
  body.innerHTML = subjectRow + compRows;

  // Summary rows (tfoot). Median $/sqft goes in the $/sqft column; the
  // derived dollar numbers (fair value, appraisal, over-assessment) go
  // in the Value column. Optional comp-spread badge appears next to the
  // median row so the reader knows how confident this median is.
  const gap = (p.v || 0) - (p.fair || 0);
  const gapLabel = p.p > 0 ? "Over-assessment" : "Under-assessment";
  const gapClass = p.p > 0 ? "over" : "under";
  const conf = confidenceLabel(p.cv);
  const confBadge = conf
    ? ` <span class="conf-badge conf-${conf.label}" title="Comp-basket coefficient of variation: ${p.cv}%. ${escape(conf.desc)}">spread: ${conf.label}</span>`
    : "";
  foot.innerHTML = `
    <tr class="summary"><td colspan="5" class="num">Median $/sqft of 5 comps${confBadge}</td><td class="num">${fmtPsf(p.med_psf)}</td><td></td></tr>
    <tr class="summary"><td colspan="6" class="num">Fair value at median $/sqft (&times; ${fmtInt(p.sqft)} sqft)</td><td class="num">${fmtMoney(p.fair)}</td></tr>
    <tr class="summary"><td colspan="6" class="num">HCAD 2026 appraisal</td><td class="num">${fmtMoney(p.v)}</td></tr>
    <tr class="summary ${gapClass}"><td colspan="6" class="num">${escape(gapLabel)}</td><td class="num">${fmtMoney(Math.abs(gap))} (${p.p > 0 ? "+" : ""}${p.p.toFixed(1)}%)</td></tr>
  `;
}

function renderHearingScript(p) {
  if (p.med_psf == null || p.p == null) {
    $("hearing-script").innerHTML =
      `<p>Keep this report as your personal script for the hearing. ` +
      `Because no automatic comps were matched, you'll need to present ` +
      `your own: pick 5 neighboring properties on hcad.org that share ` +
      `your HCAD neighborhood code, grade, are within &plusmn;15% of your ` +
      `${fmtInt(p.sqft)} sqft, and within 10 years of your ${escape(p.year)} build. ` +
      `Take the median of their <b>$/sqft</b>, multiply by your ${fmtInt(p.sqft)} sqft, ` +
      `and argue that implied fair value against your ${fmtMoney(p.v)} appraisal.</p>`;
    return;
  }
  if (p.c === "purple") {
    const absPct = Math.abs(p.p).toFixed(1);
    $("hearing-script").innerHTML = `
      <div class="purple-warning">
        <p><b>Do not file this protest.</b> Your 2026 appraisal of <b>${fmtMoney(p.v)}</b>
        (${fmtPsf(p.psf)}/sqft) is already <b>${absPct}% below</b> the
        per-square-foot median of 5 comparable homes
        (${fmtPsf(p.med_psf)}/sqft, implying a fair value of ${fmtMoney(p.fair)}
        at your ${fmtInt(p.sqft)} sqft).</p>
        <p>The Appraisal Review Board has the statutory authority to adjust
        appraised values <b>upward as well as downward</b>. If you file an
        unequal-appraisal protest with these numbers, the panel may apply the
        same &sect;41.43(b)(3) median test to <em>your</em> case and conclude
        the appraisal should be raised toward ${fmtMoney(p.fair)}, costing you
        roughly ${fmtMoney(p.fair - p.v)} in additional taxable value.</p>
        <p>The remaining playbook below (deadlines, iFile, hearing scripts)
        applies if you ever face a future year where your appraisal moves
        above the median &mdash; bookmark this page and re-check next April.</p>
      </div>`;
    return;
  }
  const dir = p.p > 0 ? "below" : "above";
  const absPct = Math.abs(p.p).toFixed(1);
  $("hearing-script").innerHTML = `
    <p>Keep this report as your personal script for the hearing. The core of your claim is two points:</p>
    <ol class="script">
      <li><b>"The median per-square-foot appraisal across 5 comparable homes in my neighborhood is ${fmtPsf(p.med_psf)}/sqft. Applied to my ${fmtInt(p.sqft)} sqft, that's a fair value of ${fmtMoney(p.fair)} &mdash; ${absPct}% ${dir} HCAD's appraisal of my home at ${fmtMoney(p.v)}."</b></li>
      <li><b>"These 5 comps share my neighborhood code (${escape(p.nbhd)}), my HCAD grade (${escape(p.grade)}), fall within &plusmn;15% of my ${fmtInt(p.sqft)} sqft, and within 10 years of my ${escape(p.year)} build. Per-square-foot is the same yardstick HCAD's own mass-appraisal model uses, so the district has already endorsed this as the right comparison."</b></li>
    </ol>
    <p>Stay focused on the per-square-foot median gap. That is the only argument &sect;41.43(b)(3) lets you win on &mdash; don't wander into market value, tax rates, or condition.</p>`;
}

function renderVerdictBanner(p) {
  const info = COLOR_LABEL[p.c] || COLOR_LABEL.gray;
  const banner = $("verdict-banner");
  banner.className = `verdict-banner verdict-${info.css}`;
  $("verdict-label").textContent = info.banner;
  $("verdict-subtitle").textContent = info.bannerSub;
  banner.hidden = false;
}

function renderReport(p) {
  const addrLine = p.d
    ? `${p.d}, Jersey Village, TX — HCAD ${p.a}`
    : `HCAD ${p.a}, Jersey Village, TX`;
  $("subtitle-1").textContent = addrLine;
  $("subtitle-2").textContent = addrLine;
  document.title = `2026 HCAD Appeal Report — ${p.d || p.a}`;

  // Apply bucket color class to the body so the bottom line can style it.
  document.body.classList.add(`bucket-${(COLOR_LABEL[p.c] || COLOR_LABEL.gray).css}`);

  renderVerdictBanner(p);
  renderFacts(p);
  renderBottomLine(p);
  renderHearingScript(p);

  // Comp section vs. gray variant — also swap the Legal Argument copy
  // so the gray report doesn't promise "the five comps below" when
  // there aren't any.
  const hasComps = Array.isArray(p.comps) && p.comps.length > 0;
  if (hasComps) {
    renderComps(p);
    $("comps-section").hidden = false;
    $("gray-notice").hidden = true;
  } else {
    $("comps-section").hidden = true;
    $("gray-notice").hidden = false;
    $("legal-argument").innerHTML =
      'The unequal-appraisal ground under <b>Texas Tax Code ' +
      '&sect;41.43(b)(3)</b> is still available to you, but it requires a ' +
      'set of 5 comparable properties that share your HCAD neighborhood ' +
      'code and grade, fall within &plusmn;15% of your living area, and ' +
      'within 10 years of your year built. The automatic search did not ' +
      'return 5 matches inside those filters &mdash; usually because the ' +
      "parcel's grade or size is unusual for its block. If you want to " +
      'file, pick your own 5 comps on hcad.org before the hearing. Once ' +
      'you have them, take the median of their <b>$/sqft</b>, multiply by ' +
      'your sqft, and compare the implied fair value to your appraisal &mdash; ' +
      "that's the test HCAD must pass.";
  }

  $("report").hidden = false;
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const acct = (params.get("a") || "").trim();
  if (!acct) {
    showError("No HCAD account specified. Go back to the map and click a parcel.");
    return;
  }
  let reports;
  try {
    const resp = await fetch("data/reports.json", { cache: "default" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    reports = await resp.json();
  } catch (e) {
    showError(`Could not load report data (${e.message}). Please try again.`);
    return;
  }
  const p = reports[acct];
  if (!p) {
    showError(`HCAD account ${acct} was not found in this dataset.`);
    return;
  }
  renderReport(p);
}

boot();
