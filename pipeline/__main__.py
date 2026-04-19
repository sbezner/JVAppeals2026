"""
Command-line entry point.

    python -m pipeline load        # ingest HCAD files -> DuckDB
    python -m pipeline findings    # compute comps + median + over-assessment %
    python -m pipeline reports     # emit data/reports.json for report.html
    python -m pipeline mapdata     # emit data/parcels.json for the map
    python -m pipeline all         # load -> findings -> reports -> mapdata

Smoke-test flow after a fresh HCAD download:
    uv run python -m pipeline all
    git add data/ && git commit -m "Regenerate 2026 data" && git push
"""
from __future__ import annotations
import argparse
import sys

from pipeline import load, findings, reports_data, mapdata


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="pipeline")
    p.add_argument("stage", choices=["load", "findings", "reports", "mapdata", "all"])
    p.add_argument("--db", default="pipeline.duckdb")
    args = p.parse_args(argv)

    if args.stage in ("load", "all"):
        load.build(args.db)
    if args.stage in ("findings", "all"):
        findings.compute(args.db)
    if args.stage in ("reports", "all"):
        reports_data.emit(args.db)
    if args.stage in ("mapdata", "all"):
        mapdata.emit(args.db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
