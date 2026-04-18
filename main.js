// Jersey Village 2026 HCAD Appeals — map + autocomplete.
// Static page: loads data/parcels.json, draws pins, wires search, and on
// pin click links to the pre-generated reports/{account}.pdf.

const COLOR = {
  red:    "#d93a3a",
  yellow: "#e6b422",
  green:  "#2f9e44",
  gray:   "#4a5058",
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
  const owner = p.o ? `<div class="owner">${p.o}</div>` : "";
  return `
    <div class="parcel-popup">
      <div class="addr">${p.d || "(no address)"}</div>
      ${owner}
      <div>HCAD ${p.a}${val ? ` · ${val}` : ""}</div>
      <div class="pct ${cls}">${pct} vs. median of 5 comps</div>
      ${action}
    </div>`;
}

// Detect touch / narrow-viewport layout. When true we skip the Leaflet popup
// entirely and drive a bottom sheet instead — popups overlap finger, get
// clipped on phones, and Leaflet's auto-pan is disorienting on small screens.
const MOBILE =
  window.matchMedia("(pointer: coarse)").matches ||
  window.matchMedia("(max-width: 720px)").matches;

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
let selectedMarker = null;
function setSelected(marker) {
  if (selectedMarker && selectedMarker !== marker) {
    selectedMarker.setStyle(DEFAULT_STYLE);
  }
  selectedMarker = marker || null;
  if (selectedMarker) selectedMarker.setStyle(SELECTED_STYLE);
}

function sheetHtml(p) {
  const pct = p.p == null ? "n/a" : (p.p >= 0 ? `+${p.p}%` : `${p.p}%`);
  const val = p.v == null ? "" : `$${p.v.toLocaleString()}`;
  const cls = p.c || "gray";
  const owner = p.o ? `<div class="sheet-owner">${p.o}</div>` : "";
  const action = p.r
    ? `<a class="sheet-action download" href="reports/${p.a}.pdf" download>Download appeal report (PDF)</a>`
    : `<a class="sheet-action pending" href="report-pending.html?a=${encodeURIComponent(p.a)}&d=${encodeURIComponent(p.d || "")}">Report coming soon</a>`;
  return `
    <button class="sheet-close" type="button" aria-label="Close">&times;</button>
    <div class="sheet-addr" id="sheet-addr">${p.d || "(no address)"}</div>
    ${owner}
    <div class="sheet-meta">HCAD ${p.a}${val ? ` · ${val}` : ""}</div>
    <div class="sheet-pct ${cls}">${pct} vs. median of 5 comps</div>
    ${action}
  `;
}

let suppressMapClickUntil = 0;
function openSheet(p, marker) {
  const sheet = document.getElementById("parcel-sheet");
  if (!sheet) return;
  sheet.innerHTML = sheetHtml(p);
  sheet.hidden = false;
  // Force reflow then add .open so the transition runs.
  void sheet.offsetWidth;
  sheet.classList.add("open");
  const closeBtn = sheet.querySelector(".sheet-close");
  if (closeBtn) closeBtn.addEventListener("click", closeSheet);
  setSelected(marker);
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
    const m = L.circleMarker(p.ll, {
      radius: 5,
      color: DEFAULT_STYLE.color,
      weight: DEFAULT_STYLE.weight,
      fillColor: COLOR[p.c] || COLOR.gray,
      fillOpacity: 0.85,
      // Keep click from bubbling to the map (the map handler closes the sheet).
      bubblingMouseEvents: false,
    });

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
