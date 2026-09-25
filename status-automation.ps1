# status-automation.ps1
# Inspect live health, rate limits, and engagement telemetry on Windows

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$pidFile = "$scriptDir\threads-agent.pid"
$logFile = "$scriptDir\logs\daemon.log"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  META AUTOMATION — SYSTEM STATUS (WINDOWS)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$isRunning = $false
if (Test-Path $pidFile) {
    $agentPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($agentPid) {
        $proc = Get-Process -Id $agentPid -ErrorAction SilentlyContinue
        if ($proc) {
            $isRunning = $true
            $wsMb = [math]::Round($proc.WorkingSet64 / 1MB, 2)
            Write-Host "🟢 Daemon Status : RUNNING (PID: $agentPid, Memory: ${wsMb}MB)" -ForegroundColor Green
        }
    }
}

if (-not $isRunning) {
    Write-Host "🔴 Daemon Status : STOPPED" -ForegroundColor Red
}

# Check CDP port
$test = Test-NetConnection -ComputerName 127.0.0.1 -Port 9222 -WarningAction SilentlyContinue
if ($test.TcpTestSucceeded) {
    Write-Host "🟢 Browser CDP   : ACTIVE (http://127.0.0.1:9222)" -ForegroundColor Green
} else {
    Write-Host "🔴 Browser CDP   : NOT REACHABLE on port 9222" -ForegroundColor Red
}

# Print CLI Status summary
& node threads-agent.js status

if (Test-Path $logFile) {
    Write-Host ""
    Write-Host "Recent Activity (last 10 lines):" -ForegroundColor Cyan
    Write-Host "--------------------------------------------------" -ForegroundColor Gray
    Get-Content $logFile -Tail 10
    Write-Host "--------------------------------------------------" -ForegroundColor Gray
    Write-Host "To stream live logs: Get-Content -Wait $logFile" -ForegroundColor Yellow
}
