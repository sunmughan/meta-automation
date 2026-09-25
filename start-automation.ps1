# Standalone Meta Automation launcher for Windows.
# Starts both browser execution planes and both Node workers.
# No IDE is required.

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

& node "$scriptDir\scripts\desktop-runner.js" @args
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
