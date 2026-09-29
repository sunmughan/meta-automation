$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $rootDir

& node "$rootDir\scripts\desktop-runner.js" --mode=job @args
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

