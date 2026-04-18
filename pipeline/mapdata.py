"""
Emit a compact JSON file for the Leaflet front-end:

    data/parcels.json = {
        "center": [lat, lon],
        "parcels": [
            {"a": account, "d": address, "c": "red|yellow|green|gray",
             "p": over_pct, "v": appraised_val, "ll": [lat, lon]},
            ...
        ]
    }

Short keys to keep the file small — there are ~3,000 parcels and this file
loads on every map visit. Gzipped by GitHub Pages automatically.
"""
from __future__ import annotations
import duckdb
import json
from pathlib import Path

DATA_DIR = Path("data")


def emit(db_path: str = "pipeline.duckdb") -> None:
    DATA_DIR.mkdir(exist_ok=True)
    con = duckdb.connect(db_path)

    rows = con.execute("""
        SELECT
            p.account, p.site_addr, p.site_zip,
            p.lat, p.lon,
            p.appraised_val,
            f.over_pct, f.color
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
    for account, addr, zip_, lat, lon, val, pct, color in rows:
        parcels.append({
            "a": account,
            "d": (addr or "").strip(),
            "z": (zip_ or "").strip(),
            "c": color or "gray",
            "p": round(pct, 1) if pct is not None else None,
            "v": int(val) if val is not None else None,
            "ll": [round(lat, 6), round(lon, 6)],
        })

    out = DATA_DIR / "parcels.json"
    out.write_text(json.dumps({
        "center": [round(center[0], 6), round(center[1], 6)] if center and center[0] else [29.889, -95.567],
        "parcels": parcels,
    }, separators=(",", ":")))
    print(f"wrote {out} with {len(parcels)} parcels")
