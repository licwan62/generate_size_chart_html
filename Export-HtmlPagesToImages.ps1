param(
    # HTML 文件匹配规则，例如 .\output_*.html。
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$HtmlGlob,

    # 图片输出目录。默认写到 html 同级目录下的 images 文件夹。
    [string]$OutputDir = "",

    # 配置文件。默认读取 prefer.yaml 的 page_width_px / page_height_px。
    [string]$ConfigPath = "prefer.yaml",

    # 输出图片宽度。未传时读取 prefer.yaml。
    [int]$Width = 0,

    # 输出图片高度。未传时读取 prefer.yaml。
    [int]$Height = 0,

    # JPEG 质量，范围 1-100。100 是最高质量，但 JPEG 格式仍然是有损压缩。
    [int]$JpegQuality = 100,

    # 保留 Edge 截图得到的 PNG。PNG 是真正无损格式。
    [switch]$KeepPng
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

        $value = $match.Groups["value"].Value.Trim()
        $commentIndex = $value.IndexOf(" #")
        if ($commentIndex -ge 0) {
            $value = $value.Substring(0, $commentIndex).Trim()
        }
        $config[$match.Groups["key"].Value] = $value.Trim("'", '"')
    }
    return $config
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

$config = Read-FlatYaml -Path $ConfigPath
if ($Width -le 0 -and $config.ContainsKey("page_width_px")) {
    $Width = [int]$config["page_width_px"]
}
if ($Height -le 0 -and $config.ContainsKey("page_height_px")) {
    $Height = [int]$config["page_height_px"]
}
if ($Width -le 0) {
    $Width = 2000
}
if ($Height -le 0) {
    $Height = 1800
}

$quality = [Math]::Min(100, [Math]::Max(1, $JpegQuality))
$htmlFiles = @(Get-ChildItem -Path $HtmlGlob | Sort-Object Name)
if ($htmlFiles.Count -eq 0) {
    throw "No HTML files matched: $HtmlGlob"
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $htmlFiles[0].DirectoryName "images"
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path

$edgePath = Get-EdgePath
$userDataDir = Join-Path ([System.IO.Path]::GetTempPath()) ("size-chart-edge-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null

try {
    foreach ($htmlFile in $htmlFiles) {
        $baseName = [System.IO.Path]::GetFileNameWithoutExtension($htmlFile.Name)
        $pngPath = Join-Path $OutputDir ($baseName + ".png")
        $jpgPath = Join-Path $OutputDir ($baseName + ".jpg")
        $fileUrl = (New-Object System.Uri($htmlFile.FullName)).AbsoluteUri

        $arguments = @(
            "--headless=new",
            "--disable-gpu",
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

        Convert-PngToJpeg -PngPath $pngPath -JpegPath $jpgPath -Quality $quality
        if (-not $KeepPng) {
            Remove-Item -LiteralPath $pngPath
        }
        Remove-Item -LiteralPath $browserStdout, $browserStderr -ErrorAction SilentlyContinue
        Write-Host "Wrote $jpgPath"
    }
}
finally {
    if (Test-Path $userDataDir) {
        Remove-Item -LiteralPath $userDataDir -Recurse -Force
    }
}
