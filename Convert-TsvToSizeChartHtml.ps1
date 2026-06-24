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
    [string]$CssPath = "",
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
    $previousModel = $null
    $modelGroupIndex = -1
    foreach ($row in $brandRows) {
        $model = Get-PropertyValue -Row $row -Name "MODEL"
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
  <link rel="stylesheet" href="$(Encode-Html $cssHref)">
</head>
<body>
$banner
  <main class="chart" style="--chart-columns: $safeColumns;">
$($tables -join "`n")
  </main>
</body>
</html>
"@

if ($outputDirectory -ne ".") {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

Set-Content -Path $OutputPath -Value $html -Encoding UTF8
Write-Host "Wrote $OutputPath"
Write-Host "Using CSS $CssPath"
