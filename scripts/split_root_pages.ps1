param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

function Write-PageAssets {
    param(
        [string]$HtmlPath,
        [string]$CssPath,
        [string]$JsPath,
        [string]$BootstrapPath,
        [string]$CssHref,
        [string]$JsSrc,
        [string]$BootstrapSrc
    )

    $raw = Get-Content -Path $HtmlPath -Raw

    $styleMatch = [regex]::Match($raw, '(?s)<style>\s*(.*?)\s*</style>')
    if (-not $styleMatch.Success) { throw "Missing style block in $HtmlPath" }
    Set-Content -Path $CssPath -Value ($styleMatch.Groups[1].Value.Trim() + "`r`n")

    $scriptMatches = [regex]::Matches($raw, '(?s)<script>\s*(.*?)\s*</script>')
    if ($scriptMatches.Count -lt 1) { throw "Missing script block in $HtmlPath" }
    Set-Content -Path $JsPath -Value ($scriptMatches[0].Groups[1].Value.Trim() + "`r`n")

    $moduleMatch = [regex]::Match($raw, '(?s)<script type="module">\s*(.*?)\s*</script>')
    if (-not $moduleMatch.Success) { throw "Missing module block in $HtmlPath" }
    $bootstrapContent = $moduleMatch.Groups[1].Value.Trim() -replace '\./dist/', '../../dist/'
    Set-Content -Path $BootstrapPath -Value ($bootstrapContent + "`r`n")

    $updated = $raw
    $updated = [regex]::Replace($updated, '(?s)<style>\s*.*?\s*</style>', "<link rel=`"stylesheet`" href=`"$CssHref`">", 1)
    $updated = [regex]::Replace($updated, '(?s)<script>\s*.*?\s*</script>', "<script src=`"$JsSrc`"></script>", 1)
    $updated = [regex]::Replace($updated, '(?s)<script type=\"module\">\s*.*?\s*</script>', "<script type=`"module`" src=`"$BootstrapSrc`"></script>", 1)
    Set-Content -Path $HtmlPath -Value $updated
}

$assetsCss = Join-Path $RepoRoot 'assets/css'
$assetsJs = Join-Path $RepoRoot 'assets/js'
New-Item -ItemType Directory -Force -Path $assetsCss | Out-Null
New-Item -ItemType Directory -Force -Path $assetsJs | Out-Null

Write-PageAssets `
    -HtmlPath (Join-Path $RepoRoot 'ai_mode.html') `
    -CssPath (Join-Path $assetsCss 'ai_mode.css') `
    -JsPath (Join-Path $assetsJs 'ai_mode.js') `
    -BootstrapPath (Join-Path $assetsJs 'ai_mode_bootstrap.js') `
    -CssHref 'assets/css/ai_mode.css' `
    -JsSrc 'assets/js/ai_mode.js' `
    -BootstrapSrc 'assets/js/ai_mode_bootstrap.js'

Write-PageAssets `
    -HtmlPath (Join-Path $RepoRoot 'wall_navigator.html') `
    -CssPath (Join-Path $assetsCss 'wall_navigator.css') `
    -JsPath (Join-Path $assetsJs 'wall_navigator.js') `
    -BootstrapPath (Join-Path $assetsJs 'wall_navigator_bootstrap.js') `
    -CssHref 'assets/css/wall_navigator.css' `
    -JsSrc 'assets/js/wall_navigator.js' `
    -BootstrapSrc 'assets/js/wall_navigator_bootstrap.js'

Write-Host 'Split root page assets successfully.'
