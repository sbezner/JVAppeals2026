"""
Load HCAD ARB protest + hearings files into a per-parcel history table.

Inputs (optional — feature degrades gracefully when absent):
    hcad_raw/Hearings/{year}/arb_hearings_real.txt
    hcad_raw/Hearings/{year}/arb_protest_real.txt

Reads all years found on disk (typically 2023–2026), filters to JV parcels
via the existing `parcels` table, and writes a `parcel_history` table keyed
by (account, tax_year). Downstream emitters (`reports_data.py`,
`mapdata.py`) join against this to attach per-parcel `hist` data and a
sparse `h:1` flag.

Separate stage because:
1. HCAD publishes fresh 2026 hearings data weekly through the appeal
   season. Re-running `hearings` + `reports` + `mapdata` is cheap (~30s);
   re-running `load` would re-ingest the shapefile (slow, unnecessary).
2. Historical years (2023–2025) are frozen once the cycle closes. No
   pipeline change required when the 2027 zip drops — just overwrite the
   files and re-run.

The table stores one row per (account, tax_year). In the rare case where
a parcel has multiple hearings in a single year (e.g. informal then
formal), we pick the record with the latest Release_Date as authoritative
(that's the final outcome). Similarly for multiple protest filings in a
year, the first filing wins.

Schema of `parcel_history`:
    account        13-digit HCAD account, trimmed
    year           tax year (INT)
    pd             protest filing date, MM/DD/YYYY string
    by_            filer type: 'A' (Agent), 'O' (Owner), or NULL
    ad             actual hearing date, ISO string (NULL if no hearing)
    rd             release date, ISO string (NULL if no hearing)
    lt             letter type, e.g. 'TC' / 'FC' / 'EH' / 'WD'
    ht             hearing type: 'F' (Formal), 'I' (Informal)
    iv, fv         initial/final Appraised Value
    im, fm         initial/final Market Value
"""
from __future__ import annotations
import duckdb
from pathlib import Path

HEARINGS_DIR = Path("hcad_raw/Hearings")


def build(db_path: str = "pipeline.duckdb") -> None:
    if not HEARINGS_DIR.exists():
        print("hearings: hcad_raw/Hearings/ not found — skipping (feature disabled)")
        _ensure_empty_table(db_path)
        return

    hearings_files = sorted(HEARINGS_DIR.glob("*/arb_hearings_real.txt"))
    protest_files  = sorted(HEARINGS_DIR.glob("*/arb_protest_real.txt"))
    if not hearings_files and not protest_files:
        print("hearings: no arb_hearings_real.txt or arb_protest_real.txt files found — skipping")
        _ensure_empty_table(db_path)
        return

    con = duckdb.connect(db_path)

    # Bail early if load.py hasn't been run — we need the parcels table
    # for the JV filter.
    parcels_exists = con.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name='parcels'"
    ).fetchone()
    if not parcels_exists:
        con.close()
        raise RuntimeError(
            "hearings stage requires the `parcels` table — run `pipeline load` first"
        )

    if hearings_files:
        files_list = "[" + ", ".join(f"'{f}'" for f in hearings_files) + "]"
        con.execute(f"""
            CREATE OR REPLACE TABLE arb_hearings_raw AS
            SELECT * FROM read_csv({files_list},
                delim='\\t', header=true, auto_detect=true, union_by_name=true,
                ignore_errors=true, strict_mode=false)
        """)
        n_h = con.execute("SELECT count(*) FROM arb_hearings_raw").fetchone()[0]
        print(f"hearings: loaded {n_h:,} hearing rows across {len(hearings_files)} year(s)")
    else:
        # Stub so downstream SQL doesn't error.
        con.execute("""
            CREATE OR REPLACE TABLE arb_hearings_raw (
                acct VARCHAR, Tax_Year INTEGER,
                Actual_Hearing_Date VARCHAR, Release_Date VARCHAR,
                Letter_Type VARCHAR, Hearing_Type VARCHAR, Agent_Code VARCHAR,
                Initial_Appraised_Value VARCHAR, Final_Appraised_Value VARCHAR,
                Initial_Market_Value VARCHAR, Final_Market_Value VARCHAR
            )
        """)

    if protest_files:
        files_list = "[" + ", ".join(f"'{f}'" for f in protest_files) + "]"
        con.execute(f"""
            CREATE OR REPLACE TABLE arb_protest_raw AS
            SELECT * FROM read_csv({files_list},
                delim='\\t', header=true, auto_detect=true,
                ignore_errors=true, strict_mode=false)
        """)
        n_p = con.execute("SELECT count(*) FROM arb_protest_raw").fetchone()[0]
        print(f"hearings: loaded {n_p:,} protest rows across {len(protest_files)} year(s)")
    else:
        con.execute("""
            CREATE OR REPLACE TABLE arb_protest_raw (
                acct VARCHAR, protested_by VARCHAR, protested_dt VARCHAR
            )
        """)

    # Build the per-(account, year) table. Pick the latest Release_Date
    # when multiple hearings exist (that's the final outcome), and the
    # earliest protest date per year.
    con.execute("""
        CREATE OR REPLACE TABLE parcel_history AS
        WITH jv_hearings AS (
            SELECT TRIM(CAST(acct AS VARCHAR)) AS account,
                   CAST(Tax_Year AS INTEGER) AS year,
                   CAST(Actual_Hearing_Date AS VARCHAR) AS ad,
                   CAST(Release_Date        AS VARCHAR) AS rd,
                   NULLIF(TRIM(Letter_Type),  '') AS lt,
                   NULLIF(TRIM(Hearing_Type), '') AS ht,
                   CASE WHEN TRIM(Agent_Code) = 'Agent' THEN 'A'
                        WHEN TRIM(Agent_Code) = 'Owner' THEN 'O'
                        ELSE NULL END AS by_,
                   TRY_CAST(Initial_Appraised_Value AS INTEGER) AS iv,
                   TRY_CAST(Final_Appraised_Value   AS INTEGER) AS fv,
                   TRY_CAST(Initial_Market_Value    AS INTEGER) AS im,
                   TRY_CAST(Final_Market_Value      AS INTEGER) AS fm,
                   row_number() OVER (
                       PARTITION BY TRIM(CAST(acct AS VARCHAR)), CAST(Tax_Year AS INTEGER)
                       ORDER BY TRY_CAST(Release_Date AS DATE) DESC NULLS LAST
                   ) AS rank
            FROM arb_hearings_raw
            WHERE Tax_Year IS NOT NULL
              AND CAST(Tax_Year AS INTEGER) >= 2023
              AND TRIM(CAST(acct AS VARCHAR)) IN (SELECT account FROM parcels)
        ),
        jv_protests AS (
            SELECT TRIM(CAST(acct AS VARCHAR)) AS account,
                   TRY_CAST(extract(year FROM TRY_STRPTIME(protested_dt, '%m/%d/%Y')) AS INTEGER) AS year,
                   NULLIF(TRIM(protested_dt), '') AS pd,
                   CASE WHEN TRIM(protested_by) = 'Agent' THEN 'A'
                        WHEN TRIM(protested_by) = 'Owner' THEN 'O'
                        ELSE NULL END AS by_,
                   row_number() OVER (
                       PARTITION BY TRIM(CAST(acct AS VARCHAR)),
                                    TRY_CAST(extract(year FROM TRY_STRPTIME(protested_dt, '%m/%d/%Y')) AS INTEGER)
                       ORDER BY TRY_STRPTIME(protested_dt, '%m/%d/%Y')
                   ) AS rank
            FROM arb_protest_raw
            WHERE TRIM(CAST(acct AS VARCHAR)) IN (SELECT account FROM parcels)
        ),
        h_dedup AS (SELECT * FROM jv_hearings WHERE rank = 1),
        p_dedup AS (SELECT * FROM jv_protests WHERE rank = 1 AND year IS NOT NULL AND year >= 2023),
        keys AS (
            SELECT account, year FROM h_dedup
            UNION
            SELECT account, year FROM p_dedup
        )
        SELECT k.account, k.year,
               p.pd,
               COALESCE(p.by_, h.by_) AS by_,
               h.ad, h.rd, h.lt, h.ht,
               h.iv, h.fv, h.im, h.fm
        FROM keys k
        LEFT JOIN p_dedup p USING (account, year)
        LEFT JOIN h_dedup h USING (account, year)
    """)

    n_rows = con.execute("SELECT count(*) FROM parcel_history").fetchone()[0]
    n_acct = con.execute("SELECT count(DISTINCT account) FROM parcel_history").fetchone()[0]
    years = con.execute("SELECT DISTINCT year FROM parcel_history ORDER BY year").fetchall()
    years_s = ", ".join(str(y[0]) for y in years) if years else "(none)"
    print(f"hearings: parcel_history has {n_rows:,} rows across {n_acct:,} JV parcels (years {years_s})")
    con.close()


def _ensure_empty_table(db_path: str) -> None:
    """Create an empty parcel_history so downstream emitters can LEFT JOIN
    unconditionally without table-exists checks."""
    con = duckdb.connect(db_path)
    con.execute("""
        CREATE TABLE IF NOT EXISTS parcel_history (
            account VARCHAR, year INTEGER,
            pd VARCHAR, by_ VARCHAR,
            ad VARCHAR, rd VARCHAR, lt VARCHAR, ht VARCHAR,
            iv INTEGER, fv INTEGER, im INTEGER, fm INTEGER
        )
    """)
    con.close()
