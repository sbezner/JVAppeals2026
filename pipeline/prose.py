"""
Generate three prose blocks per parcel via the Claude Code CLI in headless mode:

    claude -p "<prompt>" --output-format json

Uses your existing Claude Code subscription auth (no API key). Rate-limited to
about 50 calls per hour by a fixed 72-second sleep between calls. Each result
is cached as cache/prose/{account}.json so restarts skip completed parcels.
"""
from __future__ import annotations
import duckdb
import json
import subprocess
import sys
import time
from pathlib import Path

CACHE_DIR = Path("cache/prose")
SLEEP_SECONDS = 72          # ~50 calls/hour
TIMEOUT_SECONDS = 180       # per-call headless timeout

SYSTEM_TONE = (
    "You are writing short prose blocks for a Texas property tax appeal report "
    "under Tax Code §41.43(b)(3) for a Jersey Village, TX homeowner. Tone: "
    "friendly, professional, and plain-spoken — written by a helpful neighbor, "
    "not a lawyer and not a marketer. Use the homeowner's first name if provided. "
    "Stick to the facts supplied; do not invent comps, dollar amounts, or legal "
    "advice. Output STRICT JSON only, with exactly these keys: "
    '{"executive_summary": "...", "standout_finding": "...", "reconciliation": "..."}. '
    "No preamble, no markdown, no code fences."
)

EXEC_SUMMARY_GUIDE = (
    "executive_summary (2–3 sentences): plain-English overview stating the "
    "subject's appraised value, the median of five comparable homes, and the "
    "resulting percentage over-assessment. Frame it as what the ARB will see."
)
STANDOUT_GUIDE = (
    "standout_finding (2–3 sentences): the single most persuasive detail from "
    "the comp set — e.g., a comp with very similar sqft and year but materially "
    "lower value, or a tight cluster of comps well below the subject."
)
RECONCILIATION_GUIDE = (
    "reconciliation (2–3 sentences): cite §41.43(b)(3) by name and explain, in "
    "neighborly terms, that the district must defeat the median-of-comps showing "
    "to prevail, and why this parcel's comps meet the statute's requirements "
    "(same neighborhood code, same grade, sqft/age bands)."
)


def _build_prompt(row: dict) -> str:
    first_name = (row.get("owner_name") or "").split(",")[-1].strip().split(" ")[0].title() or "Neighbor"
    return (
        f"{SYSTEM_TONE}\n\n"
        f"Subject parcel facts:\n"
        f"  Owner first name: {first_name}\n"
        f"  Site address: {row['site_addr']}\n"
        f"  HCAD account: {row['account']}\n"
        f"  Appraised value: ${row['appraised_val']:,.0f}\n"
        f"  Living area: {row['living_area']:,.0f} sqft\n"
        f"  Year built: {row['year_built']}\n"
        f"  Grade/class: {row['grade']}\n"
        f"  Neighborhood code: {row['nbhd_code']}\n\n"
        f"Comparable set (5 closest matches by HCAD nbhd + grade + ±15% sqft + ±10 yrs):\n"
        f"  Median appraised value: ${row['median_comp_val']:,.0f}\n"
        f"  Over-assessment: {row['over_pct']:.1f}%\n\n"
        f"Required output:\n"
        f"- {EXEC_SUMMARY_GUIDE}\n"
        f"- {STANDOUT_GUIDE}\n"
        f"- {RECONCILIATION_GUIDE}\n\n"
        f"Return STRICT JSON only."
    )


def _call_claude(prompt: str) -> dict:
    proc = subprocess.run(
        ["claude", "-p", prompt, "--output-format", "json"],
        capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"claude -p exited {proc.returncode}: {proc.stderr[:500]}")
    outer = json.loads(proc.stdout)
    inner_text = outer.get("result") or outer.get("response") or ""
    # Model may wrap in ```json fences despite instruction; strip if present.
    inner_text = inner_text.strip()
    if inner_text.startswith("```"):
        inner_text = inner_text.strip("`")
        if inner_text.lower().startswith("json"):
            inner_text = inner_text[4:]
        inner_text = inner_text.strip()
    parsed = json.loads(inner_text)
    for k in ("executive_summary", "standout_finding", "reconciliation"):
        if k not in parsed or not isinstance(parsed[k], str) or not parsed[k].strip():
            raise ValueError(f"Claude response missing/empty key: {k}")
    return parsed


def generate(db_path: str = "pipeline.duckdb", only_accounts: list[str] | None = None) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(db_path)

    where = ""
    params: list = []
    if only_accounts:
        placeholders = ",".join("?" * len(only_accounts))
        where = f"WHERE p.account IN ({placeholders})"
        params = list(only_accounts)

    rows = con.execute(f"""
        SELECT
            p.account, p.site_addr, p.owner_name,
            p.living_area, p.year_built, p.grade, p.nbhd_code,
            p.appraised_val,
            f.median_comp_val, f.over_pct, f.color
        FROM parcels p
        JOIN findings f USING (account)
        {where}
        ORDER BY p.account
    """, params).fetchall()
    cols = [d[0] for d in con.description]
    con.close()

    total = len(rows)
    for i, row in enumerate(rows, start=1):
        r = dict(zip(cols, row))
        out = CACHE_DIR / f"{r['account']}.json"
        if out.exists():
            continue
        if r["median_comp_val"] is None:
            continue  # skip parcels that couldn't find 5 comps
        prompt = _build_prompt(r)
        try:
            parsed = _call_claude(prompt)
        except Exception as e:
            print(f"[{i}/{total}] {r['account']}: FAILED ({e})", file=sys.stderr)
            time.sleep(SLEEP_SECONDS)
            continue
        out.write_text(json.dumps(parsed, indent=2))
        print(f"[{i}/{total}] {r['account']}: ok  over={r['over_pct']:.1f}%")
        time.sleep(SLEEP_SECONDS)
