param(
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$modeLaunchersDir = Join-Path $repoRoot 'mode-launchers'
$traceRoot = Join-Path $modeLaunchersDir 'traces'

$modes = @(
    @{ Name = 'ai-mode'; Label = 'AI Mode'; Command = @('run', './cmd/ai-mode'); Url = 'http://localhost:8004/ai_mode.html' },
    @{ Name = 'wall-navigator'; Label = 'Wall Navigator'; Command = @('run', './cmd/wall-navigator'); Url = 'http://localhost:8003/wall_navigator.html' },
    @{ Name = 'isolated-wall-navigator'; Label = 'Isolated Wall Navigator'; Command = @('run', './cmd/isolated-wall-navigator'); Url = 'http://localhost:8000/wall_navigator.html' },
    @{ Name = 'db-viewer'; Label = 'DB Viewer'; Command = @('run', './cmd/db-viewer'); Url = 'http://localhost:8001/db_view.html' }
)

function Test-Url {
    param(
        [string]$Url,
        [int]$TimeoutSec = 2
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
            return $true
        }
    } catch {
    }
    return $false
}

function Get-LatestTraceDir {
    param([string]$ModeName)

    $modeDir = Join-Path $traceRoot $ModeName
    if (-not (Test-Path $modeDir)) {
        return $null
    }
    $latest = Get-ChildItem -Path $modeDir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) { return $latest.FullName }
    return $null
}

function Get-LauncherState {
    param([string]$TraceDir)

    $launcherLog = if ($TraceDir) { Join-Path $TraceDir 'launcher.log' } else { $null }
    $content = if ($launcherLog -and (Test-Path $launcherLog)) { Get-Content $launcherLog -Raw } else { '' }
    [pscustomobject]@{
        BrowserOpened = $content -match 'browser_opened=true'
        ServerReady = $content -match 'server_ready=true'
        LauncherLog = $launcherLog
    }
}

$results = @()

foreach ($mode in $modes) {
    Write-Host "Launching $($mode.Label)..."
    $stdout = Join-Path $env:TEMP "$($mode.Name)-stdout.log"
    $stderr = Join-Path $env:TEMP "$($mode.Name)-stderr.log"
    Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue

    $process = Start-Process -FilePath 'go' -ArgumentList $mode.Command -WorkingDirectory $modeLaunchersDir -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $traceDir = $null
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        $traceDir = Get-LatestTraceDir -ModeName $mode.Name
        $launcherState = Get-LauncherState -TraceDir $traceDir
        $ready = $launcherState.BrowserOpened -and $launcherState.ServerReady
        if ($ready -and $traceDir) {
            break
        }
        Start-Sleep -Milliseconds 500
    }

    if ($process -and -not $process.HasExited) {
        & taskkill /PID $process.Id /T /F 2>$null | Out-Null
        Start-Sleep -Milliseconds 500
    }

    $traceOk = $false
    if ($traceDir) {
        $traceOk = (Test-Path (Join-Path $traceDir 'launcher.log')) -and (Test-Path (Join-Path $traceDir 'server.log'))
    }

    $results += [pscustomobject]@{
        Mode = $mode.Name
        Url = $mode.Url
        Ready = $ready
        TraceDir = $traceDir
        TraceOk = $traceOk
        StdoutTail = if (Test-Path $stdout) { (Get-Content $stdout -Tail 8) -join [Environment]::NewLine } else { '' }
        StderrTail = if (Test-Path $stderr) { (Get-Content $stderr -Tail 8) -join [Environment]::NewLine } else { '' }
    }

    $status = if ($ready -and $traceOk) { 'OK' } else { 'FAIL' }
    Write-Host "$status - $($mode.Name)"
}

$results | Format-Table -AutoSize Mode, Ready, TraceOk, TraceDir

$failed = $results | Where-Object { -not $_.Ready -or -not $_.TraceOk }
if ($failed) {
    Write-Host ''
    Write-Host 'Failures:'
    $failed | ForEach-Object {
        Write-Host "- $($_.Mode): url ready=$($_.Ready), trace ok=$($_.TraceOk)"
        if ($_.StdoutTail) {
            Write-Host '  stdout:'
            Write-Host $_.StdoutTail
        }
        if ($_.StderrTail) {
            Write-Host '  stderr:'
            Write-Host $_.StderrTail
        }
    }
    exit 1
}

Write-Host ''
Write-Host 'All launcher smoke tests passed.'
