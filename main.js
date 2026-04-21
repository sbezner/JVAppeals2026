// Jersey Village 2026 HCAD Appeals — map + autocomplete.
// Static page: loads data/parcels.json, draws pins, wires search, and on
// pin click navigates to report.html?a=<account> for the client-rendered
// two-page playbook.

const COLOR = {
  red:    "#d93a3a",
  yellow: "#e6b422",
  green:  "#2f9e44",
  purple: "#7c3aed",  // under-assessed — do not file (ARB can adjust up)
  gray:   "#4a5058",
};

// Detect touch / narrow-viewport layout. When true we drive a bottom sheet
// instead of Leaflet's default popup and give the canvas renderer a generous
// hit tolerance so fingers can actually tap 10px pins.
const MOBILE =
  window.matchMedia("(pointer: coarse)").matches ||
  window.matchMedia("(max-width: 720px)").matches;

const map = L.map("map", {
  preferCanvas: true,
  // Canvas renderer with a generous touch tolerance on mobile so finger
  // taps land within a ~22px radius of a pin (effective 44×44 hit zone,
  // matching Apple HIG). Desktop uses 0 — mouse pointer is precise.
  renderer: L.canvas({ tolerance: MOBILE ? 22 : 0 }),
});
// CartoDB Positron — muted light basemap that lets the red/yellow/green
// pins read clearly. Retina tile URL ({r} → '@2x') keeps labels crisp
// on high-density phone screens.
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  subdomains: "abcd",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
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
  const owner = p.o ? `<div class="owner">${p.o}</div>` : "";
  const cap = p.cap ? `<div class="cap-flag">Possible §23.23 homestead cap claim</div>` : "";
  const disagree = p.dis ? `<div class="disagree-flag">Methods differ — see report</div>` : "";
  const action = `<a class="download" href="report.html?a=${encodeURIComponent(p.a)}">View report</a>`;
  return `
    <div class="parcel-popup">
      <div class="addr">${p.d || "(no address)"}</div>
      ${owner}
      <div>HCAD ${p.a}${val ? ` · ${val}` : ""}</div>
      <div class="pct ${cls}">${pct} vs. median of 5 comps</div>
      ${cap}
      ${disagree}
      ${action}
    </div>`;
}

// Desktop hover: open popup on mouseover at zoom ≥ HOVER_ZOOM, 200ms grace
// after mouseout so the user can move into the popup and click the download
// link. Below HOVER_ZOOM the parcels are too densely packed for hover to
// feel intentional.
const HOVER_ZOOM = 16;
let hoverCloseTimer = null;
function cancelHoverClose() {
  if (hoverCloseTimer) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null; }
}
function scheduleHoverClose(marker) {
  cancelHoverClose();
  hoverCloseTimer = setTimeout(() => marker.closePopup(), 200);
}

// Selected-marker ring (mobile sheet selection indicator).
const SELECTED_STYLE = { weight: 2.5, color: "#1b6fe6" };
const DEFAULT_STYLE = { weight: 0.5, color: "#00000033" };
// Ring treatment for homestead-cap violations (§23.23). A pin with p.cap
// wears a bright orange ring on top of its §41.43 color — and renders a
// notch larger than a normal pin so it's legible at city-wide zoom.
const CAP_STYLE = { weight: 3, color: "#ff7a00" };
const CAP_RADIUS = 7;
const DEFAULT_RADIUS = 5;
let selectedMarker = null;
function restingStyle(parcel) {
  return parcel && parcel.cap ? CAP_STYLE : DEFAULT_STYLE;
}
function setSelected(marker, parcel) {
  if (selectedMarker && selectedMarker !== marker) {
    selectedMarker.setStyle(restingStyle(selectedMarker.__parcel));
  }
  selectedMarker = marker || null;
  if (selectedMarker) {
    if (parcel) selectedMarker.__parcel = parcel;
    selectedMarker.setStyle(SELECTED_STYLE);
  }
}

function sheetHtml(p) {
  const pct = p.p == null ? "n/a" : (p.p >= 0 ? `+${p.p}%` : `${p.p}%`);
  const val = p.v == null ? "" : `$${p.v.toLocaleString()}`;
  const cls = p.c || "gray";
  const owner = p.o ? `<div class="sheet-owner">${p.o}</div>` : "";
  const cap = p.cap ? `<div class="sheet-cap">Possible §23.23 homestead cap claim</div>` : "";
  const disagree = p.dis ? `<div class="sheet-disagree">Methods differ — see report</div>` : "";
  const action = `<a class="sheet-action download" href="report.html?a=${encodeURIComponent(p.a)}">View report</a>`;
  return `
    <button class="sheet-close" type="button" aria-label="Close">&times;</button>
    <div class="sheet-addr" id="sheet-addr">${p.d || "(no address)"}</div>
    ${owner}
    <div class="sheet-meta">HCAD ${p.a}${val ? ` · ${val}` : ""}</div>
    <div class="sheet-pct ${cls}">${pct} vs. median of 5 comps</div>
    ${cap}
    ${disagree}
    ${action}
  `;
}

let suppressMapClickUntil = 0;
function openSheet(p, marker) {
  const sheet = document.getElementById("parcel-sheet");
  if (!sheet) return;
  sheet.innerHTML = sheetHtml(p);
  // Reset then re-apply so the bucket color reflects the tapped parcel.
  sheet.className = "parcel-sheet " + (p.c || "gray");
  sheet.hidden = false;
  // Force reflow then add .open so the transition runs.
  void sheet.offsetWidth;
  sheet.classList.add("open");
  const closeBtn = sheet.querySelector(".sheet-close");
  if (closeBtn) closeBtn.addEventListener("click", closeSheet);
  setSelected(marker, p);
  // Canvas-rendered markers can still bubble a click to the map in some
  // Leaflet versions; swallow the very next map click so the sheet doesn't
  // close itself on the same tap that opened it.
  suppressMapClickUntil = Date.now() + 100;
}

function closeSheet() {
  const sheet = document.getElementById("parcel-sheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  setTimeout(() => {
    if (!sheet.classList.contains("open")) {
      sheet.hidden = true;
      sheet.innerHTML = "";
    }
  }, 220);
  setSelected(null);
}

function drawParcels() {
  for (const p of state.parcels) {
    const resting = restingStyle(p);
    const m = L.circleMarker(p.ll, {
      radius: p.cap ? CAP_RADIUS : DEFAULT_RADIUS,
      color: resting.color,
      weight: resting.weight,
      fillColor: COLOR[p.c] || COLOR.gray,
      fillOpacity: 0.85,
    });
    m.__parcel = p;

    if (MOBILE) {
      m.on("click", () => openSheet(p, m));
    } else {
      m.bindPopup(() => popupHtml(p), {
        autoPan: false,
        closeButton: false,
        offset: [0, -4],
      });
      m.on("mouseover", function () {
        if (map.getZoom() < HOVER_ZOOM) return;
        cancelHoverClose();
        this.openPopup();
      });
      m.on("mouseout", function () {
        scheduleHoverClose(this);
      });
      m.on("popupopen", function (e) {
        const el = e.popup.getElement();
        if (!el) return;
        el.addEventListener("mouseenter", cancelHoverClose);
        el.addEventListener("mouseleave", () => scheduleHoverClose(m));
      });
    }

    m.addTo(map);
    state.markers.set(p.a, m);
  }

  if (MOBILE) {
    // Tap anywhere on the map (not a pin) closes the sheet.
    map.on("click", () => {
      if (Date.now() < suppressMapClickUntil) return;
      closeSheet();
    });
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
  if (MOBILE) {
    openSheet(p, m);
  } else {
    m.openPopup();
  }
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
  const nudge = document.getElementById("intro-nudge");
  if (!btn || !pop) return;
  const close = pop.querySelector(".info-close");
  const INTRO_SEEN_KEY = "jv-seen-intro-v1";

  let introSeen = false;
  try { introSeen = !!localStorage.getItem(INTRO_SEEN_KEY); } catch (e) {}
  if (nudge && !introSeen) nudge.hidden = false;

  function markIntroSeen() {
    try { localStorage.setItem(INTRO_SEEN_KEY, "1"); } catch (e) {}
    if (nudge) nudge.hidden = true;
  }
  function open(scrollToHowto) {
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    if (scrollToHowto) {
      requestAnimationFrame(() => {
        const sec = document.getElementById("info-howto");
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }
  function shut() {
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pop.hidden) { open(false); markIntroSeen(); } else { shut(); }
  });
  if (nudge) {
    nudge.addEventListener("click", (e) => {
      e.stopPropagation();
      open(true);
      markIntroSeen();
    });
  }
  close.addEventListener("click", shut);
  document.addEventListener("click", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) shut();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !pop.hidden) shut();
  });
}

// Locate-me control: a small button in the map's top-right that centers
// the map on the user's position and drops a blue dot + accuracy ring.
// Useful on mobile — tap once and the surrounding parcels are right there.
let locateDot = null;
let locateRing = null;
const LOCATE_COLOR = "#1b6fe6";

function showLocateError(msg) {
  const existing = document.querySelector(".locate-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "locate-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

const LocateControl = L.Control.extend({
  options: { position: "topright" },
  onAdd() {
    const container = L.DomUtil.create("div", "leaflet-bar leaflet-control locate-control");
    const btn = L.DomUtil.create("a", "locate-btn", container);
    btn.href = "#";
    btn.role = "button";
    btn.title = "Show my location";
    btn.setAttribute("aria-label", "Show my location");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="3" fill="currentColor"/>' +
        '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<line x1="12" y1="1.5" x2="12" y2="4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<line x1="12" y1="19.5" x2="12" y2="22.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<line x1="1.5" y1="12" x2="4.5" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<line x1="19.5" y1="12" x2="22.5" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      "</svg>";
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(btn, "click", (e) => {
      L.DomEvent.preventDefault(e);
      if (!navigator.geolocation) {
        showLocateError("Your browser doesn't support geolocation.");
        return;
      }
      container.classList.add("loading");
      map.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true, timeout: 10000 });
    });
    return container;
  },
});

// Map-overlay legend (bottom-left). Compact action-verb key that
// mirrors the verdict banner in the report: File / Consider / Skip /
// Don't file / Review. Always visible — no header, no toggle.
const LEGEND_ROWS = [
  { cls: "red",    label: "File",       desc: "more than 7% over median" },
  { cls: "yellow", label: "Consider",   desc: "2\u20137% over" },
  { cls: "green",  label: "Skip",       desc: "within noise band" },
  { cls: "purple", label: "Don't file", desc: "more than 5% under" },
  { cls: "gray",   label: "Review",     desc: "no comps" },
];

const LegendControl = L.Control.extend({
  options: { position: "bottomleft" },
  onAdd() {
    const container = L.DomUtil.create("div", "leaflet-bar legend-control");
    const rows = LEGEND_ROWS.map((r) =>
      `<div class="legend-row">` +
        `<span class="dot ${r.cls}"></span>` +
        `<b>${r.label}</b>` +
        `<span class="legend-desc">${r.desc}</span>` +
      `</div>`
    ).join("");
    // Extra row explaining the orange ring — a secondary statutory ground
    // that can apply on top of any §41.43 bucket color.
    const capRow =
      `<div class="legend-row legend-cap">` +
        `<span class="dot ring-cap" aria-hidden="true"></span>` +
        `<b>Cap</b>` +
        `<span class="legend-desc">orange ring = homestead +10% YoY</span>` +
      `</div>`;
    container.innerHTML = rows + capRow;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  },
});

function wireLegend() {
  new LegendControl().addTo(map);
}

function wireLocate() {
  new LocateControl().addTo(map);
  map.on("locationfound", (e) => {
    document.querySelector(".locate-control")?.classList.remove("loading");
    if (locateDot) map.removeLayer(locateDot);
    if (locateRing) map.removeLayer(locateRing);
    locateRing = L.circle(e.latlng, {
      radius: e.accuracy,
      color: LOCATE_COLOR,
      weight: 1,
      fillColor: LOCATE_COLOR,
      fillOpacity: 0.10,
      interactive: false,
    }).addTo(map);
    locateDot = L.circleMarker(e.latlng, {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: LOCATE_COLOR,
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
  });
  map.on("locationerror", (e) => {
    document.querySelector(".locate-control")?.classList.remove("loading");
    const msg =
      e.code === 1 ? "Location permission denied. Enable it in your browser and try again." :
      e.code === 3 ? "Timed out getting your location. Try again." :
      "Could not get your location.";
    showLocateError(msg);
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
  wireLegend();
  wireLocate();
}

boot();
