"""
Portable JSON & CSV exporter for the `performance_test` MySQL schema.
Allows full migration of benchmark history to external analytical/SQL stores.
"""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from db_manager import open_mysql_tunnel

TABLES = [
    "schema_migrations",
    "test_runs",
    "load_scenarios",
    "http_metrics",
    "websocket_metrics",
    "resource_metrics",
    "test_errors",
]


def _serialize_val(val: Any) -> Any:
    if isinstance(val, datetime):
        return val.isoformat()
    return val


def export_all(output_dir: Path, fmt: str = "both") -> dict[str, int]:
    output_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    json_bundle: dict[str, list[dict[str, Any]]] = {}

    with open_mysql_tunnel(database="performance_test") as conn:
        with conn.cursor() as cur:
            for table in TABLES:
                cur.execute(f"SELECT * FROM `{table}`")
                rows = cur.fetchall()
                clean_rows = [{k: _serialize_val(v) for k, v in row.items()} for row in rows]
                counts[table] = len(clean_rows)
                json_bundle[table] = clean_rows

                if fmt in ("csv", "both"):
                    csv_path = output_dir / f"{table}.csv"
                    if clean_rows:
                        with csv_path.open("w", newline="", encoding="utf-8") as fh:
                            writer = csv.DictWriter(fh, fieldnames=list(clean_rows[0].keys()))
                            writer.writeheader()
                            writer.writerows(clean_rows)
                    else:
                        csv_path.write_text("", encoding="utf-8")

    if fmt in ("json", "both"):
        json_path = output_dir / "performance_test_export.json"
        json_path.write_text(json.dumps(json_bundle, indent=2), encoding="utf-8")

    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export performance_test schema to CSV and JSON.")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent / "exports"))
    parser.add_argument("--format", choices=["csv", "json", "both"], default="both")
    args = parser.parse_args()

    result = export_all(Path(args.out), args.format)
    print(json.dumps(result, indent=2))

