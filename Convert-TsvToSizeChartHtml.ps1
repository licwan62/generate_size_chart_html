param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$InputPath,

    [Parameter(Mandatory = $true, Position = 1)]
    [string]$OutputPath,

    [int]$Columns = 4,
    [int]$MaxRows = 32,
    [string]$Title = "FIND THE RIGHT SIZE",
    [string]$Subtitle = "FOR YOUR CAR COVER",
    [string]$BrandColumn = "BRAND",
    [string[]]$TableColumns = @("MODEL", "YEAR", "TYPE", "SIZE"),
    [switch]$NoBanner
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
        <tr>
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

$rows = Import-Csv -Path $InputPath -Delimiter "`t"
if ($rows.Count -eq 0) {
    throw "Input TSV has no data rows."
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

$tables = New-Object System.Collections.Generic.List[string]
foreach ($brand in $brandGroups.Keys) {
    $brandRows = @($brandGroups[$brand])
    $safeMaxRows = [Math]::Max(1, $MaxRows)
    $totalParts = [Math]::Ceiling($brandRows.Count / $safeMaxRows)

    for ($offset = 0; $offset -lt $brandRows.Count; $offset += $safeMaxRows) {
        $partNumber = [Math]::Floor($offset / $safeMaxRows) + 1
        $endIndex = [Math]::Min($offset + $safeMaxRows - 1, $brandRows.Count - 1)
        $partRows = @($brandRows[$offset..$endIndex])
        $tables.Add((Render-Table -Brand $brand -Rows $partRows -ColumnNames $TableColumns -PartNumber $partNumber -TotalParts $totalParts))
    }
}

$safeColumns = [Math]::Max(1, $Columns)
$banner = ""
if (-not $NoBanner) {
    $banner = @"
  <header class="hero">
    <div>
      <h1>$(Encode-Html $Title)<br><span>$(Encode-Html $Subtitle)</span></h1>
      <p>A custom-like fit is guaranteed for all listed vehicles</p>
    </div>
  </header>
"@
}

$html = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$(Encode-Html $Title)</title>
  <style>
    :root {
      --blue-dark: #062746;
      --blue: #004b91;
      --grid: #d7dbe0;
      --text: #161b22;
      --paper: #f3f4f6;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--paper);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
    }

    .hero {
      background: var(--blue-dark);
      color: #fff;
      padding: 22px 28px 16px;
      border-bottom: 10px solid #0d5ba6;
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(34px, 5vw, 58px);
      line-height: 0.95;
      letter-spacing: 0;
      font-weight: 900;
    }

    .hero h1 span {
      font-size: 0.72em;
      font-weight: 700;
    }

    .hero p {
      display: inline-block;
      margin: 18px 0 0;
      padding: 8px 18px;
      background: #094f98;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      text-transform: uppercase;
      font-weight: 800;
      font-size: 16px;
    }

    .chart {
      column-count: $safeColumns;
      column-gap: 14px;
      padding: 14px;
    }

    .brand-table {
      display: inline-block;
      width: 100%;
      margin: 0 0 14px;
      break-inside: avoid;
      page-break-inside: avoid;
      background: #fff;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
    }

    .brand-table h2 {
      margin: 0;
      padding: 6px 12px;
      min-height: 38px;
      background: linear-gradient(90deg, #003f82, #0060af);
      color: #fff;
      font-size: 28px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .brand-part {
      font-size: 12px;
      font-weight: 700;
      opacity: 0.85;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 17px;
    }

    th, td {
      border-right: 1px solid var(--grid);
      border-bottom: 1px solid var(--grid);
      padding: 3px 6px;
      overflow-wrap: anywhere;
      vertical-align: middle;
    }

    th:last-child, td:last-child { border-right: 0; }

    th {
      color: #315c72;
      background: #fff;
      text-align: left;
      font-size: 12px;
      line-height: 1;
      font-weight: 800;
    }

    td:nth-child(1) { font-weight: 800; }
    td:nth-child(2) { white-space: nowrap; }

    th:nth-child(1), td:nth-child(1) { width: 28%; }
    th:nth-child(2), td:nth-child(2) { width: 28%; }
    th:nth-child(3), td:nth-child(3) { width: 32%; }
    th:nth-child(4), td:nth-child(4) { width: 12%; }

    .size-cell {
      padding: 2px 4px;
      text-align: center;
    }

    .size-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      height: 22px;
      padding: 0 3px;
      border-radius: 3px;
      color: #fff;
      font-weight: 900;
      line-height: 1;
      box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.22);
    }

    .size-a { background: #1f86c7; }
    .size-c { background: #c91d31; }
    .size-h { background: #159aa2; }
    .size-s { background: #ef9c32; }
    .size-other { background: #6b7280; }

    @media (max-width: 1200px) {
      .chart { column-count: min(3, $safeColumns); }
      table { font-size: 15px; }
      .brand-table h2 { font-size: 24px; }
    }

    @media (max-width: 760px) {
      .chart { column-count: 1; padding: 10px; }
      .hero { padding: 18px 16px 12px; }
      .hero p { font-size: 12px; }
      table { font-size: 14px; }
      th, td { padding: 3px 4px; }
      .brand-table h2 { font-size: 22px; }
    }

    @media print {
      body { background: #fff; }
      .hero { padding: 12px 18px; }
      .chart { padding: 8px; column-gap: 8px; }
      .brand-table { margin-bottom: 8px; box-shadow: none; border: 1px solid #cdd3da; }
    }
  </style>
</head>
<body>
$banner
  <main class="chart">
$($tables -join "`n")
  </main>
</body>
</html>
"@

$outputDirectory = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

Set-Content -Path $OutputPath -Value $html -Encoding UTF8
Write-Host "Wrote $OutputPath"
