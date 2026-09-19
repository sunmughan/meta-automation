# start-automation.ps1
# Master command to launch Meta Automation on Windows
param (
    [switch]$Foreground
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$pidFile = "$scriptDir\threads-agent.pid"
$logDir = "$scriptDir\logs"
$logFile = "$logDir\daemon.log"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  🚀 META AUTOMATION — WINDOWS RUNNER" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Ensure Browser CDP is running
Write-Host "[1/3] Checking Browser CDP port 9222..." -ForegroundColor Yellow
& node "$scriptDir\scripts\launch-browser-cdp.js"
if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Failed to verify browser CDP on port 9222."
    exit 1
}

# 2. Check Auth
Write-Host "[2/3] Checking Threads & Instagram sessions..." -ForegroundColor Yellow
& node threads-agent.js auth | Out-Null

# 3. Check if already running
if (Test-Path $pidFile) {
    $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($existingPid) {
        $proc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host ""
            Write-Host "==================================================" -ForegroundColor Green
            Write-Host "  🟢 Automation is ALREADY running (PID: $existingPid)" -ForegroundColor Green
            Write-Host "==================================================" -ForegroundColor Green
            Write-Host "Live logs   : Get-Content -Wait $logFile" -ForegroundColor White
            Write-Host "Check status: powershell .\status-automation.ps1" -ForegroundColor White
            Write-Host "Stop daemon : powershell .\stop-automation.ps1" -ForegroundColor White
            exit 0
        }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# 4. Foreground vs Background
if ($Foreground) {
    Write-Host "[3/3] Starting automation loop in FOREGROUND..." -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
    Write-Host "==================================================" -ForegroundColor Cyan
    & node threads-agent.js run
} else {
    Write-Host "[3/3] Starting automation loop in BACKGROUND..." -ForegroundColor Yellow
    $proc = Start-Process -FilePath "node" -ArgumentList "threads-agent.js run" -RedirectStandardOutput $logFile -RedirectStandardError $logFile -PassThru -WindowStyle Hidden
    $proc.Id | Out-File -FilePath $pidFile -Encoding ascii
    Start-Sleep -Seconds 2

    if (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) {
        Write-Host "==================================================" -ForegroundColor Green
        Write-Host "  🟢 Automation daemon successfully started!" -ForegroundColor Green
        Write-Host "==================================================" -ForegroundColor Green
        Write-Host "PID        : $($proc.Id)" -ForegroundColor Cyan
        Write-Host "Live logs  : Get-Content -Wait $logFile" -ForegroundColor Cyan
        Write-Host "Status     : powershell .\status-automation.ps1" -ForegroundColor Cyan
        Write-Host "Stop       : powershell .\stop-automation.ps1" -ForegroundColor Cyan
        Write-Host "==================================================" -ForegroundColor Green
    } else {
        Write-Error "❌ Failed to start automation daemon. Check $logFile"
        exit 1
    }
}
