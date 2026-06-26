#!/usr/bin/env python3
"""
Convert a vehicle size-chart TSV file into a printable HTML chart.

Input columns expected by default:
BRAND, MODEL, YEAR, TYPE, SIZE
Optional stripe column: 排序车型
"""

from __future__ import annotations

import argparse
import csv
import html
import shutil
import sys
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
        "--config-path",
        type=Path,
        default=Path("prefer.yaml"),
        help="Flat YAML config file. Values are used unless the same option is passed on the command line.",
    )
    parser.add_argument(
        "--page-width-px",
        type=int,
        default=2000,
        help="Table canvas width in pixels. Default: 2000.",
    )
    parser.add_argument(
        "--page-height-px",
        type=int,
        default=1800,
        help="Output page height in pixels. Default: 1800.",
    )
    parser.add_argument(
        "--columns",
        type=int,
        default=4,
        help="Number of vertical columns per generated HTML page. Default: 4.",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=0,
        help="Optional hard row limit per brand table chunk. Use 0 for pixel-height pagination only. Default: 0.",
    )
    parser.add_argument(
        "--min-rows-per-brand-chunk",
        type=int,
        default=2,
        help="Minimum data rows required when placing a brand chunk into a column/page. Default: 2.",
    )
    parser.add_argument(
        "--page-max-height-px",
        type=int,
        default=0,
        help="Maximum usable height, in pixels, for each page column. Use 0 to derive from page height. Default: 0.",
    )
    parser.add_argument(
        "--brand-title-height-px",
        type=int,
        default=38,
        help="Estimated pixel height of the blue brand title bar. Default: 38.",
    )
    parser.add_argument(
        "--table-header-height-px",
        type=int,
        default=22,
        help="Estimated pixel height of the table header row. Default: 22.",
    )
    parser.add_argument(
        "--table-row-height-px",
        type=int,
        default=25,
        help="Estimated pixel height of one table data row. Keep this aligned with CSS. Default: 25.",
    )
    parser.add_argument(
        "--table-gap-px",
        type=int,
        default=14,
        help="Estimated vertical gap after each brand table. Default: 14.",
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
        "--stripe-column",
        default="",
        help="Name of the TSV column used to alternate row background groups. Defaults to 排序车型 when present, otherwise MODEL.",
    )
    parser.add_argument(
        "--table-columns",
        default=",".join(DEFAULT_COLUMNS),
        help="Comma-separated TSV columns shown inside each table. Default: MODEL,YEAR,TYPE,SIZE.",
    )
    parser.add_argument(
        "--show-title",
        action="store_true",
        help="Show the quiet title block above each table page. Hidden by default.",
    )
    parser.add_argument(
        "--css-path",
        type=Path,
        default=None,
        help="CSS file path to reference from the HTML. Defaults to size-chart-template.css beside the output.",
    )
    return parser.parse_args()


def read_flat_yaml(path: Path) -> dict[str, str]:
    config: dict[str, str] = {}
    if not path.exists():
        return config

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        comment_index = value.find(" #")
        if comment_index >= 0:
            value = value[:comment_index].strip()
        config[key.strip()] = value.strip("'\"")
    return config


def apply_config(args: argparse.Namespace) -> argparse.Namespace:
    config = read_flat_yaml(args.config_path)
    cli_options = set()
    for item in sys.argv[1:]:
        if item.startswith("--"):
            cli_options.add(item.split("=", 1)[0])

    mapping = {
        "page_width_px": ("page_width_px", "--page-width-px", int),
        "page_height_px": ("page_height_px", "--page-height-px", int),
        "columns": ("columns", "--columns", int),
        "max_rows": ("max_rows", "--max-rows", int),
        "min_rows_per_brand_chunk": (
            "min_rows_per_brand_chunk",
            "--min-rows-per-brand-chunk",
            int,
        ),
        "page_max_height_px": ("page_max_height_px", "--page-max-height-px", int),
        "brand_title_height_px": ("brand_title_height_px", "--brand-title-height-px", int),
        "table_header_height_px": ("table_header_height_px", "--table-header-height-px", int),
        "table_row_height_px": ("table_row_height_px", "--table-row-height-px", int),
        "table_gap_px": ("table_gap_px", "--table-gap-px", int),
        "title": ("title", "--title", str),
        "subtitle": ("subtitle", "--subtitle", str),
        "brand_column": ("brand_column", "--brand-column", str),
        "stripe_column": ("stripe_column", "--stripe-column", str),
        "css_path": ("css_path", "--css-path", Path),
    }

    for key, (attr, option, caster) in mapping.items():
        if key in config and option not in cli_options and config[key] != "":
            setattr(args, attr, caster(config[key]))

    if "table_columns" in config and "--table-columns" not in cli_options and config["table_columns"]:
        args.table_columns = config["table_columns"]

    if "show_title" in config and "--show-title" not in cli_options:
        args.show_title = config["show_title"].lower() in {"true", "yes", "1"}

    return args


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


def css_class_for_size(value: str) -> str:
    first = value[:1].upper()
    if first in {"A", "C", "H", "S"}:
        return f"size-{first.lower()}"
    return "size-other"


def choose_stripe_column(rows: list[dict[str, str]], configured_column: str) -> str:
    input_columns = set(rows[0].keys()) if rows else set()
    if configured_column:
        if configured_column not in input_columns:
            raise ValueError(f"Stripe column not found in input TSV: {configured_column}")
        return configured_column
    if "排序车型" in input_columns:
        return "排序车型"
    return "MODEL"


def add_model_stripes(rows: list[dict[str, str]], stripe_column: str) -> None:
    previous_model: str | None = None
    model_group_index = -1
    for row in rows:
        model = row.get(stripe_column, "")
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


def table_height(row_count: int, args: argparse.Namespace) -> int:
    return (
        args.brand_title_height_px
        + args.table_header_height_px
        + (row_count * args.table_row_height_px)
        + args.table_gap_px
    )


def max_rows_per_column(args: argparse.Namespace) -> int:
    base_height = args.brand_title_height_px + args.table_header_height_px + args.table_gap_px
    rows_by_height = max(1, (args.page_max_height_px - base_height) // max(1, args.table_row_height_px))
    if args.max_rows > 0:
        return min(rows_by_height, args.max_rows)
    return rows_by_height


def max_rows_for_available_height(args: argparse.Namespace, available_height: int) -> int:
    base_height = args.brand_title_height_px + args.table_header_height_px + args.table_gap_px
    rows_by_height = max(0, (available_height - base_height) // max(1, args.table_row_height_px))
    if args.max_rows > 0 and rows_by_height > 0:
        return min(rows_by_height, args.max_rows)
    return rows_by_height


def paginate_tables(
    grouped: OrderedDict[str, list[dict[str, str]]],
    args: argparse.Namespace,
    stripe_column: str,
) -> list[list[list[dict[str, object]]]]:
    safe_columns = max(1, args.columns)
    max_height = max(1, args.page_max_height_px)
    pages: list[list[list[dict[str, object]]]] = [[[] for _ in range(safe_columns)]]
    heights: list[list[int]] = [[0 for _ in range(safe_columns)]]
    page_index = 0
    column_index = 0
    min_rows_per_chunk = max(1, args.min_rows_per_brand_chunk)
    full_column_rows = max_rows_per_column(args)

    def move_to_next_column() -> None:
        nonlocal page_index, column_index
        column_index += 1
        if column_index >= safe_columns:
            pages.append([[] for _ in range(safe_columns)])
            heights.append([0 for _ in range(safe_columns)])
            page_index += 1
            column_index = 0

    for brand, brand_rows in grouped.items():
        add_model_stripes(brand_rows, stripe_column)
        brand_chunks: list[dict[str, object]] = []
        offset = 0
        while offset < len(brand_rows):
            available_height = max_height - heights[page_index][column_index]
            rows_that_fit = max_rows_for_available_height(args, available_height)
            remaining_rows = len(brand_rows) - offset
            minimum_rows_for_this_chunk = min(min_rows_per_chunk, remaining_rows)
            column_has_content = heights[page_index][column_index] > 0

            if rows_that_fit <= 0 or (
                rows_that_fit < minimum_rows_for_this_chunk and column_has_content
            ):
                move_to_next_column()
                continue

            rows_to_take = min(rows_that_fit, remaining_rows)
            remaining_after_take = remaining_rows - rows_to_take

            if (
                0 < remaining_after_take < min_rows_per_chunk
                and column_has_content
                and remaining_rows <= full_column_rows
            ):
                move_to_next_column()
                continue

            tail_shortfall = min_rows_per_chunk - remaining_after_take
            if (
                0 < remaining_after_take < min_rows_per_chunk
                and rows_to_take - tail_shortfall >= min_rows_per_chunk
            ):
                rows_to_take -= tail_shortfall

            part_rows = brand_rows[offset : offset + rows_to_take]
            height = table_height(len(part_rows), args)

            chunk = {
                "brand": brand,
                "rows": part_rows,
                "part_number": 1,
                "total_parts": 1,
            }
            brand_chunks.append(chunk)
            pages[page_index][column_index].append(chunk)
            heights[page_index][column_index] += height
            offset += rows_to_take

        for index, chunk in enumerate(brand_chunks, start=1):
            chunk["part_number"] = index
            chunk["total_parts"] = len(brand_chunks)

    return pages


def render_html(
    page: list[list[dict[str, object]]],
    table_columns: list[str],
    layout_columns: int,
    page_max_height_px: int,
    page_width_px: int,
    page_height_px: int,
    brand_title_height_px: int,
    table_header_height_px: int,
    table_row_height_px: int,
    title: str,
    subtitle: str,
    show_title: bool,
    css_href: str,
    page_number: int,
) -> str:
    safe_columns = max(1, layout_columns)
    title_class = "chart-title-block is-visible" if show_title else "chart-title-block"
    column_blocks = []
    for column_index in range(safe_columns):
        tables = []
        for table in page[column_index]:
            tables.append(
                render_table(
                    str(table["brand"]),
                    table["rows"],  # type: ignore[arg-type]
                    table_columns,
                    int(table["part_number"]),
                    int(table["total_parts"]),
                )
            )
        column_blocks.append(
            f"""      <section class="chart-column" data-column="{column_index + 1}">
{chr(10).join(tables)}
      </section>"""
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} - Page {page_number}</title>
  <link rel="stylesheet" href="{html.escape(css_href)}">
</head>
<body>
  <aside class="{title_class}">
    <h1>{html.escape(title)}</h1>
    <p>{html.escape(subtitle)}</p>
  </aside>
  <main class="chart-page" style="--page-width: {page_width_px}px; --page-height: {page_height_px}px; --chart-columns: {safe_columns}; --page-max-height: {page_max_height_px}px; --brand-title-height: {brand_title_height_px}px; --table-header-height: {table_header_height_px}px; --table-row-height: {table_row_height_px}px;" data-page="{page_number}">
    <div class="chart-columns">
{chr(10).join(column_blocks)}
    </div>
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
    args = apply_config(parse_args())
    if args.page_max_height_px <= 0:
        args.page_max_height_px = max(1, args.page_height_px - 28)
    rows = read_tsv(args.input)
    table_columns = [column.strip() for column in args.table_columns.split(",") if column.strip()]
    if not table_columns:
        raise ValueError("--table-columns must contain at least one column.")

    stripe_column = choose_stripe_column(rows, args.stripe_column)
    grouped = group_by_brand(rows, args.brand_column)
    _, css_href = prepare_css(args.output, args.css_path)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pages = paginate_tables(grouped, args, stripe_column)
    suffix = args.output.suffix or ".html"
    stem = args.output.stem if args.output.suffix else args.output.name
    for index, page in enumerate(pages, start=1):
        page_path = args.output.with_name(f"{stem}_{index:03d}{suffix}")
        html_text = render_html(
            page=page,
            table_columns=table_columns,
            layout_columns=args.columns,
            page_max_height_px=max(1, args.page_max_height_px),
            page_width_px=max(1, args.page_width_px),
            page_height_px=max(1, args.page_height_px),
            brand_title_height_px=max(1, args.brand_title_height_px),
            table_header_height_px=max(1, args.table_header_height_px),
            table_row_height_px=max(1, args.table_row_height_px),
            title=args.title,
            subtitle=args.subtitle,
            show_title=args.show_title,
            css_href=css_href,
            page_number=index,
        )
        page_path.write_text(html_text, encoding="utf-8")


if __name__ == "__main__":
    main()
