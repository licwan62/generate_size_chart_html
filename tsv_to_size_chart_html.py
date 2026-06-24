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
import shutil
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
    parser.add_argument(
        "--css-path",
        type=Path,
        default=None,
        help="CSS file path to reference from the HTML. Defaults to size-chart-template.css beside the output.",
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


def add_model_stripes(rows: list[dict[str, str]]) -> None:
    previous_model: str | None = None
    model_group_index = -1
    for row in rows:
        model = row.get("MODEL", "")
        if previous_model is None or model != previous_model:
            model_group_index += 1
            previous_model = model
        row["__MODEL_STRIPE_CLASS"] = (
            "model-stripe-light" if model_group_index % 2 == 0 else "model-stripe-dark"
        )


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
        row_class = html.escape(row.get("__MODEL_STRIPE_CLASS", ""))
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
        body_rows.append(f'        <tr class="{row_class}">\n' + "\n".join(cells) + "\n        </tr>")

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
    css_href: str,
) -> str:
    tables: list[str] = []
    for brand, brand_rows in grouped.items():
        add_model_stripes(brand_rows)
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
  <link rel="stylesheet" href="{html.escape(css_href)}">
</head>
<body>
{banner}  <main class="chart" style="--chart-columns: {safe_columns};">
{chr(10).join(tables)}
  </main>
</body>
</html>
"""


def prepare_css(output_path: Path, css_path: Path | None) -> tuple[Path, str]:
    target_css = css_path or output_path.parent / "size-chart-template.css"
    if not target_css.is_absolute():
        target_css = Path.cwd() / target_css

    template_css = Path(__file__).with_name("size-chart-template.css")
    if not target_css.exists():
        target_css.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(template_css, target_css)

    return target_css, target_css.name


def main() -> None:
    args = parse_args()
    rows = read_tsv(args.input)
    table_columns = [column.strip() for column in args.table_columns.split(",") if column.strip()]
    if not table_columns:
        raise ValueError("--table-columns must contain at least one column.")

    grouped = group_by_brand(rows, args.brand_column)
    _, css_href = prepare_css(args.output, args.css_path)
    html_text = render_html(
        grouped=grouped,
        table_columns=table_columns,
        layout_columns=args.columns,
        max_rows=args.max_rows,
        title=args.title,
        subtitle=args.subtitle,
        show_banner=not args.no_banner,
        css_href=css_href,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html_text, encoding="utf-8")


if __name__ == "__main__":
    main()
