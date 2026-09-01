<#
.SYNOPSIS
  Sets up the FBR fiscal agent on this PC, from source.

.DESCRIPTION
  A wrapper around `node index.js --install`, kept because it is the command the
  README has always documented. The registration itself lives in install.js so that
  the packaged fbr-agent.exe — which has no PowerShell script beside it — sets itself
  up exactly the same way. Two implementations of a scheduled task is one too many.

  Run from an ELEVATED PowerShell:
      Set-ExecutionPolicy -Scope Process Bypass -Force
      .\install.ps1

.PARAMETER Uninstall
  Removes the scheduled task. Leaves the folder and .env in place.
#>
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "  [fail] Run this from an elevated PowerShell (right-click, Run as administrator)." -ForegroundColor Red
  exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "  [warn] Node.js is not installed." -ForegroundColor Yellow
  Write-Host "         Install the LTS build, then run this again:"
  Write-Host "             winget install OpenJS.NodeJS.LTS"
  Write-Host "         Or use the packaged fbr-agent.exe, which needs no Node at all."
  exit 1
}

if ($Uninstall) {
  Push-Location $Root
  & node index.js --uninstall
  $code = $LASTEXITCODE
  Pop-Location
  exit $code
}

if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Write-Host "  Installing dependencies..."
  Push-Location $Root
  & npm install --omit=dev --no-audit --no-fund
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) {
    Write-Host "  [fail] npm install failed." -ForegroundColor Red
    exit 1
  }
}

Push-Location $Root
& node index.js --install
$code = $LASTEXITCODE
Pop-Location
exit $code
