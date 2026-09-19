# scripts/launch-brave-cdp.ps1
# Windows PowerShell helper script to launch Brave/Chrome with CDP on port 9222

$CDP_PORT = 9222
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# If Node.js is available, run the universal cross-platform launcher
if (Get-Command node -ErrorAction SilentlyContinue) {
    & node "$scriptDir\launch-browser-cdp.js"
    exit $LASTEXITCODE
}

# Native PowerShell fallback
$test = Test-NetConnection -ComputerName 127.0.0.1 -Port $CDP_PORT -WarningAction SilentlyContinue
if ($test.TcpTestSucceeded) {
    Write-Host "✅ Browser CDP is already active and listening on port $CDP_PORT!" -ForegroundColor Green
    exit 0
}

$localAppData = $env:LOCALAPPDATA
$candidates = @(
    "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
    "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
    "$localAppData\BraveSoftware\Brave-Browser\Application\brave.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$localAppData\Google\Chrome\Application\chrome.exe"
)

$bin = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bin) {
    Write-Error "❌ Neither Brave nor Google Chrome could be found in default Windows program paths."
    exit 1
}

$isBrave = $bin.ToLower().Contains("brave")
$userData = if ($isBrave) { "$localAppData\BraveSoftware\Brave-Browser\User Data" } else { "$localAppData\Google\Chrome\User Data" }

Write-Host "🚀 Launching $bin on CDP port $CDP_PORT..." -ForegroundColor Cyan
Start-Process -FilePath $bin -ArgumentList "--remote-debugging-port=$CDP_PORT", "--user-data-dir=`"$userData`"", "--no-first-run", "--no-default-browser-check", "--restore-last-session"

Start-Sleep -Seconds 3
Write-Host "✅ Browser launched on port $CDP_PORT." -ForegroundColor Green
