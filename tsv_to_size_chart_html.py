#!/usr/bin/env python3
"""
Convert a vehicle size-chart TSV file into a printable HTML chart.

Input columns expected by default:
BRAND, MODEL, YEAR, TYPE, SIZE
"""

from __future__ import annotations

import argparse
import csv
import html
from collections import OrderedDict
from pathlib import Path
from typing import Iterable


DEFAULT_COLUMNS = ["MODEL", "YEAR", "TYPE", "SIZE"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a TSV vehicle fitment table into brand-grouped HTML."
    )
    parser.add_argument("input", type=Path, help="Input TSV file path.")
    parser.add_argument("output", type=Path, help="Output HTML file path.")
    parser.add_argument(
        "--columns",
        type=int,
        default=4,
        help="Number of vertical layout columns in the HTML page. Default: 4.",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=32,
        help="Maximum data rows per brand table before splitting. Default: 32.",
    )
    parser.add_argument(
        "--title",
        default="FIND THE RIGHT SIZE",
        help="Main page title. Default: FIND THE RIGHT SIZE.",
    )
    parser.add_argument(
        "--subtitle",
        default="FOR YOUR CAR COVER",
        help="Page subtitle. Default: FOR YOUR CAR COVER.",
    )
    parser.add_argument(
        "--brand-column",
        default="BRAND",
        help="Name of the TSV column used as each table title. Default: BRAND.",
    )
    parser.add_argument(
        "--table-columns",
        default=",".join(DEFAULT_COLUMNS),
        help="Comma-separated TSV columns shown inside each table. Default: MODEL,YEAR,TYPE,SIZE.",
    )
    parser.add_argument(
        "--no-banner",
        action="store_true",
        help="Hide the top title/banner area and output only the chart grid.",
    )
    return parser.parse_args()


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file, delimiter="\t")
        if not reader.fieldnames:
            raise ValueError("Input TSV has no header row.")
        return [
            {key: (value or "").strip() for key, value in row.items()}
            for row in reader
            if any((value or "").strip() for value in row.values())
        ]


def group_by_brand(rows: Iterable[dict[str, str]], brand_column: str) -> OrderedDict[str, list[dict[str, str]]]:
    grouped: OrderedDict[str, list[dict[str, str]]] = OrderedDict()
    for row in rows:
        brand = row.get(brand_column, "").strip()
        if not brand:
            brand = "UNKNOWN"
        grouped.setdefault(brand, []).append(row)
    return grouped


def chunks(items: list[dict[str, str]], size: int) -> Iterable[list[dict[str, str]]]:
    if size <= 0:
        yield items
        return
    for index in range(0, len(items), size):
        yield items[index : index + size]


def css_class_for_size(value: str) -> str:
    first = value[:1].upper()
    if first in {"A", "C", "H", "S"}:
        return f"size-{first.lower()}"
    return "size-other"


def render_table(
    brand: str,
    rows: list[dict[str, str]],
    table_columns: list[str],
    part_number: int,
    total_parts: int,
) -> str:
    title = html.escape(brand.upper())
    if total_parts > 1:
        title = f"{title} <span class=\"brand-part\">{part_number}/{total_parts}</span>"

    header_cells = "\n".join(
        f"          <th>{html.escape(column)}</th>" for column in table_columns
    )
    body_rows = []
    for row in rows:
        cells = []
        for column in table_columns:
            value = row.get(column, "")
            escaped = html.escape(value)
            if column.upper() == "SIZE" and value:
                klass = css_class_for_size(value)
                cells.append(
                    f'          <td class="size-cell"><span class="size-badge {klass}">{escaped}</span></td>'
                )
            else:
                cells.append(f"          <td>{escaped}</td>")
        body_rows.append("        <tr>\n" + "\n".join(cells) + "\n        </tr>")

    return f"""    <section class="brand-table">
      <h2>{title}</h2>
      <table>
        <thead>
        <tr>
{header_cells}
        </tr>
        </thead>
        <tbody>
{chr(10).join(body_rows)}
        </tbody>
      </table>
    </section>"""


def render_html(
    grouped: OrderedDict[str, list[dict[str, str]]],
    table_columns: list[str],
    layout_columns: int,
    max_rows: int,
    title: str,
    subtitle: str,
    show_banner: bool,
) -> str:
    tables: list[str] = []
    for brand, brand_rows in grouped.items():
        split_rows = list(chunks(brand_rows, max_rows))
        for index, part_rows in enumerate(split_rows, start=1):
            tables.append(render_table(brand, part_rows, table_columns, index, len(split_rows)))

    banner = ""
    if show_banner:
        banner = f"""  <header class="hero">
    <div>
      <h1>{html.escape(title)}<br><span>{html.escape(subtitle)}</span></h1>
      <p>A custom-like fit is guaranteed for all listed vehicles</p>
    </div>
  </header>
"""

    safe_columns = max(1, layout_columns)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>
    :root {{
      --blue-dark: #062746;
      --blue: #004b91;
      --blue-bright: #168ee4;
      --grid: #d7dbe0;
      --text: #161b22;
      --paper: #f3f4f6;
    }}

    * {{ box-sizing: border-box; }}

    body {{
      margin: 0;
      background: var(--paper);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
    }}

    .hero {{
      background: var(--blue-dark);
      color: #fff;
      padding: 22px 28px 16px;
      border-bottom: 10px solid #0d5ba6;
    }}

    .hero h1 {{
      margin: 0;
      font-size: clamp(34px, 5vw, 58px);
      line-height: 0.95;
      letter-spacing: 0;
      font-weight: 900;
    }}

    .hero h1::first-line {{
      color: #fff;
    }}

    .hero h1 span {{
      font-size: 0.72em;
      font-weight: 700;
    }}

    .hero p {{
      display: inline-block;
      margin: 18px 0 0;
      padding: 8px 18px;
      background: #094f98;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      text-transform: uppercase;
      font-weight: 800;
      font-size: 16px;
    }}

    .chart {{
      column-count: {safe_columns};
      column-gap: 14px;
      padding: 14px;
    }}

    .brand-table {{
      display: inline-block;
      width: 100%;
      margin: 0 0 14px;
      break-inside: avoid;
      page-break-inside: avoid;
      background: #fff;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
    }}

    .brand-table h2 {{
      margin: 0;
      padding: 6px 12px;
      min-height: 38px;
      background: linear-gradient(90deg, #003f82, #0060af);
      color: #fff;
      font-size: 28px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }}

    .brand-part {{
      font-size: 12px;
      font-weight: 700;
      opacity: 0.85;
    }}

    table {{
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 17px;
    }}

    th, td {{
      border-right: 1px solid var(--grid);
      border-bottom: 1px solid var(--grid);
      padding: 3px 6px;
      overflow-wrap: anywhere;
      vertical-align: middle;
    }}

    th:last-child, td:last-child {{
      border-right: 0;
    }}

    th {{
      color: #315c72;
      background: #fff;
      text-align: left;
      font-size: 12px;
      line-height: 1;
      font-weight: 800;
    }}

    td:nth-child(1) {{
      font-weight: 800;
    }}

    td:nth-child(2) {{
      white-space: nowrap;
    }}

    th:nth-child(1), td:nth-child(1) {{ width: 28%; }}
    th:nth-child(2), td:nth-child(2) {{ width: 28%; }}
    th:nth-child(3), td:nth-child(3) {{ width: 32%; }}
    th:nth-child(4), td:nth-child(4) {{ width: 12%; }}

    .size-cell {{
      padding: 2px 4px;
      text-align: center;
    }}

    .size-badge {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      height: 22px;
      padding: 0 3px;
      border-radius: 3px;
      color: #fff;
      font-weight: 900;
      line-height: 1;
      box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.22);
    }}

    .size-a {{ background: #1f86c7; }}
    .size-c {{ background: #c91d31; }}
    .size-h {{ background: #159aa2; }}
    .size-s {{ background: #ef9c32; }}
    .size-other {{ background: #6b7280; }}

    @media (max-width: 1200px) {{
      .chart {{ column-count: min(3, {safe_columns}); }}
      table {{ font-size: 15px; }}
      .brand-table h2 {{ font-size: 24px; }}
    }}

    @media (max-width: 760px) {{
      .chart {{ column-count: 1; padding: 10px; }}
      .hero {{ padding: 18px 16px 12px; }}
      .hero p {{ font-size: 12px; }}
      table {{ font-size: 14px; }}
      th, td {{ padding: 3px 4px; }}
      .brand-table h2 {{ font-size: 22px; }}
    }}

    @media print {{
      body {{ background: #fff; }}
      .hero {{ padding: 12px 18px; }}
      .chart {{ padding: 8px; column-gap: 8px; }}
      .brand-table {{ margin-bottom: 8px; box-shadow: none; border: 1px solid #cdd3da; }}
    }}
  </style>
</head>
<body>
{banner}  <main class="chart">
{chr(10).join(tables)}
  </main>
</body>
</html>
"""


def main() -> None:
    args = parse_args()
    rows = read_tsv(args.input)
    table_columns = [column.strip() for column in args.table_columns.split(",") if column.strip()]
    if not table_columns:
        raise ValueError("--table-columns must contain at least one column.")

    grouped = group_by_brand(rows, args.brand_column)
    html_text = render_html(
        grouped=grouped,
        table_columns=table_columns,
        layout_columns=args.columns,
        max_rows=args.max_rows,
        title=args.title,
        subtitle=args.subtitle,
        show_banner=not args.no_banner,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html_text, encoding="utf-8")


if __name__ == "__main__":
    main()
