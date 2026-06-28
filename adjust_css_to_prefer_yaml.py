#!/usr/bin/env python3
"""
Merge a modified size-chart.css back into a prefer.yaml file.

CSS values win when present. Values missing from CSS are kept from the
source YAML, so non-CSS settings such as input fields and pagination survive.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from tsv_to_size_chart_html import CSS_CONFIG, read_css_variables, read_flat_yaml


YAML_GROUPS = [
    (
        "输入和标题。",
        ["title", "subtitle", "show_title", "brand_column", "stripe_column", "table_columns"],
    ),
    (
        "分页规则。会影响切页的高度都放这里，不放 CSS。",
        [
            "page_bottom_safe_margin_px",
            "max_rows",
            "min_rows_per_brand_chunk",
            "line_height",
            "table_row_height_px",
            "make_padding_y",
            "header_height_px",
            "brand_block_gap_px",
        ],
    ),
    (
    "页面尺寸和布局。脚本会写入 size-chart.css。",
        ["page_width_px", "page_height_px", "chart_columns", "page_padding_px", "column_gap"],
    ),
    (
        "颜色。",
        [
            "page_background",
            "page_text",
            "make_background",
            "make_text",
            "table_background",
            "row_stripe_light",
            "row_stripe_dark",
            "header_background",
            "header_text",
        ],
    ),
    (
        "边框和块样式。",
        [
            "table_border_color",
            "table_border_width",
            "table_outline_color",
            "table_outline_width",
            "table_radius",
            "brand_block_padding",
        ],
    ),
    (
        "单元格和对齐。",
        [
            "cell_padding_x",
            "size_cell_padding_x",
            "model_align",
            "year_align",
            "type_align",
            "cab_align",
            "bed_align",
            "size_align",
        ],
    ),
    (
        "列宽。",
        [
            "model_col_width",
            "year_col_width",
            "type_col_width",
            "cab_col_width",
            "bed_col_width",
            "size_col_width",
        ],
    ),
    (
        "字体。",
        [
            "base_font_family",
            "make_font_family",
            "make_font_size",
            "make_font_weight",
            "brand_padding_x",
            "brand_title_transform",
            "brand_title_align",
            "description_font_family",
            "description_font_size",
            "description_font_weight",
            "description_text",
            "description_margin_top",
            "description_text_transform",
            "brand_part_font_size",
            "brand_part_align",
            "header_font_family",
            "header_font_size",
            "header_font_weight",
            "header_padding_y",
            "header_padding_x",
            "header_text_transform",
            "header_align",
            "cell_font_family",
            "cell_font_size",
            "cell_font_weight",
            "badge_font_family",
            "badge_font_size",
            "badge_font_weight",
            "fit_text_min_font_size",
        ],
    ),
    (
        "SIZE 徽标。",
        [
            "size_badge_width",
            "size_badge_min_width",
            "size_badge_height",
            "size_badge_min_height",
            "size_badge_padding_y",
            "size_badge_padding_x",
            "size_badge_radius",
            "size_badge_background",
            "size_badge_text_color",
            "size_badge_shadow",
            "size_a_background",
            "size_c_background",
            "size_h_background",
            "size_s_background",
            "size_other_background",
        ],
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert size-chart.css changes into a prefer.yaml file."
    )
    parser.add_argument("adjust_css", type=Path, help="Modified size-chart.css path.")
    parser.add_argument("source_yaml", type=Path, help="Original prefer.yaml used for missing values.")
    parser.add_argument(
        "output_yaml",
        type=Path,
        nargs="?",
        default=None,
        help="Output YAML path. Defaults to overwriting source_yaml.",
    )
    return parser.parse_args()


def normalize_css_value(value: str, unit: str) -> str:
    value = value.strip()
    if unit == "px":
        match = re.fullmatch(r"(-?\d+(?:\.\d+)?)px", value)
        if match:
            number = match.group(1)
            return str(int(float(number))) if float(number).is_integer() else number
    return value


def merge_css_into_yaml(css_path: Path, yaml_path: Path) -> dict[str, str]:
    merged = read_flat_yaml(yaml_path)
    css_variables = read_css_variables(css_path)

    for yaml_key, css_name, _default, unit in CSS_CONFIG:
        if css_name in css_variables:
            merged[yaml_key] = normalize_css_value(css_variables[css_name], unit)

    return merged


def render_yaml(values: dict[str, str]) -> str:
    emitted: set[str] = set()
    lines: list[str] = []

    for comment, keys in YAML_GROUPS:
        if lines:
            lines.append("")
        lines.append(f"# {comment}")
        for key in keys:
            lines.append(f"{key}: {values.get(key, '')}")
            emitted.add(key)

    remaining = [key for key in values.keys() if key not in emitted]
    if remaining:
        lines.append("")
        lines.append("# 其它配置。")
        for key in remaining:
            lines.append(f"{key}: {values.get(key, '')}")

    return "\n".join(lines) + "\n"


def main() -> None:
    args = parse_args()
    output_yaml = args.output_yaml or args.source_yaml
    merged = merge_css_into_yaml(args.adjust_css, args.source_yaml)
    output_yaml.write_text(render_yaml(merged), encoding="utf-8")
    print(f"Wrote {output_yaml}")


if __name__ == "__main__":
    main()
