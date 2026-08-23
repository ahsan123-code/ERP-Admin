# Exports all transaction + detail tables for CompanyId=3 (Ahsan Brothers - Shop 58)
# Files prefixed with c3_ to avoid overwriting CID=1 exports
Add-Type -AssemblyName System.Data

$cs  = "Server=np:\\.\pipe\MSSQL`$SQLEXPRESS\sql\query;Database=genxMultiERPLive;Trusted_Connection=True;"
$CID = 3
$OUT = Join-Path $PSScriptRoot "sqldata"

$conn = New-Object System.Data.SqlClient.SqlConnection $cs
$conn.Open()
Write-Host "Connected to SQL Server (CompanyId=$CID).`n"

function Export-Query($label, $file, $sql) {
  Write-Host "Exporting $label ..." -NoNewline
  $cmd             = $conn.CreateCommand()
  $cmd.CommandText = $sql
  $cmd.CommandTimeout = 300
  try {
    $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $dt = New-Object System.Data.DataTable
    $da.Fill($dt) | Out-Null

    $path = Join-Path $OUT $file
    $cols = $dt.Columns | ForEach-Object { $_.ColumnName }

    $sb = [System.Text.StringBuilder]::new()
    $sb.AppendLine($cols -join ',') | Out-Null
    foreach ($row in $dt.Rows) {
      $vals = foreach ($c in $cols) {
        $v = $row[$c]
        if ($v -is [DBNull])       { '' }
        elseif ($v -is [DateTime]) { $v.ToString('yyyy-MM-dd') }
        else {
          $s = $v.ToString()
          if ($s -match '[,"\n]') { '"' + $s.Replace('"','""') + '"' } else { $s }
        }
      }
      $sb.AppendLine($vals -join ',') | Out-Null
    }
    [System.IO.File]::WriteAllText($path, $sb.ToString(), [System.Text.Encoding]::UTF8)
    Write-Host " $($dt.Rows.Count) rows -> $file"
  } catch {
    Write-Host " FAILED: $($_.Exception.Message)"
  }
}

# ── Vouchers ─────────────────────────────────────────────────────────────────
Export-Query 'Vouchers' 'c3_vouchers.csv' "
SELECT m.TransectionId, m.VocherId AS VoucherNo, m.VoucherType,
  CONVERT(VARCHAR,m.VocherDate,23) AS VocherDate, ISNULL(m.Remarks,'') AS Remarks,
  ISNULL(ag.TotalDebit,0)  AS TotalDebit, ISNULL(ag.TotalCredit,0) AS TotalCredit,
  ISNULL(ag.MainAccount,'') AS MainAccount
FROM AccountVocherMaster m
OUTER APPLY (
  SELECT SUM(Dr_Amount) AS TotalDebit, SUM(Cr_Amount) AS TotalCredit,
         MAX(CASE WHEN Dr_Amount > 0 THEN AccountTitle END) AS MainAccount
  FROM AccountVocherChild WHERE TransectionId = m.TransectionId AND CompanyId = m.CompanyId
) ag
WHERE m.CompanyId = $CID ORDER BY m.VocherDate DESC"

# ── Voucher Lines ─────────────────────────────────────────────────────────────
Export-Query 'Voucher Lines' 'c3_voucher_lines.csv' "
SELECT c.TransectionId, c.SrNo, ISNULL(c.AccountCode,'') AS AccountCode,
  ISNULL(c.AccountTitle,'') AS AccountTitle,
  ISNULL(c.Dr_Amount,0) AS Dr_Amount, ISNULL(c.Cr_Amount,0) AS Cr_Amount,
  ISNULL(c.Naration,'') AS Naration
FROM AccountVocherChild c WHERE c.CompanyId = $CID"

# ── Sales Orders ──────────────────────────────────────────────────────────────
Export-Query 'Sales Orders' 'c3_orders.csv' "
SELECT o.OrderId, o.CustomerId,
  CONVERT(VARCHAR,o.BookingDate,23) AS BookingDate,
  CONVERT(VARCHAR,o.DeliveryDate,23) AS DeliveryDate,
  o.Status, ISNULL(d.ItemCount,0) AS ItemCount, ISNULL(d.TotalAmount,0) AS TotalAmount
FROM Orders o
LEFT JOIN (
  SELECT OrderId, COUNT(*) AS ItemCount, SUM(ISNULL(NetAmount,0)) AS TotalAmount
  FROM OrderDetail WHERE CompanyId = $CID GROUP BY OrderId
) d ON d.OrderId = o.OrderId
WHERE o.CompanyId = $CID ORDER BY o.BookingDate DESC"

# ── SO Line Items ─────────────────────────────────────────────────────────────
Export-Query 'SO Line Items' 'c3_so_lines.csv' "
SELECT od.OrderId, CAST(od.ItemId AS VARCHAR) AS ItemId,
  ISNULL(i.Name,'Item-'+CAST(od.ItemId AS VARCHAR)) AS ItemName,
  ISNULL(i.UnitMeasure,'') AS UnitMeasure,
  ISNULL(od.Quantity,0) AS Quantity, ISNULL(od.Price,0) AS Price, ISNULL(od.NetAmount,0) AS NetAmount
FROM OrderDetail od
LEFT JOIN Items i ON i.ItemId = od.ItemId AND i.CompanyId = od.CompanyId
WHERE od.CompanyId = $CID"

# ── Delivery Notes ────────────────────────────────────────────────────────────
Export-Query 'Delivery Notes' 'c3_delivery.csv' "
SELECT DeliveryId, OrderId, CONVERT(VARCHAR,SalesDate,23) AS SalesDate,
  ISNULL(VehicleNo,'') AS VehicleNo
FROM OrderDelivery WHERE CompanyId = $CID ORDER BY SalesDate DESC"

# ── Sale Invoices ─────────────────────────────────────────────────────────────
Export-Query 'Sale Invoices' 'c3_sale_invoice.csv' "
SELECT si.SaleInvoiceId, si.OrderId, si.DeliveryId,
  CONVERT(VARCHAR,si.SaleInvoiceDate,23) AS SaleInvoiceDate,
  ISNULL(si.FreightExpense,0)          AS FreightExpense,
  ISNULL(si.LoadingUnLoadingExpense,0) AS LoadingUnLoadingExpense,
  ISNULL(si.PackingExpense,0)          AS PackingExpense,
  ISNULL(si.TollExpense,0)             AS TollExpense,
  ISNULL(si.SlittingCharges,0)         AS SlittingCharges,
  ISNULL(si.CuttingCharges,0)          AS CuttingCharges,
  ISNULL(si.OtherExpense,0)            AS OtherExpense,
  ISNULL(od.SubTotal,0)                AS SubTotal,
  ISNULL(od.SubTotal,0)+ISNULL(si.FreightExpense,0)+ISNULL(si.LoadingUnLoadingExpense,0)
    +ISNULL(si.PackingExpense,0)+ISNULL(si.TollExpense,0)+ISNULL(si.SlittingCharges,0)
    +ISNULL(si.CuttingCharges,0)+ISNULL(si.OtherExpense,0) AS GrandTotal
FROM SaleInvoice si
OUTER APPLY (
  SELECT SUM(ISNULL(NetAmount,0)) AS SubTotal FROM OrderDetail
  WHERE OrderId = si.OrderId AND CompanyId = si.CompanyId
) od
WHERE si.CompanyId = $CID ORDER BY si.SaleInvoiceDate DESC"

# ── Purchase Orders ───────────────────────────────────────────────────────────
Export-Query 'Purchase Orders' 'c3_po.csv' "
SELECT po.PurchaseOrderId, po.VendorId,
  CONVERT(VARCHAR,po.PurchaseOrderDate,23) AS PurchaseOrderDate,
  ISNULL(po.PurchaseOrderStatus,'') AS PurchaseOrderStatus,
  ISNULL(d.ItemCount,0) AS ItemCount, ISNULL(d.TotalAmount,0) AS TotalAmount
FROM inv_PurchaseOrder po
LEFT JOIN (
  SELECT PurchaseOrderId, COUNT(*) AS ItemCount,
         SUM(ISNULL(ItemQuantity*ItemPrice,0)) AS TotalAmount
  FROM inv_PurchaseOrderDetail WHERE CompanyId = $CID GROUP BY PurchaseOrderId
) d ON d.PurchaseOrderId = po.PurchaseOrderId
WHERE po.CompanyId = $CID ORDER BY po.PurchaseOrderDate DESC"

# ── PO Line Items ─────────────────────────────────────────────────────────────
Export-Query 'PO Line Items' 'c3_po_lines.csv' "
SELECT pd.PurchaseOrderId, CAST(pd.ItemId AS VARCHAR) AS ItemId,
  ISNULL(i.Name,'Item-'+CAST(pd.ItemId AS VARCHAR)) AS ItemName,
  ISNULL(i.UnitMeasure,'') AS UnitMeasure,
  ISNULL(pd.ItemQuantity,0) AS ItemQuantity, ISNULL(pd.ItemPrice,0) AS ItemPrice,
  ISNULL(pd.ItemQuantity,0)*ISNULL(pd.ItemPrice,0) AS TotalPrice
FROM inv_PurchaseOrderDetail pd
LEFT JOIN Items i ON i.ItemId = pd.ItemId AND i.CompanyId = pd.CompanyId
WHERE pd.CompanyId = $CID"

# ── GRNs ──────────────────────────────────────────────────────────────────────
Export-Query 'GRNs' 'c3_grn.csv' "
SELECT g.GrnId, CONVERT(VARCHAR,g.GoodRecieveDate,23) AS GoodRecieveDate,
  ISNULL(g.Status,'') AS Status
FROM inv_GoodRecieveNote g WHERE g.CompanyId = $CID ORDER BY g.GoodRecieveDate DESC"

# ── GRN Line Items ────────────────────────────────────────────────────────────
Export-Query 'GRN Line Items' 'c3_grn_lines.csv' "
SELECT g.GrnId, CAST(g.ItemId AS VARCHAR) AS ItemId,
  ISNULL(i.Name,'Item-'+CAST(g.ItemId AS VARCHAR)) AS ItemName,
  ISNULL(i.UnitMeasure,'') AS UnitMeasure, g.WarehouseId,
  ISNULL(g.RecievedQuantity,0) AS RecievedQuantity, ISNULL(g.Price,0) AS Price,
  ISNULL(g.RecievedQuantity,0)*ISNULL(g.Price,0) AS TotalPrice
FROM inv_GoodRecieveNoteDetailItems g
LEFT JOIN Items i ON i.ItemId = g.ItemId AND i.CompanyId = g.CompanyId
WHERE g.CompanyId = $CID"

# ── PDNs ──────────────────────────────────────────────────────────────────────
Export-Query 'PDNs' 'c3_pdn.csv' "
SELECT p.PdnId, p.DepartmentId, CONVERT(VARCHAR,p.DemandNoteDate,23) AS DemandNoteDate,
  ISNULL(p.Priority,'') AS Priority, ISNULL(p.Status,'') AS Status,
  ISNULL(d.ItemCount,0) AS ItemCount
FROM inv_PurchaseDemandNote p
LEFT JOIN (
  SELECT PdnId, COUNT(*) AS ItemCount FROM inv_purchaseDemandNoteDetail
  WHERE CompanyId = $CID GROUP BY PdnId
) d ON d.PdnId = p.PdnId
WHERE p.CompanyId = $CID ORDER BY p.DemandNoteDate DESC"

# ── PDN Line Items ────────────────────────────────────────────────────────────
Export-Query 'PDN Line Items' 'c3_pdn_lines.csv' "
SELECT dd.PdnId, CAST(dd.ItemId AS VARCHAR) AS ItemId,
  ISNULL(i.Name,'Item-'+CAST(dd.ItemId AS VARCHAR)) AS ItemName,
  ISNULL(i.UnitMeasure,'') AS UnitMeasure,
  ISNULL(dd.Quantity,0) AS Quantity, ISNULL(dd.ApprovedQuantity,0) AS ApprovedQuantity
FROM inv_purchaseDemandNoteDetail dd
LEFT JOIN Items i ON i.ItemId = dd.ItemId AND i.CompanyId = dd.CompanyId
WHERE dd.CompanyId = $CID"

$conn.Close()
Write-Host "`nAll Company 3 exports done. Files saved to sqldata\c3_*"
