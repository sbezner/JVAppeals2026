"""
Render per-parcel PDF appeal reports with ReportLab.

Two pages:

    Page 1 — THE EVIDENCE
        Title + bottom-line sentence
        Subject Property table
        The Legal Argument (§41.43(b)(3))
        Comparable Properties table
        The Target (median + over-assessment callout)

    Page 2 — HOW TO USE THIS REPORT
        Deadline banner
        Step 1 — File the Protest (iFile / owners.hcad.org)
        Step 2 — Understand the iSettle Offer
        Step 3 — Your Hearing Script (parcel-specific)
        If the Appraiser Pushes Back (3 scripted rebuttals)
        What NOT to Argue
        If You Want to Escalate — §42.26(a)(3)

The output is deterministic — every paragraph is either a static block or
string-formatted from the parcel's numbers. No AI call, no prose cache.
"""
from __future__ import annotations
import duckdb
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

REPORTS_DIR = Path("reports")
FOOTER = "Built by a neighbor."


# ---------- Static blocks (identical across every parcel) ----------

LEGAL_ARGUMENT = (
    "This protest is filed under <b>Texas Tax Code §41.43(b)(3)</b>, the "
    "unequal-appraisal ground. Under this section, the appraisal district "
    "must prove that your appraised value is at or below the median "
    "appraised value of a reasonable number of appropriately-adjusted "
    "comparable properties. The five comps below share your HCAD "
    "neighborhood code and grade, fall within \u00b115% of your living "
    "area, and within 10 years of your year built — the standard filters "
    "for a §41.43(b)(3) showing."
)

DEADLINE_TEXT = (
    "<b>File by May 15, 2026</b>, or within 30 days of your Notice of "
    "Appraised Value — whichever is later. Missing this deadline waives "
    "your right to appeal for the 2026 tax year."
)

STEP1_TEXT = (
    "Log in to <b>owners.hcad.org</b> using your iFile number (it's on "
    "the Notice of Appraised Value HCAD mailed you). When choosing your "
    'grounds for protest, select <b>"Value is unequal compared with '
    'other properties."</b> You can attach this report as supporting '
    "evidence, but do not rely on HCAD reading it in detail — they won't."
)

STEP2_TEXT = (
    "After filing, HCAD will likely respond with an <b>iSettle offer</b> "
    "— a small reduction, often in the $2,000–$10,000 range. This offer "
    "is <b>not a ceiling</b>. If the reduction is smaller than the gap "
    "shown on Page 1, reject it and request a formal <b>Appraisal "
    "Review Board (ARB) hearing</b>, where you'll present this report "
    "in person (or by video). Most of the value in filing comes at the "
    "ARB, not from the iSettle offer."
)

REBUTTAL_INTRO = (
    "The district's appraiser may try one of these pushbacks. Have the "
    "scripted response ready:"
)

REBUTTALS = [
    (
        '"Those comps aren\'t appropriate."',
        "They share my neighborhood code, grade, sqft band, and age band — "
        "the same filters HCAD uses internally. They meet the "
        "reasonable-number-of-appropriately-adjusted test.",
    ),
    (
        '"Your home has features those don\'t."',
        "§41.43(b)(3) requires appropriately-adjusted comps, not identical "
        "ones. HCAD's own appraisals of these homes already reflect the "
        "adjustments the district made for their features.",
    ),
    (
        '"Market value supports our number."',
        "§41.43(b)(3) is an unequal-appraisal claim, not a market-value "
        "claim. The median of comparable appraisals is the standard this "
        "panel is asked to apply.",
    ),
]

NOT_TO_ARGUE = (
    "Stay off these — they muddy the claim and hurt credibility:<br/>"
    "&bull; <b>Market value or recent sale prices.</b> Different statute, "
    "different argument. Save for §42.26(a)(3) judicial review.<br/>"
    "&bull; <b>\u201cMy taxes went up too much.\u201d</b> Irrelevant — the "
    "ARB panel sets the appraised value, not the tax rate.<br/>"
    "&bull; <b>Repair costs or damage.</b> That is a condition argument "
    "under §41.44, not an unequal-appraisal argument under §41.43(b)(3).<br/>"
    "&bull; <b>What your neighbor paid when they bought.</b> Panels "
    "distrust anecdotes; stick to the comp table."
)

GROUNDS_4226 = (
    "If the ARB denies your protest, you have 60 days to file for "
    "judicial review in district court under <b>Texas Tax Code "
    "§42.26(a)(3)</b>. That statute prohibits the district from "
    "presenting — and the court from considering — market-value evidence "
    "as a response to your median-of-comps showing. It is a stronger "
    "procedural posture than the ARB, but requires a lawyer and filing "
    "fee. Mention it at the ARB hearing to signal that you understand "
    "the full legal ladder."
)

TOP_DISCLAIMER = (
    "<b>NOT LEGAL ADVICE:</b> This report is provided for informational "
    "and self-help purposes by a neighbor. It is not a substitute for the "
    "advice of a licensed attorney or a registered property tax consultant."
)

DISCLAIMER_TERMS = (
    "&bull; <b>Not an Agent.</b> The author of this report is not your "
    "authorized representative and is not filing this protest on your "
    "behalf. You are responsible for all filings.<br/>"
    "&bull; <b>No Guarantee.</b> This data is provided as-is based on "
    "public records. The author makes no claim as to the absolute "
    "accuracy of this information or the outcome of any appeal.<br/>"
    "&bull; <b>Deadlines.</b> You are solely responsible for meeting the "
    "HCAD filing deadline (typically May 15, 2026).<br/>"
    "&bull; <b>Risk of Increase.</b> The Appraisal Review Board (ARB) has "
    "the authority to adjust property values upward, downward, or keep "
    "them unchanged.<br/>"
    "&bull; <b>Non-Commercial.</b> This report is provided free of charge "
    "as a community resource and may not be sold or used for commercial "
    "purposes."
)


# ---------- Parcel-specific text (pure string formatting) ----------

def bottom_line(subject: dict) -> str:
    appr = float(subject["appraised_val"])
    med = float(subject["median_comp_val"])
    pct = float(subject["over_pct"])
    color = subject.get("color") or "gray"
    if color == "red":
        verdict = (
            "You have statutory grounds to appeal under §41.43(b)(3)."
        )
    elif color == "yellow":
        verdict = (
            "The appeal case is thin but presentable under §41.43(b)(3)."
        )
    elif color == "green":
        verdict = (
            "This is within the normal noise of comp selection; filing "
            "is unlikely to change the value."
        )
    else:
        verdict = (
            "No unequal-appraisal case is available — review by hand if "
            "it matters to you."
        )
    direction = "above" if pct > 0 else "below"
    return (
        f"HCAD's 2026 appraisal of <b>${appr:,.0f}</b> is "
        f"<b>{abs(pct):.1f}% {direction}</b> the median of 5 comparable "
        f"homes (<b>${med:,.0f}</b>). {verdict}"
    )


def hearing_script(subject: dict) -> str:
    med = float(subject["median_comp_val"])
    appr = float(subject["appraised_val"])
    pct = float(subject["over_pct"])
    sqft = int(subject["living_area"])
    year = int(subject["year_built"])
    grade = (subject.get("grade") or "").strip() or "unclassified"
    nbhd = (subject.get("nbhd_code") or "").strip() or "unknown"
    direction = "below" if pct > 0 else "above"
    point1 = (
        f'1. <b>"Here is the median of 5 comparable properties — '
        f'${med:,.0f} — which is {abs(pct):.1f}% {direction} HCAD\'s '
        f'appraisal of my home at ${appr:,.0f}."</b>'
    )
    point2 = (
        f'2. <b>"These 5 comps share my neighborhood code ({nbhd}), '
        f"my HCAD grade ({grade}), fall within \u00b115% of my {sqft:,} "
        f"sqft, and within 10 years of my {year} build. HCAD appraised "
        f'these homes themselves, so the district has already verified '
        f'these values as fair."</b>'
    )
    return (
        "Keep this report as your personal script for the hearing. The "
        "core of your claim is two points:<br/><br/>"
        f"{point1}<br/><br/>"
        f"{point2}<br/><br/>"
        "Stay focused on the median-of-comps gap. That is the only "
        "argument §41.43(b)(3) lets you win on — don't wander into "
        "market value, tax rates, or condition."
    )


# ---------- Styles ----------

def _styles() -> dict[str, ParagraphStyle]:
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title", parent=ss["Heading1"], fontName="Helvetica-Bold",
            fontSize=16, leading=20, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=ss["Normal"], fontName="Helvetica",
            fontSize=10, textColor=colors.grey, spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
            fontSize=12, leading=15, spaceBefore=12, spaceAfter=4,
        ),
        "h3": ParagraphStyle(
            "h3", parent=ss["Heading3"], fontName="Helvetica-Bold",
            fontSize=11, leading=14, spaceBefore=10, spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "body", parent=ss["BodyText"], fontName="Helvetica",
            fontSize=10.5, leading=14, spaceAfter=8,
        ),
        "bottomline": ParagraphStyle(
            "bottomline", parent=ss["BodyText"], fontName="Helvetica",
            fontSize=11.5, leading=15, spaceAfter=12,
            leftIndent=8, rightIndent=8,
            borderPadding=10, borderWidth=0,
            backColor=colors.HexColor("#F4F7FB"),
        ),
        "deadline": ParagraphStyle(
            "deadline", parent=ss["BodyText"], fontName="Helvetica",
            fontSize=11, leading=15, spaceAfter=10,
            leftIndent=8, rightIndent=8,
            borderPadding=10, borderWidth=1,
            borderColor=colors.HexColor("#E6B422"),
            backColor=colors.HexColor("#FFF8E1"),
        ),
        "small": ParagraphStyle(
            "small", parent=ss["Normal"], fontName="Helvetica",
            fontSize=8.5, leading=11, textColor=colors.grey,
        ),
        "disclaimer_top": ParagraphStyle(
            "disclaimer_top", parent=ss["Normal"], fontName="Helvetica-Oblique",
            fontSize=8.5, leading=11, textColor=colors.HexColor("#5a6067"),
            spaceAfter=6,
        ),
    }


# ---------- Tables ----------

def _facts_table(subject: dict) -> Table:
    addr = subject["site_addr"] or ""
    zip_ = subject.get("site_zip") or ""
    full_addr = f"{addr}, Jersey Village, TX {zip_}".strip(", ")
    data = [
        ["HCAD Account", subject["account"]],
        ["Site Address", full_addr],
        ["Living Area", f"{int(subject['living_area']):,} sqft"],
        ["Year Built", str(subject["year_built"])],
        ["Grade / Class", subject["grade"] or ""],
        ["Neighborhood Code", subject["nbhd_code"] or ""],
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


def _comps_table(subject: dict, comps: list[dict]) -> Table:
    # Wrap every cell in a Paragraph so ReportLab word-wraps inside the
    # cell width. Plain strings in Table cells render as a single line
    # and silently overflow into neighboring columns when they don't fit
    # — that's what caused the earlier visual merge between the Living
    # Area and Year columns. Paragraph alignment lives in the style.
    ss = getSampleStyleSheet()
    cl = ParagraphStyle(
        "comp_cl", parent=ss["BodyText"],
        fontName="Helvetica", fontSize=9.5, leading=12, alignment=TA_LEFT,
    )
    cr = ParagraphStyle(
        "comp_cr", parent=ss["BodyText"],
        fontName="Helvetica", fontSize=9.5, leading=12, alignment=TA_RIGHT,
    )
    # Use inline <b> tags for bold so we don't need four style variants.
    def L(text: str, bold: bool = False) -> Paragraph:
        return Paragraph(f"<b>{text}</b>" if bold else text, cl)
    def R(text: str, bold: bool = False) -> Paragraph:
        return Paragraph(f"<b>{text}</b>" if bold else text, cr)

    grade_subj = (subject.get("grade") or "").strip()
    rows = [[
        L("#", bold=True),
        L("HCAD Account", bold=True),
        R("Living Area (sqft)", bold=True),
        R("Year", bold=True),
        L("Grade", bold=True),
        R("Appraised Value", bold=True),
    ]]
    rows.append([
        L("Subject", bold=True),
        L(subject["account"], bold=True),
        R(f"{int(subject['living_area']):,}", bold=True),
        R(str(subject["year_built"]), bold=True),
        L(grade_subj, bold=True),
        R(f"${subject['appraised_val']:,.0f}", bold=True),
    ])
    for i, c in enumerate(comps, start=1):
        rows.append([
            L(str(i)),
            L(c["account"]),
            R(f"{int(c['living_area']):,}"),
            R(str(c["year_built"])),
            L((c["grade"] or "").strip()),
            R(f"${c['appraised_val']:,.0f}"),
        ])

    # Target summary rows — folded into the comp table so the conclusion
    # (median / appraisal / gap) sits directly under the evidence. Columns
    # 0–4 are SPAN-merged into one right-aligned label cell; column 5
    # holds the value.
    med = float(subject["median_comp_val"])
    appr = float(subject["appraised_val"])
    pct = float(subject["over_pct"])
    gap = appr - med
    gap_label = "Over-assessment" if pct > 0 else "Under-assessment"
    gap_color = "#C03030" if pct > 0 else "#2f9e44"
    rows.append([R("Median of 5 comps", bold=True), "", "", "", "", R(f"${med:,.0f}", bold=True)])
    rows.append([R("HCAD 2026 appraisal", bold=True), "", "", "", "", R(f"${appr:,.0f}", bold=True)])
    rows.append([
        R(f'<font color="{gap_color}">{gap_label}</font>', bold=True),
        "", "", "", "",
        R(f'<font color="{gap_color}">${abs(gap):,.0f}  ({pct:+.1f}%)</font>', bold=True),
    ])

    t = Table(rows, colWidths=[0.5*inch, 1.5*inch, 1.1*inch, 0.6*inch, 0.9*inch, 1.4*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEEEE")),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#FFF7E6")),
        ("BACKGROUND", (0, -3), (-1, -1), colors.HexColor("#F4F7FB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEABOVE", (0, -3), (-1, -3), 0.5, colors.black),
        ("SPAN", (0, -3), (4, -3)),
        ("SPAN", (0, -2), (4, -2)),
        ("SPAN", (0, -1), (4, -1)),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def _rebuttals_table() -> Table:
    # Wrap every cell in a Paragraph so ReportLab word-wraps inside the
    # cell width. Plain strings in Table cells render as single lines and
    # silently overflow into neighboring columns when they don't fit.
    ss = getSampleStyleSheet()
    q_style = ParagraphStyle(
        "rebuttal_q", parent=ss["BodyText"],
        fontName="Helvetica-Oblique", fontSize=10, leading=13,
    )
    a_style = ParagraphStyle(
        "rebuttal_a", parent=ss["BodyText"],
        fontName="Helvetica", fontSize=10, leading=13,
    )
    header_style = ParagraphStyle(
        "rebuttal_h", parent=ss["BodyText"],
        fontName="Helvetica-Bold", fontSize=10, leading=13,
    )
    rows = [[
        Paragraph("The appraiser may say\u2026", header_style),
        Paragraph("Your response", header_style),
    ]]
    for q, a in REBUTTALS:
        rows.append([Paragraph(q, q_style), Paragraph(a, a_style)])
    t = Table(rows, colWidths=[2.2 * inch, 3.8 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEEEE")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, colors.lightgrey),
    ]))
    return t


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(colors.grey)
    canvas.drawString(0.75 * inch, 0.5 * inch, FOOTER)
    canvas.drawRightString(8.25 * inch, 0.5 * inch, f"Page {doc.page}")
    canvas.restoreState()


# ---------- Main render ----------

def render_one(subject: dict, comps: list[dict], out_path: Path) -> None:
    s = _styles()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(out_path), pagesize=LETTER,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        title=f"2026 HCAD Appeal — {subject['site_addr']}",
    )
    addr = subject["site_addr"] or ""
    story = [
        # ====== PAGE 1 — THE EVIDENCE ======
        Paragraph(TOP_DISCLAIMER, s["disclaimer_top"]),
        Paragraph(f"2026 HCAD Appeal Report", s["title"]),
        Paragraph(f"{addr}, Jersey Village, TX", s["subtitle"]),

        Paragraph(bottom_line(subject), s["bottomline"]),

        Paragraph("Subject Property", s["h2"]),
        _facts_table(subject),

        Paragraph("The Legal Argument", s["h2"]),
        Paragraph(LEGAL_ARGUMENT, s["body"]),

        Paragraph("Comparable Properties", s["h2"]),
        _comps_table(subject, comps),

        # ====== PAGE 2 — HOW TO USE THIS REPORT ======
        PageBreak(),
        Paragraph("How to Use This Report", s["title"]),
        Paragraph(f"{addr}, Jersey Village, TX — HCAD {subject['account']}", s["subtitle"]),

        Paragraph(DEADLINE_TEXT, s["deadline"]),

        Paragraph("Step 1 — File the Protest", s["h3"]),
        Paragraph(STEP1_TEXT, s["body"]),

        Paragraph("Step 2 — Understand the iSettle Offer", s["h3"]),
        Paragraph(STEP2_TEXT, s["body"]),

        Paragraph("Step 3 — Your Hearing Script", s["h3"]),
        Paragraph(hearing_script(subject), s["body"]),

        Paragraph("If the Appraiser Pushes Back", s["h3"]),
        Paragraph(REBUTTAL_INTRO, s["body"]),
        _rebuttals_table(),
        Spacer(1, 8),

        Paragraph("What NOT to Argue", s["h3"]),
        Paragraph(NOT_TO_ARGUE, s["body"]),

        Paragraph("If You Want to Escalate — §42.26(a)(3)", s["h3"]),
        Paragraph(GROUNDS_4226, s["body"]),

        Paragraph("Disclaimer &amp; Terms of Use", s["h3"]),
        Paragraph(DISCLAIMER_TERMS, s["body"]),
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
            p.living_area, p.year_built, p.grade, p.nbhd_code,
            p.appraised_val,
            f.median_comp_val, f.over_pct, f.color
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
        render_one(subj, comps, out)
        n_ok += 1

    con.close()
    print(f"rendered {n_ok} PDFs, skipped {n_skip}")
