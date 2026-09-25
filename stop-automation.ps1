# Stops both Meta Automation execution planes. Browser windows remain open.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  STOPPING META AUTOMATION (WINDOWS)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$files = @(
    @{ Name = "Social Automation"; Path = "$scriptDir\threads-agent.pid"; Pattern = "*threads-agent.js run*" },
    @{ Name = "Job Revenue Engine"; Path = "$scriptDir\job-agent.pid"; Pattern = "*job-agent.js run*" }
)

foreach ($item in $files) {
    if (Test-Path $item.Path) {
        $pid = Get-Content $item.Path -ErrorAction SilentlyContinue
        if ($pid) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Stopping $($item.Name) (PID $pid)..." -ForegroundColor Yellow
                Stop-Process -Id $pid -ErrorAction SilentlyContinue
            }
        }
        Remove-Item $item.Path -Force -ErrorAction SilentlyContinue
    }

    $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like $item.Pattern }
    foreach ($proc in $procs) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped orphaned $($item.Name) process (PID $($proc.ProcessId))." -ForegroundColor Green
    }
}

Write-Host "✅ Social + Job workers stopped." -ForegroundColor Green
Write-Host "Browser windows were left open intentionally." -ForegroundColor Gray
