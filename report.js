// report.js — populates report.html from data/reports.json based on ?a=<account>.
// All static text (headings, steps, rebuttals, disclaimer) lives in the HTML.
// This file only fills in the parcel-specific slots: address, bottom line,
// facts table, comp table, and hearing script.

const COLOR_LABEL = {
  red:    { verdict: "You have statutory grounds to appeal under §41.43(b)(3).", css: "red" },
  yellow: { verdict: "The appeal case is thin but presentable under §41.43(b)(3).", css: "yellow" },
  green:  { verdict: "This is within the normal noise of comp selection; filing is unlikely to change the value.", css: "green" },
  gray:   { verdict: "No unequal-appraisal case is available from the standard filters — review by hand if it matters to you.", css: "gray" },
};

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
  const rows = [
    ["HCAD Account", p.a],
    ["Site Address", addr],
    ["Living Area", p.sqft != null ? `${fmtInt(p.sqft)} sqft` : ""],
    ["Year Built", p.year != null ? String(p.year) : ""],
    ["Grade / Class", p.grade || ""],
    ["Neighborhood Code", p.nbhd || ""],
    ["2026 Appraised Value", fmtMoney(p.v)],
  ];
  $("facts-body").innerHTML = rows
    .map(([k, v]) => `<tr><th scope="row">${escape(k)}</th><td>${escape(v)}</td></tr>`)
    .join("");
}

function renderBottomLine(p) {
  const verdict = (COLOR_LABEL[p.c] || COLOR_LABEL.gray).verdict;
  if (p.med == null || p.p == null) {
    $("bottomline").innerHTML =
      `HCAD's 2026 appraisal of <b>${fmtMoney(p.v)}</b>. ` +
      `No comparable properties could be matched automatically for this parcel. ${escape(verdict)}`;
    return;
  }
  const direction = p.p > 0 ? "above" : "below";
  $("bottomline").innerHTML =
    `HCAD's 2026 appraisal of <b>${fmtMoney(p.v)}</b> is ` +
    `<b>${Math.abs(p.p).toFixed(1)}% ${direction}</b> the median of 5 ` +
    `comparable homes (<b>${fmtMoney(p.med)}</b>). ${escape(verdict)}`;
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
    <td class="num">${fmtMoney(p.v)}</td>
  </tr>`;
  // Comp rows.
  const compRows = p.comps.map((c, i) => `<tr>
    <td>${i + 1}</td>
    <td>${escape(c.a)}</td>
    <td class="num">${fmtInt(c.sqft)}</td>
    <td class="num">${escape(c.year)}</td>
    <td>${escape(c.grade)}</td>
    <td class="num">${fmtMoney(c.v)}</td>
  </tr>`).join("");
  body.innerHTML = subjectRow + compRows;

  // Target summary rows (folded into the tfoot).
  const gap = (p.v || 0) - (p.med || 0);
  const gapLabel = p.p > 0 ? "Over-assessment" : "Under-assessment";
  const gapClass = p.p > 0 ? "over" : "under";
  foot.innerHTML = `
    <tr class="summary"><td colspan="5" class="num">Median of 5 comps</td><td class="num">${fmtMoney(p.med)}</td></tr>
    <tr class="summary"><td colspan="5" class="num">HCAD 2026 appraisal</td><td class="num">${fmtMoney(p.v)}</td></tr>
    <tr class="summary ${gapClass}"><td colspan="5" class="num">${escape(gapLabel)}</td><td class="num">${fmtMoney(Math.abs(gap))} (${p.p > 0 ? "+" : ""}${p.p.toFixed(1)}%)</td></tr>
  `;
}

function renderHearingScript(p) {
  if (p.med == null || p.p == null) {
    $("hearing-script").innerHTML =
      `<p>Keep this report as your personal script for the hearing. ` +
      `Because no automatic comps were matched, you'll need to present ` +
      `your own: pick 5 neighboring properties on hcad.org that share ` +
      `your HCAD neighborhood code, grade, are within &plusmn;15% of your ` +
      `${fmtInt(p.sqft)} sqft, and within 10 years of your ${escape(p.year)} build. ` +
      `Take their median and argue the gap against your ${fmtMoney(p.v)} appraisal.</p>`;
    return;
  }
  const dir = p.p > 0 ? "below" : "above";
  const absPct = Math.abs(p.p).toFixed(1);
  $("hearing-script").innerHTML = `
    <p>Keep this report as your personal script for the hearing. The core of your claim is two points:</p>
    <ol class="script">
      <li><b>"Here is the median of 5 comparable properties — ${fmtMoney(p.med)} — which is ${absPct}% ${dir} HCAD's appraisal of my home at ${fmtMoney(p.v)}."</b></li>
      <li><b>"These 5 comps share my neighborhood code (${escape(p.nbhd)}), my HCAD grade (${escape(p.grade)}), fall within &plusmn;15% of my ${fmtInt(p.sqft)} sqft, and within 10 years of my ${escape(p.year)} build. HCAD appraised these homes themselves, so the district has already verified these values as fair."</b></li>
    </ol>
    <p>Stay focused on the median-of-comps gap. That is the only argument §41.43(b)(3) lets you win on &mdash; don't wander into market value, tax rates, or condition.</p>`;
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

  renderFacts(p);
  renderBottomLine(p);
  renderHearingScript(p);

  // Comp section vs. gray variant.
  const hasComps = Array.isArray(p.comps) && p.comps.length > 0;
  if (hasComps) {
    renderComps(p);
    $("comps-section").hidden = false;
    $("gray-notice").hidden = true;
  } else {
    $("comps-section").hidden = true;
    $("gray-notice").hidden = false;
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
