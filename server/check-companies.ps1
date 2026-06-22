Add-Type -AssemblyName System.Data
$cs = "Server=np:\\.\pipe\MSSQL`$SQLEXPRESS\sql\query;Database=genxMultiERPLive;Trusted_Connection=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection $cs
$conn.Open()

$tables = @('AccountVocherMaster','Orders','OrderDelivery','SaleInvoice','GatePass','SalesReturn','inv_PurchaseOrder','inv_GoodRecieveNote','inv_PurchaseDemandNote')

foreach ($tbl in $tables) {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = "SELECT CompanyId, BusinessUnitId, COUNT(*) AS N FROM [$tbl] GROUP BY CompanyId, BusinessUnitId ORDER BY N DESC"
  try {
    $r = $cmd.ExecuteReader()
    Write-Host "`n$tbl :"
    while ($r.Read()) { Write-Host "  CompanyId=$($r['CompanyId'])  BU=$($r['BusinessUnitId'])  rows=$($r['N'])" }
    $r.Close()
  } catch { Write-Host "  $tbl : $($_.Exception.Message)" }
}
$conn.Close()
