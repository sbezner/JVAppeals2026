# JVAppeals2026

A static map of every Jersey Village, TX single-family parcel, with a
client-rendered §41.43(b)(3) HCAD appeal report behind every pin.

- **Live site** — [jvtaxappeal.com](https://jvtaxappeal.com), served
  from GitHub Pages (custom domain proxied via Cloudflare).
- **Pins** are colored by over-assessment vs. the median of 5 comparable
  homes (same HCAD neighborhood code + grade, ±15% sqft, ±10 years age,
  geographically closest). Per-sqft normalization:
  - **red** >7% over median (strong unequal-appraisal case)
  - **yellow** 2–7% over (consider filing)
  - **green** within noise band (skip)
  - **purple** >5% under (do not file — ARB could raise)
  - **gray** no comps matched (review manually)
- **Orange ring** on a pin = possible §23.23 homestead cap claim
  (homesteaded home with >10% year-over-year appraisal increase).
- **Click a pin** → opens a two-page report at
  `report.html?a=<account>`. Page 1 is the evidence (facts table,
  comps, median with fair-value math, raw-dollar alt view); Page 2 is
  the playbook (May 15 deadline, iFile steps, hearing script,
  rebuttals, §42.26 escalation, disclaimer). Fully printable; share by
  URL.
- **Community snapshot** at
  [`stats.html`](https://jvtaxappeal.com/stats.html) — JV-wide
  aggregate numbers (total appraised value, combined over-assessment
  gap, median year-over-year change, bucket distribution, cap-violation
  count), an inline-SVG histogram of every parcel's over-%, a
  per-neighborhood case-rate table, and a live count of how many
  neighbors have already filed a 2026 protest (refreshed weekly from
  HCAD's ARB data).
- **ARB protest + hearings history** for 2023–2026 is loaded into
  `data/reports.json` per parcel (1,265 of 2,172 JV parcels have at
  least one record, 58%). Stored as a year-keyed `hist` object with
  filing date, agent/owner, hearing outcome, and initial/final
  appraised + market values. Not yet surfaced in the UI; the pipeline
  is in place so future features (per-parcel protest-history row,
  win-rate stats, year-over-year agent vs owner breakdown) can be
  added without another pipeline change.

## How it's built

All data is deterministic — no AI, no per-parcel rendered files. One
HTML template + two JSON data files drive the whole site.

Offline pipeline (runs in ~1 minute):

1. You download HCAD 2026 source files to `hcad_raw/` (see
   `pipeline/download.py` for filenames and URLs — HCAD blocks
   automated fetches, so this step is manual).
2. `python -m pipeline load` — DuckDB ingests the tab-delimited
   property tables and the parcel shapefile, filters to the City of
   Jersey Village (`jur_value.tax_district='070'`, with a postal-city
   fallback for parcels HCAD left out of `jur_value`) plus residential
   state classes.
3. `python -m pipeline findings` — for each parcel, DuckDB picks 5
   comps and computes per-sqft median, raw-dollar median, fair value,
   comp-basket coefficient of variation, homestead-cap excess, and
   bucket color.
4. `python -m pipeline hearings` — loads HCAD ARB protest + hearings
   files from `hcad_raw/Hearings/{year}/` (optional input; feature
   silently no-ops if absent). Builds a `parcel_history` DuckDB table
   of JV-filtered protest + hearing records keyed by (account, year),
   2023–2026.
5. `python -m pipeline reports` — emits `data/reports.json`
   (~2MB / ~307KB gzipped), keyed by HCAD account, with subject facts,
   5 comp details, and per-year ARB `hist` entries.
6. `python -m pipeline mapdata` — emits `data/parcels.json`
   (~367KB / ~89KB gzipped), the compact payload the map loads on
   boot. Includes sparse `cap:1` / `dis:1` / `h:1` flags on parcels
   that have a homestead-cap claim / methods-differ verdict / ARB
   history.

Or the shortcut: `python -m pipeline all`.

Stages accept multi-invocation for weekly ARB refreshes (they run in
fixed dependency order regardless of argv order):

```bash
# Weekly ARB refresh — only the 2026 hearings file changes during cycle
unzip -o hcad_raw/Hearings/2026/Hearing_files.zip -d hcad_raw/Hearings/2026/
uv run python -m pipeline hearings reports mapdata
git commit -am "Refresh 2026 hearings" && git push
```

`report.html` and `report.js` then render the report client-side from
`reports.json` when a visitor hits `report.html?a=<account>`.

## Setup (Python 3.14)

```bash
# 1. Install dependencies
uv sync

# 2. Download HCAD 2026 files into ./hcad_raw/ (see pipeline/download.py)

# 3. Run the full pipeline (~1 minute)
uv run python -m pipeline all

# 4. Preview locally
python3 -m http.server 8765
# then open http://localhost:8765/

# 5. Publish
git add data/ && git commit -m "Regenerate parcel data" && git push
```

## Layout

```
index.html, main.js, style.css    Leaflet map + search UI
report.html, report.js            two-page appeal report template
stats.html, stats.js              /stats.html community snapshot + histogram
data/parcels.json                 map pins + flags
data/reports.json                 per-parcel report data (lazy-loaded)
pipeline/                         Python pipeline modules
  load.py                           DuckDB ingest + JV filter
  findings.py                       5-comp selection, medians, buckets
  hearings.py                       ARB protest + hearings loader (2023-2026)
  reports_data.py                   emits data/reports.json (incl. hist)
  mapdata.py                        emits data/parcels.json
  download.py                       HCAD file check
CNAME                             GitHub Pages custom-domain pointer (jvtaxappeal.com)
featurelist.md                    backlog of features under consideration
CLAUDE.md                         deeper design notes + runbook
hcad_raw/                         (gitignored) your HCAD source files
  Hearings/{year}/                  ARB protest + hearings downloads
hcad_download/                    (gitignored) original HCAD zips
```

Built by a neighbor. Not affiliated with HCAD or the City of Jersey Village.
No legal advice.
