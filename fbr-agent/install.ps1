<#
.SYNOPSIS
  One-time setup of the AJK-IRD fiscal agent on the shop PC.

.DESCRIPTION
  Installs dependencies, writes .env, and registers the agent as a scheduled task that
  starts with Windows and restarts itself if it stops. Then checks the whole path the
  ERP depends on: the agent answers, the AJK fiscal component answers, and Chrome's
  private-network preflight is allowed.

  Run from an ELEVATED PowerShell:
      Set-ExecutionPolicy -Scope Process Bypass -Force
      .\install.ps1

.PARAMETER Uninstall
  Removes the scheduled task. Leaves the folder and .env in place.
#>
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$TaskName = 'AlliedSteelFbrAgent'
$AgentDir = $PSScriptRoot
$Port     = 4000

function Say  ($m) { Write-Host "  $m" }
function Ok   ($m) { Write-Host "  [ ok ] $m"   -ForegroundColor Green }
function Warn ($m) { Write-Host "  [warn] $m"   -ForegroundColor Yellow }
function Die  ($m) { Write-Host "  [fail] $m"   -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Allied Steel Center - FBR fiscal agent setup" -ForegroundColor Cyan
Write-Host "  --------------------------------------------"

# --- must be elevated: registering a task and binding a port both need it -------------
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Die "Run this from an elevated PowerShell (right-click, Run as administrator)." }

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask    -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Ok "Removed scheduled task '$TaskName'."
  } else {
    Say "No task named '$TaskName' was registered."
  }
  exit 0
}

# --- node ------------------------------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Warn "Node.js is not installed."
  Say  "Install the LTS build, then run this script again:"
  Say  "    winget install OpenJS.NodeJS.LTS"
  Say  "  or download it from https://nodejs.org"
  exit 1
}
Ok "Node $(& node -v) at $($node.Source)"

# --- dependencies ----------------------------------------------------------------------
Say "Installing dependencies (express, cors, dotenv, axios)..."
Push-Location $AgentDir
& npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; Die "npm install failed." }
Pop-Location
Ok "Dependencies installed."

# --- .env ------------------------------------------------------------------------------
$envFile = Join-Path $AgentDir '.env'
if (Test-Path $envFile) {
  Ok ".env already present - left untouched."
} else {
  Copy-Item (Join-Path $AgentDir '.env.example') $envFile
  Ok "Created .env from .env.example (FBR_ENV=production)."
  Warn "If the fiscal component installed here is the SANDBOX build, set FBR_ENV=sandbox."
}

# --- scheduled task --------------------------------------------------------------------
# A task rather than a Windows service: it needs no extra tooling, survives reboots, and
# can be inspected and stopped from Task Scheduler by whoever looks after the machine.
# cmd.exe wraps it only so stdout and stderr land in a log worth reading later.
$logDir = Join-Path $AgentDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'agent.log'

$cmdArgs = '/c ""{0}" index.js >> "{1}" 2>&1"' -f $node.Source, $log
$action  = New-ScheduledTaskAction -Execute "$env:ComSpec" -Argument $cmdArgs -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$princ   = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
             -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
             -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Say "Replaced the existing task."
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $princ -Settings $set `
  -Description 'Relays ERP invoices to the AJK-IRD fiscal component on this machine.' | Out-Null
Ok "Registered '$TaskName' to start with Windows."

Start-ScheduledTask -TaskName $TaskName
Say "Starting the agent..."

# --- verify ----------------------------------------------------------------------------
$up = $false
foreach ($i in 1..15) {
  Start-Sleep -Seconds 1
  try {
    $h = Invoke-RestMethod "http://localhost:$Port/health" -TimeoutSec 3
    if ($h.status -eq 'ok') { $up = $true; break }
  } catch { }
}
if (-not $up) { Die "The agent did not answer on port $Port. See $log" }
Ok "Agent answering on http://localhost:$Port"

try {
  $s = Invoke-RestMethod "http://localhost:$Port/api/fbr/status" -TimeoutSec 10
  if ($s.online) {
    Ok "AJK fiscal component is online (port 8524)."
  } else {
    Warn "AJK fiscal component did NOT answer on port 8524."
    Say  "Invoices will go to the AJK cloud endpoint instead of the local component."
    Say  "Install it from the AJK-IRD portal, then check:"
    Say  "    curl http://localhost:8524/api/IMSFiscal/Get"
  }
} catch { Warn "Could not read /api/fbr/status: $($_.Exception.Message)" }

# Chrome refuses an HTTPS page -> localhost call unless the agent opts in. Ask exactly
# what the browser asks, so a missing header is caught here and not by a blank screen.
try {
  $pre = Invoke-WebRequest "http://localhost:$Port/api/fbr/submit" -Method Options -TimeoutSec 5 `
    -Headers @{
      'Origin'                                  = 'https://www.alliedsteel.store'
      'Access-Control-Request-Method'           = 'POST'
      'Access-Control-Request-Private-Network'  = 'true'
    }
  if ($pre.Headers['Access-Control-Allow-Private-Network'] -eq 'true') {
    Ok "Chrome private-network preflight allowed."
  } else {
    Warn "Private-network header missing - Chrome will block the ERP from reaching this agent."
  }
} catch { Warn "Preflight check failed: $($_.Exception.Message)" }

Write-Host ""
Write-Host "  Done. Open https://www.alliedsteel.store on THIS machine and check that" -ForegroundColor Cyan
Write-Host "  Invoicing shows the FBR service as online." -ForegroundColor Cyan
Write-Host ""
Say "logs      : $log"
Say "stop      : Stop-ScheduledTask -TaskName $TaskName"
Say "start     : Start-ScheduledTask -TaskName $TaskName"
Say "remove    : .\install.ps1 -Uninstall"
Write-Host ""
