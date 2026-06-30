# TSV to Size Chart HTML

把车辆尺寸 TSV 转成按品牌分组的分页 HTML 表格。输出目录里会有：

- `output_001.html`、`output_002.html` ...
- `size-chart.css`：由 `prefer.yaml` 生成的完整样式

## 输入格式

脚本会自动识别两种压缩 TSV 表头。

非皮卡：

```tsv
CAR	MAKE	MODEL	YEAR	VERSION	CONST	BACKSIZE	TYPE-未缩写	TYPE-字符数	TYPE	SIZE
```

默认用 `MAKE` 做表格标题，表格显示 `MODEL`、`YEAR`、`TYPE`、`SIZE`。
`TYPE` 默认来自输入表的 `TYPE`；只有没有 `TYPE` 列时，才 fallback 到 `LONG-TYPE`。
`MODEL` 默认按 `SHORT-MODEL MODEL` 的顺序取值。

皮卡：

```tsv
TITLE	DESCRIPTION	CAR	MAKE	MODEL	YEAR	VERSION	CAB	BED	BACKSIZE	SIZE
```

默认用 `TITLE` 做表格标题，表格显示 `YEAR`、`CAB`、`BED`、`SIZE`。
`CAB` 默认按 `SHORT-CAB CAB` 的顺序取值。
`DESCRIPTION` 会显示为 `TITLE` 下方的小字，可用 `description_*` 配置单独设置字体、颜色、字重和间距。

两种格式默认都按连续的 `MODEL` 交替行底纹。

## 用法

```powershell
python .\tsv_to_size_chart_html.py nonpickup-0626.tsv
```

输入文件默认放在 `data/input` 里。只传文件名时，脚本会自动读取：

```text
data\input\nonpickup-0626.tsv
```

默认输出到 `data/output/输入文件名/`：

```text
data\output\nonpickup-0626\output_001.html
data\output\nonpickup-0626\output_002.html
data\output\nonpickup-0626\size-chart.css
data\output\nonpickup-0626\output_generation.log
```

`output_generation.log` 会记录本次生成的输入文件、profile、页数、表格块数量、每页块数，以及每个 make/title 的 logo 匹配结果。

## 合并皮卡和非皮卡

可以用一个 profile 同时生成非皮卡和皮卡，分页会连续排版；前一类最后一页还有空间时，后一类会直接接上：

```powershell
python .\tsv_to_size_chart_html.py `
  --non-pickup-input .\data\input\0628-nonpick-1.tsv `
  --pickup-input .\data\input\0628-pick-1.tsv `
  --order non-pickup,pickup `
  --config-path .\profile\combined-preference.yaml `
  --output .\data\output\0628-full\output.html
```

`--order` 可以改成 `pickup,non-pickup`。`profile_page_mode: same-page` 会让两类连续排版，改成 `new-page` 会在皮卡/非皮卡切换时另起一页。

合并 profile 里可以用 `non_pickup_` 或 `pickup_` 前缀覆盖任意配置，也可以用短前缀 `nonpick_` 或 `pick_`，例如 `pick_year_col_width`、`pickup_make_background`、`pickup_description_font_size`、`nonpick_stripe_column`。没有前缀的配置作为两类共用默认值。

字段来源可以写成从左到右的 fallback 列表：

```yaml
non_pickup_make_column: MAKE
non_pickup_model_column: SHORT-MODEL MODEL
non_pickup_type_column: TYPE LONG-TYPE
pickup_cab_column: SHORT-CAB CAB
```

## 默认配置

`prefer.yaml` 是默认配置源，包含 TSV 字段、标题、分页规则、页面尺寸、颜色、字体、列宽、徽标和边框。生成脚本会按它写出 `size-chart.css`，所以默认值请改 `prefer.yaml`，不要直接改输出目录里的 `size-chart.css`。

常用视觉配置：

```yaml
page_width_px: 2000
page_height_px: 1800
chart_columns: 5
page_padding_px: 14
page_text: #111111
header_text: #f1f1f1
make_font_size: 25px
make_padding_y: 5px
description_font_size: 14px
cell_font_size: 18px
badge_font_size: 18px
table_border_width: 2px
size_badge_width: 100%
size_badge_height: 100%
```

对齐：

```yaml
brand_title_align: center
brand_part_align: center
header_align: center
```

品牌 logo：

```yaml
brand_logo_enabled: true
brand_logo_dir: img_logos
brand_logo_opacity: 0.8   # 80% 透明度
brand_logo_width: 46px
brand_logo_height: 32px
brand_logo_right: 10px
```

脚本会按 make/title 自动匹配 `img_logos` 里的图片。文件名会忽略大小写、空格、横线、下划线和末尾数字后缀；例如 `Acura.png` 匹配 `ACURA`，`Land-Rover.png` 匹配 `LAND ROVER`，`Chevrolet.png` 也能匹配 `CHEVROLET SILVERADO 1500` 这类皮卡标题。

分页和输入配置：

- `title`
- `subtitle`
- `show_title`
- `brand_column`
- `store_column`
- `stripe_column`
- `table_columns`
- `page_bottom_safe_margin_px`
- `max_rows`
- `min_rows_per_brand_chunk`
- `line_height`
- `table_row_height_px`
- `make_padding_y`
- `header_height_px`
- `brand_block_gap_px`

其中 `page_bottom_safe_margin_px` 会从页面可用高度里扣除；`max_rows: 0` 表示不限制每个品牌块的最大行数；`min_rows_per_brand_chunk` 控制换列拆块时至少保留几行。
`store_column` 用来指定店铺字段；如果输入里存在这个字段且没有显式传 `--output`，脚本会按每个输入文件和店铺值分别输出到 `data/output/输入文件名-店铺/`。
`line_height`、`table_row_height_px`、`make_padding_y`、`header_height_px`、`brand_block_gap_px` 会影响分页估算；make 标题栏不再固定高度，会由字体行高和上下 padding 自然撑开，多行标题也会自动变高。
`make/header/cell/badge` 字号是基准字号；只有某个单元格内容放不下一行时，该单元格才会自动缩小到 `--fit-text-min-font-size` 以上的合适字号。

## 从 CSS 回写 prefer

如果你已经手改了某个输出目录里的 `size-chart.css`，可以把它合并回 `prefer.yaml`。CSS 里有的值会覆盖 yaml；CSS 里没有的配置会沿用原 yaml：

```powershell
python .\adjust_css_to_prefer_yaml.py .\data\output\nonpick0628\size-chart.css .\prefer.yaml .\prefer-from-css.yaml
```

如果不传第三个路径，会直接覆盖第二个 yaml。

## 导出图片

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Export-HtmlPagesToImages.ps1 .\data\output\nonpickup-0626\output_*.html
```

导出脚本会读取 HTML 同目录下 `size-chart.css` 的 `--page-width` 和 `--page-height`。
图片默认输出到：

```text
image\nonpickup-0626\
```
