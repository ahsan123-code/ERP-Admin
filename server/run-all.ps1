# Full automated pipeline — no manual steps
# 1) Finds latest .bak  2) Restores to SQL Server  3) Exports CSVs  4) Imports to Supabase
# Run: powershell -ExecutionPolicy Bypass -File run-all.ps1
#      powershell -ExecutionPolicy Bypass -File run-all.ps1 -BakDir "D:\path\to\baks"
param(
  [string]$BakDir = "D:\ERP-admin\DATABASE-BACKUP"
)

$BAK_DIR    = $BakDir
$SERVER     = "np:\\.\pipe\MSSQL`$SQLEXPRESS\sql\query"
$DB         = "genxMultiERPLive"
$SCRIPT_DIR = $PSScriptRoot

# ── helpers ───────────────────────────────────────────────────────────────────

function Run-Sql($query, $timeoutSec = 30) {
  $tmp = [System.IO.Path]::GetTempFileName() + ".sql"
  [System.IO.File]::WriteAllText($tmp, $query, [System.Text.Encoding]::UTF8)
  sqlcmd -S $SERVER -E -C -i $tmp -t $timeoutSec
  $code = $LASTEXITCODE
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  if ($code -ne 0) { throw "sqlcmd exited with code $code" }
}

function Write-Step($n, $msg) {
  Write-Host ""
  Write-Host "[$n/3] $msg" -ForegroundColor Cyan
  Write-Host ("-" * 50)
}

# ── STEP 1 — Restore latest .bak ─────────────────────────────────────────────

Write-Step 1 "Restoring latest .bak to SQL Server"

$latest = Get-ChildItem "$BAK_DIR\*.bak" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$latest) { Write-Error "No .bak files found in $BAK_DIR"; exit 1 }

Write-Host "File : $($latest.Name)"
Write-Host "Size : $([math]::Round($latest.Length/1MB, 0)) MB"
Write-Host "Date : $($latest.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))"
Write-Host ""

# Kill any open connections so RESTORE can get exclusive access
try {
  Run-Sql "IF DB_ID('$DB') IS NOT NULL ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE" -timeoutSec 30
  Write-Host "Existing connections dropped."
} catch {
  Write-Host "Note: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Restore — this takes a few minutes for a 280 MB file
Write-Host "Restoring (this takes 2-5 min)..."
$t = Get-Date
try {
  Run-Sql "RESTORE DATABASE [$DB] FROM DISK = N'$($latest.FullName)' WITH REPLACE, RECOVERY, STATS = 10" -timeoutSec 600
} catch {
  Write-Error "Restore failed: $($_.Exception.Message)"
  Write-Host "Make sure SQL Server Express is running (check Services or SQL Server Configuration Manager)." -ForegroundColor Yellow
  exit 1
}
$elapsed = [math]::Round(((Get-Date) - $t).TotalSeconds, 0)
Write-Host "Restore done in ${elapsed}s." -ForegroundColor Green

# ── STEP 2 — Export all tables to CSV ────────────────────────────────────────

Write-Step 2 "Exporting all tables to CSV"
& powershell -ExecutionPolicy Bypass -File "$SCRIPT_DIR\export-all.ps1"
if ($LASTEXITCODE -ne 0) { Write-Error "Export failed"; exit 1 }

# ── STEP 3 — Import CSVs into Supabase ───────────────────────────────────────

# Uses import-all-safe.js, NOT import-all.js. The latter clears its tables with
# unconditional DELETEs, which wipes company 2's ledger lines (their headers are
# scoped to company 1 and survive, leaving orphans) and every transaction entered
# in the ERP app itself rather than in GenX. The safe version upserts instead.
Write-Step 3 "Importing into Supabase"
node "$SCRIPT_DIR\import-all-safe.js"
if ($LASTEXITCODE -ne 0) { Write-Error "Import failed"; exit 1 }

Write-Host ""
Write-Host "All done!" -ForegroundColor Green
