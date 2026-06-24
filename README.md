# TSV to Size Chart HTML

把车辆尺寸 TSV 转成按品牌分组的 HTML 表格。输出是单个 HTML 文件，可以直接用浏览器打开。

## 输入格式

默认要求 TSV 表头包含这些列：

```tsv
BRAND	MODEL	YEAR	TYPE	SIZE
```

`BRAND` 会作为每个表格的蓝色标题；`MODEL`、`YEAR`、`TYPE`、`SIZE` 会显示在表格内。

## 用法

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Convert-TsvToSizeChartHtml.ps1 .\input.tsv .\output.html
```

常用参数：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Convert-TsvToSizeChartHtml.ps1 .\input.tsv .\output.html -Columns 4 -MaxRows 32
```

- `-Columns`: 页面分成几列排版，默认 `4`
- `-MaxRows`: 每个品牌表最多几行，超过后自动拆成同品牌续表，默认 `32`
- `-NoBanner`: 不输出顶部标题栏，只输出表格区域
- `-Title` / `-Subtitle`: 修改顶部标题文字

示例：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Convert-TsvToSizeChartHtml.ps1 .\cars.tsv .\cars.html -Columns 4 -MaxRows 30 -Title "FIND THE RIGHT SIZE" -Subtitle "FOR YOUR CAR COVER"
```

如果你的机器装了 Python，也可以用同目录里的 Python 版本：

```powershell
python .\tsv_to_size_chart_html.py .\input.tsv .\output.html --columns 4 --max-rows 32
```
