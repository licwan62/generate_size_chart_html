# TSV to Size Chart HTML

把车辆尺寸 TSV 转成按品牌分组的 HTML 表格。输出为多个分页 HTML + 一个 CSS 模板，可以直接用浏览器打开 HTML。

## 输入格式

默认要求 TSV 表头包含这些列：

```tsv
BRAND	MODEL	YEAR	TYPE	SIZE
```

`BRAND` 会作为每个表格的蓝色标题；`MODEL`、`YEAR`、`TYPE`、`SIZE` 会显示在表格内。

如果 TSV 里有 `排序车型` 列，脚本会优先用它控制行底纹交替分组；这个列默认不显示在表格里。没有 `排序车型` 时，会继续按 `MODEL` 分组。

## 用法

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Convert-TsvToSizeChartHtml.ps1 .\input.tsv .\output.html
```

上面的命令会输出编号文件：

```text
output_001.html
output_002.html
output_003.html
...
```

推荐方式：先改 [prefer.yaml](./prefer.yaml)，再用短命令生成。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Convert-TsvToSizeChartHtml.ps1 .\input.tsv .\output.html
```

`prefer.yaml` 里的常用项：

- `page_width_px`: 表格区域总宽度，默认 `2000`
- `page_height_px`: 表格区域总高度，默认 `1800`
- `page_max_height_px`: 每列可用高度，默认 `1772`，给上下页面 padding 留空间
- `columns`: 每页列数，默认 `4`
- `min_rows_per_brand_chunk`: 品牌表换列/换页时每个分块至少保留几行数据，默认 `2`
- `table_row_height_px`: 数据行估算高度，默认 `25`
- `brand_title_height_px`: 品牌标题条估算高度，默认 `38`
- `table_header_height_px`: 表头行估算高度，默认 `22`
- `table_gap_px`: 品牌表之间的间距估算，默认 `14`
- `show_title`: 是否显示小标题块，默认 `false`
- `stripe_column`: 控制行底纹交替分组的列名；留空时优先用 `排序车型`，没有该列时用 `MODEL`
- `table_columns`: 表格列顺序，默认 `MODEL,YEAR,TYPE,SIZE`

命令行仍然可以覆盖配置，例如：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Convert-TsvToSizeChartHtml.ps1 .\input.tsv .\output.html -PageMaxHeightPx 1600 -Columns 3
```

示例：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Convert-TsvToSizeChartHtml.ps1 .\cars.tsv .\cars.html
```

如果你的机器装了 Python，也可以用同目录里的 Python 版本：

```powershell
python .\tsv_to_size_chart_html.py .\input.tsv .\output.html
```

## 分页逻辑

脚本会按品牌表格的估算高度排版：

1. 当前品牌能放进当前列，就放进去。
2. 当前列还剩一些空间但放不下整个品牌时，会先确认是否能放下 `min_rows_per_brand_chunk` 行；不够就直接换列/换页。
3. 剩下的同品牌数据会去下一列，并重新显示品牌标题，例如 `AUDI 1/2`、`AUDI 2/2`。
4. 拆分品牌时会尽量避免下一块只剩 1 行这类很短的续表。
5. 当前页最后一列也不够时，创建下一页，例如 `output_002.html`。

像素高度是脚本估算，不是浏览器实时测量。实际视觉高度由 CSS 控制，所以如果你改了字体大小、行高、padding，建议同步调整 `-TableRowHeightPx`、`-BrandTitleHeightPx`、`-TableHeaderHeightPx`。

## CSS 模板

默认样式在 [size-chart-template.css](./size-chart-template.css)。CSS 现在主要控制视觉样式，不建议再用它控制生成尺寸和分页。

建议在 CSS 里改：

- 各字段字体：品牌标题、表头、MODEL、YEAR、TYPE、SIZE
- 各列宽度：`--model-col-width`、`--year-col-width`、`--type-col-width`、`--size-col-width`
- 各列对齐：`--model-align`、`--year-align`、`--type-align`、`--size-align`
- 表格底纹颜色：`--row-stripe-light`、`--row-stripe-dark`
- 边框粗细/颜色：`--table-border-width`、`--table-border-color`
- 单元格和块间距：`--cell-padding-y`、`--cell-padding-x`、`--brand-block-gap`

不建议在 CSS 里改：

- 页面宽高
- 每页列数
- 品牌标题高度
- 表头高度
- 数据行高度

这些由 [prefer.yaml](./prefer.yaml) 决定，生成 HTML 时会写进页面。

常改变量：

```css
:root {
  --base-font-family: Arial, Helvetica, sans-serif;
  --model-font-family: Arial, Helvetica, sans-serif;
  --model-font-size: 12px;
  --year-font-size: 12px;
  --type-font-size: 12px;
  --brand-font-size: 25px;
  --table-border-color: #d7dbe0;
  --table-border-width: 1px;
  --row-stripe-light: #ffffff;
  --row-stripe-dark: #f0f2f4;
}
```

底纹规则：脚本会按连续的 `排序车型` 分组交替加类名；如果输入没有 `排序车型` 列，则按连续的 `MODEL` 分组。同一个分组的连续多行会保持同一种底纹，例如两行 `Acura ADX` 都是白色，下一组 `Acura CL` 会切到深一点的底纹。也可以在 [prefer.yaml](./prefer.yaml) 里设置 `stripe_column` 指定其它列。

对应 CSS：

```css
tbody tr.model-stripe-light td {
  background: var(--row-stripe-light);
}

tbody tr.model-stripe-dark td {
  background: var(--row-stripe-dark);
}
```

## 导出图片

HTML 生成后，可以用 Edge/Chrome headless 导出图片：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Export-HtmlPagesToImages.ps1 .\output_*.html
```

默认会读取 `prefer.yaml` 的 `page_width_px` / `page_height_px`，所以输出图片尺寸会是 `2000x1800`。

输出目录默认是：

```text
images/
```

JPEG 说明：JPEG 格式本身是有损压缩。脚本会用最高质量 `100` 另存 `.jpg`；如果你需要真正无损文件，加 `-KeepPng` 保留 Edge 原始截图 PNG：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Export-HtmlPagesToImages.ps1 .\output_*.html -KeepPng
```
