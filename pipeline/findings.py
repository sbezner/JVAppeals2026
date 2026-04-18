"""
For each JV single-family parcel, find the 5 best comparable homes and the
§41.43(b)(3) median appraised value.

Comp selection rules (in order of precedence):
    1. Same HCAD nbhd_code
    2. Same grade / class
    3. Living area within ±15% of subject
    4. Year built within ±10 years of subject
    5. Different account number (not the subject itself)
    6. Pick the 5 geographically closest (centroid-to-centroid)

Findings per parcel:
    median_comp_val   median of the 5 comps' appraised_val
    over_pct          100 * (subject.appraised_val - median_comp_val) / median_comp_val
    color             'red'    if over_pct >  7.0
                      'yellow' if 2.0 <= over_pct <= 7.0
                      'green'  if over_pct <  2.0
    comp_accounts     list of 5 comp account numbers (for the PDF comp table)

Output tables:
    findings            one row per subject parcel
    finding_comps       five rows per subject (account, comp_account, rank)
"""
from __future__ import annotations
import duckdb


def compute(db_path: str = "pipeline.duckdb") -> None:
    con = duckdb.connect(db_path)
    con.execute("INSTALL spatial; LOAD spatial;")

    # Candidate comps per subject: nbhd + grade + sqft band + age band, not self.
    # Then rank by great-circle distance on centroids and take top 5.
    # Haversine in SQL to avoid recomputing a geometry column per subject.
    con.execute("""
        CREATE OR REPLACE TABLE finding_comps AS
        WITH subj AS (
            SELECT account, nbhd_code, grade, living_area, year_built, lon, lat
            FROM parcels
        ),
        pairs AS (
            SELECT
                s.account        AS account,
                c.account        AS comp_account,
                c.appraised_val  AS comp_val,
                -- Haversine, miles
                2 * 3958.8 * asin(sqrt(
                    power(sin(radians((c.lat - s.lat) / 2)), 2)
                    + cos(radians(s.lat)) * cos(radians(c.lat))
                      * power(sin(radians((c.lon - s.lon) / 2)), 2)
                )) AS dist_mi
            FROM subj s
            JOIN parcels c
              ON c.account <> s.account
             AND c.nbhd_code = s.nbhd_code
             AND c.grade = s.grade
             AND c.living_area BETWEEN s.living_area * 0.85 AND s.living_area * 1.15
             AND c.year_built BETWEEN s.year_built - 10 AND s.year_built + 10
             AND c.appraised_val > 0
        ),
        ranked AS (
            SELECT account, comp_account, comp_val, dist_mi,
                   row_number() OVER (PARTITION BY account ORDER BY dist_mi) AS rank
            FROM pairs
        )
        SELECT account, comp_account, comp_val, dist_mi, rank
        FROM ranked
        WHERE rank <= 5
    """)

    con.execute("""
        CREATE OR REPLACE TABLE findings AS
        WITH agg AS (
            SELECT
                account,
                count(*) AS n_comps,
                median(comp_val) AS median_comp_val,
                list(comp_account ORDER BY rank) AS comp_accounts
            FROM finding_comps
            GROUP BY account
        )
        SELECT
            p.account,
            p.appraised_val,
            a.median_comp_val,
            a.n_comps,
            a.comp_accounts,
            CASE
                WHEN a.median_comp_val IS NULL OR a.median_comp_val = 0 THEN NULL
                ELSE 100.0 * (p.appraised_val - a.median_comp_val) / a.median_comp_val
            END AS over_pct,
            CASE
                WHEN a.median_comp_val IS NULL OR a.median_comp_val = 0 THEN 'gray'
                WHEN 100.0 * (p.appraised_val - a.median_comp_val) / a.median_comp_val > 7.0 THEN 'red'
                WHEN 100.0 * (p.appraised_val - a.median_comp_val) / a.median_comp_val >= 2.0 THEN 'yellow'
                ELSE 'green'
            END AS color
        FROM parcels p
        LEFT JOIN agg a USING (account)
    """)

    red, yellow, green, gray = con.execute("""
        SELECT
            sum(case when color='red' then 1 else 0 end),
            sum(case when color='yellow' then 1 else 0 end),
            sum(case when color='green' then 1 else 0 end),
            sum(case when color='gray' then 1 else 0 end)
        FROM findings
    """).fetchone()
    print(f"findings: red={red} yellow={yellow} green={green} gray={gray}")
    con.close()
