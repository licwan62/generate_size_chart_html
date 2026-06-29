#!/usr/bin/env python3
"""
Convert a vehicle size-chart TSV file into a printable HTML chart.

Input columns expected by default:
BRAND, MODEL, YEAR, TYPE, SIZE
Optional stripe column: 排序车型
"""

from __future__ import annotations

import argparse
import copy
import csv
import html
import os
import re
import sys
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from typing import Iterable


DEFAULT_COLUMNS = ["MODEL", "YEAR", "TYPE", "SIZE"]
NON_PICKUP_COLUMNS = ["MODEL", "YEAR", "TYPE", "SIZE"]
PICKUP_COLUMNS = ["YEAR", "CAB", "BED", "SIZE"]
NULL_SIZE_BACKSIZE = "无可用尺码"
DEFAULT_COLUMN_SOURCES = {
    "non_pickup": {
        "MAKE": ["MAKE"],
        "MODEL": ["SHORT-MODEL", "MODEL"],
        "TYPE": ["TYPE", "LONG-TYPE", "CONST"],
        "SIZE": ["SIZE", "BACKSIZE"],
    },
    "pickup": {
        "TITLE": ["TITLE"],
        "MODEL": ["SHORT-MODEL", "MODEL"],
        "CAB": ["SHORT-CAB", "CAB"],
    },
    "generic": {},
}
PROFILE_DEFAULT_FIELDS = {
    "non_pickup": ("MAKE", NON_PICKUP_COLUMNS),
    "pickup": ("TITLE", PICKUP_COLUMNS),
}

CHART_CSS = r"""
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-width: var(--page-width);
  background: var(--page-background);
  color: var(--page-text);
  font-family: var(--base-font-family);
}

.chart-title-block {
  display: none;
}

.chart-title-block.is-visible {
  display: block;
  width: var(--page-width);
  padding: 8px 14px;
  background: var(--brand-title-background);
  color: #fff;
}

.chart-title-block h1,
.chart-title-block p {
  margin: 0;
}

.chart-title-block h1 {
  font-size: 18px;
  line-height: var(--page-line-height);
}

.chart-title-block p {
  margin-top: 2px;
  font-size: 12px;
}

.chart-page {
  width: var(--page-width);
  height: var(--page-height);
  padding: var(--page-padding);
  overflow: hidden;
  background: var(--page-background);
}

.chart-columns {
  display: grid;
  grid-template-columns: repeat(var(--chart-columns), minmax(0, 1fr));
  gap: var(--column-gap);
  align-items: start;
  height: 100%;
}

.chart-column {
  height: 100%;
  overflow: hidden;
}

.brand-table {
  display: block;
  width: 100%;
  margin: 0 0 var(--brand-block-gap);
  padding: var(--brand-block-padding);
  break-inside: avoid;
  page-break-inside: avoid;
  background: var(--table-background);
  border-radius: var(--table-radius);
  overflow: hidden;
  box-shadow: 0 0 0 var(--table-outline-width) var(--table-outline-color);
}

.brand-table h2 {
  position: relative;
  margin: 0;
  padding: var(--brand-padding-y) var(--brand-padding-x);
  background: var(--brand-title-background);
  color: var(--brand-title-text);
  font-family: var(--make-font-family, var(--brand-font-family));
  font-size: var(--make-font-size, var(--brand-font-size));
  font-weight: var(--make-font-weight, var(--brand-font-weight));
  line-height: var(--page-line-height);
  letter-spacing: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  overflow-wrap: anywhere;
  text-align: var(--brand-title-align);
  text-transform: var(--brand-title-transform);
}

.brand-table h2.has-brand-logo {
  padding-right: calc(var(--brand-logo-width) + var(--brand-logo-right) + var(--brand-padding-x));
}

.brand-title-main {
  display: block;
  width: 100%;
  z-index: 1;
}

.brand-title-description {
  display: block;
  width: 100%;
  margin-top: var(--description-margin-top);
  color: var(--description-text);
  font-family: var(--description-font-family);
  font-size: var(--description-font-size);
  font-weight: var(--description-font-weight);
  line-height: var(--page-line-height);
  text-transform: var(--description-text-transform);
  z-index: 1;
}

.brand-title-logo {
  position: absolute;
  top: 50%;
  right: var(--brand-logo-right);
  width: var(--brand-logo-width);
  height: var(--brand-logo-height);
  object-fit: contain;
  opacity: var(--brand-logo-opacity);
  transform: translateY(-50%);
  pointer-events: none;
}

.brand-part {
  font-size: var(--brand-part-font-size);
  font-weight: 700;
  line-height: var(--page-line-height);
  text-align: var(--brand-part-align);
  opacity: 0.85;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

th,
td {
  border-right: var(--table-border-width) solid var(--table-border-color);
  border-bottom: var(--table-border-width) solid var(--table-border-color);
  padding: 0 var(--cell-padding-x);
  color: var(--page-text);
  overflow-wrap: anywhere;
  vertical-align: middle;
}

.cell-fit,
.size-badge .fit-text {
  display: inline-block;
  width: 100%;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}

th:last-child,
td:last-child {
  border-right: 0;
}

th {
  height: var(--table-header-height);
  padding: var(--header-padding-y) var(--header-padding-x);
  color: var(--header-text, var(--header-text-color));
  background: var(--header-background);
  font-family: var(--header-font-family);
  font-size: var(--header-font-size);
  font-weight: var(--header-font-weight);
  line-height: var(--page-line-height);
  text-align: var(--header-align);
  text-transform: var(--header-text-transform);
}

tbody tr {
  height: var(--table-row-height);
}

tbody td {
  height: var(--table-row-height);
}

tbody tr.model-stripe-light td {
  background: var(--row-stripe-light);
}

tbody tr.model-stripe-dark td {
  background: var(--row-stripe-dark);
}

th:nth-child(1),
td:nth-child(1) {
  width: var(--model-col-width);
  text-align: var(--model-align);
}

th:nth-child(2),
td:nth-child(2) {
  width: var(--year-col-width);
  text-align: var(--year-align);
}

th:nth-child(3),
td:nth-child(3) {
  width: var(--type-col-width);
  text-align: var(--type-align);
}

th:nth-child(4),
td:nth-child(4) {
  width: var(--size-col-width);
  text-align: var(--size-align);
}

th.col-model,
td.col-model {
  width: var(--model-col-width);
  text-align: var(--model-align);
}

th.col-year,
td.col-year {
  width: var(--year-col-width);
  text-align: var(--year-align);
}

th.col-type,
td.col-type {
  width: var(--type-col-width);
  text-align: var(--type-align);
}

th.col-cab,
td.col-cab {
  width: var(--cab-col-width);
  text-align: var(--cab-align);
}

th.col-bed,
td.col-bed {
  width: var(--bed-col-width);
  text-align: var(--bed-align);
}

th.col-size,
td.col-size {
  width: var(--size-col-width);
  text-align: var(--size-align);
}

thead th,
thead th:nth-child(1),
thead th:nth-child(2),
thead th:nth-child(3),
thead th:nth-child(4),
thead th:nth-child(5) {
  text-align: var(--header-align) !important;
}

thead th.col-model {
  text-align: var(--model-header-align) !important;
}

thead th.col-year {
  text-align: var(--year-header-align) !important;
}

thead th.col-type {
  text-align: var(--type-header-align) !important;
}

thead th.col-cab {
  text-align: var(--cab-header-align) !important;
}

thead th.col-bed {
  text-align: var(--bed-header-align) !important;
}

thead th.col-size {
  text-align: var(--size-header-align) !important;
}

tbody td,
tbody td:nth-child(1),
tbody td:nth-child(2),
tbody td:nth-child(3),
tbody td:nth-child(4),
tbody td:nth-child(5) {
  line-height: var(--page-line-height) !important;
}

tbody td {
  font-family: var(--cell-font-family, var(--model-font-family));
  font-size: var(--cell-font-size, var(--model-font-size));
  font-weight: var(--cell-font-weight, var(--model-font-weight));
}

.size-cell {
  padding: 0 var(--size-cell-padding-x);
}

.size-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-badge-width);
  min-width: var(--size-badge-min-width);
  height: var(--size-badge-height);
  min-height: var(--size-badge-min-height);
  padding: var(--size-badge-padding-y) var(--size-badge-padding-x);
  border-radius: var(--size-badge-radius);
  color: var(--size-badge-text-color);
  font-family: var(--badge-font-family, var(--size-font-family));
  font-size: var(--badge-font-size, var(--size-font-size));
  font-weight: var(--badge-font-weight, var(--size-font-weight));
  letter-spacing: var(--badge-letter-spacing);
  line-height: var(--page-line-height);
  background: var(--size-badge-background);
  box-shadow: var(--size-badge-shadow);
}

.size-a {
  background: var(--size-a-background, var(--size-badge-background));
}

.size-c {
  background: var(--size-c-background, var(--size-badge-background));
}

.size-h {
  background: var(--size-h-background, var(--size-badge-background));
}

.size-s {
  background: var(--size-s-background, var(--size-badge-background));
}

.size-other {
  background: var(--size-other-background, var(--size-badge-background));
}

@media print {
  body {
    background: #fff;
  }

  .chart-page {
    break-after: page;
    page-break-after: always;
  }
}
""".strip()

CSS_CONFIG = [
    ("line_height", "page-line-height", "1", ""),
    ("page_width_px", "page-width", "2000px", "px"),
    ("page_height_px", "page-height", "1800px", "px"),
    ("chart_columns", "chart-columns", "5", ""),
    ("page_padding_px", "page-padding", "14px", "px"),
    ("column_gap", "column-gap", "10px", ""),
    ("page_background", "page-background", "#ffffff", ""),
    ("page_text", "page-text", "#111111", ""),
    ("table_row_height_px", "table-row-height", "25px", "px"),
    ("header_height_px", "table-header-height", "22px", "px"),
    ("brand_block_gap_px", "brand-block-gap", "14px", "px"),
    ("make_background", "brand-title-background", "#d57b32", ""),
    ("make_text", "brand-title-text", "#ffffff", ""),
    ("table_background", "table-background", "#ffffff", ""),
    ("row_stripe_light", "row-stripe-light", "#f5f5f5", ""),
    ("row_stripe_dark", "row-stripe-dark", "#e2e1df", ""),
    ("header_background", "header-background", "#33363a", ""),
    ("header_text", "header-text", "#f1f1f1", ""),
    ("table_border_color", "table-border-color", "#ffffff", ""),
    ("table_border_width", "table-border-width", "2px", "px"),
    ("table_outline_color", "table-outline-color", "rgba(0, 0, 0, 0.08)", ""),
    ("table_outline_width", "table-outline-width", "0", "px"),
    ("table_radius", "table-radius", "6px", "px"),
    ("brand_block_padding", "brand-block-padding", "0", "px"),
    ("cell_padding_x", "cell-padding-x", "5px", "px"),
    ("size_cell_padding_x", "size-cell-padding-x", "2px", "px"),
    ("model_align", "model-align", "left", ""),
    ("year_align", "year-align", "center", ""),
    ("type_align", "type-align", "left", ""),
    ("cab_align", "cab-align", "center", ""),
    ("bed_align", "bed-align", "center", ""),
    ("size_align", "size-align", "center", ""),
    ("model_col_width", "model-col-width", "25%", ""),
    ("year_col_width", "year-col-width", "25%", ""),
    ("type_col_width", "type-col-width", "35%", ""),
    ("cab_col_width", "cab-col-width", "20%", ""),
    ("bed_col_width", "bed-col-width", "20%", ""),
    ("size_col_width", "size-col-width", "15%", ""),
    ("base_font_family", "base-font-family", "D-DIN-PRO, sans-serif", ""),
    ("make_font_family", "make-font-family", "Arial, Helvetica, sans-serif", ""),
    ("make_font_size", "make-font-size", "25px", "px"),
    ("make_font_weight", "make-font-weight", "700", ""),
    ("make_padding_y", "brand-padding-y", "5px", "px"),
    ("brand_padding_x", "brand-padding-x", "10px", "px"),
    ("brand_title_transform", "brand-title-transform", "uppercase", ""),
    ("brand_title_align", "brand-title-align", "center", ""),
    ("description_font_family", "description-font-family", "Arial, Helvetica, sans-serif", ""),
    ("description_font_size", "description-font-size", "14px", "px"),
    ("description_font_weight", "description-font-weight", "400", ""),
    ("description_text", "description-text", "#ffffff", ""),
    ("description_margin_top", "description-margin-top", "2px", "px"),
    ("description_text_transform", "description-text-transform", "none", ""),
    ("brand_part_font_size", "brand-part-font-size", "20px", "px"),
    ("brand_part_align", "brand-part-align", "center", ""),
    ("brand_logo_opacity", "brand-logo-opacity", "0.8", ""),
    ("brand_logo_width", "brand-logo-width", "46px", "px"),
    ("brand_logo_height", "brand-logo-height", "32px", "px"),
    ("brand_logo_right", "brand-logo-right", "10px", "px"),
    ("header_font_family", "header-font-family", "D-DIN-PRO, Helvetica, sans-serif", ""),
    ("header_font_size", "header-font-size", "20px", "px"),
    ("header_font_weight", "header-font-weight", "600", ""),
    ("header_padding_y", "header-padding-y", "1px", "px"),
    ("header_padding_x", "header-padding-x", "5px", "px"),
    ("header_text_transform", "header-text-transform", "uppercase", ""),
    ("header_align", "header-align", "center", ""),
    ("model_header_align", "model-header-align", "var(--header-align)", ""),
    ("year_header_align", "year-header-align", "var(--header-align)", ""),
    ("type_header_align", "type-header-align", "var(--header-align)", ""),
    ("cab_header_align", "cab-header-align", "var(--header-align)", ""),
    ("bed_header_align", "bed-header-align", "var(--header-align)", ""),
    ("size_header_align", "size-header-align", "var(--header-align)", ""),
    ("cell_font_family", "cell-font-family", "D-DIN-PRO, Helvetica, sans-serif", ""),
    ("cell_font_size", "cell-font-size", "18px", "px"),
    ("cell_font_weight", "cell-font-weight", "400", ""),
    ("badge_font_family", "badge-font-family", "D-DIN-PRO, Helvetica, sans-serif", ""),
    ("badge_font_size", "badge-font-size", "18px", "px"),
    ("badge_font_weight", "badge-font-weight", "900", ""),
    ("badge_letter_spacing", "badge-letter-spacing", "0", ""),
    ("fit_text_min_font_size", "fit-text-min-font-size", "7px", "px"),
    ("size_badge_width", "size-badge-width", "100%", ""),
    ("size_badge_min_width", "size-badge-min-width", "0", "px"),
    ("size_badge_height", "size-badge-height", "100%", ""),
    ("size_badge_min_height", "size-badge-min-height", "18px", "px"),
    ("size_badge_padding_y", "size-badge-padding-y", "0", "px"),
    ("size_badge_padding_x", "size-badge-padding-x", "1px", "px"),
    ("size_badge_radius", "size-badge-radius", "3px", "px"),
    ("size_badge_background", "size-badge-background", "#6b7280", ""),
    ("size_badge_text_color", "size-badge-text-color", "#ffffff", ""),
    ("size_badge_shadow", "size-badge-shadow", "inset 0 -2px 1px rgba(48, 48, 48, 0.22)", ""),
    ("size_a_background", "size-a-background", "#1777c8", ""),
    ("size_c_background", "size-c-background", "#d62828", ""),
    ("size_h_background", "size-h-background", "#00a6a6", ""),
    ("size_s_background", "size-s-background", "#f28c28", ""),
    ("size_other_background", "size-other-background", "#6b7280", ""),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a TSV vehicle fitment table into brand-grouped HTML."
    )
    parser.add_argument(
        "input",
        type=Path,
        nargs="?",
        default=None,
        help="Input TSV file path. If only a file name is passed, data/input is checked too.",
    )
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=None,
        help="Output HTML file path. Defaults to data/output/<input-stem>/output.html.",
    )
    parser.add_argument(
        "--output",
        dest="output_option",
        type=Path,
        default=None,
        help="Output HTML base path. Overrides the optional positional output path.",
    )
    parser.add_argument(
        "--non-pickup-input",
        type=Path,
        default=None,
        help="Non-pickup TSV path for combined output.",
    )
    parser.add_argument(
        "--pickup-input",
        type=Path,
        default=None,
        help="Pickup TSV path for combined output.",
    )
    parser.add_argument(
        "--order",
        default="non-pickup,pickup",
        help="Combined output order: non-pickup,pickup or pickup,non-pickup.",
    )
    parser.add_argument(
        "--profile-page-mode",
        choices=("same-page", "new-page"),
        default="same-page",
        help="When combined inputs switch between non-pickup and pickup, continue on the same page or start a new page. Default: same-page.",
    )
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
        "--page-padding-px",
        type=int,
        default=14,
        help="Base page padding in pixels. Default: 14.",
    )
    parser.add_argument(
        "--page-bottom-safe-margin-px",
        type=int,
        default=0,
        help="Bottom safety margin reserved during pagination. Default: 0.",
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
        "--line-height",
        type=float,
        default=1.0,
        help="Line height used by generated pages. Default: 1.",
    )
    parser.add_argument(
        "--brand-title-height-px",
        type=int,
        default=38,
        help="Legacy option. Brand title height is now estimated from font line height plus make_padding_y.",
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
        "--table-cell-bottom-safe-padding-px",
        type=int,
        default=0,
        help="Legacy option. Default: 0; row height is controlled by --table-row-height-px.",
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
        "--with-null-size",
        action="store_true",
        help="Keep rows whose BACKSIZE is 无可用尺码. By default those rows are filtered out.",
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


def read_css_variables(path: Path) -> dict[str, str]:
    variables: dict[str, str] = {}
    if not path.exists():
        return variables

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if "--" not in line or ":" not in line or ";" not in line:
            continue
        name_part, value_part = line.split(":", 1)
        name = name_part.strip()
        if not name.startswith("--"):
            continue
        value = value_part.split(";", 1)[0].strip()
        variables[name[2:]] = value
    return variables


def css_number(variables: dict[str, str], name: str, default: float) -> float:
    import re

    value = variables.get(name)
    if value is None:
        return default
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    if not match:
        return default
    return float(match.group(0))


def css_int(variables: dict[str, str], name: str, default: int) -> int:
    return round(css_number(variables, name, default))


def css_value_from_config(config: dict[str, str], key: str, default: str, unit: str) -> str:
    value = config.get(key, "").strip()
    if not value and key == "make_padding_y":
        value = config.get("brand_padding_y", "").strip()
    if not value:
        value = default
    if unit and value.replace(".", "", 1).lstrip("-").isdigit():
        return f"{value}{unit}"
    return value


def profile_config_prefixes(profile_key: str) -> list[str]:
    normalized = profile_key.replace("-", "_")
    aliases = {
        "non_pickup": ["non_pickup_", "nonpick_"],
        "pickup": ["pickup_", "pick_"],
    }
    return aliases.get(normalized, [f"{normalized}_"])


def profile_config_values(config: dict[str, str], profile_key: str, key: str) -> list[str]:
    values = []
    for prefix in profile_config_prefixes(profile_key):
        value = config.get(f"{prefix}{key}", "").strip()
        if value:
            values.append(value)
    return values


def css_variables_from_config(config: dict[str, str]) -> dict[str, str]:
    return {
        css_name: css_value_from_config(config, key, default, unit)
        for key, css_name, default, unit in CSS_CONFIG
    }


def config_for_profile(config: dict[str, str], profile_key: str) -> dict[str, str]:
    merged = dict(config)
    for prefix in reversed(profile_config_prefixes(profile_key)):
        for key, value in config.items():
            if key.startswith(prefix):
                merged[key[len(prefix) :]] = value
    return merged


def write_chart_css(path: Path, config: dict[str, str]) -> None:
    lines = [
        ":root {",
        "  /* Generated from prefer.yaml. Edit prefer.yaml, then regenerate HTML. */",
    ]
    for key, css_name, default, unit in CSS_CONFIG:
        value = css_value_from_config(config, key, default, unit)
        lines.append(f"  --{css_name}: {value};")
    lines.append("}")
    for profile_key, class_name in (
        ("non_pickup", "profile-non-pickup"),
        ("pickup", "profile-pickup"),
    ):
        scoped_lines = []
        for key, css_name, default, unit in CSS_CONFIG:
            scoped_value = next(iter(profile_config_values(config, profile_key, key)), "")
            if scoped_value:
                scoped_lines.append(
                    f"  --{css_name}: {css_value_from_config({key: scoped_value}, key, default, unit)};"
                )
        if scoped_lines:
            lines.append("")
            lines.append(f".{class_name} {{")
            lines.extend(scoped_lines)
            lines.append("}")
    lines.append("")
    lines.append(CHART_CSS)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def apply_cli_css_overrides(config: dict[str, str], args: argparse.Namespace) -> dict[str, str]:
    merged = dict(config)
    cli_options = {item.split("=", 1)[0] for item in sys.argv[1:] if item.startswith("--")}
    mapping = {
        "--page-width-px": ("page_width_px", args.page_width_px),
        "--page-height-px": ("page_height_px", args.page_height_px),
        "--page-padding-px": ("page_padding_px", args.page_padding_px),
        "--columns": ("chart_columns", args.columns),
    }
    for option, (key, value) in mapping.items():
        if option in cli_options:
            merged[key] = str(value)
    return merged


def apply_config(args: argparse.Namespace) -> argparse.Namespace:
    config = apply_cli_css_overrides(read_flat_yaml(args.config_path), args)
    cli_options = set()
    for item in sys.argv[1:]:
        if item.startswith("--"):
            cli_options.add(item.split("=", 1)[0])

    mapping = {
        "page_bottom_safe_margin_px": (
            "page_bottom_safe_margin_px",
            "--page-bottom-safe-margin-px",
            int,
        ),
        "max_rows": ("max_rows", "--max-rows", int),
        "min_rows_per_brand_chunk": (
            "min_rows_per_brand_chunk",
            "--min-rows-per-brand-chunk",
            int,
        ),
        "line_height": ("line_height", "--line-height", float),
        "table_row_height_px": ("table_row_height_px", "--table-row-height-px", int),
        "make_height_px": ("brand_title_height_px", "--brand-title-height-px", int),
        "header_height_px": ("table_header_height_px", "--table-header-height-px", int),
        "brand_block_gap_px": ("table_gap_px", "--table-gap-px", int),
        "title": ("title", "--title", str),
        "subtitle": ("subtitle", "--subtitle", str),
        "brand_column": ("brand_column", "--brand-column", str),
        "stripe_column": ("stripe_column", "--stripe-column", str),
    }

    for key, (attr, option, caster) in mapping.items():
        if key in config and option not in cli_options and config[key] != "":
            setattr(args, attr, caster(config[key]))

    if "table_columns" in config and "--table-columns" not in cli_options and config["table_columns"]:
        args.table_columns = config["table_columns"]

    if "profile_page_mode" in config and "--profile-page-mode" not in cli_options:
        profile_page_mode = config["profile_page_mode"].strip()
        if profile_page_mode not in {"same-page", "new-page"}:
            raise ValueError("profile_page_mode must be same-page or new-page.")
        args.profile_page_mode = profile_page_mode

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


def parse_column_sources(value: str) -> list[str]:
    return [item for item in re.split(r"[\s,]+", value.strip()) if item]


def configured_column_sources(
    config: dict[str, str],
    profile_key: str,
    target_column: str,
    defaults: list[str],
) -> list[str]:
    key = f"{target_column.lower()}_column"
    value = next(iter(profile_config_values(config, profile_key, key)), "")
    if not value:
        value = config.get(key, "").strip()
    if value:
        return parse_column_sources(value)
    return defaults


def configured_column_source_value(
    config: dict[str, str],
    profile_key: str,
    target_column: str,
) -> str:
    key = f"{target_column.lower()}_column"
    value = next(iter(profile_config_values(config, profile_key, key)), "")
    if value:
        return value
    return config.get(key, "").strip()


def apply_column_sources(
    rows: list[dict[str, str]],
    input_columns: set[str],
    column_sources: dict[str, list[str]],
) -> set[str]:
    normalized_columns = set(input_columns)
    for target_column, sources in column_sources.items():
        if not any(source in input_columns for source in sources):
            continue
        normalized_columns.add(target_column)
        for row in rows:
            for source in sources:
                value = row.get(source, "").strip()
                if value:
                    row[target_column] = value
                    break
            else:
                row[target_column] = ""
    return normalized_columns


def missing_configured_source_columns(
    config: dict[str, str],
    profile_key: str,
    input_columns: set[str],
    target_columns: Iterable[str],
) -> list[str]:
    missing: list[str] = []
    for target_column in target_columns:
        value = configured_column_source_value(config, profile_key, target_column)
        if not value:
            continue
        for source in parse_column_sources(value):
            if source not in input_columns and source not in missing:
                missing.append(source)
    return missing


def filter_null_size_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        row
        for row in rows
        if row.get("BACKSIZE", "").strip() != NULL_SIZE_BACKSIZE
    ]


def group_by_brand(rows: Iterable[dict[str, str]], brand_column: str) -> OrderedDict[str, list[dict[str, str]]]:
    grouped: OrderedDict[str, list[dict[str, str]]] = OrderedDict()
    for row in rows:
        brand = row.get(brand_column, "").strip()
        if not brand:
            brand = "UNKNOWN"
        grouped.setdefault(brand, []).append(row)
    return grouped


def detect_input_profile(input_columns: set[str]) -> tuple[str, str, list[str]]:
    non_pickup_required = {
        "CAR",
        "MAKE",
        "MODEL",
        "YEAR",
        "VERSION",
        "CONST",
        "BACKSIZE",
        "TYPE",
        "SIZE",
    }
    pickup_required = {
        "TITLE",
        "DESCRIPTION",
        "CAR",
        "MAKE",
        "MODEL",
        "YEAR",
        "VERSION",
        "CAB",
        "BED",
        "BACKSIZE",
        "SIZE",
    }

    if non_pickup_required.issubset(input_columns):
        return "non-pickup", "MAKE", NON_PICKUP_COLUMNS
    if pickup_required.issubset(input_columns):
        return "pickup", "TITLE", PICKUP_COLUMNS
    return "generic", "BRAND", DEFAULT_COLUMNS


def column_sources_for_profile(config: dict[str, str], profile_key: str) -> dict[str, list[str]]:
    defaults = DEFAULT_COLUMN_SOURCES.get(profile_key, {})
    return {
        target_column: configured_column_sources(config, profile_key, target_column, sources)
        for target_column, sources in defaults.items()
    }


def detect_profile_with_sources(
    rows: list[dict[str, str]],
    input_columns: set[str],
    config: dict[str, str],
    forced_profile: str | None,
) -> tuple[set[str], str, str, list[str]]:
    if forced_profile:
        profile_key = forced_profile.replace("-", "_")
        normalized_columns = apply_column_sources(
            rows,
            input_columns,
            column_sources_for_profile(config, profile_key),
        )
        detected_brand_column, detected_table_columns = PROFILE_DEFAULT_FIELDS.get(
            profile_key,
            ("BRAND", DEFAULT_COLUMNS),
        )
        return normalized_columns, forced_profile, detected_brand_column, detected_table_columns

    detected_profile, detected_brand_column, detected_table_columns = detect_input_profile(input_columns)
    if detected_profile != "generic":
        profile_key = detected_profile.replace("-", "_")
        normalized_columns = apply_column_sources(
            rows,
            input_columns,
            column_sources_for_profile(config, profile_key),
        )
        return normalized_columns, detected_profile, detected_brand_column, detected_table_columns

    non_pickup_columns = apply_column_sources(
        rows,
        input_columns,
        column_sources_for_profile(config, "non_pickup"),
    )
    detected_profile, detected_brand_column, detected_table_columns = detect_input_profile(non_pickup_columns)
    if detected_profile == "non-pickup":
        return non_pickup_columns, detected_profile, detected_brand_column, detected_table_columns

    return input_columns, "generic", "BRAND", DEFAULT_COLUMNS


def missing_columns(input_columns: set[str], required_columns: Iterable[str]) -> list[str]:
    return [column for column in required_columns if column not in input_columns]


def css_class_for_size(value: str) -> str:
    first = value[:1].upper()
    if first in {"A", "C", "H", "S"}:
        return f"size-{first.lower()}"
    return "size-other"


def css_class_for_column(column: str) -> str:
    cleaned = "".join(character.lower() if character.isalnum() else "-" for character in column)
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return f"col-{cleaned or 'field'}"


def is_enabled_config(value: str, default: bool = True) -> bool:
    if not value:
        return default
    return value.strip().lower() in {"true", "yes", "1", "on"}


def normalize_logo_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def logo_keys_from_stem(stem: str) -> list[str]:
    keys = []
    base = re.sub(r"[_\-\s]+\d+$", "", stem.strip())
    for value in (stem, base):
        key = normalize_logo_key(value)
        if key and key not in keys:
            keys.append(key)
    return keys


def resolve_logo_dir(config: dict[str, str]) -> Path:
    configured = config.get("brand_logo_dir", "img_logos").strip() or "img_logos"
    path = Path(configured)
    if not path.is_absolute():
        path = script_root() / path
    return path


def build_brand_logo_map(config: dict[str, str], output_dir: Path) -> dict[str, str]:
    if not is_enabled_config(config.get("brand_logo_enabled", "true"), True):
        return {}
    logo_dir = resolve_logo_dir(config)
    if not logo_dir.exists():
        return {}

    logo_map: dict[str, str] = {}
    for logo_path in sorted(logo_dir.iterdir()):
        if not logo_path.is_file() or logo_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
            continue
        rel_path = os.path.relpath(logo_path, output_dir).replace(os.sep, "/")
        rel_url = quote(rel_path, safe="/._-()")
        for key in logo_keys_from_stem(logo_path.stem):
            logo_map.setdefault(key, rel_url)
    return logo_map


def logo_for_brand(brand: str, logo_map: dict[str, str]) -> str:
    if not logo_map:
        return ""
    key = normalize_logo_key(brand)
    if key in logo_map:
        return logo_map[key]
    for logo_key in sorted(logo_map, key=len, reverse=True):
        if key.startswith(logo_key):
            return logo_map[logo_key]
    return ""


def page_table_counts(pages: list[list[list[dict[str, object]]]]) -> list[int]:
    return [sum(len(column) for column in page) for page in pages]


def unique_page_brands(pages: list[list[list[dict[str, object]]]]) -> list[str]:
    brands = []
    seen = set()
    for page in pages:
        for column in page:
            for table in column:
                brand = str(table["brand"])
                key = brand.upper()
                if key not in seen:
                    seen.add(key)
                    brands.append(brand)
    return brands


def write_generation_log(
    path: Path,
    args: argparse.Namespace,
    config: dict[str, str],
    input_summaries: list[dict[str, object]],
    pages: list[list[list[dict[str, object]]]],
    logo_map: dict[str, str],
) -> None:
    brands = unique_page_brands(pages)
    logo_enabled = is_enabled_config(config.get("brand_logo_enabled", "true"), True)
    logo_dir = resolve_logo_dir(config)
    logo_matches = [(brand, logo_for_brand(brand, logo_map)) for brand in brands]
    matched = [(brand, logo) for brand, logo in logo_matches if logo]
    missing = [brand for brand, logo in logo_matches if not logo]
    counts = page_table_counts(pages)

    lines = [
        "Size chart generation log",
        f"Generated at: {datetime.now().isoformat(timespec='seconds')}",
        f"Config: {args.config_path}",
        f"Output directory: {path.parent}",
        f"CSS: {path.parent / 'size-chart.css'}",
        f"Pages: {len(pages)}",
        f"Table chunks: {sum(counts)}",
        f"Unique titles: {len(brands)}",
        f"Page table chunks: {', '.join(str(count) for count in counts)}",
        "",
        "Inputs:",
    ]
    for summary in input_summaries:
        lines.extend(
            [
                f"- {summary['path']}",
                f"  Profile: {summary['profile']}",
                f"  Rows after filtering: {summary['rows']}",
                f"  Titles: {summary['brands']}",
                f"  Brand column: {summary['brand_column']}",
                f"  Stripe column: {summary['stripe_column']}",
                f"  Table columns: {', '.join(summary['table_columns'])}",
            ]
        )

    lines.extend(
        [
            "",
            "Logo settings:",
            f"Enabled: {logo_enabled}",
            f"Directory: {logo_dir}",
            f"Logo files indexed: {len(set(logo_map.values()))}",
            f"Matched titles: {len(matched)}",
            f"Missing titles: {len(missing)}",
            "",
            "Logo matches:",
        ]
    )
    for brand, logo in logo_matches:
        status = "MATCH" if logo else "MISSING"
        detail = f" -> {logo}" if logo else ""
        lines.append(f"- {status}: {brand}{detail}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


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
    description: str,
    profile_class: str,
    rows: list[dict[str, str]],
    table_columns: list[str],
    part_number: int,
    total_parts: int,
    logo_map: dict[str, str],
) -> str:
    title_text = html.escape(brand.upper())
    if total_parts > 1:
        title_text = f'{title_text} <span class="brand-part">{part_number}/{total_parts}</span>'
    title = f'<span class="brand-title-main">{title_text}</span>'
    if description:
        title = f'{title}<span class="brand-title-description">{html.escape(description)}</span>'
    logo_src = logo_for_brand(brand, logo_map)
    logo_class = " has-brand-logo" if logo_src else ""
    if logo_src:
        title = (
            f'{title}<img class="brand-title-logo" src="{html.escape(logo_src)}" '
            f'alt="{html.escape(brand)} logo" loading="eager">'
        )

    header_cells = "\n".join(
        f'          <th class="{css_class_for_column(column)}">{html.escape(column)}</th>'
        for column in table_columns
    )
    body_rows = []
    for row in rows:
        row_class = html.escape(row.get("__MODEL_STRIPE_CLASS", ""))
        cells = []
        for column in table_columns:
            value = row.get(column, "")
            escaped = html.escape(value)
            column_class = css_class_for_column(column)
            if column.upper() == "SIZE" and value:
                klass = css_class_for_size(value)
                cells.append(
                    f'          <td class="{column_class} size-cell"><span class="size-badge {klass}"><span class="fit-text">{escaped}</span></span></td>'
                )
            else:
                cells.append(f'          <td class="{column_class}"><span class="cell-fit fit-text">{escaped}</span></td>')
        body_rows.append(f'        <tr class="{row_class}">\n' + "\n".join(cells) + "\n        </tr>")

    section_class = f"brand-table {html.escape(profile_class)}".strip()
    return f"""    <section class="{section_class}">
      <h2 class="{logo_class.strip()}">{title}</h2>
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


def estimated_text_lines(text: str, font_size: int, inner_width: float) -> int:
    average_char_width = font_size * 0.62
    chars_per_line = max(1, int(inner_width // max(1, average_char_width)))
    return max(1, (len(text.upper()) + chars_per_line - 1) // chars_per_line)


def estimated_brand_title_height(brand: str, description: str, args: argparse.Namespace) -> int:
    font_size = max(1, getattr(args, "brand_title_font_size_px", 25))
    description_font_size = max(1, getattr(args, "description_font_size_px", 14))
    description_margin_top = max(0, getattr(args, "description_margin_top_px", 2))
    padding_y = max(0, getattr(args, "brand_title_padding_y_px", 5))
    padding_x = max(0, getattr(args, "brand_title_padding_x_px", 10))
    line_height = max(0.1, args.line_height)
    page_width = max(1, getattr(args, "page_width_px", 2000))
    page_padding = max(0, getattr(args, "page_padding_px", 14))
    columns = max(1, getattr(args, "columns", 1))
    column_gap = max(0, getattr(args, "column_gap_px", 0))
    column_width = max(1, (page_width - (2 * page_padding) - ((columns - 1) * column_gap)) / columns)
    inner_width = max(1, column_width - (2 * padding_x))
    title_lines = estimated_text_lines(brand, font_size, inner_width)
    title_height = font_size * line_height * title_lines
    if not description:
        return round(title_height + (2 * padding_y))
    description_lines = estimated_text_lines(description, description_font_size, inner_width)
    description_height = (description_font_size * line_height * description_lines) + description_margin_top
    return round(title_height + description_height + (2 * padding_y))


def table_height(brand: str, description: str, row_count: int, args: argparse.Namespace) -> int:
    return (
        estimated_brand_title_height(brand, description, args)
        + args.table_header_height_px
        + (row_count * args.table_row_height_px)
        + args.table_gap_px
    )


def max_rows_per_column(args: argparse.Namespace) -> int:
    base_height = estimated_brand_title_height("", "", args) + args.table_header_height_px + args.table_gap_px
    rows_by_height = max(1, (args.page_content_height_px - base_height) // max(1, args.table_row_height_px))
    if args.max_rows > 0:
        return min(rows_by_height, args.max_rows)
    return rows_by_height


def max_rows_for_available_height(args: argparse.Namespace, available_height: int) -> int:
    base_height = estimated_brand_title_height("", "", args) + args.table_header_height_px + args.table_gap_px
    rows_by_height = max(0, (available_height - base_height) // max(1, args.table_row_height_px))
    if args.max_rows > 0 and rows_by_height > 0:
        return min(rows_by_height, args.max_rows)
    return rows_by_height


def paginate_tables(
    grouped: OrderedDict[str, list[dict[str, str]]],
    args: argparse.Namespace,
    stripe_column: str,
    table_columns: list[str],
    profile_key: str,
    state: dict[str, object] | None = None,
) -> dict[str, object]:
    safe_columns = max(1, args.columns)
    max_height = max(1, args.page_content_height_px)
    if state is None:
        state = {
            "pages": [[[] for _ in range(safe_columns)]],
            "heights": [[0 for _ in range(safe_columns)]],
            "page_index": 0,
            "column_index": 0,
        }
    pages = state["pages"]  # type: ignore[assignment]
    heights = state["heights"]  # type: ignore[assignment]
    page_index = int(state["page_index"])
    column_index = int(state["column_index"])
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
        description = brand_rows[0].get("DESCRIPTION", "").strip() if brand_rows else ""
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
                and offset > 0
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
            height = table_height(brand, description, len(part_rows), args)

            chunk = {
                "brand": brand,
                "description": description,
                "rows": part_rows,
                "table_columns": table_columns,
                "profile_class": f"profile-{profile_key.replace('_', '-')}",
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

    state["page_index"] = page_index
    state["column_index"] = column_index
    return state


def start_new_page(state: dict[str, object], columns: int) -> dict[str, object]:
    safe_columns = max(1, columns)
    pages = state["pages"]  # type: ignore[assignment]
    heights = state["heights"]  # type: ignore[assignment]
    page_index = int(state["page_index"])
    current_page_has_content = any(heights[page_index])  # type: ignore[index]
    if current_page_has_content:
        pages.append([[] for _ in range(safe_columns)])
        heights.append([0 for _ in range(safe_columns)])
        state["page_index"] = page_index + 1
    state["column_index"] = 0
    return state


def render_html(
    page: list[list[dict[str, object]]],
    layout_columns: int,
    title: str,
    subtitle: str,
    show_title: bool,
    css_href: str,
    line_height: float,
    table_row_height_px: int,
    header_height_px: int,
    brand_block_gap_px: int,
    page_number: int,
    logo_map: dict[str, str],
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
                    str(table.get("description", "")),
                    str(table.get("profile_class", "")),
                    table["rows"],  # type: ignore[arg-type]
                    table["table_columns"],  # type: ignore[arg-type]
                    int(table["part_number"]),
                    int(table["total_parts"]),
                    logo_map,
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
<body style="--page-line-height: {line_height:g}; --table-row-height: {table_row_height_px}px; --table-header-height: {header_height_px}px; --brand-block-gap: {brand_block_gap_px}px;">
  <aside class="{title_class}">
    <h1>{html.escape(title)}</h1>
    <p>{html.escape(subtitle)}</p>
  </aside>
  <main class="chart-page" data-page="{page_number}">
    <div class="chart-columns">
{chr(10).join(column_blocks)}
    </div>
  </main>
  <script>
  (function () {{
    function numberFromCss(name, fallback) {{
      var raw = getComputedStyle(document.documentElement).getPropertyValue(name);
      var match = raw && raw.match(/-?\\d+(?:\\.\\d+)?/);
      return match ? parseFloat(match[0]) : fallback;
    }}

    function fitText(element) {{
      var computed = getComputedStyle(element);
      var maxSize = parseFloat(element.dataset.maxFontSize || computed.fontSize) || 12;
      var minSize = numberFromCss("--fit-text-min-font-size", 7);
      element.style.fontSize = "";
      element.style.whiteSpace = "nowrap";
      if (element.scrollWidth <= element.clientWidth) {{
        return;
      }}
      element.style.fontSize = maxSize + "px";
      var size = maxSize;
      while (size > minSize && element.scrollWidth > element.clientWidth) {{
        size -= 0.25;
        element.style.fontSize = size + "px";
      }}
    }}

    function run() {{
      document.querySelectorAll(".fit-text").forEach(fitText);
    }}

    if (document.readyState === "loading") {{
      document.addEventListener("DOMContentLoaded", run);
    }} else {{
      run();
    }}
    window.addEventListener("load", run);
  }})();
  </script>
</body>
</html>
"""


def prepare_css_file(output_path: Path, config: dict[str, str]) -> tuple[Path, str]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    css_path = output_path.parent / "size-chart.css"
    write_chart_css(css_path, config)
    return css_path, css_path.name


def script_root() -> Path:
    return Path(__file__).resolve().parent


def resolve_input_path(input_path: Path) -> Path:
    if input_path.exists():
        return input_path
    if not input_path.is_absolute() and input_path.parent == Path("."):
        candidate = script_root() / "data" / "input" / input_path
        if candidate.exists():
            return candidate
    return input_path


def default_output_path(input_path: Path) -> Path:
    return script_root() / "data" / "output" / input_path.stem / "output.html"


def default_combined_output_path(input_paths: list[Path]) -> Path:
    stem = "-".join(path.stem for path in input_paths if path.stem) or "combined"
    return script_root() / "data" / "output" / stem / "output.html"


def normalize_profile_key(profile_name: str) -> str:
    cleaned = profile_name.strip().lower().replace("_", "-")
    aliases = {
        "nonpick": "non-pickup",
        "non-pickup": "non-pickup",
        "nonpickup": "non-pickup",
        "pickup": "pickup",
        "pick": "pickup",
    }
    if cleaned not in aliases:
        raise ValueError(f"Unknown profile/order value: {profile_name}")
    return aliases[cleaned]


def combined_input_specs(args: argparse.Namespace) -> list[tuple[Path, str | None]]:
    specs_by_profile: dict[str, Path] = {}
    if args.non_pickup_input is not None:
        specs_by_profile["non-pickup"] = args.non_pickup_input
    if args.pickup_input is not None:
        specs_by_profile["pickup"] = args.pickup_input

    if specs_by_profile:
        order = [normalize_profile_key(item) for item in args.order.split(",") if item.strip()]
        if not order:
            raise ValueError("--order must contain at least one profile.")
        missing = [profile for profile in order if profile not in specs_by_profile]
        if missing:
            raise ValueError(
                "Missing input(s) for order item(s): "
                + ", ".join(missing)
                + ". Pass --non-pickup-input and/or --pickup-input."
            )
        return [(specs_by_profile[profile], profile) for profile in order]

    if args.input is None:
        raise ValueError("Pass an input TSV, or use --non-pickup-input/--pickup-input.")
    return [(args.input, None)]


def configured_field(
    config: dict[str, str],
    profile_key: str,
    key: str,
    global_default: str,
    detected_default: str,
) -> str:
    prefixed = next(iter(profile_config_values(config, profile_key, key)), "")
    if prefixed:
        return prefixed
    global_value = config.get(key, "").strip()
    if global_value:
        return global_value
    return detected_default or global_default


def apply_layout_from_config(args: argparse.Namespace, config: dict[str, str]) -> argparse.Namespace:
    css_vars = css_variables_from_config(config)
    args.page_width_px = css_int(css_vars, "page-width", args.page_width_px)
    args.page_height_px = css_int(css_vars, "page-height", args.page_height_px)
    args.page_padding_px = css_int(css_vars, "page-padding", args.page_padding_px)
    args.columns = css_int(css_vars, "chart-columns", args.columns)
    args.column_gap_px = css_int(css_vars, "column-gap", 10)
    args.page_padding_px = max(0, args.page_padding_px)
    args.page_bottom_safe_margin_px = max(0, args.page_bottom_safe_margin_px)
    args.page_content_height_px = max(
        1,
        args.page_height_px - (2 * args.page_padding_px) - args.page_bottom_safe_margin_px,
    )
    return args


def args_for_profile(args: argparse.Namespace, config: dict[str, str], profile_key: str) -> argparse.Namespace:
    profile_args = copy.copy(args)
    profile_config = config_for_profile(config, profile_key)
    css_vars = css_variables_from_config(profile_config)
    profile_args.line_height = max(0.1, css_number(css_vars, "page-line-height", profile_args.line_height))
    profile_args.table_row_height_px = max(1, css_int(css_vars, "table-row-height", profile_args.table_row_height_px))
    profile_args.table_header_height_px = max(
        1,
        css_int(css_vars, "table-header-height", profile_args.table_header_height_px),
    )
    profile_args.table_gap_px = max(0, css_int(css_vars, "brand-block-gap", profile_args.table_gap_px))
    profile_args.brand_title_font_size_px = css_int(css_vars, "make-font-size", 25)
    profile_args.description_font_size_px = css_int(css_vars, "description-font-size", 14)
    profile_args.description_margin_top_px = css_int(css_vars, "description-margin-top", 2)
    profile_args.brand_title_padding_y_px = css_int(css_vars, "brand-padding-y", 5)
    profile_args.brand_title_padding_x_px = css_int(css_vars, "brand-padding-x", 10)
    return profile_args


def main() -> None:
    args = apply_config(parse_args())
    if args.output_option is not None:
        args.output = args.output_option

    input_specs = [(resolve_input_path(path), profile) for path, profile in combined_input_specs(args)]
    if args.output is None:
        args.output = (
            default_combined_output_path([path for path, _profile in input_specs])
            if len(input_specs) > 1
            else default_output_path(input_specs[0][0])
        )

    config = apply_cli_css_overrides(read_flat_yaml(args.config_path), args)
    css_path, css_href = prepare_css_file(args.output, config)
    logo_map = build_brand_logo_map(config, args.output.parent)
    args = apply_layout_from_config(args, config)
    cli_options = {item.split("=", 1)[0] for item in sys.argv[1:] if item.startswith("--")}

    state: dict[str, object] | None = None
    input_summaries: list[dict[str, object]] = []
    for input_path, forced_profile in input_specs:
        rows = read_tsv(input_path)
        source_input_columns = set(rows[0].keys()) if rows else set()
        input_columns = set(source_input_columns)
        if not args.with_null_size:
            rows = filter_null_size_rows(rows)
        if not rows:
            continue
        input_columns, profile_name, detected_brand_column, detected_table_columns = detect_profile_with_sources(
            rows,
            input_columns,
            config,
            forced_profile,
        )
        profile_key = profile_name.replace("-", "_")

        brand_column = (
            args.brand_column
            if "--brand-column" in cli_options
            else configured_field(config, profile_key, "brand_column", "BRAND", detected_brand_column)
        )
        table_columns_text = (
            args.table_columns
            if "--table-columns" in cli_options
            else configured_field(
                config,
                profile_key,
                "table_columns",
                ",".join(DEFAULT_COLUMNS),
                ",".join(detected_table_columns),
            )
        )
        stripe_column_config = (
            args.stripe_column
            if "--stripe-column" in cli_options
            else configured_field(config, profile_key, "stripe_column", "", "")
        )

        table_columns = [column.strip() for column in table_columns_text.split(",") if column.strip()]
        if not table_columns:
            raise ValueError(f"table_columns must contain at least one column for {input_path}.")
        stripe_column = choose_stripe_column(rows, stripe_column_config)
        missing_sources = missing_configured_source_columns(
            config,
            profile_key,
            source_input_columns,
            [brand_column, *table_columns],
        )
        if missing_sources:
            raise ValueError(
                f"{input_path} is missing configured source column(s): {', '.join(missing_sources)}"
            )
        missing = missing_columns(input_columns, [brand_column, *table_columns, stripe_column])
        if missing:
            raise ValueError(
                f"{input_path} is missing required column(s): {', '.join(missing)}"
            )

        profile_args = args_for_profile(args, config, profile_key)
        grouped = group_by_brand(rows, brand_column)
        input_summaries.append(
            {
                "path": input_path,
                "profile": profile_name,
                "rows": len(rows),
                "brands": len(grouped),
                "brand_column": brand_column,
                "stripe_column": stripe_column,
                "table_columns": table_columns,
            }
        )
        if state is not None and args.profile_page_mode == "new-page":
            state = start_new_page(state, profile_args.columns)
        state = paginate_tables(
            grouped,
            profile_args,
            stripe_column,
            table_columns,
            profile_key,
            state,
        )

    if state is None:
        raise ValueError("No input data was processed.")
    pages = state["pages"]  # type: ignore[assignment]
    suffix = args.output.suffix or ".html"
    stem = args.output.stem if args.output.suffix else args.output.name
    for stale_page in args.output.parent.glob(f"{stem}_*{suffix}"):
        stale_page.unlink()
    for index, page in enumerate(pages, start=1):
        page_path = args.output.with_name(f"{stem}_{index:03d}{suffix}")
        html_text = render_html(
            page=page,
            layout_columns=args.columns,
            title=args.title,
            subtitle=args.subtitle,
            show_title=args.show_title,
            css_href=css_href,
            line_height=max(0.1, args.line_height),
            table_row_height_px=max(1, args.table_row_height_px),
            header_height_px=max(1, args.table_header_height_px),
            brand_block_gap_px=max(0, args.table_gap_px),
            page_number=index,
            logo_map=logo_map,
        )
        page_path.write_text(html_text, encoding="utf-8")
    log_path = args.output.with_name(f"{stem}_generation.log")
    write_generation_log(log_path, args, config, input_summaries, pages, logo_map)


if __name__ == "__main__":
    main()
