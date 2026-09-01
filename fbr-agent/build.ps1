<#
.SYNOPSIS
  Builds fbr-agent.exe — the agent and a whole Node runtime in one file.

.DESCRIPTION
  Run this on a development machine with Node and internet access. It produces
  dist\ containing everything the shop PC needs, and nothing it has to install:

      dist\fbr-agent.exe
      dist\.env.example
      dist\Install FBR Agent.cmd
      dist\Uninstall FBR Agent.cmd
      dist\README.txt

  Copy that folder to the shop PC and double-click "Install FBR Agent.cmd".

  Three steps: esbuild flattens the agent and its dependencies into one script,
  Node's single-executable-application support turns that script into a blob, and
  postject writes the blob into a copy of node.exe.

.PARAMETER SkipBundle
  Reuse an existing build\bundle.js instead of running esbuild again.
#>
param([switch]$SkipBundle)

$ErrorActionPreference = 'Stop'
$Root  = $PSScriptRoot
$Build = Join-Path $Root 'build'
$Dist  = Join-Path $Root 'dist'

function Say  ($m) { Write-Host "  $m" }
function Ok   ($m) { Write-Host "  [ ok ] $m" -ForegroundColor Green }
function Die  ($m) { Write-Host "  [fail] $m" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Building fbr-agent.exe" -ForegroundColor Cyan
Write-Host "  ----------------------"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Die "Node.js is not installed on this machine." }

# SEA is only dependable from Node 20 on, and this is built against 22.
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) { Die "Node 20 or newer is required to build the executable (found $(& node -v))." }
Ok "Node $(& node -v)"

New-Item -ItemType Directory -Force -Path $Build, $Dist | Out-Null

# --- 1. dependencies -------------------------------------------------------------------
if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Say "Installing dependencies..."
  Push-Location $Root
  & npm install --no-audit --no-fund
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Die "npm install failed." }
}

# --- 2. bundle -------------------------------------------------------------------------
# SEA takes one script, not a folder, so express, axios, dotenv and the agent's own
# modules all have to be flattened first. node: builtins stay external — they come
# from the runtime already inside the executable.
$bundle = Join-Path $Build 'bundle.js'
if (-not $SkipBundle) {
  Say "Bundling with esbuild..."
  Push-Location $Root
  & npx --yes esbuild@0.23.1 index.js `
      --bundle `
      --platform=node `
      --target=node20 `
      --format=cjs `
      --minify `
      --external:node:sea `
      "--outfile=$bundle"
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Die "esbuild failed." }
}
if (-not (Test-Path $bundle)) { Die "No bundle at $bundle" }
Ok ("Bundled ({0:N0} KB)" -f ((Get-Item $bundle).Length / 1KB))

# --- 3. SEA blob -----------------------------------------------------------------------
$seaConfig = Join-Path $Build 'sea-config.json'
$seaJson = @{
  main                          = ($bundle -replace '\\', '/')
  output                        = ((Join-Path $Build 'sea-prep.blob') -replace '\\', '/')
  disableExperimentalSEAWarning = $true
} | ConvertTo-Json
# Windows PowerShell's -Encoding utf8 writes a BOM, and Node's JSON parser rejects
# one outright ("Unexpected token"). Write the bytes without it.
[System.IO.File]::WriteAllText($seaConfig, $seaJson, (New-Object System.Text.UTF8Encoding($false)))

Say "Generating the SEA blob..."
& node --experimental-sea-config $seaConfig
if ($LASTEXITCODE -ne 0) { Die "Could not generate the SEA blob." }
Ok "Blob generated."

# --- 4. inject into a copy of node.exe --------------------------------------------------
$exe = Join-Path $Dist 'fbr-agent.exe'
if (Test-Path $exe) { Remove-Item $exe -Force }
Copy-Item $node.Source $exe

# node.exe ships signed, and the signature covers bytes postject is about to change.
# Stripping it first avoids handing the shop PC a binary Windows reports as tampered.
$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if ($signtool) {
  try { & $signtool.Source remove /s $exe 2>$null | Out-Null; Ok "Removed node.exe's signature." }
  catch { Say "Could not strip the signature; carrying on." }
}

Say "Injecting the blob..."
& npx --yes postject@1.0.0-alpha.6 $exe NODE_SEA_BLOB (Join-Path $Build 'sea-prep.blob') `
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if ($LASTEXITCODE -ne 0) { Die "postject failed." }
Ok ("fbr-agent.exe built ({0:N0} MB)" -f ((Get-Item $exe).Length / 1MB))

# --- 5. everything else the shop PC needs ----------------------------------------------
Copy-Item (Join-Path $Root '.env.example')            $Dist -Force
Copy-Item (Join-Path $Root 'Install FBR Agent.cmd')   $Dist -Force
Copy-Item (Join-Path $Root 'Uninstall FBR Agent.cmd') $Dist -Force

@"
Allied Steel Center - FBR fiscal agent
======================================

WHAT TO DO

  1. Install the AJK fiscal component first, from the AJK-IRD portal.
     Choose the PRODUCTION build. You need the POS ID and Access Code.

  2. Copy this whole folder somewhere permanent on this PC.
     C:\AlliedSteel\fbr-agent is a good place. Not the Desktop, not Downloads.

  3. Double-click "Install FBR Agent.cmd".
     Windows will ask for permission - click Yes.
     It sets everything up and then tells you what is working.

  4. Open https://www.alliedsteel.store in Chrome or Edge ON THIS PC.
     Invoicing should show the FBR service as online.

Nothing else needs installing. Node.js is already inside fbr-agent.exe.


WHAT IT DOES

  Invoices are filed with AJK-IRD through this PC. Staff can raise an invoice from
  anywhere at any time; anything raised while this PC was switched off is filed
  automatically the next time it is on. Nothing is lost overnight.

  It starts by itself whenever Windows starts or anyone logs in, and restarts
  itself if it ever stops. You should not have to touch it.


IF SOMETHING LOOKS WRONG

  Double-click "Install FBR Agent.cmd" again - it re-checks everything and is
  safe to run as often as you like.

  fbr-agent.exe --status      what is running and how many invoices are waiting
  logs\agent.log              what it has been doing

  To remove it: "Uninstall FBR Agent.cmd".
"@ | Out-File -FilePath (Join-Path $Dist 'README.txt') -Encoding utf8

Write-Host ""
Ok "dist\ is ready to copy to the shop PC:"
Get-ChildItem $Dist | ForEach-Object { Say ("  {0,-28} {1,8:N0} KB" -f $_.Name, ($_.Length / 1KB)) }
Write-Host ""
Say "Test it here first:  .\dist\fbr-agent.exe --help"
Write-Host ""
