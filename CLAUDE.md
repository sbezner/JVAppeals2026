# JVAppeals2026 — Project Context

> **This file is the project's single source of truth.** When you open Claude
> Code in this repo, it auto-loads `CLAUDE.md` and has full context. Humans
> should read it top-to-bottom before their first run.

---

## 1. What this is

A static GitHub Pages site that shows every single-family parcel in Jersey
Village, TX on a Leaflet map. Each pin is colored by how over-assessed it is
on a **per-square-foot basis** versus the median of 5 comparable homes under
the standard Texas Tax Code §41.43(b)(3) criteria. Clicking a pin opens a
client-rendered personalized appeal report for that parcel.

**Intended user:** a Jersey Village homeowner who wants to know, in one click,
whether HCAD over-assessed them for 2026 and — if so — walk into an ARB
hearing (or upload to iSettle) with a ready-to-file report.

**Built by:** a neighbor. Not affiliated with HCAD or the City of Jersey
Village. No legal advice.

---

## 2. Architecture at a glance

```
  ┌──────────────────────────── OFFLINE PIPELINE (Mac Mini) ───────────────────────────┐
  │                                                                                    │
  │  hcad_raw/            load.py             findings.py         reports_data.py      │
  │  (HCAD files,  ─►  DuckDB ingest  ─►   5-comp median,      ─► data/reports.json    │
  │   downloaded       + residential       over-assessment %,     (subject + 5 comps   │
  │   manually)        + jurisdiction     red/yellow/green          per parcel)        │
  │                    070 filter)         color bucket                                │
  │                                                                                    │
  │                                        mapdata.py  ─►  data/parcels.json           │
  └────────────────────────────────────────────────────────────────────────────────────┘
                                                 │
                                                 ▼
  ┌────────────────────────── STATIC SITE (GitHub Pages, repo root) ───────────────────┐
  │                                                                                    │
  │  index.html + main.js + style.css          report.html + report.js                 │
  │    ├─ reads  data/parcels.json                ├─ reads  ?a=<account>               │
  │    ├─ Leaflet CircleMarkers on Positron       ├─ lazy-loads data/reports.json      │
  │    ├─ autocomplete: address + HCAD            ├─ renders two-page playbook         │
  │    └─ on pin click ─► report.html?a=X         └─ Print btn + @media print CSS      │
  └────────────────────────────────────────────────────────────────────────────────────┘
```

**Data flow:** HCAD tables + Parcels shapefile → DuckDB → per-parcel
findings → `reports_data.py` emits `data/reports.json` (subject facts +
5 comps per account, ~2,100 parcels, ~140KB gzipped) + `mapdata.py`
emits `data/parcels.json` → git commit → GitHub Pages. `report.html`
fetches `reports.json` lazily and renders the playbook client-side; no
per-parcel HTML or PDF files are generated.

**Key design decisions (do not undo without a reason):**

- **DuckDB, not pandas/geopandas.** DuckDB's built-in `spatial` extension
  reads shapefiles via `st_read` and does centroid reprojection in SQL.
  Avoids the geopandas/shapely/pyogrio wheel lag on Python 3.14.
- **One HTML template + one data file, not ~2,100 rendered pages.**
  `report.html` is a single client-rendered template. It reads
  `?a=<account>` from the URL and populates itself from
  `data/reports.json`. Both `pipeline/prose.py` (AI prose) and
  `pipeline/render.py` (ReportLab PDFs) have been deleted — a
  deterministic JSON object plus a ~300-line `report.js` produces the
  same playbook that used to ship as 2,077 PDFs, with a visible Print
  button and proper `@media print` styling for paper. Share URLs are a
  first-class feature: `…/report.html?a=1074400000013` is a stable
  link to a specific parcel's report.
- **Jersey Village = jurisdiction code 070.** HCAD's `jur_value` table
  (filename `jur_value.txt` in 2026, previously `jurisdiction_value.txt`)
  lists every taxing unit that levies on a parcel; "070" is the City of
  Jersey Village. This is the legal definition of being "in JV" and it's
  a clean tabular filter — no spatial clip needed. (Verified 2026-04-18
  by cross-referencing JV-addressed parcels against `tax_district`; the
  code `061` is the City of Houston.)
- **§41.43(b)(3) is the claim.** The report leads with unequal-appraisal
  under §41.43(b)(3), which shifts burden to HCAD to show the appraised
  value is ≤ the median of a reasonable number of appropriately-adjusted
  comparables. §42.26(a)(3) is reserved as the judicial-review fallback.
- **Schema-adaptive column resolution.** HCAD renames columns year to
  year. `pipeline/load.py` defines `COLUMN_ALIASES` — canonical name →
  list of likely HCAD variants. Loader probes each alias and fails loudly
  if a column can't be resolved.

---

## 3. Repo layout

```
JVAppeals2026/
├── CLAUDE.md               this file — project context for Claude Code & humans
├── README.md               public-facing project readme (for GitHub visitors)
├── pyproject.toml          uv-managed Python 3.14 project
├── .gitignore
│
├── index.html              Leaflet map page (served at site root)
├── main.js                 map + autocomplete + pin-click navigation
├── style.css               styles for map, popup, sheet, report, @media print
├── report.html             one template, rendered by JS from ?a=<account>
├── report.js               fetches data/reports.json, populates the template
│
├── data/
│   ├── parcels.json        ~300KB; consumed by main.js on map load
│   └── reports.json        ~1MB / ~140KB gzipped; lazy-loaded by report.js
│
├── pipeline/
│   ├── __init__.py
│   ├── __main__.py         CLI: python -m pipeline {load|findings|reports|mapdata|all}
│   ├── download.py         manual-download instructions + existence check
│   ├── load.py             DuckDB ingest, schema-adaptive column resolution
│   ├── findings.py         5-comp selection, median, over-assessment %, color
│   ├── reports_data.py     emits data/reports.json (subject + comps per parcel)
│   └── mapdata.py          emits data/parcels.json
│
├── hcad_download/          (gitignored) local staging for HCAD download zips
└── hcad_raw/               (gitignored) extracted HCAD source files
```

---

## 4. Status — what is and isn't done

### ✅ Functionally complete (committed, ready to run)

- **Repo scaffold** — `pyproject.toml`, `.gitignore`, README, directory tree
- **Pipeline download stage** — file-existence check with a clear error
  pointing you to the HCAD download URLs
- **Pipeline load stage** — DuckDB ingest of `real_acct.txt`,
  `building_res.txt`, `jur_value.txt` (2026 filename), optional
  `owners.txt`, and the `Parcels.shp` shapefile. Reprojects centroids to
  WGS84. Schema-adaptive column resolution (canonical → HCAD variant).
  Filters to JV (tax_district 070) + residential (state_class `A*`) +
  sqft > 0 + year > 1900. Account columns in the text files are padded
  with trailing spaces; joins TRIM to match the unpadded shapefile keys.
- **Pipeline findings stage** — for each subject parcel: candidate comps
  are same nbhd + same grade + sqft within ±15% + year within ±10 + not
  self; top 5 by haversine distance from centroids; **median $/sqft**;
  implied fair value = median $/sqft × subject sqft; over-assessment % vs.
  subject appraisal; comp-basket coefficient of variation (`cv_pct =
  100·stdev/mean of comp $/sqft`, surfaced as a "tight/moderate/wide"
  spread badge in the report); 5-bucket color (>+7% red, +2..+7% yellow,
  −5..+2% green, <−5% purple "don't file — ARB can adjust upward",
  missing comps gray). Per-sqft normalization is the same yardstick
  HCAD's own CAMA model uses internally and that the Texas Comptroller's
  Property Value Study audits for uniformity. The asymmetric −5/+2 green
  band reflects ARB risk asymmetry: mild under-assessment carries no
  practical upward-adjustment risk, so flagging it as "don't file" would
  over-warn.
- **Pipeline prose stage** — shells out to `claude -p --output-format json`
  with a strict JSON prompt requiring three keys
  (executive_summary, standout_finding, reconciliation). 72s sleep between
  calls. Each successful result cached as `cache/prose/{account}.json` —
  restarts skip completed parcels. Malformed responses are logged and
  skipped (they'll be retried on the next run).
- **Pipeline reports_data stage** — emits `data/reports.json`, keyed
  by HCAD account. Each entry carries subject facts (address, sqft,
  year, grade, nbhd, appraised value), the computed median + over-
  assessment + color bucket, and a 5-entry comps array. Gray parcels
  appear with `med: null` and `comps: []` so the front-end can render
  a "limited data" variant.
- **Pipeline mapdata stage** — emits compact `data/parcels.json` with
  short keys (`a` account, `d` address, `o` owner, `z` zip, `c` color,
  `p` pct, `v` value, `ll` [lat, lon]) + a computed map center. No
  per-PDF flag — every account routes to `report.html?a=X`.
- **CLI entry point** — `python -m pipeline {load|findings|reports|mapdata|all}`.
- **Static site** — `index.html` + `main.js` + `style.css` serve the
  map (Leaflet + CartoDB Positron tiles, colored pins, autocomplete
  on address + account, keyboard nav, hover/click popup on desktop,
  bottom sheet on mobile). `report.html` + `report.js` serve the
  client-rendered two-page playbook, navigated to via
  `report.html?a=<account>`; renders from `data/reports.json` which is
  fetched only on first report view and cached by the browser after
  that. Print button up top is hidden via `@media print`, which also
  forces a page break between the Evidence and Playbook sheets.

### ✅ Resolved during the 2026 smoke test (2026-04-18)

- **HCAD 2026 column drift** — resolved in `COLUMN_ALIASES`. Five columns
  had new names this year: `site_city` (→ `site_addr_2`), `site_zip`
  (→ `site_addr_3`), `year_built` (→ `date_erected`/`eff`), `grade`
  (→ `qa_cd`), `jurs_code` (→ `tax_district`). Old candidates are still
  probed as fallbacks so the loader stays forward-compatible.
- **HCAD filename drift** — `jurisdiction_value.txt` is now
  `jur_value.txt`; alias added in `pipeline/download.py`.
- **Shapefile CRS** — confirmed EPSG:2278
  (`NAD_1983_StatePlane_Texas_South_Central_FIPS_4204_Feet`). Code
  assumption correct; no change needed.
- **Shapefile account column** — confirmed `HCAD_NUM`. Hardcoded
  reference in `load.py → parcel_centroid` works as-is.
- **`uv.lock`** — committed.
- **GitHub Pages** — enabled from `main` branch root.
- **Smoke test** — passed on account `1074400000013` (16213 Capri Dr):
  5 comps found, 2.5% over median, yellow bucket, PDF renders cleanly.
- **JV jurisdiction code** — was incorrectly documented as 061
  (that's the City of Houston, 581k parcels). Correct code for the
  City of Jersey Village in 2026 is **070** (2,338 parcels). Fixed in
  `load.py`.

### ✅ Shipped 2026-04-19 — initial playbook (commit b8b10bf)

- 2,077 two-page playbook PDFs generated by `pipeline/render.py` for
  every non-gray JV parcel, committed to `reports/` and served via
  Pages. No AI prose; deterministic string formatting.

### ✅ Shipped 2026-04-19 — HTML refactor (this revision)

- **PDFs replaced by one HTML template + one data file.** Deleted
  `reports/*.pdf` (2,077 files, ~24MB), `pipeline/render.py`,
  `pipeline/prose.py`, `report-pending.html`, `scripts/run.sh`, and
  `cache/`. Added `report.html` + `report.js` + `pipeline/reports_data.py`
  which emits `data/reports.json`.
- **Same playbook content, now rendered client-side.** The full
  two-page layout (Evidence + Playbook) is now in `report.html` with
  slots that `report.js` populates from `reports.json` based on
  `?a=<account>` in the URL. Visible Print button and Back-to-map link
  up top; both hidden via `@media print`.
- **Share URLs.** `…/report.html?a=1074400000013` is a stable URL you
  can text a neighbor directly.
- **Map changes.** Popup / bottom-sheet button now says "View report"
  and links to `report.html?a=X` for every pin (gray included). The
  `r` flag on `parcels.json` entries is gone; `report.html` handles
  gray parcels with a "limited data — review manually" variant.

### ✅ Shipped 2026-04-19 — per-sqft normalization

- **Comp comparison switched from raw appraised value to $/sqft.**
  `findings.py` now takes the median of `comp_val / comp_living_area`
  and derives an implied fair value = `median_psf × subject_sqft`.
  Over-assessment % is subject appraisal vs. that fair value. This
  matches HCAD's own CAMA model and the Comptroller's PVS uniformity
  audit, and removes the bias the raw-dollar method had when the
  subject sat at the edges of its sqft band.
- **Report changes.** Comp table gains a `$/sqft` column (7 total);
  the Evidence page footer shows `median $/sqft → fair value → HCAD
  appraisal → over-assessment`; the Page-2 hearing script reads the
  per-sqft claim aloud; the Legal Argument paragraph now cites the
  per-sqft normalization directly.
- **reports.json schema changes.** Added `psf`, `med_psf`, `fair` to
  each parcel entry and `psf` to each comp. Dropped `med` (median of
  comp dollar values) — superseded by `med_psf`. The front-end bottom
  line and hearing script reference the new fields; `p` (over-%) now
  has per-sqft semantics.
- **Pin color distribution shift.** 2026 data: red 581→529, yellow
  331→316, green 1165→1232 (gray 36 unchanged). The new greens are
  parcels the raw-$ method was flagging as over-assessed just because
  the subject happened to be smaller than its comp basket.

### ✅ Shipped 2026-04-19 — under-assessed bucket + comp-spread badge

- **5th color: purple "don't file" bucket** for parcels >5% under their
  per-sqft median (`#7c3aed`). Threshold tuned to where ARB upward-
  adjustment risk becomes practically non-zero — −2% under was tested
  but flagged 856 parcels (41%) including many with no real risk; −5%
  scopes the warning to 583 parcels (27%) that genuinely shouldn't
  file. Green band stays asymmetric (−5..+2%) for the same reason.
  COLOR_LABEL.purple in `report.js` carries an explicit "ARB has
  authority to adjust upward" warning; `renderHearingScript` swaps
  the standard hearing script for a `.purple-warning` callout that
  quantifies the risk in dollars.
- **Comp-basket confidence badge.** `findings.py` emits
  `cv_pct = 100 · stdev/mean of comp $/sqft` per basket; the report's
  Median row gets a "spread: tight / moderate / wide" pill (CV<10/<15/
  ≥15) so the reader knows whether the median is solid (~58% of
  baskets have CV<10) or shaky.
- **Final 2026 distribution.** red 526 (24%), yellow 324 (15%),
  green 644 (30%), purple 583 (27%), gray 36 (2%). Surfacing under-
  assessment is the bigger reveal of the two-step migration: under
  the original raw-$ green-only model, 856 of those purple parcels
  were silently bucketed as "skip — filing unlikely to change" when
  they actually carry real risk of an upward correction.
- **Relative-not-absolute caveat** added to the legend popover so
  homeowners understand the test compares against neighbors HCAD also
  appraised, not absolute market value — the tool can't detect
  district-wide systematic over- or under-appraisal.

### ❌ Explicitly out of scope (not built)

- Auto-downloading HCAD source files (blocked by HCAD; manual step).
- iFile/iSettle upload automation (homeowner action, not static-site
  function).
- Owner-name-as-search-key in the autocomplete (privacy / stalker-proofing).
- Per-feature hedonic adjustments (pool, garage count, bath count).
  Per-sqft normalization + matched grade + matched nbhd gets us most of
  the "appropriately adjusted" signal without re-coding HCAD's internal
  feature schedules.
- User accounts, saved searches, analytics, feedback form.

---

## 5. How to operate

### 5.1 First-time setup (Mac Mini, Python 3.14)

```bash
uv sync
```

That's it. No API keys, no headless-claude auth to verify — the
pipeline is pure DuckDB + JSON emit, no AI calls.

### 5.2 Download HCAD 2026 source files

These are manual downloads — HCAD blocks programmatic access.

1. Property data: https://hcad.org/pdata/pdata-property-downloads.html
2. GIS (parcel shapefile): https://hcad.org/pdata/pdata-gis-downloads.html

Unzip into `hcad_raw/` so it looks like:

```
hcad_raw/
├── real_acct.txt
├── building_res.txt
├── jur_value.txt                   (was `jurisdiction_value.txt` before 2026)
├── owners.txt                      (optional; improves owner block in PDF)
└── Parcels/
    ├── Parcels.shp
    ├── Parcels.shx
    ├── Parcels.dbf
    └── Parcels.prj
```

Filenames may vary year to year — `pipeline/download.py → REQUIRED`
accepts common aliases; add more there if yours differ.

### 5.3 Smoke-test on ONE parcel first

Run the full pipeline (it's fast, ~1 minute), then visit
`report.html?a=<your-account>` locally to eyeball the output.

```bash
uv run python -m pipeline all           # load → findings → reports → mapdata
python3 -m http.server 8765             # serve the static site locally
open "http://localhost:8765/report.html?a=1234567890123"
```

Eyeball the HTML report. Check Page 1 (Evidence):
- "NOT LEGAL ADVICE" italic notice at the top
- One-sentence "bottom line" with the right appraisal, median, and %
- Facts table — address, sqft, year, grade, nbhd, 2026 value match
- Legal Argument cites §41.43(b)(3)
- Comp table with 5 plausible neighbors, ending with Median / HCAD
  2026 appraisal / Over-assessment (colored red if over, green if under)

Page 2 (Playbook):
- May 15 deadline banner
- Steps 1–3 (iFile login, iSettle offer, hearing script with your numbers)
- "If the Appraiser Pushes Back" rebuttals table
- "What NOT to Argue"
- §42.26(a)(3) escalation
- Disclaimer & Terms of Use

Footer on Page 2: "Built by a neighbor."

If anything's wrong, fix before pushing. Also sanity-check Print
preview in the browser — `@media print` should hide the toolbar,
force a page break between Page 1 and Page 2, and produce a clean
black-and-white layout suitable for the ARB hearing.

### 5.4 Full production run (~1 minute)

The pipeline is pure DuckDB + JSON emit — no AI, no HTML/PDF
rendering per parcel. Full run from a fresh HCAD download:

```bash
uv run python -m pipeline load        # ingest HCAD files into DuckDB
uv run python -m pipeline findings    # compute comps, median, over-assessment %, color
uv run python -m pipeline reports     # emit data/reports.json (~1MB, ~140KB gzipped)
uv run python -m pipeline mapdata     # emit data/parcels.json (~300KB, ~60KB gzipped)
```

Or run all four at once:

```bash
uv run python -m pipeline all
```

### 5.5 Publish

After any rebuild, commit the two JSON files and push:

```bash
git add data/parcels.json data/reports.json
git commit -m "Regenerate 2026 parcel data"
git push
```

GitHub Pages re-publishes within ~1 minute. Visit:
`https://sbezner.github.io/JVAppeals2026/`

### 5.6 Common re-run scenarios

Tweaked the PDF template in `pipeline/render.py`, want to re-render
**Tweaked the report template** (`report.html`, `report.js`, or
`style.css`) — no pipeline run needed. The static template is the
template; just commit and push:

```bash
git add report.html report.js style.css
git commit -m "Refresh report template"
git push
```

**Regenerated data from DuckDB** (edited `reports_data.py` or
`findings.py`, for example) — re-emit the JSONs and commit:

```bash
uv run python -m pipeline reports
uv run python -m pipeline mapdata
git add data/
git commit -m "Refresh 2026 parcel data"
git push
```

**After HCAD posts 2027 data** — download into `hcad_raw/` per §5.2,
then:

```bash
uv run python -m pipeline all
git add data/
git commit -m "Regenerate 2027 parcel data"
git push
```

`load.py`'s `COLUMN_ALIASES` is designed to survive HCAD's annual
renames — if it can't resolve a canonical column, it fails loudly with
the expected candidates, and you add the new HCAD name to the list.

---

## 6. Statutory references (used in the report)

- **Tex. Tax Code §41.43(b)(3)** — primary claim. Burden is on HCAD to
  show appraised value ≤ median of a reasonable number of appropriately-
  adjusted comparables.
  https://statutes.capitol.texas.gov/Docs/TX/htm/TX.41.htm
- **Tex. Tax Code §42.26(a)(3)** — judicial review fallback. Statutorily
  prohibits HCAD from presenting market-value rebuttal to a median-of-
  comps showing in district court.

## 7. Operating notes for future Claude Code sessions

**Shipping workflow (standing instruction from the owner):** every
change goes to `main`. Work on whatever feature branch the harness
assigns, commit there, then fast-forward merge into `main` and push
`main` — don't leave commits sitting on a branch waiting for a PR.
Pages publishes from `main` root, so "merged and pushed to main" is
the definition of "shipped." No need to ask each time.

**Cache-busting (don't skip).** `index.html` and `report.html`
reference the local assets with a version query string
(`style.css?v=N`, `main.js?v=N`, `report.js?v=N`). Browsers cache
those files aggressively; without the bump, users keep seeing the
previous deploy. **Whenever you touch `main.js`, `report.js`, or
`style.css`, bump the `v=` integer in both HTML files before
committing.** Data JSONs (`data/*.json`) are fetched with
`cache: "no-cache"` in `main.js` so they don't need the bump.

If you're Claude reading this in a later session, here's what *not* to
touch without good reason:

- Don't swap DuckDB for pandas/geopandas. DuckDB's spatial extension
  handles the shapefile, centroid, and transform; the Python stack for
  3.14 is intentionally minimal.
- **Don't re-introduce AI prose generation.** `pipeline/prose.py` was
  deleted on 2026-04-19. The report is a structured evidence sheet +
  hearing script, not a letter; warmth adds nothing. If a future
  session proposes regenerating prose per parcel, re-read `report.html`
  first — the "bottom line" sentence at the top of Page 1 already does
  the one-sentence-summary job deterministically.
- **Don't re-introduce per-parcel file output.** The 2,077 PDFs were
  deleted in favor of one `report.html` + one `reports.json`. If you
  catch yourself generating `reports/{account}.html`, stop — that's
  undoing the architectural shift documented in §2.
- Don't change the comp selection rules in `findings.py` without
  updating the matching prose in `report.html` (the Legal Argument
  block and the Page-2 rebuttals both quote the filter criteria).
- **The comparison is per-sqft, not raw dollars.** `findings.py` computes
  `median(comp_val / comp_living_area)` and derives `fair_value =
  median_psf × subject_sqft`; `over_pct` is against that fair value.
  Raw-dollar medians bias the result when the subject isn't near the
  sqft-band center — e.g., a 2,008-sqft subject compared against a
  basket averaging 2,150 sqft looks closer to fair than it really is.
  Don't revert to `median(comp_val)` without recomputing and retesting
  the pin-color distribution, and expect more greens + fewer yellows
  under the per-sqft version (the greens were hidden false-positives
  before).
- Don't remove the "Built by a neighbor." footer, the "NOT LEGAL
  ADVICE" banner, or the Disclaimer & Terms of Use section — they are
  the difference between a neighborly tool and unauthorized practice.
- The Jersey Village jurisdiction code is **070** in `jur_value.txt`'s
  `tax_district` column — not the city's ZIP, not its school district,
  not the postal city string. **Do not use 061** — that's the City of
  Houston, ~580k parcels.
- **Axis-order trap in DuckDB spatial.** After `st_transform(..., 'EPSG:2278',
  'EPSG:4326')`, `st_x()` returns the latitude and `st_y()` returns the
  longitude (DuckDB honors EPSG:4326's published lat-first axis order).
  `load.py` flips them so downstream code can treat lat/lon normally —
  don't re-swap without re-testing a known parcel's map pin location.
- **Account-key padding trap.** HCAD's tab-delimited text files pad
  the account column with trailing spaces to a fixed width; the
  shapefile's `HCAD_NUM` is unpadded. `load.py` uses `TRIM()` on every
  account cast so the joins work — keep that in any new query that
  joins across the text and shapefile tables.
- The pipeline is **idempotent and fast** (~1 minute end-to-end).
  Re-run freely; every stage is `CREATE OR REPLACE` under the hood
  and the JSON emitters are write-in-place.
