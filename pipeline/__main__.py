"""
Command-line entry point.

    python -m pipeline load                     # ingest HCAD files -> DuckDB
    python -m pipeline findings                 # compute comps + median + color
    python -m pipeline prose                    # Claude prose per parcel (long)
    python -m pipeline prose --accounts 123,456 # prose for specific accounts only
    python -m pipeline render                   # ReportLab PDFs to reports/
    python -m pipeline mapdata                  # emit data/parcels.json for the site
    python -m pipeline all                      # load -> findings -> prose -> render -> mapdata

Smoke-test flow on one known parcel:
    python -m pipeline load
    python -m pipeline findings
    python -m pipeline prose   --accounts 0123456789012
    python -m pipeline render  --accounts 0123456789012
    open reports/0123456789012.pdf
"""
from __future__ import annotations
import argparse
import sys

from pipeline import load, findings, prose, render, mapdata


def _parse_accounts(s: str | None) -> list[str] | None:
    if not s:
        return None
    return [a.strip() for a in s.split(",") if a.strip()]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="pipeline")
    p.add_argument("stage", choices=["load", "findings", "prose", "render", "mapdata", "all"])
    p.add_argument("--db", default="pipeline.duckdb")
    p.add_argument("--accounts", default=None,
                   help="comma-separated HCAD account numbers (prose/render only)")
    args = p.parse_args(argv)

    only = _parse_accounts(args.accounts)

    if args.stage in ("load", "all"):
        load.build(args.db)
    if args.stage in ("findings", "all"):
        findings.compute(args.db)
    if args.stage in ("prose", "all"):
        prose.generate(args.db, only_accounts=only)
    if args.stage in ("render", "all"):
        render.render(args.db, only_accounts=only)
    if args.stage in ("mapdata", "all"):
        mapdata.emit(args.db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
