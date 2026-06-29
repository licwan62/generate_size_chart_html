param(
    # HTML 文件匹配规则，例如 .\output_*.html。
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$HtmlGlob,

    # 图片输出目录。默认写到 image/<输入文件名> 文件夹。
    [string]$OutputDir = "",

    # CSS 文件名。默认读取 HTML 同目录里的 size-chart.css。
    [string]$AdjustCssName = "size-chart.css",

    # 输出图片宽度。未传时读取调整 CSS 的 --page-width。
    [int]$Width = 0,

    # 输出图片高度。未传时读取调整 CSS 的 --page-height。
    [int]$Height = 0,

    # JPEG 质量，范围 1-100。100 是最高质量，但 JPEG 格式仍然是有损压缩。
    [Alias("Quality")]
    [int]$JpegQuality = 100,

    # 输出格式：jpg、png 或 both。
    [ValidateSet("jpg", "jpeg", "png", "both")]
    [string]$Format = "jpg",

    # 保留 Edge 截图得到的 PNG。PNG 是真正无损格式。
    [switch]$KeepPng,

    # 显式分析自动缩小字体并写出 fit-text-summary.log。默认不分析。
    [switch]$AnalysisFont
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-CssVariables {
    param([string]$Path)

    $variables = @{}
    if (-not (Test-Path $Path)) {
        return $variables
    }

    foreach ($line in Get-Content -Path $Path) {
        $match = [regex]::Match($line, "--(?<name>[A-Za-z0-9_-]+)\s*:\s*(?<value>[^;]+);")
        if ($match.Success) {
            $variables[$match.Groups["name"].Value] = $match.Groups["value"].Value.Trim()
        }
    }
    return $variables
}

function Get-CssInt {
    param(
        [hashtable]$Variables,
        [string]$Name,
        [int]$Default
    )

    if (-not $Variables.ContainsKey($Name)) {
        return $Default
    }

    $match = [regex]::Match([string]$Variables[$Name], "-?\d+(\.\d+)?")
    if (-not $match.Success) {
        return $Default
    }
    return [int][Math]::Round([double]$match.Value)
}

function Get-EdgePath {
    $candidates = @(
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "Cannot find Microsoft Edge or Chrome executable."
}

function Get-NodePath {
    $command = Get-Command node -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        (Join-Path $HOME ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"),
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    return ""
}

function Get-DefaultImageOutputDir {
    param([System.IO.DirectoryInfo]$HtmlDirectory)

    $inputName = $HtmlDirectory.Name
    return Join-Path (Join-Path $PSScriptRoot "image") $inputName
}

function Write-FitTextSummary {
    param(
        [System.IO.FileInfo]$HtmlFile,
        [string]$EdgePath,
        [int]$Width,
        [int]$Height,
        [string]$LogPath
    )

    $nodePath = Get-NodePath
    $summaryScript = Join-Path $PSScriptRoot "collect_fit_text_summary.js"
    if ([string]::IsNullOrWhiteSpace($nodePath) -or -not (Test-Path $summaryScript)) {
        $line = "字体自动缩小汇总已跳过 $($HtmlFile.Name)：未找到 Node.js 辅助环境。"
        Add-Content -Path $LogPath -Value $line -Encoding UTF8
        Write-Host $line
        return
    }

    $json = & $nodePath $summaryScript --edge $EdgePath --html $HtmlFile.FullName --width $Width --height $Height 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($json)) {
        $line = "字体自动缩小汇总失败：$($HtmlFile.Name)。"
        Add-Content -Path $LogPath -Value $line -Encoding UTF8
        Write-Host $line
        return
    }

    $summary = $json | ConvertFrom-Json
    $total = [int]$summary.total
    $lines = New-Object System.Collections.ArrayList
    [void]$lines.Add("字体自动缩小汇总 $($HtmlFile.Name)：$total 处")
    if ($total -eq 0) {
        Add-Content -Path $LogPath -Value @($lines) -Encoding UTF8
        Write-Host $lines[0]
        return
    }

    $columnParts = @()
    foreach ($property in $summary.byColumn.PSObject.Properties | Sort-Object Name) {
        $columnParts += ("{0}={1}" -f $property.Name, $property.Value)
    }
    if ($columnParts.Count -gt 0) {
        [void]$lines.Add("  按列统计：" + ($columnParts -join ", "))
    }

    foreach ($item in $summary.byText | Sort-Object column, text, finalFontSize) {
        [void]$lines.Add(("  {0}：""{1}"" x{2} -> {3}px" -f $item.column, $item.text, $item.count, $item.finalFontSize))
    }

    Add-Content -Path $LogPath -Value @($lines) -Encoding UTF8
    foreach ($line in $lines) {
        Write-Host $line
    }
}

function Convert-PngToJpeg {
    param(
        [string]$PngPath,
        [string]$JpegPath,
        [int]$Quality
    )

    Add-Type -AssemblyName System.Drawing
    $bitmap = [System.Drawing.Image]::FromFile($PngPath)
    try {
        $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
            Where-Object { $_.MimeType -eq "image/jpeg" } |
            Select-Object -First 1

        $encoder = [System.Drawing.Imaging.Encoder]::Quality
        $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, [long]$Quality)
        $bitmap.Save($JpegPath, $jpegCodec, $encoderParameters)
    }
    finally {
        $bitmap.Dispose()
    }
}

$quality = [Math]::Min(100, [Math]::Max(1, $JpegQuality))
$normalizedFormat = $Format.ToLowerInvariant()
if ($normalizedFormat -eq "jpeg") {
    $normalizedFormat = "jpg"
}
$jpegNameSuffix = if ($quality -ne 100) { "_q$quality" } else { "" }
$htmlFiles = @(Get-ChildItem -Path $HtmlGlob | Sort-Object Name)
if ($htmlFiles.Count -eq 0) {
    throw "No HTML files matched: $HtmlGlob"
}

$cssPath = Join-Path $htmlFiles[0].DirectoryName $AdjustCssName
$cssVariables = Read-CssVariables -Path $cssPath
if ($Width -le 0) {
    $Width = Get-CssInt -Variables $cssVariables -Name "page-width" -Default 2000
}
if ($Height -le 0) {
    $Height = Get-CssInt -Variables $cssVariables -Name "page-height" -Default 1800
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Get-DefaultImageOutputDir -HtmlDirectory $htmlFiles[0].Directory
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path
$fitTextLogPath = Join-Path $OutputDir "fit-text-summary.log"
if ($AnalysisFont) {
    Set-Content -Path $fitTextLogPath -Value @(
        "字体自动缩小汇总"
        "生成时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        "HTML：$HtmlGlob"
        "输出格式：$normalizedFormat"
        "输出尺寸：${Width}x${Height}"
        "JPEG质量：$quality"
        ""
    ) -Encoding UTF8
}

$edgePath = Get-EdgePath
$userDataDir = Join-Path ([System.IO.Path]::GetTempPath()) ("size-chart-edge-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null

try {
    foreach ($htmlFile in $htmlFiles) {
        $baseName = [System.IO.Path]::GetFileNameWithoutExtension($htmlFile.Name)
        $pngPath = Join-Path $OutputDir ($baseName + ".png")
        $jpgPath = Join-Path $OutputDir ($baseName + $jpegNameSuffix + ".jpg")
        $fileUrl = (New-Object System.Uri($htmlFile.FullName)).AbsoluteUri

        $arguments = @(
            "--headless=new",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-component-update",
            "--no-first-run",
            "--no-default-browser-check",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--window-size=$Width,$Height",
            "--user-data-dir=$userDataDir",
            "--screenshot=$pngPath",
            $fileUrl
        )

        $browserStdout = Join-Path $OutputDir ($baseName + ".browser.out.log")
        $browserStderr = Join-Path $OutputDir ($baseName + ".browser.err.log")
        $process = Start-Process -FilePath $edgePath -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden -RedirectStandardError $browserStderr -RedirectStandardOutput $browserStdout
        if ($process.ExitCode -ne 0) {
            throw "Browser screenshot failed for $($htmlFile.Name) with exit code $($process.ExitCode)."
        }
        if (-not (Test-Path $pngPath)) {
            $logText = ""
            if (Test-Path $browserStdout) { $logText += Get-Content -Path $browserStdout -Raw }
            if (Test-Path $browserStderr) { $logText += Get-Content -Path $browserStderr -Raw }
            throw "Browser did not create screenshot: $pngPath`n$logText"
        }

        $writtenPaths = New-Object System.Collections.ArrayList
        if ($normalizedFormat -eq "jpg" -or $normalizedFormat -eq "both") {
            Convert-PngToJpeg -PngPath $pngPath -JpegPath $jpgPath -Quality $quality
            [void]$writtenPaths.Add($jpgPath)
        }
        if ($normalizedFormat -eq "png" -or $normalizedFormat -eq "both" -or $KeepPng) {
            [void]$writtenPaths.Add($pngPath)
        }

        if ($AnalysisFont) {
            Write-FitTextSummary -HtmlFile $htmlFile -EdgePath $edgePath -Width $Width -Height $Height -LogPath $fitTextLogPath
        }
        if ($normalizedFormat -ne "png" -and $normalizedFormat -ne "both" -and -not $KeepPng) {
            Remove-Item -LiteralPath $pngPath
        }
        Remove-Item -LiteralPath $browserStdout, $browserStderr -ErrorAction SilentlyContinue
        Write-Host ("Wrote " + (@($writtenPaths) -join ", "))
    }
}
finally {
    if (Test-Path $userDataDir) {
        Remove-Item -LiteralPath $userDataDir -Recurse -Force
    }
}
