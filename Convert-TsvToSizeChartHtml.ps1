param(
    # TSV input file. Header row should include BRAND, MODEL, YEAR, TYPE, SIZE by default.
    # Optional stripe column defaults to 排序车型 when present, otherwise MODEL.
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$InputPath,

    # Output HTML base path. The script writes numbered files such as output_001.html.
    [Parameter(Mandatory = $true, Position = 1)]
    [string]$OutputPath,

    # Flat YAML config file. Values here are used unless the same option is passed on the command line.
    [string]$ConfigPath = "prefer.yaml",

    # Table canvas width in pixels. Default prefer.yaml uses 2000.
    [int]$PageWidthPx = 2000,

    # Output page height in pixels. Default prefer.yaml uses 1800.
    [int]$PageHeightPx = 1800,

    # Number of vertical columns on each generated HTML page.
    [int]$Columns = 4,

    # Optional hard row limit per brand table chunk. Set 0 to use only pixel-height pagination.
    [int]$MaxRows = 0,

    # Minimum data rows required when placing a brand chunk into a column/page.
    [int]$MinRowsPerBrandChunk = 2,

    # Maximum usable height, in pixels, for each page column.
    [int]$PageMaxHeightPx = 0,

    # Estimated pixel height of the blue brand title bar.
    [int]$BrandTitleHeightPx = 38,

    # Estimated pixel height of the table header row.
    [int]$TableHeaderHeightPx = 22,

    # Estimated pixel height of one data row. Keep this aligned with CSS row height/font size.
    [int]$TableRowHeightPx = 25,

    # Estimated vertical gap after each brand table.
    [int]$TableGapPx = 14,

    # Metadata/title text. It is placed in a quiet hidden block unless -ShowTitle is used.
    [string]$Title = "FIND THE RIGHT SIZE",

    # Metadata/subtitle text. It is placed in a quiet hidden block unless -ShowTitle is used.
    [string]$Subtitle = "FOR YOUR CAR COVER",

    # TSV column used to group rows and create brand table titles.
    [string]$BrandColumn = "BRAND",

    # TSV column used to alternate row background groups. Leave empty to auto-use 排序车型, then MODEL.
    [string]$StripeColumn = "",

    # TSV columns shown inside each generated table.
    [string[]]$TableColumns = @("MODEL", "YEAR", "TYPE", "SIZE"),

    # CSS file referenced by every generated HTML page.
    [string]$CssPath = "",

    # Show the quiet title block above the table pages. By default, only table pages are visible.
    [switch]$ShowTitle
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:CliParameterNames = @($PSBoundParameters.Keys)

function Encode-Html {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) {
        return ""
    }
    return [System.Net.WebUtility]::HtmlEncode($Value.Trim())
}

function Get-SizeClass {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return "size-other"
    }

    switch ($Value.Trim().Substring(0, 1).ToUpperInvariant()) {
        "A" { return "size-a" }
        "C" { return "size-c" }
        "H" { return "size-h" }
        "S" { return "size-s" }
        default { return "size-other" }
    }
}

function Get-PropertyValue {
    param(
        [Parameter(Mandatory = $true)]$Row,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Row.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return ""
    }
    return [string]$property.Value
}

function Read-FlatYaml {
    param([string]$Path)

    $config = @{}
    if (-not (Test-Path $Path)) {
        return $config
    }

    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }

        $match = [regex]::Match($trimmed, "^(?<key>[A-Za-z0-9_]+)\s*:\s*(?<value>.*)$")
        if (-not $match.Success) {
            continue
        }

        $key = $match.Groups["key"].Value
        $value = $match.Groups["value"].Value.Trim()
        $commentIndex = $value.IndexOf(" #")
        if ($commentIndex -ge 0) {
            $value = $value.Substring(0, $commentIndex).Trim()
        }
        $value = $value.Trim("'", '"')
        $config[$key] = $value
    }

    return $config
}

function Use-ConfigValue {
    param(
        [hashtable]$Config,
        [string]$ConfigKey,
        [string]$ParameterName,
        [scriptblock]$Apply
    )

    if ($Config.ContainsKey($ConfigKey) -and -not ($script:CliParameterNames -contains $ParameterName)) {
        & $Apply $Config[$ConfigKey]
    }
}

$config = Read-FlatYaml -Path $ConfigPath
Use-ConfigValue $config "page_width_px" "PageWidthPx" { param($value) $script:PageWidthPx = [int]$value }
Use-ConfigValue $config "page_height_px" "PageHeightPx" { param($value) $script:PageHeightPx = [int]$value }
Use-ConfigValue $config "columns" "Columns" { param($value) $script:Columns = [int]$value }
Use-ConfigValue $config "max_rows" "MaxRows" { param($value) $script:MaxRows = [int]$value }
Use-ConfigValue $config "min_rows_per_brand_chunk" "MinRowsPerBrandChunk" { param($value) $script:MinRowsPerBrandChunk = [int]$value }
Use-ConfigValue $config "page_max_height_px" "PageMaxHeightPx" { param($value) $script:PageMaxHeightPx = [int]$value }
Use-ConfigValue $config "brand_title_height_px" "BrandTitleHeightPx" { param($value) $script:BrandTitleHeightPx = [int]$value }
Use-ConfigValue $config "table_header_height_px" "TableHeaderHeightPx" { param($value) $script:TableHeaderHeightPx = [int]$value }
Use-ConfigValue $config "table_row_height_px" "TableRowHeightPx" { param($value) $script:TableRowHeightPx = [int]$value }
Use-ConfigValue $config "table_gap_px" "TableGapPx" { param($value) $script:TableGapPx = [int]$value }
Use-ConfigValue $config "title" "Title" { param($value) $script:Title = [string]$value }
Use-ConfigValue $config "subtitle" "Subtitle" { param($value) $script:Subtitle = [string]$value }
Use-ConfigValue $config "brand_column" "BrandColumn" { param($value) $script:BrandColumn = [string]$value }
Use-ConfigValue $config "stripe_column" "StripeColumn" { param($value) $script:StripeColumn = [string]$value }
Use-ConfigValue $config "table_columns" "TableColumns" {
    param($value)
    $script:TableColumns = @($value.Trim("[", "]").Split(",") | ForEach-Object { $_.Trim().Trim("'", '"') } | Where-Object { $_ })
}
Use-ConfigValue $config "css_path" "CssPath" { param($value) $script:CssPath = [string]$value }
Use-ConfigValue $config "show_title" "ShowTitle" {
    param($value)
    $script:ShowTitle = [System.Management.Automation.SwitchParameter]::new($value -match "^(true|yes|1)$")
}

function Render-Table {
    param(
        [string]$Brand,
        [array]$Rows,
        [string[]]$ColumnNames,
        [int]$PartNumber,
        [int]$TotalParts
    )

    $brandTitle = (Encode-Html $Brand).ToUpperInvariant()
    if ($TotalParts -gt 1) {
        $brandTitle = "$brandTitle <span class=""brand-part"">$PartNumber/$TotalParts</span>"
    }

    $headerCells = foreach ($column in $ColumnNames) {
        "          <th>$(Encode-Html $column)</th>"
    }

    $bodyRows = foreach ($row in $Rows) {
        $rowClass = Get-PropertyValue -Row $row -Name "__MODEL_STRIPE_CLASS"
        $cells = foreach ($column in $ColumnNames) {
            $value = Get-PropertyValue -Row $row -Name $column
            $escaped = Encode-Html $value
            if ($column.ToUpperInvariant() -eq "SIZE" -and -not [string]::IsNullOrWhiteSpace($value)) {
                $className = Get-SizeClass $value
                "          <td class=""size-cell""><span class=""size-badge $className"">$escaped</span></td>"
            }
            else {
                "          <td>$escaped</td>"
            }
        }

@"
        <tr class="$rowClass">
$($cells -join "`n")
        </tr>
"@
    }

@"
    <section class="brand-table">
      <h2>$brandTitle</h2>
      <table>
        <thead>
        <tr>
$($headerCells -join "`n")
        </tr>
        </thead>
        <tbody>
$($bodyRows -join "`n")
        </tbody>
      </table>
    </section>
"@
}

function Get-TableHeight {
    param([int]$RowCount)
    return $BrandTitleHeightPx + $TableHeaderHeightPx + ($RowCount * $TableRowHeightPx) + $TableGapPx
}

function Get-MaxRowsPerColumn {
    $baseHeight = $BrandTitleHeightPx + $TableHeaderHeightPx + $TableGapPx
    $rowsByHeight = [Math]::Floor(($PageMaxHeightPx - $baseHeight) / [Math]::Max(1, $TableRowHeightPx))
    $rowsByHeight = [Math]::Max(1, $rowsByHeight)
    if ($MaxRows -gt 0) {
        return [Math]::Min($rowsByHeight, $MaxRows)
    }
    return $rowsByHeight
}

function Get-MaxRowsForAvailableHeight {
    param([int]$AvailableHeight)

    $baseHeight = $BrandTitleHeightPx + $TableHeaderHeightPx + $TableGapPx
    $rowsByHeight = [Math]::Floor(($AvailableHeight - $baseHeight) / [Math]::Max(1, $TableRowHeightPx))
    $rowsByHeight = [Math]::Max(0, $rowsByHeight)
    if ($MaxRows -gt 0 -and $rowsByHeight -gt 0) {
        return [Math]::Min($rowsByHeight, $MaxRows)
    }
    return $rowsByHeight
}

function Move-ToNextColumn {
    $script:currentColumnIndex++
    if ($script:currentColumnIndex -ge $safeColumns) {
        $script:currentPage = New-ChartPage
        [void]$pages.Add($script:currentPage)
        $script:currentColumnIndex = 0
    }
}

function New-ChartPage {
    $page = [pscustomobject]@{
        Columns = New-Object System.Collections.ArrayList
        Heights = New-Object System.Collections.ArrayList
    }

    for ($index = 0; $index -lt $safeColumns; $index++) {
        [void]$page.Columns.Add((New-Object System.Collections.ArrayList))
        [void]$page.Heights.Add(0)
    }
    return $page
}

$rows = Import-Csv -Path $InputPath -Delimiter "`t"
if ($rows.Count -eq 0) {
    throw "Input TSV has no data rows."
}

$inputColumns = @($rows[0].PSObject.Properties.Name)
if ([string]::IsNullOrWhiteSpace($StripeColumn)) {
    if ($inputColumns -contains "排序车型") {
        $StripeColumn = "排序车型"
    }
    else {
        $StripeColumn = "MODEL"
    }
}
elseif (-not ($inputColumns -contains $StripeColumn)) {
    throw "Stripe column not found in input TSV: $StripeColumn"
}

$brandGroups = [ordered]@{}
foreach ($row in $rows) {
    $brand = (Get-PropertyValue -Row $row -Name $BrandColumn).Trim()
    if ([string]::IsNullOrWhiteSpace($brand)) {
        $brand = "UNKNOWN"
    }

    if (-not $brandGroups.Contains($brand)) {
        $brandGroups[$brand] = New-Object System.Collections.ArrayList
    }
    [void]$brandGroups[$brand].Add($row)
}

$safeColumns = [Math]::Max(1, $Columns)
$safePageWidthPx = [Math]::Max(1, $PageWidthPx)
$safePageHeightPx = [Math]::Max(1, $PageHeightPx)
if ($PageMaxHeightPx -le 0) {
    $PageMaxHeightPx = [Math]::Max(1, $safePageHeightPx - 28)
}
$safePageMaxHeightPx = [Math]::Max(1, $PageMaxHeightPx)
$safeMinRowsPerBrandChunk = [Math]::Max(1, $MinRowsPerBrandChunk)
$maxRowsPerFullColumn = Get-MaxRowsPerColumn
$pages = New-Object System.Collections.ArrayList
$currentPage = New-ChartPage
[void]$pages.Add($currentPage)
$currentColumnIndex = 0

foreach ($brand in $brandGroups.Keys) {
    $brandRows = @($brandGroups[$brand])
    $previousModel = $null
    $modelGroupIndex = -1
    foreach ($row in $brandRows) {
        $model = Get-PropertyValue -Row $row -Name $StripeColumn
        if ($null -eq $previousModel -or $model -ne $previousModel) {
            $modelGroupIndex++
            $previousModel = $model
        }

        $stripeClass = if ($modelGroupIndex % 2 -eq 0) { "model-stripe-light" } else { "model-stripe-dark" }
        $existing = $row.PSObject.Properties["__MODEL_STRIPE_CLASS"]
        if ($null -eq $existing) {
            $row | Add-Member -NotePropertyName "__MODEL_STRIPE_CLASS" -NotePropertyValue $stripeClass
        }
        else {
            $existing.Value = $stripeClass
        }
    }

    $offset = 0
    $brandChunks = New-Object System.Collections.ArrayList
    while ($offset -lt $brandRows.Count) {
        $availableHeight = $safePageMaxHeightPx - [int]$currentPage.Heights[$currentColumnIndex]
        $rowsThatFit = Get-MaxRowsForAvailableHeight -AvailableHeight $availableHeight
        $remainingRows = $brandRows.Count - $offset
        $minimumRowsForThisChunk = [Math]::Min($safeMinRowsPerBrandChunk, $remainingRows)
        $currentColumnHasContent = [int]$currentPage.Heights[$currentColumnIndex] -gt 0

        if ($rowsThatFit -le 0 -or ($rowsThatFit -lt $minimumRowsForThisChunk -and $currentColumnHasContent)) {
            Move-ToNextColumn
            continue
        }

        $rowsToTake = [Math]::Min($rowsThatFit, $remainingRows)
        $remainingAfterTake = $remainingRows - $rowsToTake

        if ($remainingAfterTake -gt 0 -and $remainingAfterTake -lt $safeMinRowsPerBrandChunk -and $currentColumnHasContent -and $remainingRows -le $maxRowsPerFullColumn) {
            Move-ToNextColumn
            continue
        }

        $tailShortfall = $safeMinRowsPerBrandChunk - $remainingAfterTake
        if ($remainingAfterTake -gt 0 -and $tailShortfall -gt 0 -and ($rowsToTake - $tailShortfall) -ge $safeMinRowsPerBrandChunk) {
            $rowsToTake -= $tailShortfall
        }

        $endIndex = $offset + $rowsToTake - 1
        $partRows = @($brandRows[$offset..$endIndex])
        $tableHeight = Get-TableHeight -RowCount $partRows.Count

        $chunk = [pscustomobject]@{
            Brand = $brand
            Rows = $partRows
            PartNumber = 1
            TotalParts = 1
        }
        [void]$brandChunks.Add($chunk)
        [void]$currentPage.Columns[$currentColumnIndex].Add($chunk)
        $currentPage.Heights[$currentColumnIndex] = [int]$currentPage.Heights[$currentColumnIndex] + $tableHeight
        $offset += $rowsToTake
    }

    for ($chunkIndex = 0; $chunkIndex -lt $brandChunks.Count; $chunkIndex++) {
        $brandChunks[$chunkIndex].PartNumber = $chunkIndex + 1
        $brandChunks[$chunkIndex].TotalParts = $brandChunks.Count
    }
}

$outputDirectory = Split-Path -Parent $OutputPath
if ([string]::IsNullOrWhiteSpace($outputDirectory)) {
    $outputDirectory = "."
}

if ([string]::IsNullOrWhiteSpace($CssPath)) {
    $CssPath = Join-Path $outputDirectory "size-chart-template.css"
}

$cssOutputPath = $CssPath
if (-not [System.IO.Path]::IsPathRooted($cssOutputPath)) {
    $cssOutputPath = Join-Path (Get-Location) $cssOutputPath
}

$cssHref = [System.IO.Path]::GetFileName($CssPath)
$templateCssPath = Join-Path $PSScriptRoot "size-chart-template.css"
if (-not (Test-Path $cssOutputPath)) {
    if (-not (Test-Path $templateCssPath)) {
        throw "CSS template not found: $templateCssPath"
    }
    $cssDirectory = Split-Path -Parent $cssOutputPath
    if (-not [string]::IsNullOrWhiteSpace($cssDirectory)) {
        New-Item -ItemType Directory -Path $cssDirectory -Force | Out-Null
    }
    Copy-Item -Path $templateCssPath -Destination $cssOutputPath
}

function Render-PageHtml {
    param(
        [Parameter(Mandatory = $true)]$Page,
        [int]$PageNumber
    )

    $titleBlockClass = if ($ShowTitle) { "chart-title-block is-visible" } else { "chart-title-block" }
    $columnsHtml = for ($columnIndex = 0; $columnIndex -lt $safeColumns; $columnIndex++) {
        $tableHtml = foreach ($table in $Page.Columns[$columnIndex]) {
            Render-Table -Brand $table.Brand -Rows $table.Rows -ColumnNames $TableColumns -PartNumber $table.PartNumber -TotalParts $table.TotalParts
        }

@"
      <section class="chart-column" data-column="$($columnIndex + 1)">
$($tableHtml -join "`n")
      </section>
"@
    }

@"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$(Encode-Html $Title) - Page $PageNumber</title>
  <link rel="stylesheet" href="$(Encode-Html $cssHref)">
</head>
<body>
  <aside class="$titleBlockClass">
    <h1>$(Encode-Html $Title)</h1>
    <p>$(Encode-Html $Subtitle)</p>
  </aside>
  <main class="chart-page" style="--page-width: ${safePageWidthPx}px; --page-height: ${safePageHeightPx}px; --chart-columns: $safeColumns; --page-max-height: ${safePageMaxHeightPx}px; --brand-title-height: ${BrandTitleHeightPx}px; --table-header-height: ${TableHeaderHeightPx}px; --table-row-height: ${TableRowHeightPx}px;" data-page="$PageNumber">
    <div class="chart-columns">
$($columnsHtml -join "`n")
    </div>
  </main>
</body>
</html>
"@
}

if ($outputDirectory -ne ".") {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$outputLeaf = [System.IO.Path]::GetFileNameWithoutExtension($OutputPath)
$outputExtension = [System.IO.Path]::GetExtension($OutputPath)
if ([string]::IsNullOrWhiteSpace($outputExtension)) {
    $outputExtension = ".html"
}

for ($pageIndex = 0; $pageIndex -lt $pages.Count; $pageIndex++) {
    $pageNumber = $pageIndex + 1
    $pagePath = Join-Path $outputDirectory ("{0}_{1:000}{2}" -f $outputLeaf, $pageNumber, $outputExtension)
    Set-Content -Path $pagePath -Value (Render-PageHtml -Page $pages[$pageIndex] -PageNumber $pageNumber) -Encoding UTF8
    Write-Host "Wrote $pagePath"
}

Write-Host "Using CSS $CssPath"
Write-Host "Pages $($pages.Count); page size ${safePageWidthPx}x${safePageHeightPx}px; columns per page $safeColumns; max rows per full column $maxRowsPerFullColumn"
