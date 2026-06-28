# TSV to Size Chart HTML

把车辆尺寸 TSV 转成按品牌分组、自动分页的 HTML 尺码表。HTML 生成和图片导出都用 Python 入口。

```powershell
python .\tsv_to_size_chart_html.py
```

## 最常用命令

单个非皮卡或通用 TSV：

```powershell
python .\tsv_to_size_chart_html.py 0629-nonpick.tsv
```

只传文件名时会自动到 `data/input/` 下找文件。默认输出到：

```text
data/output/0629-nonpick/output_001.html
data/output/0629-nonpick/size-chart.css
```

指定输出位置：

```powershell
python .\tsv_to_size_chart_html.py 0629-nonpick.tsv --output .\data\output\my-chart\output.html
```

合并非皮卡和皮卡，连续分页：

```powershell
python .\tsv_to_size_chart_html.py `
  --non-pickup-input .\data\input\0629-nonpick.tsv `
  --pickup-input .\data\input\0629-pick.tsv `
  --order non-pickup,pickup `
  --config-path .\profile\combined-preference.yaml `
  --output .\data\output\0629-full\output.html
```

只生成皮卡输入时，需要把顺序也设成 pickup：

```powershell
python .\tsv_to_size_chart_html.py `
  --pickup-input .\data\input\0629-pick.tsv `
  --order pickup `
  --config-path .\profile\pickup-preference.yaml
```

导出图片：

```powershell
python .\export_html_pages_to_images.py .\data\output\0629-full\output_*.html
```

导出时指定格式、质量和位置：

```powershell
python .\export_html_pages_to_images.py `
  .\data\output\0629-full\output_*.html `
  --format jpg `
  --quality 90 `
  --output-dir .\image\0629-full
```

`--format` 可选 `jpg`、`png`、`both`。`--quality` 只影响 jpg；png 是无损截图。默认只输出 `Wrote ...`。需要检查自动缩小时，加 `--analysis-font`。

## 常用参数

`--config-path .\profile\combined-preference.yaml`

读取样式和分页配置。常用配置在 `profile/` 目录：`nonpick-preference.yaml`、`pickup-preference.yaml`、`combined-preference.yaml`。

`--output .\data\output\name\output.html`

指定输出基准路径。实际会生成 `output_001.html`、`output_002.html` 等分页文件，以及同目录下的 `size-chart.css`。

`--non-pickup-input <path>` / `--pickup-input <path>`

合并输出时分别指定非皮卡和皮卡 TSV。

`--order non-pickup,pickup`

控制合并顺序。可用 `pickup,non-pickup`，只传皮卡时用 `--order pickup`。

`--with-null-size`

默认会过滤掉 `BACKSIZE` 为 `无可用尺码` 的行。加这个参数后保留这些行。

`--table-columns MODEL,YEAR,TYPE,SIZE`

控制表格显示列。皮卡默认是 `YEAR,CAB,BED,SIZE`。

`--brand-column MAKE`

控制每个表格标题用哪一列。非皮卡默认 `MAKE`，皮卡默认 `TITLE`。

`--stripe-column MODEL`

控制交替底纹按哪一列分组。皮卡 profile 通常用 `CAB`。

`--columns 5`

每页分几栏。也可以放在 yaml 里的 `chart_columns`。

`--page-width-px 2000` / `--page-height-px 1800`

页面尺寸。通常建议写在 yaml 里，命令行只在临时调试时用。

`--table-row-height-px 25`

分页估算时的一行高度，需要和最终 CSS 视觉效果保持接近。

`--max-rows 0`

每个品牌块最多行数。`0` 表示不硬性限制，只按页面高度分页。

`--min-rows-per-brand-chunk 2`

拆分品牌块时，每段至少保留几行，避免列尾只剩孤零零一行。

## 导出图片参数

`--output-dir .\image\name`

指定图片输出目录。不传时默认输出到 `image/<HTML输出目录名>/`。

`--format jpg`

指定输出格式。可用 `jpg`、`png`、`both`，默认 `jpg`。

`--quality 90` / `--jpeg-quality 90`

指定 jpg 质量，范围 1-100，默认 100。

`--keep-png`

输出 jpg 时额外保留浏览器截图得到的 png。

`--width 2000` / `--height 1800`

指定截图尺寸。不传时读取 HTML 同目录 `size-chart.css` 里的 `--page-width` 和 `--page-height`。

`--analysis-font`

显式分析每个 HTML 页面的字体自动缩小统计，并写到图片输出目录下的 `fit-text-summary.log`。默认不做这个检查。

## 输入兼容

非皮卡默认识别这些核心列：

```text
CAR, MAKE, MODEL, YEAR, VERSION, CONST, BACKSIZE, TYPE, SIZE
```

皮卡默认识别这些核心列：

```text
TITLE, DESCRIPTION, CAR, MAKE, MODEL, YEAR, VERSION, CAB, BED, BACKSIZE, SIZE
```

额外兼容：

- `TYPE` 默认来自输入表里的 `TYPE`；只有没有 `TYPE` 列时，才 fallback 到 `LONG-TYPE`。
- `MODEL` 默认按 `SHORT-MODEL MODEL` 的顺序取值；`SHORT-MODEL` 为空时再用 `MODEL`。
- `CAB` 默认按 `SHORT-CAB CAB` 的顺序取值；`SHORT-CAB` 为空时再用 `CAB`。
- `DESCRIPTION` 会显示在皮卡标题下方的小字。

字段来源也可以在 yaml 里指定，值是从左到右的 fallback 列表：

```yaml
non_pickup_make_column: MAKE
non_pickup_model_column: SHORT-MODEL MODEL
non_pickup_type_column: TYPE LONG-TYPE
pickup_cab_column: SHORT-CAB CAB
```

没有 profile 前缀时，会作为当前单类 profile 的配置，例如 `model_column: SHORT-MODEL MODEL`。

## 常用样式配置

样式建议改 yaml，不要直接改输出目录里的 `size-chart.css`。常调项：

```yaml
page_width_px: 2000
page_height_px: 1800
chart_columns: 5
page_padding_px: 14
make_font_size: 25px
make_padding_y: 5px
description_font_size: 14px
cell_font_size: 18px
badge_font_size: 18px
table_row_height_px: 25
brand_block_gap_px: 14
```

合并 profile 里可以用 `non_pickup_` 和 `pickup_` 前缀分别覆盖配置，例如：

```yaml
non_pickup_stripe_column: MODEL
pickup_stripe_column: CAB
pickup_description_font_size: 20px
non_pickup_model_column: SHORT-MODEL MODEL
pickup_cab_column: SHORT-CAB CAB
```

## CSS 回写 YAML

如果手动调整过某个输出目录里的 `size-chart.css`，可以把 CSS 里的值合并回 yaml：

```powershell
python .\adjust_css_to_prefer_yaml.py .\data\output\0629-full\size-chart.css .\profile\combined-preference.yaml .\profile\combined-preference-updated.yaml
```

不传第三个路径时，会直接覆盖第二个 yaml。
