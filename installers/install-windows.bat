@echo off
REM installers/install-windows.bat
REM 1-Click Batch Installer wrapper for Windows
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
pause
