# JVAppeals2026

A static map of every Jersey Village, TX single-family parcel, with a
pre-generated §41.43(b)(3) HCAD appeal PDF behind every pin.

- **Live site** — served from GitHub Pages off the repo root.
- **Pins** are colored by over-assessment vs. the median of 5 comparable homes
  (same HCAD neighborhood code + grade, ±15% sqft, ±10 years age, geographically
  closest): **red** > 7%, **yellow** 2–7%, **green** < 2%.
- **Click a pin** → downloads the pre-generated PDF appeal report for that
  parcel.

## How it's built

Offline pipeline on the Mac Mini:

1. You download HCAD 2026 source files to `hcad_raw/` (see
   `pipeline/download.py` for filenames and URLs — HCAD blocks automated
   fetches, so this step is manual).
2. `python -m pipeline load` — DuckDB ingests the tab-delimited property
   tables and the parcel shapefile, filters to jurisdiction 061 (City of
   Jersey Village) and residential state classes.
3. `python -m pipeline findings` — for each parcel, DuckDB picks 5 comps and
   computes the median + over-assessment %.
4. `python -m pipeline prose` — the three personalized prose blocks
   (executive summary, standout finding, reconciliation) are generated via
   `claude -p --output-format json` in Claude Code headless mode. Rate-limited
   to ~50 calls/hour; each result cached as `cache/prose/{account}.json` so
   restarts skip completed parcels.
5. `python -m pipeline render` — ReportLab writes `reports/{account}.pdf`.
6. `python -m pipeline mapdata` — emits `data/parcels.json` for the Leaflet
   front-end.

## Setup (Mac Mini, Python 3.14)

```bash
# 1. Install dependencies
uv sync

# 2. Download HCAD 2026 files into ./hcad_raw/ (see pipeline/download.py)

# 3. Smoke-test on one known parcel
uv run python -m pipeline load
uv run python -m pipeline findings
uv run python -m pipeline prose   --accounts 1234567890123
uv run python -m pipeline render  --accounts 1234567890123
open reports/1234567890123.pdf

# 4. Full run, detached, with the screen kept awake
./scripts/run.sh
# (reattach any time: tmux attach -t jvappeals)
```

Expected full-run time: ~7–8 days at 50 calls/hour for ~3,000 parcels, then
minutes for PDF rendering and map data emission.

## Layout

```
index.html, main.js, style.css    Leaflet map + search UI (served by Pages)
data/parcels.json                 emitted by the pipeline; front-end reads this
reports/{account}.pdf             emitted by the pipeline; committed to git
pipeline/                         Python pipeline modules
scripts/run.sh                    tmux + caffeinate wrapper for full runs
hcad_raw/                         (gitignored) your HCAD source files
cache/prose/{account}.json        (gitignored) resumable prose cache
```

Built by a neighbor. Not affiliated with HCAD or the City of Jersey Village.
