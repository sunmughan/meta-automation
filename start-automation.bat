@echo off
REM start-automation.bat
REM 1-Click Batch Runner for Windows
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-automation.ps1" %*
pause
