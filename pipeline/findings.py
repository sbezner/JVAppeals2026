"""
For each JV single-family parcel, find the 5 best comparable homes and the
§41.43(b)(3) median per-square-foot appraised value.

Comp selection rules (in order of precedence):
    1. Same HCAD nbhd_code
    2. Same grade / class
    3. Living area within ±15% of subject
    4. Year built within ±10 years of subject
    5. Different account number (not the subject itself)
    6. Pick the 5 geographically closest (centroid-to-centroid)

We compare subjects against comps on a **$/sqft** basis, not raw appraised
value. That's what HCAD's CAMA model produces internally (base $/sqft ×
nbhd factor × grade multiplier × age depreciation × feature adders) and
it's what the Comptroller's Property Value Study and the IAAO coefficient-
of-dispersion audit apply. Raw-dollar medians are biased when the subject
is larger or smaller than the average comp in its band — a 2,008-sqft
home compared against a basket averaging 2,150 sqft looks closer to fair
than it really is, because the comps' extra square footage drags their
dollar values up. Normalizing by sqft removes that bias and gives us the
same yardstick the district uses.

Findings per parcel:
    median_comp_val   median of the 5 comps' raw appraised_val (kept for reference)
    median_comp_psf   median of the 5 comps' $/sqft
    fair_value        implied fair value = median_comp_psf × subject living_area
    over_pct          100 * (subject.appraised_val - fair_value) / fair_value
                      (equivalent to 100 * (subject_psf - median_psf) / median_psf)
    cv_pct            100 * stdev(comp_psf) / mean(comp_psf) — basket spread.
                      Lower = tighter cluster of comps = more confident median.
    color             'red'    if over_pct >  7.0
                      'yellow' if 2.0 <= over_pct <= 7.0
                      'green'  if -5.0 <= over_pct < 2.0
                      'purple' if over_pct < -5.0   (under-assessed; do not file)
                      'gray'   if no comps available

    Why the asymmetric -5/+2 green band: mild under-assessment (-5..-2)
    carries effectively no upward-adjustment risk at the ARB, so flagging it
    as "don't file" would over-warn. -5% is where the practical risk of an
    ARB-initiated upward correction begins.
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
                c.living_area    AS comp_sqft,
                c.appraised_val / NULLIF(c.living_area, 0) AS comp_psf,
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
             AND c.living_area > 0
        ),
        ranked AS (
            SELECT account, comp_account, comp_val, comp_sqft, comp_psf, dist_mi,
                   row_number() OVER (PARTITION BY account ORDER BY dist_mi) AS rank
            FROM pairs
        )
        SELECT account, comp_account, comp_val, comp_sqft, comp_psf, dist_mi, rank
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
                median(comp_psf) AS median_comp_psf,
                avg(comp_psf) AS mean_comp_psf,
                stddev_samp(comp_psf) AS stdev_comp_psf,
                list(comp_account ORDER BY rank) AS comp_accounts
            FROM finding_comps
            GROUP BY account
        ),
        derived AS (
            SELECT
                p.account,
                p.appraised_val,
                p.prior_appraised_val,
                p.homestead,
                p.living_area,
                a.median_comp_val,
                a.median_comp_psf,
                a.median_comp_psf * p.living_area AS fair_value,
                a.n_comps,
                a.comp_accounts,
                CASE
                    WHEN a.mean_comp_psf IS NULL OR a.mean_comp_psf = 0
                      OR a.stdev_comp_psf IS NULL THEN NULL
                    ELSE 100.0 * a.stdev_comp_psf / a.mean_comp_psf
                END AS cv_pct,
                CASE
                    WHEN a.median_comp_psf IS NULL OR a.median_comp_psf = 0
                      OR p.living_area IS NULL OR p.living_area = 0 THEN NULL
                    ELSE 100.0 * (p.appraised_val - a.median_comp_psf * p.living_area)
                         / (a.median_comp_psf * p.living_area)
                END AS over_pct,
                -- §23.23 homestead cap fields. Year-over-year appraisal change;
                -- cap_excess is the dollar amount over the 10% cap a residence
                -- homestead is statutorily entitled to have removed. Positive
                -- only when the parcel has a homestead AND YoY > 10%.
                CASE
                    WHEN p.prior_appraised_val IS NULL OR p.prior_appraised_val = 0
                      OR p.appraised_val IS NULL THEN NULL
                    ELSE 100.0 * (p.appraised_val - p.prior_appraised_val)
                         / p.prior_appraised_val
                END AS yoy_pct,
                CASE
                    WHEN NOT p.homestead THEN NULL
                    WHEN p.prior_appraised_val IS NULL OR p.prior_appraised_val = 0
                      OR p.appraised_val IS NULL THEN NULL
                    WHEN p.appraised_val <= p.prior_appraised_val * 1.10 THEN NULL
                    ELSE p.appraised_val - (p.prior_appraised_val * 1.10)
                END AS cap_excess_val
            FROM parcels p
            LEFT JOIN agg a USING (account)
        )
        SELECT
            account, appraised_val, prior_appraised_val, homestead, living_area,
            median_comp_val, median_comp_psf, fair_value,
            n_comps, comp_accounts, cv_pct, over_pct,
            yoy_pct, cap_excess_val,
            (cap_excess_val IS NOT NULL) AS cap_violation,
            CASE
                WHEN median_comp_val IS NULL OR median_comp_val = 0
                  OR appraised_val IS NULL THEN NULL
                ELSE 100.0 * (appraised_val - median_comp_val) / median_comp_val
            END AS raw_over_pct,
            CASE
                WHEN over_pct IS NULL THEN 'gray'
                WHEN over_pct >  7.0 THEN 'red'
                WHEN over_pct >= 2.0 THEN 'yellow'
                WHEN over_pct >= -5.0 THEN 'green'
                ELSE 'purple'
            END AS color,
            -- Same bucket thresholds applied to the raw-dollar methodology.
            -- When this differs from the primary color, the two methods
            -- disagree on the verdict — a signal worth surfacing on the
            -- map popup and in the report.
            CASE
                WHEN median_comp_val IS NULL OR median_comp_val = 0
                  OR appraised_val IS NULL THEN 'gray'
                WHEN 100.0 * (appraised_val - median_comp_val) / median_comp_val >  7.0 THEN 'red'
                WHEN 100.0 * (appraised_val - median_comp_val) / median_comp_val >= 2.0 THEN 'yellow'
                WHEN 100.0 * (appraised_val - median_comp_val) / median_comp_val >= -5.0 THEN 'green'
                ELSE 'purple'
            END AS raw_color
        FROM derived
    """)

    red, yellow, green, purple, gray = con.execute("""
        SELECT
            sum(case when color='red' then 1 else 0 end),
            sum(case when color='yellow' then 1 else 0 end),
            sum(case when color='green' then 1 else 0 end),
            sum(case when color='purple' then 1 else 0 end),
            sum(case when color='gray' then 1 else 0 end)
        FROM findings
    """).fetchone()
    print(f"findings: red={red} yellow={yellow} green={green} purple={purple} gray={gray}")

    cap_stats = con.execute("""
        SELECT
            sum(case when cap_violation then 1 else 0 end) AS cap_hits,
            sum(case when homestead then 1 else 0 end) AS homesteads
        FROM findings
    """).fetchone()
    print(f"homestead cap: {cap_stats[0]} violations across {cap_stats[1]} homesteaded parcels")
    con.close()
