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
    cv       coefficient of variation of comp $/sqft (basket spread, %)
    c        color bucket: red / yellow / green / purple / gray
    comps    list of {a, sqft, year, grade, v, psf}
    hist     (optional) per-year ARB protest/hearing history keyed by
             tax year; each entry has pd/by/ad/rd/lt/ht/iv/fv/im/fm.
             Only present on parcels with at least one 2023-2026 record.
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
            p.appraised_val, p.prior_appraised_val, p.homestead,
            f.median_comp_psf, f.fair_value, f.over_pct, f.cv_pct, f.color,
            f.yoy_pct, f.cap_excess_val, f.cap_violation,
            f.median_comp_val, f.raw_over_pct, f.raw_color
        FROM parcels p
        LEFT JOIN findings f USING (account)
        ORDER BY p.account
    """).fetchall()

    # Pre-load per-parcel ARB history into a {account: {year_str: rec}}
    # dict so we can attach without a per-row query. Gracefully no-ops if
    # the hearings stage hasn't populated parcel_history.
    hist_by_acct: dict[str, dict[str, dict]] = {}
    has_history = bool(con.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name='parcel_history'"
    ).fetchone())
    if has_history:
        hist_rows = con.execute("""
            SELECT account, year, pd, by_, ad, rd, lt, ht, iv, fv, im, fm
            FROM parcel_history
            ORDER BY account, year
        """).fetchall()
        for (h_acct, h_year, pd, by_, ad, rd, lt, ht, iv, fv, im, fm) in hist_rows:
            rec = {}
            if pd: rec["pd"] = pd
            if by_: rec["by"] = by_
            if ad: rec["ad"] = ad
            if rd: rec["rd"] = rd
            if lt: rec["lt"] = lt
            if ht: rec["ht"] = ht
            if iv is not None: rec["iv"] = iv
            if fv is not None: rec["fv"] = fv
            if im is not None: rec["im"] = im
            if fm is not None: rec["fm"] = fm
            if rec:
                hist_by_acct.setdefault(h_acct, {})[str(h_year)] = rec

    reports: dict[str, dict] = {}
    n_with_comps = 0
    n_gray = 0
    n_with_history = 0
    for row in subjects:
        (account, addr, zip_, owner, sqft, year, grade, nbhd,
         val, prior_val, homestead,
         med_psf, fair, pct, cv, color,
         yoy, cap_excess, cap_violation,
         med_val, raw_pct_db, raw_color) = row
        subject_psf = (val / sqft) if val and sqft else None
        # raw_pct_db comes from findings.py; reuse it as the canonical value.
        raw_over_pct = raw_pct_db
        # Directional disagreement only — see mapdata.py for the rationale.
        file_verdicts = {"red", "yellow"}
        skip_verdicts = {"green", "purple"}
        methods_disagree = (
            (color in file_verdicts and raw_color in skip_verdicts)
            or (color in skip_verdicts and raw_color in file_verdicts)
        )
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
            "prior_v": int(prior_val) if prior_val is not None else None,
            "psf": round(subject_psf, 2) if subject_psf is not None else None,
            "med_psf": round(med_psf, 2) if med_psf is not None else None,
            "fair": int(fair) if fair is not None else None,
            "p": round(pct, 1) if pct is not None else None,
            "cv": round(cv, 1) if cv is not None else None,
            "c": color or "gray",
            # §23.23 homestead cap fields:
            "hs": bool(homestead) if homestead is not None else False,
            "yoy": round(yoy, 1) if yoy is not None else None,
            "cap_excess": int(cap_excess) if cap_excess is not None else None,
            "cap": bool(cap_violation) if cap_violation is not None else False,
            # Raw-dollar (unadjusted) median + gap. Alongside the per-sqft
            # fair value, lets homeowners see both methodologies side-by-side.
            "med_val": int(med_val) if med_val is not None else None,
            "raw_p": round(raw_over_pct, 1) if raw_over_pct is not None else None,
            "raw_c": raw_color or "gray",
            # True when the two methodologies put the parcel in different
            # buckets — the front-end uses this to surface a methodology
            # note in the report and a short tag in the map popup.
            "dis": bool(methods_disagree),
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

        # Attach ARB history if present. Keys are string years to match
        # the JSON idiom (so report.js can just `for (const y in p.hist)`).
        if account in hist_by_acct:
            entry["hist"] = hist_by_acct[account]
            n_with_history += 1

        reports[account] = entry

    con.close()
    out = DATA_DIR / "reports.json"
    out.write_text(json.dumps(reports, separators=(",", ":")))
    print(
        f"wrote {out} with {len(reports)} parcels "
        f"({n_with_comps} with comps, {n_gray} gray, "
        f"{n_with_history} with ARB history)"
    )
