"""
Render per-parcel PDF appeal reports with ReportLab.

Layout:
    1. Title block: "2026 HCAD Appeal Report — {site_addr}, Jersey Village, TX"
    2. Owner + HCAD account block
    3. Executive summary (Claude prose)
    4. Subject property facts (sqft, year, grade, nbhd, appraised value)
    5. §41.43(b)(3) grounds statement + median-of-comps table (subject + 5 comps)
    6. Standout finding (Claude prose)
    7. §42.26 fallback language
    8. Reconciliation (Claude prose)
    9. Footer: "Built by a neighbor."
"""
from __future__ import annotations
import duckdb
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

REPORTS_DIR = Path("reports")
CACHE_DIR = Path("cache/prose")

GROUNDS_4143 = (
    "This protest is filed under <b>Texas Tax Code §41.43(b)(3)</b>. "
    "Under that section, a protest on the ground of unequal appraisal must be "
    "determined in favor of the protesting party unless the appraisal district "
    "establishes that the subject property's appraised value is equal to or less "
    "than the median appraised value of a reasonable number of comparable "
    "properties, appropriately adjusted. The five comparables below share the "
    "subject's HCAD neighborhood code and grade/class, fall within ±15% of its "
    "living area and ±10 years of its age, and are the geographically closest "
    "matches meeting those filters."
)
GROUNDS_4226 = (
    "If this protest is not resolved at the Appraisal Review Board, the owner "
    "reserves the right to pursue judicial review under <b>Texas Tax Code "
    "§42.26(a)(3)</b>. In that venue, the district is statutorily prohibited "
    "from presenting, and the court from considering, evidence of the subject "
    "property's market value as a response to the median-of-comparables showing."
)
FOOTER = "Built by a neighbor."


def _styles() -> dict[str, ParagraphStyle]:
    ss = getSampleStyleSheet()
    out = {
        "title": ParagraphStyle(
            "title", parent=ss["Heading1"], fontName="Helvetica-Bold",
            fontSize=16, leading=20, spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=ss["Normal"], fontName="Helvetica",
            fontSize=10, textColor=colors.grey, spaceAfter=14,
        ),
        "h2": ParagraphStyle(
            "h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
            fontSize=12, leading=15, spaceBefore=10, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body", parent=ss["BodyText"], fontName="Helvetica",
            fontSize=10.5, leading=14, spaceAfter=8,
        ),
        "small": ParagraphStyle(
            "small", parent=ss["Normal"], fontName="Helvetica",
            fontSize=8.5, leading=11, textColor=colors.grey,
        ),
    }
    return out


def _facts_table(subject: dict) -> Table:
    data = [
        ["HCAD Account", subject["account"]],
        ["Owner", subject["owner_name"] or ""],
        ["Site Address", f"{subject['site_addr']}, Jersey Village, TX {subject.get('site_zip') or ''}".strip(", ")],
        ["Living Area", f"{int(subject['living_area']):,} sqft"],
        ["Year Built", str(subject["year_built"])],
        ["Grade / Class", subject["grade"]],
        ["Neighborhood Code", subject["nbhd_code"]],
        ["2026 Appraised Value", f"${subject['appraised_val']:,.0f}"],
    ]
    t = Table(data, colWidths=[1.8 * inch, 4.2 * inch])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.lightgrey),
    ]))
    return t


def _comps_table(subject: dict, comps: list[dict], median_val: float, over_pct: float) -> Table:
    header = ["#", "HCAD Account", "Living Area", "Year", "Grade", "Appraised Value"]
    rows = [header]
    rows.append([
        "Subject", subject["account"], f"{int(subject['living_area']):,} sqft",
        str(subject["year_built"]), subject["grade"],
        f"${subject['appraised_val']:,.0f}",
    ])
    for i, c in enumerate(comps, start=1):
        rows.append([
            str(i), c["account"], f"{int(c['living_area']):,} sqft",
            str(c["year_built"]), c["grade"],
            f"${c['appraised_val']:,.0f}",
        ])
    rows.append(["", "", "", "", "Median of comps", f"${median_val:,.0f}"])
    rows.append(["", "", "", "", "Over-assessment", f"{over_pct:+.1f}%"])
    t = Table(rows, colWidths=[0.5*inch, 1.5*inch, 1.1*inch, 0.6*inch, 0.9*inch, 1.4*inch])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9.5),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEEEE")),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#FFF7E6")),
        ("FONT", (0, 1), (-1, 1), "Helvetica-Bold", 9.5),
        ("FONT", (4, -2), (-1, -1), "Helvetica-Bold", 9.5),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEABOVE", (0, -2), (-1, -2), 0.5, colors.black),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(colors.grey)
    canvas.drawString(0.75 * inch, 0.5 * inch, FOOTER)
    canvas.drawRightString(8.25 * inch, 0.5 * inch, f"Page {doc.page}")
    canvas.restoreState()


def render_one(subject: dict, comps: list[dict], prose: dict, out_path: Path) -> None:
    s = _styles()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(out_path), pagesize=LETTER,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        title=f"2026 HCAD Appeal — {subject['site_addr']}",
    )
    mailing = ", ".join(
        x for x in [
            subject.get("owner_mail_1"), subject.get("owner_mail_2"),
            subject.get("owner_mail_city"),
            " ".join(filter(None, [subject.get("owner_mail_state"), subject.get("owner_mail_zip")])),
        ] if x
    )
    story = [
        Paragraph(f"2026 HCAD Appeal Report", s["title"]),
        Paragraph(f"{subject['site_addr']}, Jersey Village, TX", s["subtitle"]),

        Paragraph("Executive Summary", s["h2"]),
        Paragraph(prose["executive_summary"], s["body"]),

        Paragraph("Property & Owner", s["h2"]),
        _facts_table(subject),
        Spacer(1, 4),
        Paragraph(f"<b>Owner mailing address:</b> {mailing}" if mailing else "", s["body"]),

        Paragraph("Grounds for Protest — §41.43(b)(3)", s["h2"]),
        Paragraph(GROUNDS_4143, s["body"]),

        Paragraph("Comparable Properties", s["h2"]),
        _comps_table(subject, comps,
                     median_val=subject["median_comp_val"],
                     over_pct=subject["over_pct"]),
        Spacer(1, 8),

        Paragraph("Standout Finding", s["h2"]),
        Paragraph(prose["standout_finding"], s["body"]),

        Paragraph("Judicial Review Reserved — §42.26(a)(3)", s["h2"]),
        Paragraph(GROUNDS_4226, s["body"]),

        Paragraph("Reconciliation", s["h2"]),
        Paragraph(prose["reconciliation"], s["body"]),
    ]
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)


def render(db_path: str = "pipeline.duckdb", only_accounts: list[str] | None = None) -> None:
    REPORTS_DIR.mkdir(exist_ok=True)
    con = duckdb.connect(db_path)

    where = ""
    params: list = []
    if only_accounts:
        placeholders = ",".join("?" * len(only_accounts))
        where = f"WHERE p.account IN ({placeholders})"
        params = list(only_accounts)

    subjects = con.execute(f"""
        SELECT
            p.account, p.site_addr, p.site_zip,
            p.owner_name, p.owner_mail_1, p.owner_mail_2,
            p.owner_mail_city, p.owner_mail_state, p.owner_mail_zip,
            p.living_area, p.year_built, p.grade, p.nbhd_code,
            p.appraised_val,
            f.median_comp_val, f.over_pct, f.color, f.comp_accounts
        FROM parcels p
        JOIN findings f USING (account)
        {where}
        ORDER BY p.account
    """, params).fetchall()
    scols = [d[0] for d in con.description]

    n_ok = n_skip = 0
    for row in subjects:
        subj = dict(zip(scols, row))
        if subj["median_comp_val"] is None:
            n_skip += 1
            continue
        cache = CACHE_DIR / f"{subj['account']}.json"
        if not cache.exists():
            n_skip += 1
            continue
        prose = json.loads(cache.read_text())

        comp_rows = con.execute("""
            SELECT p.account, p.living_area, p.year_built, p.grade, p.appraised_val
            FROM parcels p
            JOIN finding_comps fc ON fc.comp_account = p.account
            WHERE fc.account = ?
            ORDER BY fc.rank
        """, [subj["account"]]).fetchall()
        ccols = [d[0] for d in con.description]
        comps = [dict(zip(ccols, r)) for r in comp_rows]

        out = REPORTS_DIR / f"{subj['account']}.pdf"
        render_one(subj, comps, prose, out)
        n_ok += 1

    con.close()
    print(f"rendered {n_ok} PDFs, skipped {n_skip}")
