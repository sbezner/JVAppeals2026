"""
Emit a compact JSON file for the Leaflet front-end:

    data/parcels.json = {
        "center": [lat, lon],
        "parcels": [
            {"a": account, "d": address, "o": owner, "z": zip,
             "c": "red|yellow|green|gray",
             "sqft": living_area, "psf": $/sqft,
             "p": over_pct, "v": appraised_val, "ll": [lat, lon],
             "cap": 1?, "dis": 1?, "h": 1?},
            ...
        ]
    }

    Sparse flags (only present when truthy; front-end treats missing as 0):
        cap  — possible §23.23 homestead-cap claim
        dis  — per-sqft and raw-dollar methods disagree on file/skip
        h    — parcel has ARB protest or hearing history (2023+)

Short keys to keep the file small — there are ~2,100 parcels and this file
loads on every map visit. Gzipped by GitHub Pages automatically. The map
links every pin to report.html?a={account}; the report page loads
data/reports.json lazily to populate the full report content, so no "has
report" flag is needed here — every account maps to a valid report
(gray parcels render a "limited data — review manually" variant).
"""
from __future__ import annotations
import duckdb
import json
from pathlib import Path

DATA_DIR = Path("data")


def emit(db_path: str = "pipeline.duckdb") -> None:
    DATA_DIR.mkdir(exist_ok=True)
    con = duckdb.connect(db_path)

    # Parcels with any ARB history (2023+ protests or hearings). Sparse
    # `h:1` on the map pin signals "this parcel has protest history" so a
    # future map feature can light it up without another data regen.
    # Empty set if the hearings stage hasn't populated parcel_history.
    has_hist_table = bool(con.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name='parcel_history'"
    ).fetchone())
    if has_hist_table:
        history_accts = {
            r[0] for r in
            con.execute("SELECT DISTINCT account FROM parcel_history").fetchall()
        }
    else:
        history_accts = set()

    rows = con.execute("""
        SELECT
            p.account, p.site_addr, p.site_zip, p.owner_name,
            p.living_area, p.lat, p.lon,
            p.appraised_val,
            f.over_pct, f.color, f.cap_violation,
            -- "Directional" disagreement: the two methods straddle the
            -- file-vs-skip line. Red/yellow = "file"; green/purple = "skip
            -- or don't". A bucket flip within the same side (say red↔yellow)
            -- doesn't change the homeowner's decision and would just add
            -- noise — so we only flag it when the action changes.
            (f.color IN ('red','yellow') AND f.raw_color IN ('green','purple'))
            OR (f.color IN ('green','purple') AND f.raw_color IN ('red','yellow'))
                AS methods_disagree
        FROM parcels p
        LEFT JOIN findings f USING (account)
        WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL
    """).fetchall()

    center = con.execute("""
        SELECT avg(lat), avg(lon) FROM parcels
        WHERE lat IS NOT NULL AND lon IS NOT NULL
    """).fetchone()
    con.close()

    parcels = []
    for account, addr, zip_, owner, sqft, lat, lon, val, pct, color, cap, disagree in rows:
        # Subject $/sqft so the popup / bottom sheet can show the same
        # unit a homeowner would compare neighbors on. Computed per row
        # rather than carried on parcels so we don't depend on findings
        # having run.
        psf = (val / sqft) if val and sqft else None
        entry = {
            "a": account,
            "d": (addr or "").strip(),
            "z": (zip_ or "").strip(),
            "o": (owner or "").strip(),
            "c": color or "gray",
            "sqft": int(sqft) if sqft is not None else None,
            "psf": round(psf, 2) if psf is not None else None,
            "p": round(pct, 1) if pct is not None else None,
            "v": int(val) if val is not None else None,
            "ll": [round(lat, 6), round(lon, 6)],
        }
        # Only emit sparse flags when true — keeps the file small, and the
        # front-end treats missing == false.
        if cap:
            entry["cap"] = 1
        if disagree:
            entry["dis"] = 1
        if account in history_accts:
            entry["h"] = 1
        parcels.append(entry)

    out = DATA_DIR / "parcels.json"
    out.write_text(json.dumps({
        "center": [round(center[0], 6), round(center[1], 6)] if center and center[0] else [29.889, -95.567],
        "parcels": parcels,
    }, separators=(",", ":")))
    print(f"wrote {out} with {len(parcels)} parcels")
