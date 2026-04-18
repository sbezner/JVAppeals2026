# JVAppeals2026 — Project Context

> **This file is the project's single source of truth.** When you open Claude
> Code in this repo, it auto-loads `CLAUDE.md` and has full context. Humans
> should read it top-to-bottom before their first run.

---

## 1. What this is

A static GitHub Pages site that shows every single-family parcel in Jersey
Village, TX on a Leaflet map. Each pin is colored by how over-assessed it is
versus the median of 5 comparable homes under the standard Texas Tax Code
§41.43(b)(3) criteria. Clicking a pin downloads a pre-generated personalized
PDF appeal report for that parcel.

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
  │  hcad_raw/            load.py             findings.py          prose.py            │
  │  (HCAD files,  ─►  DuckDB ingest  ─►   5-comp median,      ─► claude -p            │
  │   downloaded       + residential       over-assessment %,     (rate-limited,       │
  │   manually)        + jurisdiction     red/yellow/green          cached per         │
  │                    061 filter)         color bucket              account)           │
  │                                                                       │            │
  │                                        render.py  ◄──────────────────┘            │
  │                                   ReportLab PDF                                    │
  │                                   reports/{account}.pdf                            │
  │                                                                                    │
  │                                        mapdata.py  ─►  data/parcels.json           │
  └────────────────────────────────────────────────────────────────────────────────────┘
                                                 │
                                                 ▼
  ┌────────────────────────── STATIC SITE (GitHub Pages, repo root) ───────────────────┐
  │                                                                                    │
  │  index.html + main.js + style.css                                                  │
  │    ├─ reads  data/parcels.json                                                     │
  │    ├─ draws  Leaflet CircleMarkers on OSM tiles                                    │
  │    ├─ offers autocomplete search over address + HCAD account                       │
  │    └─ on pin click  ─►  reports/{account}.pdf   (committed to repo)                │
  └────────────────────────────────────────────────────────────────────────────────────┘
```

**Data flow:** HCAD tab-delimited tables + Parcels shapefile → DuckDB →
per-parcel findings → per-parcel prose JSON (cached) → per-parcel PDF +
consolidated parcels.json → git commit → GitHub Pages.

**Key design decisions (do not undo without a reason):**

- **DuckDB, not pandas/geopandas.** DuckDB's built-in `spatial` extension
  reads shapefiles via `st_read` and does centroid reprojection in SQL.
  Avoids the geopandas/shapely/pyogrio wheel lag on Python 3.14.
- **`claude -p` headless, not the Anthropic API.** The pipeline uses your
  existing Claude Code subscription auth — no API key, no billing, no
  `.env`. Rate-limited at ~50 calls/hour to stay inside subscription
  quotas. Each call is shelled out and its JSON result cached per account
  so the pipeline is fully resumable.
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
- **PDFs live in the repo.** `reports/{account}.pdf` is committed to git
  and served by GitHub Pages at a relative path. ~3,000 small PDFs ≈
  300MB — within GitHub's 1GB soft repo limit.
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
├── main.js                 map + autocomplete + pin-click download
├── style.css               minimal styling for header, search, legend, footer
├── report-pending.html     "coming soon" landing for parcels without PDFs yet
│
├── data/
│   └── parcels.json        emitted by the pipeline; consumed by main.js
│
├── reports/
│   └── {account}.pdf       one pre-generated PDF per JV single-family parcel
│
├── pipeline/
│   ├── __init__.py
│   ├── __main__.py         CLI: python -m pipeline {load|findings|prose|render|mapdata|all}
│   ├── download.py         manual-download instructions + existence check
│   ├── load.py             DuckDB ingest, schema-adaptive column resolution
│   ├── findings.py         5-comp selection, median, over-assessment %, color
│   ├── prose.py            `claude -p --output-format json` with rate limit + cache
│   ├── render.py           ReportLab PDF template
│   └── mapdata.py          emits data/parcels.json
│
├── scripts/
│   └── run.sh              tmux + caffeinate wrapper for multi-day runs
│
├── hcad_download/          (gitignored) local staging for HCAD download zips
├── hcad_raw/               (gitignored) extracted HCAD source files
└── cache/prose/            (gitignored) resumable prose JSON cache
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
  self; top 5 by haversine distance from centroids; median appraised
  value; over-assessment % vs. subject; color bucket (>7% red, 2–7%
  yellow, <2% green, missing comps gray).
- **Pipeline prose stage** — shells out to `claude -p --output-format json`
  with a strict JSON prompt requiring three keys
  (executive_summary, standout_finding, reconciliation). 72s sleep between
  calls. Each successful result cached as `cache/prose/{account}.json` —
  restarts skip completed parcels. Malformed responses are logged and
  skipped (they'll be retried on the next run).
- **Pipeline render stage** — ReportLab PDF with: title, subtitle, exec
  summary, facts table (account, owner, address, sqft, year, grade,
  nbhd, appraised value), owner mailing address, §41.43(b)(3) grounds
  paragraph, comp table (subject row highlighted + 5 comps + median +
  over-assessment), standout finding, §42.26(a)(3) fallback, reconciliation,
  "Built by a neighbor." footer.
- **Pipeline mapdata stage** — emits compact `data/parcels.json` with
  short keys (`a` account, `d` address, `c` color, `p` pct, `v` value,
  `ll` [lat, lon]) + a computed map center.
- **CLI entry point** — `python -m pipeline <stage> [--accounts CSV]`.
- **Run script** — `scripts/run.sh` starts a detached tmux session
  running `caffeinate -is uv run python -m pipeline all` and tees to
  `pipeline.log`. Safe to reattach, tail, or kill.
- **Static site** — `index.html`, `main.js`, `style.css`. Leaflet + OSM
  tiles, colored pins, autocomplete on address + account, keyboard nav
  (↑/↓/Enter/Esc), pin-click popup, legend, footer.
  Loads from `data/parcels.json` at boot.
- **Hybrid PDF/pending UX** — `mapdata.py` sets a per-parcel `r` flag
  (1 if `reports/{account}.pdf` exists, else 0). The popup shows the
  download link for parcels with `r=1` and a "Report coming soon" link
  to `report-pending.html?a=&d=` for those with `r=0`. This lets the map
  go live with fully-colored pins even while prose/render is still
  grinding through the batch — re-run `mapdata` after each batch
  completes and commit the updated `parcels.json` + new PDFs to surface
  them.

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

### 🟡 Still open

1. **Full production run** — ~7–8 days on Max plan; verify no weekly
   quota issues partway in.
2. **After each mapdata re-run during the batch,** commit and push
   `data/parcels.json` + any new `reports/*.pdf` so the map surfaces
   completed reports incrementally via the `r` flag.

### ❌ Explicitly out of scope (not built)

- Auto-downloading HCAD source files (blocked by HCAD; manual step).
- iFile/iSettle upload automation (homeowner action, not static-site
  function).
- Owner-name-as-search-key in the autocomplete (privacy / stalker-proofing).
- Adjustments to comp values (we use raw appraised_val per HCAD data; the
  statute allows "appropriately adjusted" but an ARB panelist will accept
  raw comps when the nbhd+grade+sqft+age filters are tight).
- User accounts, saved searches, analytics, feedback form.

---

## 5. How to operate

### 5.1 First-time setup (Mac Mini, Python 3.14)

```bash
# Install Python dependencies via uv.
uv sync

# Verify claude headless is available (uses your subscription auth).
claude -p "hello" --output-format json | head -20
```

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

Use an account number you know (yours, or a neighbor's — HCAD
account numbers are public on hcad.org). This takes ~2 minutes total.

```bash
uv run python -m pipeline load
uv run python -m pipeline findings
uv run python -m pipeline prose   --accounts 1234567890123
uv run python -m pipeline render  --accounts 1234567890123
open reports/1234567890123.pdf
```

Eyeball the PDF. Check:
- Address and account match
- Sqft / year / grade are correct
- The 5 comps are plausible (same neighborhood, similar size/age)
- Over-assessment % matches what you'd compute by hand
- The three prose blocks read like a friendly neighbor, not a lawyer
- §41.43(b)(3) and §42.26(a)(3) language is present
- Footer says "Built by a neighbor."

If anything's wrong, fix before running the full 3,000.

### 5.4 Full production run (~7–8 days)

```bash
./scripts/run.sh
```

That starts a **detached tmux session** named `jvappeals` running
`caffeinate -is uv run python -m pipeline all` with output teed to
`pipeline.log`. You can close the lid, log out, whatever.

Monitoring:

```bash
tmux attach -t jvappeals    # attach — Ctrl-b d to detach again
tail -f pipeline.log        # just watch the log
```

Stopping:

```bash
tmux kill-session -t jvappeals
```

Resuming: just re-run `./scripts/run.sh` — the prose cache in
`cache/prose/` skips completed parcels, and `load`/`findings`/`render`/
`mapdata` are idempotent.

### 5.5 Publish

After the pipeline completes:

```bash
git add data/parcels.json reports/
git commit -m "Regenerate 2026 parcel data and PDFs"
git push
```

GitHub Pages will re-publish within ~1 minute. Visit:
`https://<your-github>.github.io/JVAppeals2026/`

### 5.6 Running just one stage

Useful during iteration — e.g., you edit the PDF template and want to
re-render without re-prompting Claude:

```bash
uv run python -m pipeline render       # re-renders all PDFs (prose cache unchanged)
uv run python -m pipeline mapdata      # regenerates data/parcels.json
uv run python -m pipeline prose --accounts 1234567890123  # one parcel's prose
```

---

## 6. Statutory references (used in the PDF)

- **Tex. Tax Code §41.43(b)(3)** — primary claim. Burden is on HCAD to
  show appraised value ≤ median of a reasonable number of appropriately-
  adjusted comparables.
  https://statutes.capitol.texas.gov/Docs/TX/htm/TX.41.htm
- **Tex. Tax Code §42.26(a)(3)** — judicial review fallback. Statutorily
  prohibits HCAD from presenting market-value rebuttal to a median-of-
  comps showing in district court.

## 7. Operating notes for future Claude Code sessions

If you're Claude reading this in a later session, here's what *not* to
touch without good reason:

- Don't swap DuckDB for pandas/geopandas. DuckDB's spatial extension
  handles the shapefile, centroid, and transform; the Python stack for
  3.14 is intentionally minimal.
- Don't swap `claude -p` for the Anthropic SDK. The user deliberately
  chose subscription-auth headless mode to avoid API billing.
- Don't change the comp selection rules without updating the statute
  paragraph in `render.py → GROUNDS_4143`. The report's legal claim
  depends on the filters matching what the prose describes.
- Don't remove the "Built by a neighbor." footer or the non-affiliation
  disclaimer in the README.
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
- The pipeline is **resumable by design**. Any change that invalidates
  the prose cache (prompt change, schema change, etc.) requires
  clearing `cache/prose/` manually — don't add auto-invalidation.
