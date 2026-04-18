"""
Load HCAD tab-delimited tables and the parcel shapefile into DuckDB, then
normalize into a single `parcels` table with canonical column names:

    account          HCAD account number (13 digits, string)
    site_addr        street address
    site_city        postal city (frequently "HOUSTON" even in JV)
    site_zip         postal zip
    owner_name       owner name (may be null)
    owner_mail_1..5  owner mailing address lines
    nbhd_code        HCAD neighborhood code
    grade            HCAD improvement grade / class
    state_class      state code (residential single-family filter: starts with "A")
    living_area      building sqft (residential improvement)
    year_built       effective or actual year built
    appraised_val    current-year appraised value
    jurisdictions    list of taxing jurisdiction codes
    in_jv            bool, jurisdiction 061 (City of Jersey Village)
    lon, lat         parcel centroid

Schema-adaptive: we look for canonical names first, then common HCAD variants.
"""
from __future__ import annotations
import duckdb
from pathlib import Path

from pipeline import download


# Canonical -> list of (table, candidate HCAD column name) to probe.
# Year to year, HCAD shifts casing and occasionally renames. Add here if needed.
COLUMN_ALIASES: dict[str, list[tuple[str, str]]] = {
    "account":       [("real_acct", "acct"), ("real_acct", "account")],
    "site_addr":     [("real_acct", "site_addr_1"), ("real_acct", "site_addr")],
    "site_city":     [("real_acct", "site_addr_3"), ("real_acct", "site_city")],
    "site_zip":      [("real_acct", "site_zip"), ("real_acct", "zip")],
    "state_class":   [("real_acct", "state_class"), ("real_acct", "state_cd")],
    "nbhd_code":     [("real_acct", "Neighborhood_Code"), ("real_acct", "nbhd_cd"),
                      ("real_acct", "neighborhood_code")],
    "appraised_val": [("real_acct", "tot_appr_val"), ("real_acct", "total_appraised_value"),
                      ("real_acct", "appr_val")],
    "owner_name":    [("real_acct", "mailto"), ("real_acct", "owner_name"),
                      ("owners", "name")],
    "owner_mail_1":  [("real_acct", "mail_addr_1"), ("real_acct", "mail_line_1")],
    "owner_mail_2":  [("real_acct", "mail_addr_2"), ("real_acct", "mail_line_2")],
    "owner_mail_city": [("real_acct", "mail_city"), ("real_acct", "city")],
    "owner_mail_state":[("real_acct", "mail_state"), ("real_acct", "state")],
    "owner_mail_zip":  [("real_acct", "mail_zip"), ("real_acct", "zip4")],
    "living_area":   [("building_res", "im_sq_ft"), ("building_res", "bld_ar"),
                      ("building_res", "living_area")],
    "year_built":    [("building_res", "yr_impr"), ("building_res", "actual_age"),
                      ("building_res", "year_built")],
    "grade":         [("building_res", "grade_adjustment"), ("building_res", "grade"),
                      ("building_res", "class_structure")],
    "jurs_acct":     [("jurisdiction_value", "acct"), ("jurisdiction_value", "account")],
    "jurs_code":     [("jurisdiction_value", "jurs_cd"), ("jurisdiction_value", "jurs_code"),
                      ("jurisdiction_value", "jurisdiction")],
}


def _columns(con: duckdb.DuckDBPyConnection, table: str) -> set[str]:
    rows = con.execute(f"PRAGMA table_info('{table}')").fetchall()
    return {r[1].lower() for r in rows}


def _resolve(con: duckdb.DuckDBPyConnection, canonical: str) -> tuple[str, str]:
    for table, candidate in COLUMN_ALIASES[canonical]:
        try:
            cols = _columns(con, table)
        except duckdb.Error:
            continue
        if candidate.lower() in cols:
            return table, candidate
    raise KeyError(
        f"Could not resolve canonical column '{canonical}' — "
        f"none of {COLUMN_ALIASES[canonical]} exist in the loaded tables. "
        f"Add the actual HCAD column name to COLUMN_ALIASES in pipeline/load.py."
    )


def build(db_path: str = "pipeline.duckdb") -> None:
    files = download.check()
    con = duckdb.connect(db_path)
    con.execute("INSTALL spatial; LOAD spatial;")

    # Load tab-delimited tables. HCAD sometimes quotes, sometimes doesn't —
    # auto_detect is robust enough. header=true per HCAD convention.
    for name in ("real_acct", "building_res", "jurisdiction_value"):
        p = files[name]
        con.execute(
            f"CREATE OR REPLACE TABLE {name} AS "
            f"SELECT * FROM read_csv(?, delim='\\t', header=true, auto_detect=true, "
            f"ignore_errors=true, strict_mode=false)",
            [str(p)],
        )

    if "owners" in files:
        con.execute(
            "CREATE OR REPLACE TABLE owners AS "
            "SELECT * FROM read_csv(?, delim='\\t', header=true, auto_detect=true, "
            "ignore_errors=true, strict_mode=false)",
            [str(files["owners"])],
        )

    # Parcel geometry. DuckDB spatial can read shapefile via st_read.
    con.execute(
        "CREATE OR REPLACE TABLE parcel_geom AS "
        "SELECT * FROM st_read(?)",
        [str(files["parcels_shp"])],
    )

    # Build aliases map for this year's schema.
    aliases: dict[str, tuple[str, str]] = {}
    for canonical in COLUMN_ALIASES:
        aliases[canonical] = _resolve(con, canonical)

    # Centroid + lon/lat in WGS84 (HCAD ships state-plane; reproject).
    # ST_Transform signature: (geom, from_srs, to_srs). HCAD Parcels typically
    # EPSG:2278 (Texas South Central, US feet). Override if shapefile .prj says otherwise.
    con.execute("""
        CREATE OR REPLACE TABLE parcel_centroid AS
        SELECT
            CAST(HCAD_NUM AS VARCHAR) AS account,
            st_x(st_transform(st_centroid(geom), 'EPSG:2278', 'EPSG:4326')) AS lon,
            st_y(st_transform(st_centroid(geom), 'EPSG:2278', 'EPSG:4326')) AS lat
        FROM parcel_geom
        WHERE geom IS NOT NULL
    """)

    # Jersey Village taxing jurisdiction is code "061".
    acct_col = aliases["jurs_acct"][1]
    code_col = aliases["jurs_code"][1]
    con.execute(f"""
        CREATE OR REPLACE TABLE jv_accounts AS
        SELECT DISTINCT CAST({acct_col} AS VARCHAR) AS account
        FROM jurisdiction_value
        WHERE CAST({code_col} AS VARCHAR) IN ('061', '61', '0061')
    """)

    ra = aliases
    # Residential single-family = state_class beginning with 'A' (HCAD convention).
    con.execute(f"""
        CREATE OR REPLACE TABLE parcels AS
        WITH ra AS (
            SELECT
                CAST(r.{ra['account'][1]} AS VARCHAR) AS account,
                r.{ra['site_addr'][1]} AS site_addr,
                r.{ra['site_city'][1]} AS site_city,
                CAST(r.{ra['site_zip'][1]} AS VARCHAR) AS site_zip,
                r.{ra['state_class'][1]} AS state_class,
                CAST(r.{ra['nbhd_code'][1]} AS VARCHAR) AS nbhd_code,
                CAST(r.{ra['appraised_val'][1]} AS DOUBLE) AS appraised_val,
                r.{ra['owner_name'][1]} AS owner_name,
                r.{ra['owner_mail_1'][1]} AS owner_mail_1,
                r.{ra['owner_mail_2'][1]} AS owner_mail_2,
                r.{ra['owner_mail_city'][1]} AS owner_mail_city,
                r.{ra['owner_mail_state'][1]} AS owner_mail_state,
                CAST(r.{ra['owner_mail_zip'][1]} AS VARCHAR) AS owner_mail_zip
            FROM real_acct r
        ),
        br AS (
            SELECT
                CAST(b.{ra['account'][1]} AS VARCHAR) AS account,
                CAST(b.{ra['living_area'][1]} AS DOUBLE) AS living_area,
                CAST(b.{ra['year_built'][1]} AS INTEGER) AS year_built,
                CAST(b.{ra['grade'][1]} AS VARCHAR) AS grade
            FROM building_res b
            QUALIFY row_number() OVER (
                PARTITION BY b.{ra['account'][1]}
                ORDER BY CAST(b.{ra['living_area'][1]} AS DOUBLE) DESC NULLS LAST
            ) = 1
        )
        SELECT
            ra.account,
            ra.site_addr, ra.site_city, ra.site_zip,
            ra.owner_name,
            ra.owner_mail_1, ra.owner_mail_2,
            ra.owner_mail_city, ra.owner_mail_state, ra.owner_mail_zip,
            ra.state_class,
            ra.nbhd_code,
            ra.appraised_val,
            br.living_area,
            br.year_built,
            br.grade,
            pc.lon, pc.lat,
            (ra.account IN (SELECT account FROM jv_accounts)) AS in_jv
        FROM ra
        JOIN br USING (account)
        JOIN parcel_centroid pc USING (account)
        WHERE ra.state_class LIKE 'A%'
          AND ra.account IN (SELECT account FROM jv_accounts)
          AND br.living_area > 0
          AND br.year_built > 1900
    """)

    n = con.execute("SELECT count(*) FROM parcels").fetchone()[0]
    print(f"loaded {n} JV single-family parcels")
    con.close()
