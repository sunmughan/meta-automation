$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $rootDir
& node scripts/launch-job-browser.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node job-agent.js run
