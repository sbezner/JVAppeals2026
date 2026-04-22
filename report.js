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
  const addr = p.d
    ? `${escape(p.d)}${p.z ? `, Jersey Village, TX ${escape(p.z)}` : ", Jersey Village, TX"}`
    : "Jersey Village, TX";
  const appraisedCell = p.v != null && p.psf != null
    ? `${fmtMoney(p.v)} <span class="psf-inline">(${fmtPsf(p.psf)}/sqft)</span>`
    : fmtMoney(p.v);

  // Each row is [label, already-HTML-safe content]. Caller is
  // responsible for escape() when mixing user data in.
  const rows = [
    ["HCAD Account", escape(p.a || "")],
    ["Site Address", addr],
    ["Living Area", p.sqft != null ? `${fmtInt(p.sqft)} sqft` : ""],
    ["Year Built", p.year != null ? escape(String(p.year)) : ""],
    ["Grade / Class", escape(p.grade || "")],
    ["Neighborhood Code", escape(p.nbhd || "")],
    ["2026 Appraised Value", appraisedCell],
  ];

  // Year-over-year row. Present only when HCAD posted a prior-year
  // value — skipped for new construction, mid-year splits, and data
  // gaps. Muted styling; no red/green coloring because "up is bad"
  // isn't always true (under-assessed homes moving toward fair is
  // actually fine).
  if (p.v != null && p.prior_v != null && p.prior_v > 0) {
    const delta = ((p.v - p.prior_v) / p.prior_v) * 100;
    const sign = delta >= 0 ? "+" : "";
    rows.push([
      "2025 &rarr; 2026 Change",
      `<b class="yoy-delta">${sign}${delta.toFixed(1)}%</b>` +
      `<span class="yoy-amounts">(${fmtMoney(p.prior_v)} &rarr; ${fmtMoney(p.v)})</span>`,
    ]);
  }

  $("facts-body").innerHTML = rows
    .map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`)
    .join("");
}

// Three evaluation states:
//   - isEvaluable: has comps AND a 2026 appraisal AND a computed over_pct → full report
//   - hasCompsButNoValue: comps were found but HCAD hasn't posted tot_appr_val yet
//   - no comps at all: subject filter matched fewer than 5 neighbors
function hasComps(p) { return Array.isArray(p.comps) && p.comps.length > 0; }
function isEvaluable(p) { return hasComps(p) && p.v != null && p.p != null; }
function hasCompsButNoValue(p) { return hasComps(p) && p.v == null; }

function capBottomNote(p) {
  // One-sentence coda appended to every bottom line when the parcel has a
  // homestead-cap claim. Keeps the §41.43 message intact and layers the
  // §23.23 ground on top of it.
  if (!p.cap) return "";
  return (
    ` <span class="cap-note">Plus: a separate <b>§23.23 homestead cap</b> ` +
    `claim of <b>${fmtMoney(p.cap_excess)}</b> is available &mdash; ` +
    `see Alternate Ground below.</span>`
  );
}

function renderBottomLine(p) {
  const verdict = (COLOR_LABEL[p.c] || COLOR_LABEL.gray).verdict;
  const capNote = capBottomNote(p);
  if (isEvaluable(p)) {
    const direction = p.p > 0 ? "above" : "below";
    $("bottomline").innerHTML =
      `Your 2026 appraisal of <b>${fmtMoney(p.v)}</b> (<b>${fmtPsf(p.psf)}/sqft</b>) is ` +
      `<b>${Math.abs(p.p).toFixed(1)}% ${direction}</b> the median of 5 ` +
      `comparable homes (<b>${fmtPsf(p.med_psf)}/sqft</b>, implying a fair value of ` +
      `<b>${fmtMoney(p.fair)}</b> at your ${fmtInt(p.sqft)} sqft). ` +
      escape(verdict) + capNote;
    return;
  }
  if (hasCompsButNoValue(p)) {
    $("bottomline").innerHTML =
      "HCAD has not yet posted a 2026 appraised value for this parcel, so " +
      "the comparison to the comp median cannot be computed yet. When HCAD " +
      "updates its records, this report will refresh automatically." + capNote;
    return;
  }
  $("bottomline").innerHTML =
    `HCAD's 2026 appraisal of <b>${fmtMoney(p.v)}</b>. ` +
    `No comparable properties could be matched automatically for this parcel. ${escape(verdict)}` +
    capNote;
}

function hcadCell(account) {
  // Click → copy account to clipboard + open HCAD search in new tab.
  // Anchor's native href + target="_blank" handles opening; the click
  // listener (wired in boot()) handles the clipboard copy + toast.
  const acct = escape(account);
  return (
    `<a class="hcad-link" href="https://search.hcad.org/" ` +
    `target="_blank" rel="noopener" data-account="${acct}" ` +
    `title="Open HCAD search — your account number will be copied to the clipboard so you can paste it">` +
      `${acct}<span class="hcad-arrow" aria-hidden="true">&nbsp;&#8599;</span>` +
    `</a>`
  );
}

function renderComps(p) {
  const body = $("comps-body");
  const foot = $("comps-foot");
  // Subject row.
  const subjectRow = `<tr class="subject-row">
    <td>Subject</td>
    <td>${hcadCell(p.a)}</td>
    <td class="num">${fmtInt(p.sqft)}</td>
    <td class="num">${escape(p.year)}</td>
    <td>${escape(p.grade)}</td>
    <td class="num">${fmtPsf(p.psf)}</td>
    <td class="num">${fmtMoney(p.v)}</td>
  </tr>`;
  // Comp rows.
  const compRows = p.comps.map((c, i) => `<tr>
    <td>${i + 1}</td>
    <td>${hcadCell(c.a)}</td>
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

  // Alternate view: raw-dollar comp median with no size normalization.
  // This is what Chronicle shows and what most ARB panels compare against
  // at the hearing. Rendered as a muted appendix beneath the primary
  // per-sqft summary so homeowners can walk in with both numbers.
  let altRows = "";
  if (p.med_val != null && p.raw_p != null) {
    const rawGap = (p.v || 0) - p.med_val;
    const rawGapLabel = p.raw_p > 0 ? "Over-assessment" : "Under-assessment";
    const rawGapClass = p.raw_p > 0 ? "over" : "under";
    altRows = `
      <tr class="alt-head"><td colspan="7" class="num">Alternate view: raw-dollar median (no size adjustment) &mdash; method most ARB panels default to</td></tr>
      <tr class="alt-summary"><td colspan="6" class="num">Median of 5 comp appraisals</td><td class="num">${fmtMoney(p.med_val)}</td></tr>
      <tr class="alt-summary ${rawGapClass}"><td colspan="6" class="num">${escape(rawGapLabel)} vs. raw median</td><td class="num">${fmtMoney(Math.abs(rawGap))} (${p.raw_p > 0 ? "+" : ""}${p.raw_p.toFixed(1)}%)</td></tr>
    `;
  }

  foot.innerHTML = `
    <tr class="summary"><td colspan="5" class="num">Median $/sqft of 5 comps${confBadge}</td><td class="num">${fmtPsf(p.med_psf)}</td><td></td></tr>
    <tr class="summary"><td colspan="6" class="num">Fair value at median $/sqft (&times; ${fmtInt(p.sqft)} sqft)</td><td class="num">${fmtMoney(p.fair)}</td></tr>
    <tr class="summary"><td colspan="6" class="num">HCAD 2026 appraisal</td><td class="num">${fmtMoney(p.v)}</td></tr>
    <tr class="summary ${gapClass}"><td colspan="6" class="num">${escape(gapLabel)}</td><td class="num">${fmtMoney(Math.abs(gap))} (${p.p > 0 ? "+" : ""}${p.p.toFixed(1)}%)</td></tr>
    ${altRows}
  `;
}

function capScriptHtml(p) {
  if (!p.cap) return "";
  const ceiling = Math.round(p.prior_v * 1.10);
  const purpleNote = p.c === "purple"
    ? `<p class="cap-script-caution"><b>Tactical note:</b> because your ` +
      `2026 appraisal is <em>below</em> the median of comparable homes, ` +
      `the ARB panel has room to adjust upward under §41.43. Stay strictly ` +
      `on §23.23 at the hearing &mdash; do not volunteer comps, market ` +
      `value, or anything that invites the panel to evaluate your ` +
      `unequal-appraisal case. The cap argument is mechanical: prior ` +
      `value × 1.10 vs. posted value. That's the only ground you raise.</p>`
    : "";
  return `
    <div class="cap-script">
      <p><b>Primary claim: §23.23 homestead cap.</b> This is a mechanical
      argument &mdash; no comps, no adjustments, just the numbers. At the
      hearing, say:</p>
      <ol class="script">
        <li><b>"My home has an active residence homestead exemption on HCAD record."</b></li>
        <li><b>"Under Texas Tax Code §23.23, my appraised value cannot increase more than 10% year-over-year (plus the value of any new improvements)."</b></li>
        <li><b>"HCAD's prior-year appraisal was ${fmtMoney(p.prior_v)}. The 10% cap ceiling is ${fmtMoney(ceiling)}. HCAD's 2026 appraisal is ${fmtMoney(p.v)}, which exceeds the cap by ${fmtMoney(p.cap_excess)}."</b></li>
        <li><b>"I'm requesting a reduction to ${fmtMoney(ceiling)}, the statutory cap."</b></li>
      </ol>
      <p>The ARB can deny only by showing the excess reflects new improvements (additions, new construction, major remodels). If you haven't done any, this is a straightforward win.</p>
      ${purpleNote}
    </div>`;
}

function renderHearingScript(p) {
  const capHtml = capScriptHtml(p);
  let primaryHtml;

  if (hasCompsButNoValue(p)) {
    primaryHtml =
      `<p>HCAD has not yet published a 2026 appraised value for this ` +
      `parcel, so the numbers for your §41.43 hearing script aren't ` +
      `available yet. Refresh this page after HCAD updates and the script ` +
      `will populate automatically. In the meantime, the Playbook steps ` +
      `below (deadline, iFile, iSettle, rebuttals) still apply.</p>`;
  } else if (!isEvaluable(p)) {
    // No comps path. If cap also applies, the cap script above IS the
    // primary claim and the §41.43 "hand-pick your own" path is optional.
    primaryHtml = p.cap
      ? `<p><b>Secondary claim: §41.43 unequal appraisal.</b> The automatic ` +
        `comp search did not return 5 matches, so a §41.43 case isn't ` +
        `pre-computed for this parcel. If you want to add it on top of the ` +
        `cap claim, hand-pick 5 neighboring properties on hcad.org that ` +
        `share your HCAD neighborhood code, grade, are within &plusmn;15% ` +
        `of your ${fmtInt(p.sqft)} sqft, and within 10 years of your ` +
        `${escape(p.year)} build.</p>`
      : `<p>Keep this report as your personal script for the hearing. ` +
        `Because no automatic comps were matched, you'll need to present ` +
        `your own: pick 5 neighboring properties on hcad.org that share ` +
        `your HCAD neighborhood code, grade, are within &plusmn;15% of your ` +
        `${fmtInt(p.sqft)} sqft, and within 10 years of your ${escape(p.year)} build. ` +
        `Take the median of their <b>$/sqft</b>, multiply by your ${fmtInt(p.sqft)} sqft, ` +
        `and argue that implied fair value against your ${fmtMoney(p.v)} appraisal.</p>`;
  } else if (p.c === "purple") {
    const absPct = Math.abs(p.p).toFixed(1);
    primaryHtml = `
      <div class="purple-warning">
        <p><b>${p.cap ? "§41.43 context (do not raise at hearing)" : "Do not file this protest"}.</b>
        Your 2026 appraisal of <b>${fmtMoney(p.v)}</b>
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
        <p>${p.cap
          ? "Proceed with the §23.23 cap script above and do not mention comps or market value at the hearing."
          : "The remaining playbook below (deadlines, iFile, hearing scripts) applies if you ever face a future year where your appraisal moves above the median — bookmark this page and re-check next April."}</p>
      </div>`;
  } else {
    const dir = p.p > 0 ? "below" : "above";
    const absPct = Math.abs(p.p).toFixed(1);
    primaryHtml = `
      <p>${p.cap ? "<b>Secondary claim: §41.43 unequal appraisal.</b> " : ""}Keep this report as your personal script for the hearing. The core of your ${p.cap ? "§41.43 " : ""}claim is two points:</p>
      <ol class="script">
        <li><b>"The median per-square-foot appraisal across 5 comparable homes in my neighborhood is ${fmtPsf(p.med_psf)}/sqft. Applied to my ${fmtInt(p.sqft)} sqft, that's a fair value of ${fmtMoney(p.fair)} &mdash; ${absPct}% ${dir} HCAD's appraisal of my home at ${fmtMoney(p.v)}."</b></li>
        <li><b>"These 5 comps share my neighborhood code (${escape(p.nbhd)}), my HCAD grade (${escape(p.grade)}), fall within &plusmn;15% of my ${fmtInt(p.sqft)} sqft, and within 10 years of my ${escape(p.year)} build. Per-square-foot is the same yardstick HCAD's own mass-appraisal model uses, so the district has already endorsed this as the right comparison."</b></li>
      </ol>
      <p>Stay focused on the per-square-foot median gap. That is the only argument &sect;41.43(b)(3) lets you win on &mdash; don't wander into market value, tax rates, or condition.</p>`;
  }

  $("hearing-script").innerHTML = capHtml + primaryHtml;
}

function renderMethodsNote(p) {
  // Only fire on directional disagreements (map says file, raw says skip,
  // or vice versa). These flagged parcels are 20% of the map; the other
  // ~24% bucket disagreements are minor and don't change the decision.
  if (!p.dis) {
    $("methods-note").hidden = true;
    return;
  }
  const fileByPsf = p.c === "red" || p.c === "yellow";
  const fileByRaw = p.raw_c === "red" || p.raw_c === "yellow";
  const psfPct = Math.abs(p.p).toFixed(1);
  const rawPct = Math.abs(p.raw_p).toFixed(1);
  const psfDir = p.p > 0 ? "over" : "under";
  const rawDir = p.raw_p > 0 ? "over" : "under";
  let body;
  if (fileByPsf && !fileByRaw) {
    // Per-sqft suggests filing; raw-dollar doesn't.
    // Filing is the HIGH-RISK direction: ARB may use raw and raise the value.
    body =
      `The two methods disagree on what to do here. By the per-square-foot ` +
      `method (the primary analysis above), your appraisal is ${psfPct}% ` +
      `${psfDir} median &mdash; a filable case. By the raw-dollar method ` +
      `(what most ARB panels default to at a hearing), your appraisal is ` +
      `${rawPct}% ${rawDir} median &mdash; <b>no case, and potential ` +
      `upward-adjustment risk</b>. Your home is ${p.p > 0 ? "smaller" : "larger"} than the ` +
      `average of its comp band, which is why the two numbers diverge. ` +
      `Before filing, consider how the ARB panel is likely to compare your ` +
      `appraisal &mdash; if raw-dollar is their default, the case above ` +
      `may not hold.`;
  } else {
    // Raw-dollar says file; per-sqft doesn't.
    // Not filing is the LOW-RISK direction, but homeowner may miss a case.
    body =
      `The two methods disagree on what to do here. By the per-square-foot ` +
      `method (the primary analysis above), your appraisal is ${psfPct}% ` +
      `${psfDir} median &mdash; the recommendation is to skip. By the ` +
      `raw-dollar method (what most ARB panels default to at a hearing), ` +
      `your appraisal is ${rawPct}% ${rawDir} median &mdash; <b>a case ` +
      `does exist by that methodology</b>. Your home is ` +
      `${p.p > 0 ? "larger" : "smaller"} than the average of its comp ` +
      `band, which is why the two numbers diverge. If the ARB panel is ` +
      `likely to use raw-dollar medians (most do), the case above is ` +
      `stronger than the primary analysis suggests.`;
  }
  $("methods-note-body").innerHTML = body;
  $("methods-note").hidden = false;
}

function renderCapSection(p) {
  if (!p.cap) {
    $("cap-section").hidden = true;
    return;
  }
  const ceiling = Math.round(p.prior_v * 1.10);
  $("cap-explanation").innerHTML =
    `This parcel has an <b>HCAD residence homestead exemption</b>, which ` +
    `entitles the owner to a statutory <b>10% cap</b> on year-over-year ` +
    `appraisal increases under <b>Texas Tax Code &sect;23.23</b>. HCAD ` +
    `raised this appraisal <b>${p.yoy.toFixed(1)}%</b> from the prior ` +
    `year &mdash; above the 10% cap &mdash; so the owner is entitled to ` +
    `have the excess removed, independent of the &sect;41.43(b)(3) ` +
    `unequal-appraisal case above.`;
  $("cap-body").innerHTML = `
    <tr><th>Prior-year appraisal</th><td>${fmtMoney(p.prior_v)}</td></tr>
    <tr><th>10% cap ceiling (prior &times; 1.10)</th><td>${fmtMoney(ceiling)}</td></tr>
    <tr><th>2026 appraisal as posted</th><td>${fmtMoney(p.v)}</td></tr>
    <tr class="cap-excess">
      <th>Excess above the cap</th>
      <td>${fmtMoney(p.cap_excess)} (+${p.yoy.toFixed(1)}% YoY)</td>
    </tr>`;
  $("cap-section").hidden = false;
}

function renderVerdictBanner(p) {
  const info = COLOR_LABEL[p.c] || COLOR_LABEL.gray;
  const banner = $("verdict-banner");
  let cls = `verdict-${info.css}`;
  let label = info.banner;
  let sub = info.bannerSub;

  // Cap overrides. The §23.23 cap is a separate statutory ground, and for
  // most §41.43 buckets it is the dominant signal ("File, regardless of
  // what §41.43 says"). The exception is purple — under-assessed parcels
  // where filing any protest could invite the ARB to adjust upward toward
  // the comp median, which conflicts with the cap win.
  if (p.cap) {
    const excess = fmtMoney(p.cap_excess);
    if (p.c === "purple") {
      cls = "verdict-cap-conflict";
      label = "Mixed — read carefully";
      sub = `§23.23 cap claim worth ${excess}, but §41.43 risks an upward adjustment at the ARB. Details below.`;
    } else if (p.c === "red") {
      cls = "verdict-cap";
      label = "FILE — two grounds";
      sub = `§41.43 over-assessment AND §23.23 cap claim (${excess} excess).`;
    } else {
      cls = "verdict-cap";
      label = "FILE — §23.23 cap";
      sub = `Excess above the 10% homestead cap: ${excess}.`;
    }
  }

  banner.className = `verdict-banner ${cls}`;
  $("verdict-label").textContent = label;
  $("verdict-subtitle").textContent = sub;
  banner.hidden = false;
}

// Mini-map of the subject + 5 comps. Visual-only — doesn't change any
// number on the report. Uses lat/lon from parcels.json (passed in as a
// Map keyed by account) since reports.json doesn't carry coordinates.
// Silently skipped when parcels.json is unavailable (graceful
// degradation; the comp table is the authoritative record either way).
function renderCompsMap(p, parcelsByAccount) {
  if (!parcelsByAccount || !Array.isArray(p.comps) || p.comps.length === 0) return;
  if (typeof L === "undefined") return; // Leaflet didn't load; skip.
  const subject = parcelsByAccount.get(p.a);
  if (!subject || !subject.ll) return;

  const section = $("comps-map-section");
  const container = $("comps-map");
  if (!section || !container) return;
  section.hidden = false;

  const map = L.map(container, {
    scrollWheelZoom: false,   // don't hijack page scroll on a long report
    zoomControl: true,
    attributionControl: true,
  });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  // Subject marker — gold-highlighted circle with a bold blue ring, so
  // "your home" reads immediately against the numbered comps.
  const subjectIcon = L.divIcon({
    className: "comp-map-subject-marker",
    html: '<span class="subject-dot"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
  // Match the comp-popup format so a viewer can compare apples-to-apples
  // at the pin level: header row, sqft · $/sqft middle row, dollar value
  // bottom row. The "(Your home)" label replaces the "Comp #N" tag.
  const subjectPopup =
    `<b>${escape(p.d || "Your home")}</b> <span class="map-popup-tag">(Your home)</span><br>` +
    (p.sqft != null ? `${fmtInt(p.sqft)} sqft` : "") +
    (p.psf != null ? ` &middot; ${fmtPsf(p.psf)}/sqft` : "") +
    (p.v != null ? `<br>${fmtMoney(p.v)}` : "");
  L.marker(subject.ll, { icon: subjectIcon, zIndexOffset: 1000 })
    .bindPopup(subjectPopup)
    .addTo(map);

  // Numbered comp markers (1–5) matching the # column in the comp table.
  const points = [subject.ll];
  p.comps.forEach((c, i) => {
    const cp = parcelsByAccount.get(c.a);
    if (!cp || !cp.ll) return;
    const icon = L.divIcon({
      className: "comp-map-comp-marker",
      html: `<span class="comp-num">${i + 1}</span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    // The address is a same-tab link to this comp's full report, so
    // a skeptical homeowner can drill into any single comp's own
    // report, comps, and verdict. Same-tab keeps the browser history
    // tidy; right-click / long-press still gives "open in new tab".
    const addrHtml = `<a class="comp-popup-addr" href="report.html?a=${encodeURIComponent(c.a)}" title="Open this comp's report"><b>${escape(cp.d || c.a)}</b></a>`;
    const popup =
      addrHtml + `<br>` +
      `Comp #${i + 1}${c.sqft ? ` &middot; ${fmtInt(c.sqft)} sqft` : ""}` +
      (c.psf != null ? ` &middot; ${fmtPsf(c.psf)}/sqft` : "") +
      (c.v != null ? `<br>${fmtMoney(c.v)}` : "");
    L.marker(cp.ll, { icon }).bindPopup(popup).addTo(map);
    points.push(cp.ll);
  });

  // Fit to all 6 points (or however many we could resolve) with padding
  // so nothing sits on the edge.
  map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 17 });
}

function renderReport(p, parcelsByAccount) {
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
  renderMethodsNote(p);
  renderCapSection(p);
  renderCompsMap(p, parcelsByAccount);

  // Three paths, keyed off isEvaluable / hasCompsButNoValue / (neither).
  if (isEvaluable(p)) {
    renderComps(p);
    $("comps-section").hidden = false;
    $("gray-notice").hidden = true;
  } else {
    $("comps-section").hidden = true;
    $("gray-notice").hidden = false;
    if (hasCompsButNoValue(p)) {
      // HCAD data gap: 5 comps matched, but no 2026 appraisal posted yet.
      $("gray-notice").innerHTML =
        '<h2>No 2026 Appraised Value Yet</h2>' +
        '<p>HCAD has not yet posted a 2026 appraised value for this parcel. ' +
        'Five comparable homes were found that match the &sect;41.43(b)(3) ' +
        'filters (same neighborhood code, same grade, within &plusmn;15% ' +
        'living area, within 10 years of age), but without your own ' +
        'appraisal to compare against, no case can be computed. When HCAD ' +
        'posts the value, this report will refresh automatically.</p>' +
        '<p>The Playbook on Page 2 still applies &mdash; review it now so ' +
        "you're ready to act as soon as the value is posted.</p>";
      $("legal-argument").innerHTML =
        'This protest will be filed under <b>Texas Tax Code &sect;41.43(b)(3)</b>, ' +
        'the unequal-appraisal ground. Once HCAD posts your 2026 appraised ' +
        'value, the district must prove it is at or below the median per-square-' +
        'foot appraisal of a reasonable number of appropriately-adjusted ' +
        'comparable properties. Five such comparables already match the ' +
        'standard filters for this parcel; they will appear here once the ' +
        'appraisal is posted and this report can compute a median.';
    } else {
      // No comps at all — hand-pick on hcad.org.
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
  }

  $("report").hidden = false;
}

// Click any HCAD account in the comp table → copy that account number to
// the clipboard so the user can paste it into HCAD's search box. The
// anchor's native href + target="_blank" still opens https://search.hcad.org/
// in a new tab; we just ride along on the same click.
function showHcadToast(msg) {
  const existing = document.querySelector(".hcad-toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.className = "hcad-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function wireHcadLinks() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest(".hcad-link");
    if (!link) return;
    const acct = link.dataset.account;
    if (!acct) return;
    // Best-effort copy; if the API isn't available or the user denies
    // permission, fall back to a toast that just shows the account so
    // they can copy it manually.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(acct).then(
        () => showHcadToast(`Account ${acct} copied — paste it into HCAD's search box.`),
        () => showHcadToast(`Account ${acct} — copy this and paste into HCAD's search box.`)
      );
    } else {
      showHcadToast(`Account ${acct} — copy this and paste into HCAD's search box.`);
    }
  });
}

async function boot() {
  wireHcadLinks();
  const params = new URLSearchParams(window.location.search);
  const acct = (params.get("a") || "").trim();
  if (!acct) {
    showError("No HCAD account specified. Go back to the map and click a parcel.");
    return;
  }

  // Fetch both data files in parallel. reports.json is mandatory —
  // nothing renders without it. parcels.json is best-effort: we only
  // use it for the mini-map of comps, and if it fails we just skip
  // the map and render the rest of the report normally.
  const [reportsResult, parcelsResult] = await Promise.allSettled([
    fetch("data/reports.json", { cache: "default" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
    fetch("data/parcels.json", { cache: "default" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  ]);

  if (reportsResult.status === "rejected") {
    showError(`Could not load report data (${reportsResult.reason.message}). Please try again.`);
    return;
  }
  const reports = reportsResult.value;
  const p = reports[acct];
  if (!p) {
    showError(`HCAD account ${acct} was not found in this dataset.`);
    return;
  }

  // Build an account-keyed lookup for the mini-map. Null if parcels.json
  // failed — renderCompsMap handles null gracefully.
  let parcelsByAccount = null;
  if (parcelsResult.status === "fulfilled" && parcelsResult.value && Array.isArray(parcelsResult.value.parcels)) {
    parcelsByAccount = new Map(parcelsResult.value.parcels.map((pp) => [pp.a, pp]));
  }

  renderReport(p, parcelsByAccount);
}

boot();
