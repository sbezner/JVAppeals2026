"""
HCAD source files are downloaded MANUALLY by you, not by this pipeline.
HCAD's download pages gate access and block automated fetches; keep it simple.

Place the following files under ./hcad_raw/ before running:

    hcad_raw/
        real_acct.txt           Real property account master
        building_res.txt        Residential building details (sqft, year, grade)
        jurisdiction_value.txt  Per-parcel taxing jurisdiction rows
        owners.txt              Owner name + mailing address (optional)
        Parcels/                Parcel shapefile directory (Parcels.shp + .dbf + .shx + .prj)

Sources (2026):
    Property downloads: https://hcad.org/pdata/pdata-property-downloads.html
    GIS downloads:      https://hcad.org/pdata/pdata-gis-downloads.html

Filenames may vary year to year. This pipeline is schema-adaptive — it looks
for columns by canonical name first, then common HCAD variants. If loading
fails with an unresolved column, add an alias in pipeline/load.py.
"""
from __future__ import annotations
from pathlib import Path

HCAD_RAW = Path("hcad_raw")

REQUIRED = {
    "real_acct": ["real_acct.txt", "real_acct.csv"],
    "building_res": ["building_res.txt", "building_res.csv"],
    "jurisdiction_value": ["jurisdiction_value.txt", "jurisdiction.txt"],
    "parcels_shp": ["Parcels/Parcels.shp", "parcels/Parcels.shp", "Parcels.shp"],
}

OPTIONAL = {
    "owners": ["owners.txt", "owner.txt"],
}


def resolve(name: str, candidates: list[str]) -> Path | None:
    for rel in candidates:
        p = HCAD_RAW / rel
        if p.exists():
            return p
    return None


def check() -> dict[str, Path]:
    found: dict[str, Path] = {}
    missing: list[str] = []
    for name, candidates in REQUIRED.items():
        p = resolve(name, candidates)
        if p is None:
            missing.append(f"  {name}: expected one of {candidates}")
        else:
            found[name] = p
    for name, candidates in OPTIONAL.items():
        p = resolve(name, candidates)
        if p is not None:
            found[name] = p
    if missing:
        raise FileNotFoundError(
            "HCAD source files not found under ./hcad_raw/.\n"
            "Download them manually from https://hcad.org/pdata/ and place as:\n"
            + "\n".join(missing)
        )
    return found
