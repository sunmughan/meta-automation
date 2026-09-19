# stop-automation.ps1
# Gracefully stops the Meta Automation background daemon on Windows

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$pidFile = "$scriptDir\threads-agent.pid"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  🛑 STOPPING META AUTOMATION DAEMON (WINDOWS)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if (-not (Test-Path $pidFile)) {
    Write-Host "ℹ️  No PID file found. Checking for running node threads-agent processes..." -ForegroundColor Yellow
    $procs = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*threads-agent.js run*" }
    if ($procs) {
        foreach ($p in $procs) {
            Stop-Process -Id $p.ProcessId -Force
            Write-Host "✅ Stopped orphaned process (PID: $($p.ProcessId))" -ForegroundColor Green
        }
    } else {
        Write-Host "✅ No active Meta Automation daemon found running." -ForegroundColor Green
    }
    exit 0
}

$agentPid = Get-Content $pidFile -ErrorAction SilentlyContinue
if ($agentPid) {
    $proc = Get-Process -Id $agentPid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "🔄 Gracefully stopping daemon (PID: $agentPid)..." -ForegroundColor Yellow
        Stop-Process -Id $agentPid -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        if (Get-Process -Id $agentPid -ErrorAction SilentlyContinue) {
            Stop-Process -Id $agentPid -Force -ErrorAction SilentlyContinue
        }
        Write-Host "✅ Daemon process stopped successfully." -ForegroundColor Green
    } else {
        Write-Host "ℹ️  Process $agentPid was not running." -ForegroundColor Yellow
    }
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  ✅ AUTOMATION STOPPED" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
