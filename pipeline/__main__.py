"""
Command-line entry point.

    python -m pipeline load        # ingest HCAD files -> DuckDB
    python -m pipeline findings    # compute comps + median + over-assessment %
    python -m pipeline hearings    # load ARB protest + hearing history (optional)
    python -m pipeline reports     # emit data/reports.json for report.html
    python -m pipeline mapdata     # emit data/parcels.json for the map
    python -m pipeline all         # load -> findings -> hearings -> reports -> mapdata

Multiple stages in one invocation (they run in fixed dependency order
regardless of argv order — convenient for weekly ARB-data refreshes):
    python -m pipeline hearings reports mapdata

Smoke-test flow after a fresh HCAD download:
    uv run python -m pipeline all
    git add data/ && git commit -m "Regenerate 2026 data" && git push
"""
from __future__ import annotations
import argparse
import sys

from pipeline import load, findings, hearings, reports_data, mapdata


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="pipeline")
    p.add_argument(
        "stages", nargs="+",
        choices=["load", "findings", "hearings", "reports", "mapdata", "all"],
        help="one or more stages; 'all' runs the full pipeline end-to-end",
    )
    p.add_argument("--db", default="pipeline.duckdb")
    args = p.parse_args(argv)
    stages = set(args.stages)
    if "all" in stages:
        stages = {"load", "findings", "hearings", "reports", "mapdata"}

    # Stages run in a fixed dependency order regardless of argv order, so
    # e.g. `pipeline reports mapdata hearings` does the right thing during
    # a weekly refresh ("hearings reports mapdata").
    order = ["load", "findings", "hearings", "reports", "mapdata"]
    for s in order:
        if s not in stages:
            continue
        if s == "load":      load.build(args.db)
        if s == "findings":  findings.compute(args.db)
        if s == "hearings":  hearings.build(args.db)
        if s == "reports":   reports_data.emit(args.db)
        if s == "mapdata":   mapdata.emit(args.db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
