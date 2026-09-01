@echo off
rem  Removes the scheduled task. Leaves this folder and .env alone.

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"

if exist "fbr-agent.exe" (
  "fbr-agent.exe" --uninstall
) else (
  node index.js --uninstall
)

pause
