// Jersey Village 2026 HCAD Appeals — map + autocomplete.
// Static page: loads data/parcels.json, draws pins, wires search, and on
// pin click links to the pre-generated reports/{account}.pdf.

const COLOR = {
  red:    "#d93a3a",
  yellow: "#e6b422",
  green:  "#2f9e44",
  gray:   "#9aa0a6",
};

const map = L.map("map", { preferCanvas: true });
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Normalize a string for fuzzy-ish substring search.
function norm(s) { return (s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

const state = {
  parcels: [],          // from parcels.json
  byAccount: new Map(), // account -> parcel
  markers: new Map(),   // account -> L.CircleMarker
  searchIdx: [],        // [{needle, parcel}]
};

function popupHtml(p) {
  const pct = p.p == null ? "n/a" : (p.p >= 0 ? `+${p.p}%` : `${p.p}%`);
  const val = p.v == null ? "" : `$${p.v.toLocaleString()}`;
  const cls = p.c || "gray";
  const action = p.r
    ? `<a class="download" href="reports/${p.a}.pdf" download>Download appeal report (PDF)</a>`
    : `<a class="pending" href="report-pending.html?a=${encodeURIComponent(p.a)}&d=${encodeURIComponent(p.d || "")}">Report coming soon</a>`;
  return `
    <div class="parcel-popup">
      <div class="addr">${p.d || "(no address)"}</div>
      <div>HCAD ${p.a}${val ? ` · ${val}` : ""}</div>
      <div class="pct ${cls}">${pct} vs. median of 5 comps</div>
      ${action}
    </div>`;
}

function drawParcels() {
  for (const p of state.parcels) {
    const m = L.circleMarker(p.ll, {
      radius: 5,
      color: "#00000033",
      weight: 0.5,
      fillColor: COLOR[p.c] || COLOR.gray,
      fillOpacity: 0.85,
    });
    m.bindPopup(() => popupHtml(p));
    m.addTo(map);
    state.markers.set(p.a, m);
  }
}

function buildSearchIndex() {
  state.searchIdx = state.parcels.map((p) => ({
    needle: norm(`${p.d} ${p.a} ${p.z || ""}`),
    parcel: p,
  }));
}

// Simple substring match across address + account, ranked by index-of.
function searchParcels(q, limit = 20) {
  const needle = norm(q);
  if (needle.length < 2) return [];
  const hits = [];
  for (const row of state.searchIdx) {
    const i = row.needle.indexOf(needle);
    if (i !== -1) hits.push([i, row.parcel]);
    if (hits.length > 200) break;
  }
  hits.sort((a, b) => a[0] - b[0]);
  return hits.slice(0, limit).map((x) => x[1]);
}

function renderResults(hits) {
  const ul = document.getElementById("results");
  if (!hits.length) {
    ul.hidden = true;
    ul.innerHTML = "";
    return;
  }
  ul.innerHTML = hits.map((p, idx) =>
    `<li data-account="${p.a}" data-idx="${idx}">
       <span class="addr">${p.d || "(no address)"}</span>
       <span class="acct">HCAD ${p.a}</span>
     </li>`
  ).join("");
  ul.hidden = false;
}

function focusParcel(p) {
  const m = state.markers.get(p.a);
  if (!m) return;
  map.setView(m.getLatLng(), 18);
  m.openPopup();
}

function wireSearch() {
  const input = document.getElementById("q");
  const ul = document.getElementById("results");
  let current = -1;
  let lastHits = [];

  input.addEventListener("input", () => {
    lastHits = searchParcels(input.value);
    current = -1;
    renderResults(lastHits);
  });

  input.addEventListener("keydown", (e) => {
    if (ul.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      current = Math.min(current + 1, lastHits.length - 1);
      updateSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      current = Math.max(current - 1, 0);
      updateSelection();
    } else if (e.key === "Enter" && current >= 0) {
      e.preventDefault();
      focusParcel(lastHits[current]);
      ul.hidden = true;
    } else if (e.key === "Escape") {
      ul.hidden = true;
    }
  });

  ul.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const acct = li.dataset.account;
    const p = state.byAccount.get(acct);
    if (p) {
      focusParcel(p);
      ul.hidden = true;
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) ul.hidden = true;
  });

  function updateSelection() {
    const lis = ul.querySelectorAll("li");
    lis.forEach((li, i) =>
      li.setAttribute("aria-selected", i === current ? "true" : "false"));
    const sel = lis[current];
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }
}

function wireLegendInfo() {
  const btn = document.getElementById("legend-info-btn");
  const pop = document.getElementById("legend-info");
  if (!btn || !pop) return;
  const close = pop.querySelector(".info-close");

  function open() {
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }
  function shut() {
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.hidden ? open() : shut();
  });
  close.addEventListener("click", shut);
  document.addEventListener("click", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) shut();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !pop.hidden) shut();
  });
}

async function boot() {
  wireLegendInfo();
  const resp = await fetch("data/parcels.json", { cache: "no-cache" });
  if (!resp.ok) {
    document.getElementById("map").innerHTML =
      "<p style='padding:20px'>No parcel data yet. Run the pipeline first.</p>";
    return;
  }
  const doc = await resp.json();
  state.parcels = doc.parcels;
  for (const p of state.parcels) state.byAccount.set(p.a, p);
  buildSearchIndex();

  const center = doc.center || [29.889, -95.567];
  map.setView(center, 14);
  drawParcels();
  wireSearch();
}

boot();
