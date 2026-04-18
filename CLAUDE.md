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
- **Jersey Village = jurisdiction code 061.** HCAD's `jurisdiction_value`
  table lists every taxing unit that levies on a parcel; "061" is the
  City of Jersey Village. This is the legal definition of being "in JV"
  and it's a clean tabular filter — no spatial clip needed.
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
├── hcad_raw/               (gitignored) you drop HCAD source files here
└── cache/prose/            (gitignored) resumable prose JSON cache
```

---

## 4. Status — what is and isn't done

### ✅ Functionally complete (committed, ready to run)

- **Repo scaffold** — `pyproject.toml`, `.gitignore`, README, directory tree
- **Pipeline download stage** — file-existence check with a clear error
  pointing you to the HCAD download URLs
- **Pipeline load stage** — DuckDB ingest of `real_acct.txt`,
  `building_res.txt`, `jurisdiction_value.txt`, optional `owners.txt`, and
  the `Parcels.shp` shapefile. Reprojects centroids to WGS84. Schema-
  adaptive column resolution (canonical → HCAD variant). Filters to JV
  (jurisdiction 061) + residential (state_class `A*`) + sqft > 0 + year > 1900.
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
  (↑/↓/Enter/Esc), pin-click popup with download link, legend, footer.
  Loads from `data/parcels.json` at boot.

### 🟡 Not done / unverified (needs you on the Mac Mini)

These are items that can only be resolved with the real HCAD files in hand:

1. **Confirm 2026 HCAD column names.** `pipeline/load.py → COLUMN_ALIASES`
   has best-guess HCAD names for each canonical column. If the loader
   raises `KeyError: Could not resolve canonical column 'X'`, add the
   actual HCAD column name to the list for that entry. Columns most
   likely to drift: `Neighborhood_Code` vs. `nbhd_cd`, `grade_adjustment`
   vs. `grade`, `tot_appr_val` vs. `appr_val`.
2. **Confirm shapefile CRS.** `pipeline/load.py` assumes HCAD's `Parcels.shp`
   is EPSG:2278 (Texas South Central, US feet). Open `Parcels.prj` in the
   shapefile download — if it's different, update the `st_transform`
   call in `load.py → parcel_centroid`.
3. **Shapefile account column is hardcoded to `HCAD_NUM`.** The parcel
   shapefile's DBF field for the account number has historically been
   `HCAD_NUM`, but has also been seen as `hcad_num`, `Account`, or
   `HCADACCT`. If the `parcel_centroid` CREATE fails with "column
   HCAD_NUM does not exist", inspect the shapefile's DBF columns and
   edit that one reference in `pipeline/load.py`. (Future follow-up:
   move this into `COLUMN_ALIASES` like the other columns.)
4. **`uv.lock` is not committed yet.** It is generated the first time
   you run `uv sync` on the Mac Mini. After your first successful
   `uv sync`, commit it so subsequent clones reproduce the same
   dependency versions: `git add uv.lock && git commit -m "Add uv.lock"`.
5. **GitHub Pages is not enabled yet.** On the repo, go to
   Settings → Pages → Source: this branch (or `main` after merge),
   folder `/ (root)`. Site URL will be
   `https://sbezner.github.io/JVAppeals2026/`. Until the pipeline runs
   and you push `data/parcels.json` + `reports/*.pdf`, the page will
   load but show "No parcel data yet."
6. **Smoke-test one known parcel end to end** — see §5 below.
7. **Full production run** — ~7–8 days on Max plan; verify no weekly
   quota issues partway in.
8. **After each pipeline run,** commit and push `data/parcels.json` and
   any new `reports/*.pdf` so GitHub Pages picks them up.

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
├── jurisdiction_value.txt
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
- The Jersey Village jurisdiction code is **061** — not the city's ZIP,
  not its school district, not the postal city string.
- The pipeline is **resumable by design**. Any change that invalidates
  the prose cache (prompt change, schema change, etc.) requires
  clearing `cache/prose/` manually — don't add auto-invalidation.
