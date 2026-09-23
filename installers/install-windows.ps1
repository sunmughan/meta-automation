# installers/install-windows.ps1
# 1-Click Setup & Installer for Windows 10/11 (PowerShell)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  🚀 META AUTOMATION — WINDOWS 1-CLICK INSTALLER" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Project Directory: $rootDir"
Write-Host ""

# 1. Check Node.js
Write-Host "[1/5] Checking Node.js runtime..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  Node.js is not installed." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "📦 Installing Node.js LTS via winget..." -ForegroundColor Cyan
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        # Refresh environment PATH in current PowerShell session
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    } else {
        Write-Error "❌ winget not found. Please install Node.js >= 18 manually from https://nodejs.org"
        exit 1
    }
}

$nodeVer = & node -v
Write-Host "✅ Node.js detected: $nodeVer" -ForegroundColor Green

# 2. Check Browser (Brave or Chrome)
Write-Host "[2/5] Checking Browser (Brave / Chrome)..." -ForegroundColor Yellow
$candidates = @(
    "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
    "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browserFound = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browserFound) {
    Write-Host "✅ Browser detected: $browserFound" -ForegroundColor Green
} else {
    Write-Host "⚠️  Brave / Chrome not detected in standard program directories." -ForegroundColor Yellow
    Write-Host "💡 Install Brave with: winget install Brave.Brave" -ForegroundColor Cyan
}

# 3. Install Dependencies
Write-Host "[3/5] Installing Node.js dependencies..." -ForegroundColor Yellow
& npm install

# Job Revenue Engine setup: creates private profile directories and securely prompts for MiniMax API key.
node scripts/setup-job-engine.js

# 4. Configure Environment
Write-Host "[4/5] Setting up configuration (.env)..." -ForegroundColor Yellow
if (-not (Test-Path "$rootDir\.env")) {
    Copy-Item "$rootDir\.env.example" "$rootDir\.env"
    Write-Host "✅ Created .env from .env.example" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Existing .env preserved." -ForegroundColor Cyan
}

# 5. Run Test Suite
Write-Host "[5/5] Running verification test suite..." -ForegroundColor Yellow
& npm test

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  🎉 WINDOWS INSTALLATION COMPLETE!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "To start the automation daemon on Windows:" -ForegroundColor Cyan
Write-Host "   powershell -ExecutionPolicy Bypass -File .\start-automation.ps1" -ForegroundColor White
Write-Host "Or double-click: start-automation.bat" -ForegroundColor White
Write-Host ""
Write-Host "To inspect live health and stats:" -ForegroundColor Cyan
Write-Host "   powershell -ExecutionPolicy Bypass -File .\status-automation.ps1" -ForegroundColor White
Write-Host ""
Write-Host "To gracefully stop the daemon:" -ForegroundColor Cyan
Write-Host "   powershell -ExecutionPolicy Bypass -File .\stop-automation.ps1" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor Green
