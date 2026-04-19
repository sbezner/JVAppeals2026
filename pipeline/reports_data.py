"""
Emit data/reports.json — the data source behind the client-rendered
report.html page. One entry per JV single-family parcel, keyed by HCAD
account number.

Non-gray parcels carry a `comps` array (5 entries). Gray parcels still
appear in the file but with `med_psf=null`, `fair=null`, `p=null`, and
`comps=[]`; the report.html template renders a "limited data — review
manually" variant for those. Keeping every parcel in one file means the
front-end only has to fetch once and never has to ask the server
whether a given account has a report.

Loaded lazily by report.html — the map page never needs this file, so
its payload stays out of the initial map render.

Per-parcel schema (short keys to keep the file small):
    a        HCAD account
    d, z, o  address, zip, owner
    sqft     subject living area
    year     subject year built
    grade    subject HCAD grade
    nbhd     subject HCAD neighborhood code
    v        subject 2026 appraised value (dollars)
    psf      subject $/sqft (= v / sqft)
    med_psf  median $/sqft across the 5 comps
    fair     implied fair value = med_psf × sqft (dollars)
    p        over-% of appraisal vs. fair value
    c        color bucket: red / yellow / green / gray
    comps    list of {a, sqft, year, grade, v, psf}
"""
from __future__ import annotations
import duckdb
import json
from pathlib import Path

DATA_DIR = Path("data")


def emit(db_path: str = "pipeline.duckdb") -> None:
    DATA_DIR.mkdir(exist_ok=True)
    con = duckdb.connect(db_path)

    subjects = con.execute("""
        SELECT
            p.account, p.site_addr, p.site_zip, p.owner_name,
            p.living_area, p.year_built, p.grade, p.nbhd_code,
            p.appraised_val,
            f.median_comp_psf, f.fair_value, f.over_pct, f.color
        FROM parcels p
        LEFT JOIN findings f USING (account)
        ORDER BY p.account
    """).fetchall()

    reports: dict[str, dict] = {}
    n_with_comps = 0
    n_gray = 0
    for row in subjects:
        (account, addr, zip_, owner, sqft, year, grade, nbhd, val,
         med_psf, fair, pct, color) = row
        subject_psf = (val / sqft) if val and sqft else None
        entry: dict = {
            "a": account,
            "d": (addr or "").strip(),
            "z": (zip_ or "").strip(),
            "o": (owner or "").strip(),
            "sqft": int(sqft) if sqft is not None else None,
            "year": int(year) if year is not None else None,
            "grade": (grade or "").strip(),
            "nbhd": (nbhd or "").strip(),
            "v": int(val) if val is not None else None,
            "psf": round(subject_psf, 2) if subject_psf is not None else None,
            "med_psf": round(med_psf, 2) if med_psf is not None else None,
            "fair": int(fair) if fair is not None else None,
            "p": round(pct, 1) if pct is not None else None,
            "c": color or "gray",
            "comps": [],
        }
        if med_psf is not None:
            comp_rows = con.execute("""
                SELECT p.account, p.living_area, p.year_built, p.grade,
                       p.appraised_val, fc.comp_psf
                FROM parcels p
                JOIN finding_comps fc ON fc.comp_account = p.account
                WHERE fc.account = ?
                ORDER BY fc.rank
            """, [account]).fetchall()
            entry["comps"] = [
                {
                    "a": c[0],
                    "sqft": int(c[1]) if c[1] is not None else None,
                    "year": int(c[2]) if c[2] is not None else None,
                    "grade": (c[3] or "").strip(),
                    "v": int(c[4]) if c[4] is not None else None,
                    "psf": round(c[5], 2) if c[5] is not None else None,
                }
                for c in comp_rows
            ]
            n_with_comps += 1
        else:
            n_gray += 1
        reports[account] = entry

    con.close()
    out = DATA_DIR / "reports.json"
    out.write_text(json.dumps(reports, separators=(",", ":")))
    print(
        f"wrote {out} with {len(reports)} parcels "
        f"({n_with_comps} with comps, {n_gray} gray)"
    )
