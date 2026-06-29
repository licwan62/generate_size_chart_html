#!/usr/bin/env python3
"""Export generated size-chart HTML pages to images."""

from __future__ import annotations

import argparse
import glob
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path


CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def quiet_subprocess_kwargs() -> dict[str, object]:
    if sys.platform != "win32":
        return {}
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = 0
    return {
        "creationflags": CREATE_NO_WINDOW,
        "startupinfo": startupinfo,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export size-chart HTML pages to images.")
    parser.add_argument("html_glob", help="HTML file glob, for example data/output/name/output_*.html.")
    parser.add_argument(
        "--output-dir",
        "-o",
        type=Path,
        default=None,
        help="Image output directory. Defaults to image/<HTML output directory name>.",
    )
    parser.add_argument(
        "--adjust-css-name",
        default="size-chart.css",
        help="CSS file name beside the HTML files. Default: size-chart.css.",
    )
    parser.add_argument("--width", type=int, default=0, help="Image width. Defaults to CSS --page-width.")
    parser.add_argument("--height", type=int, default=0, help="Image height. Defaults to CSS --page-height.")
    parser.add_argument(
        "--format",
        choices=["jpg", "jpeg", "png", "both"],
        default="jpg",
        help="Output image format. Default: jpg.",
    )
    parser.add_argument(
        "--quality",
        "--jpeg-quality",
        dest="jpeg_quality",
        type=int,
        default=100,
        help="JPEG quality, 1-100. Default: 100.",
    )
    parser.add_argument(
        "--keep-png",
        action="store_true",
        help="Keep the browser PNG screenshot when exporting JPG.",
    )
    parser.add_argument(
        "--analysis-font",
        action="store_true",
        help="Analyze auto-shrunk fit-text font sizes and write fit-text-summary.log.",
    )
    return parser.parse_args()


def script_root() -> Path:
    return Path(__file__).resolve().parent


def read_css_variables(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    variables: dict[str, str] = {}
    pattern = re.compile(r"--(?P<name>[A-Za-z0-9_-]+)\s*:\s*(?P<value>[^;]+);")
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        match = pattern.search(line)
        if match:
            variables[match.group("name")] = match.group("value").strip()
    return variables


def css_int(variables: dict[str, str], name: str, default: int) -> int:
    value = variables.get(name, "")
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    if not match:
        return default
    return round(float(match.group(0)))


def find_browser() -> Path:
    candidates = [
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    for command in ("msedge", "chrome"):
        found = shutil.which(command)
        if found:
            return Path(found)
    raise FileNotFoundError("Cannot find Microsoft Edge or Chrome executable.")


def find_node() -> Path | None:
    found = shutil.which("node")
    if found:
        return Path(found)
    candidates = [
        Path.home() / r".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
        Path.home() / r"AppData\Local\Programs\nodejs\node.exe",
        Path(r"C:\Program Files\nodejs\node.exe"),
        Path(r"C:\Program Files (x86)\nodejs\node.exe"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def default_output_dir(html_directory: Path) -> Path:
    return script_root() / "image" / html_directory.name


def resolve_html_files(pattern: str) -> list[Path]:
    files = [Path(item).resolve() for item in glob.glob(pattern)]
    return sorted((path for path in files if path.is_file()), key=lambda path: path.name)


def run_browser_screenshot(browser: Path, html_file: Path, png_path: Path, width: int, height: int) -> None:
    with tempfile.TemporaryDirectory(prefix="size-chart-browser-") as user_data_dir:
        file_url = html_file.resolve().as_uri()
        args = [
            str(browser),
            "--headless=new",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-component-update",
            "--no-first-run",
            "--no-default-browser-check",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--window-size={width},{height}",
            f"--user-data-dir={user_data_dir}",
            f"--screenshot={png_path}",
            file_url,
        ]
        result = subprocess.run(
            args,
            text=True,
            capture_output=True,
            check=False,
            **quiet_subprocess_kwargs(),
        )
        if result.returncode != 0 or not png_path.exists():
            log_text = "\n".join(part for part in (result.stdout, result.stderr) if part)
            raise RuntimeError(f"Browser screenshot failed for {html_file.name}.\n{log_text}")


def convert_png_to_jpeg(png_path: Path, jpeg_path: Path, quality: int) -> None:
    command = (
        "Add-Type -AssemblyName System.Drawing; "
        "$png=$args[0]; $jpg=$args[1]; $quality=[int]$args[2]; "
        "$bitmap=[System.Drawing.Image]::FromFile($png); "
        "try { "
        "$codec=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | "
        "Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1; "
        "$encoder=[System.Drawing.Imaging.Encoder]::Quality; "
        "$params=New-Object System.Drawing.Imaging.EncoderParameters(1); "
        "$params.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter($encoder, [long]$quality); "
        "$bitmap.Save($jpg, $codec, $params); "
        "} finally { $bitmap.Dispose() }"
    )
    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            command,
            str(png_path),
            str(jpeg_path),
            str(quality),
        ],
        text=True,
        capture_output=True,
        check=False,
        **quiet_subprocess_kwargs(),
    )
    if result.returncode != 0:
        raise RuntimeError(f"JPEG conversion failed for {png_path.name}.\n{result.stderr or result.stdout}")


def fit_text_summary(html_file: Path, browser: Path, width: int, height: int) -> dict[str, object] | None:
    node = find_node()
    summary_script = script_root() / "collect_fit_text_summary.js"
    if node is None or not summary_script.exists():
        return None
    result = subprocess.run(
        [
            str(node),
            str(summary_script),
            "--edge",
            str(browser),
            "--html",
            str(html_file),
            "--width",
            str(width),
            "--height",
            str(height),
        ],
        text=True,
        capture_output=True,
        check=False,
        **quiet_subprocess_kwargs(),
    )
    if result.returncode != 0 or not result.stdout.strip():
        return {"error": f"字体自动缩小汇总失败：{html_file.name}。"}
    return json.loads(result.stdout)


def summary_lines(html_file: Path, summary: dict[str, object] | None) -> list[str]:
    if summary is None:
        return [f"字体自动缩小汇总已跳过 {html_file.name}：未找到 Node.js 辅助环境。"]
    if "error" in summary:
        return [str(summary["error"])]

    total = int(summary.get("total", 0))
    lines = [f"字体自动缩小汇总 {html_file.name}：{total} 处"]
    if total == 0:
        return lines

    by_column = summary.get("byColumn", {})
    if isinstance(by_column, dict) and by_column:
        parts = [f"{key}={by_column[key]}" for key in sorted(by_column)]
        lines.append("  按列统计：" + ", ".join(parts))

    by_text = summary.get("byText", [])
    if isinstance(by_text, list):
        items = sorted(
            (item for item in by_text if isinstance(item, dict)),
            key=lambda item: (
                str(item.get("column", "")),
                str(item.get("text", "")),
                float(item.get("finalFontSize", 0) or 0),
            ),
        )
        for item in items:
            lines.append(
                '  {0}："{1}" x{2} -> {3}px'.format(
                    item.get("column", ""),
                    item.get("text", ""),
                    item.get("count", 0),
                    item.get("finalFontSize", ""),
                )
            )
    return lines


def main() -> None:
    args = parse_args()
    html_files = resolve_html_files(args.html_glob)
    if not html_files:
        raise ValueError(f"No HTML files matched: {args.html_glob}")

    css_variables = read_css_variables(html_files[0].parent / args.adjust_css_name)
    width = args.width if args.width > 0 else css_int(css_variables, "page-width", 2000)
    height = args.height if args.height > 0 else css_int(css_variables, "page-height", 1800)
    quality = min(100, max(1, args.jpeg_quality))
    output_format = "jpg" if args.format == "jpeg" else args.format
    output_dir = (args.output_dir or default_output_dir(html_files[0].parent)).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    log_path = output_dir / "fit-text-summary.log"
    if args.analysis_font:
        log_path.write_text(
            "\n".join(
                [
                    "字体自动缩小汇总",
                    f"生成时间：{datetime.now():%Y-%m-%d %H:%M:%S}",
                    f"HTML：{args.html_glob}",
                    f"输出格式：{output_format}",
                    f"输出尺寸：{width}x{height}",
                    f"JPEG质量：{quality}",
                    "",
                ]
            )
            + "\n",
            encoding="utf-8",
        )

    browser = find_browser()
    for html_file in html_files:
        base_name = html_file.stem
        png_path = output_dir / f"{base_name}.png"
        jpg_path = output_dir / f"{base_name}.jpg"

        run_browser_screenshot(browser, html_file, png_path, width, height)
        written_paths: list[Path] = []
        if output_format in {"jpg", "both"}:
            convert_png_to_jpeg(png_path, jpg_path, quality)
            written_paths.append(jpg_path)
        if output_format in {"png", "both"} or args.keep_png:
            written_paths.append(png_path)

        if args.analysis_font:
            lines = summary_lines(html_file, fit_text_summary(html_file, browser, width, height))
            with log_path.open("a", encoding="utf-8") as log_file:
                log_file.write("\n".join(lines) + "\n")
            for line in lines:
                print(line)

        if output_format not in {"png", "both"} and not args.keep_png:
            png_path.unlink(missing_ok=True)
        print("Wrote " + ", ".join(str(path) for path in written_paths))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
