@echo off
rem  Double-click this to set up the FBR agent on this PC.
rem
rem  Registering a scheduled task needs administrator rights. Rather than telling the
rem  person at the shop to right-click and pick the right menu item, this asks Windows
rem  for the rights itself and re-runs. They see the usual "Do you want to allow..."
rem  prompt and click Yes.

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo   Asking Windows for administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"

if exist "fbr-agent.exe" (
  "fbr-agent.exe" --install
) else (
  where node >nul 2>&1
  if errorlevel 1 (
    echo.
    echo   Node.js is not installed on this PC, and fbr-agent.exe is not in this folder.
    echo   Either put fbr-agent.exe here, or install Node.js LTS from https://nodejs.org
    echo.
    pause
    exit /b 1
  )
  if not exist "node_modules" (
    echo   Installing dependencies...
    call npm install --omit=dev --no-audit --no-fund
  )
  node index.js --install
)

pause
