# Master export: pulls ALL data from SQL Server into sqldata\ CSVs
# Skips ItemsDefination (items catalogue) as requested
# Run: powershell -ExecutionPolicy Bypass -File export-all.ps1
#      powershell -ExecutionPolicy Bypass -File export-all.ps1 -Database genx_20260817
param(
  [string]$Database = "genxMultiERPLive",
  [string]$OutDir   = ""
)
Add-Type -AssemblyName System.Data

$cs  = "Server=np:\\.\pipe\MSSQL`$SQLEXPRESS\sql\query;Database=$Database;Trusted_Connection=True;"
$CID = 1
$OUT = if ($OutDir) { $OutDir } else { Join-Path $PSScriptRoot "sqldata" }
if (!(Test-Path $OUT)) { New-Item -ItemType Directory $OUT | Out-Null }

$conn = New-Object System.Data.SqlClient.SqlConnection $cs
$conn.Open()
Write-Host "Connected to SQL Server ($Database).`n"

function Export-Query($label, $file, $sql) {
  Write-Host "  $label ..." -NoNewline
  $cmd             = $conn.CreateCommand()
  $cmd.CommandText = $sql
  $cmd.CommandTimeout = 300
  try {
    $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $dt = New-Object System.Data.DataTable
    $da.Fill($dt) | Out-Null
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
    [System.IO.File]::WriteAllText((Join-Path $OUT $file), $sb.ToString(), [System.Text.Encoding]::UTF8)
    Write-Host " $($dt.Rows.Count) rows"
  } catch {
    Write-Host " FAILED: $($_.Exception.Message)"
  }
}

# ── MASTER DATA ────────────────────────────────────────────────────────────────
Write-Host "=== MASTER DATA ==="
Export-Query 'Company'          'company.csv'          "SELECT * FROM Company"
Export-Query 'Branches'         'branches.csv'         "SELECT * FROM Branches"
Export-Query 'Departments'      'departments.csv'      "SELECT * FROM Department"
Export-Query 'Designations'     'designations.csv'     "SELECT * FROM Designation"
Export-Query 'Units'            'units.csv'            "SELECT DISTINCT UnitMeasure, Abberivation FROM Units WHERE UnitMeasure IS NOT NULL"
Export-Query 'Chart of Accounts' 'chart_of_accounts.csv' "SELECT * FROM ChartOfAccount WHERE CompanyId = $CID"
Export-Query 'Bank Accounts'    'bank_accounts.csv'    "SELECT * FROM BankAccounts WHERE CompanyId = $CID"
Export-Query 'Customers'        'customers.csv'        "SELECT * FROM Customers WHERE CompanyId = $CID"
Export-Query 'Vendors'          'vendors.csv'          "SELECT * FROM inv_Vendors WHERE CompanyId = $CID"
Export-Query 'Currency'         'currency.csv'         "SELECT * FROM Currency"
Export-Query 'Employees'        'employees.csv'        "SELECT * FROM Employees WHERE CompanyId = $CID"

# ── TRANSACTIONS ───────────────────────────────────────────────────────────────
Write-Host "`n=== TRANSACTIONS ==="

Export-Query 'Vouchers (ALL)' 'tx_vouchers.csv' "
SELECT m.TransectionId,
       m.VocherId AS VoucherNo,
       m.VoucherType,
       CONVERT(VARCHAR,m.VocherDate,23) AS VocherDate,
       ISNULL(m.Remarks,'')             AS Remarks,
       ISNULL(ag.TotalDebit,0)          AS TotalDebit,
       ISNULL(ag.TotalCredit,0)         AS TotalCredit,
       ISNULL(ag.MainAccount,'')        AS MainAccount,
       m.CompanyId
FROM AccountVocherMaster m
OUTER APPLY (
  SELECT SUM(Dr_Amount) AS TotalDebit,
         SUM(Cr_Amount) AS TotalCredit,
         MAX(CASE WHEN Dr_Amount > 0 THEN AccountTitle END) AS MainAccount
  FROM AccountVocherChild
  WHERE TransectionId = m.TransectionId AND CompanyId = m.CompanyId
) ag
WHERE m.CompanyId = $CID
ORDER BY m.VocherDate DESC"

Export-Query 'Sales Orders' 'tx_orders.csv' "
SELECT o.OrderId, o.CustomerId,
       CONVERT(VARCHAR,o.BookingDate,23)  AS BookingDate,
       CONVERT(VARCHAR,o.DeliveryDate,23) AS DeliveryDate,
       ISNULL(o.PurchaseOrderNo,'')       AS PurchaseOrderNo,
       o.Status,
       ISNULL(o.PaymentTerm,'')           AS PaymentTerm,
       ISNULL(o.PaymentType,'')           AS PaymentType,
       CASE WHEN o.GST=1 THEN 'true' ELSE 'false' END AS GST,
       ISNULL(d.ItemCount,0)              AS ItemCount,
       ISNULL(d.TotalAmount,0)            AS TotalAmount,
       o.CompanyId
FROM Orders o
LEFT JOIN (
  SELECT OrderId, COUNT(*) AS ItemCount, SUM(ISNULL(NetAmount,0)) AS TotalAmount
  FROM OrderDetail WHERE CompanyId = $CID GROUP BY OrderId
) d ON d.OrderId = o.OrderId
WHERE o.CompanyId = $CID ORDER BY o.BookingDate DESC"

Export-Query 'Delivery Notes' 'tx_delivery.csv' "
SELECT DeliveryId, OrderId,
       CONVERT(VARCHAR,SalesDate,23) AS SalesDate,
       ISNULL(VehicleNo,'') AS VehicleNo,
       ISNULL(DriverName,'') AS DriverName,
       ISNULL(DriverMobileNo,'') AS DriverMobileNo,
       ISNULL(ManualBillNo,'') AS ManualBillNo, CompanyId
FROM OrderDelivery WHERE CompanyId = $CID ORDER BY SalesDate DESC"

Export-Query 'Sale Invoices' 'tx_sale_invoice.csv' "
SELECT si.SaleInvoiceId, si.OrderId, si.DeliveryId,
       CONVERT(VARCHAR,si.SaleInvoiceDate,23) AS SaleInvoiceDate,
       ISNULL(si.ManualBillNo,'') AS ManualBillNo,
       ISNULL(si.FreightExpense,0) AS FreightExpense,
       ISNULL(si.LoadingUnLoadingExpense,0) AS LoadingUnLoadingExpense,
       ISNULL(si.PackingExpense,0) AS PackingExpense,
       ISNULL(si.TollExpense,0) AS TollExpense,
       ISNULL(si.SlittingCharges,0) AS SlittingCharges,
       ISNULL(si.CuttingCharges,0) AS CuttingCharges,
       ISNULL(si.LabourCharges,0) AS LabourCharges,
       ISNULL(si.BendingChanelling,0) AS BendingChanelling,
       ISNULL(si.OtherExpense,0) AS OtherExpense,
       ISNULL(od.SubTotal,0) AS SubTotal,
       -- Labour and bending belong in the total. Leaving them out understated 14,643
       -- invoices by PKR 13.29m between them: they are usually the charge that rounds
       -- the bill to a whole figure, so the total came out at 310,200 where the customer
       -- was billed 312,000.
       ISNULL(od.SubTotal,0)+ISNULL(si.FreightExpense,0)+ISNULL(si.LoadingUnLoadingExpense,0)
         +ISNULL(si.PackingExpense,0)+ISNULL(si.TollExpense,0)+ISNULL(si.SlittingCharges,0)
         +ISNULL(si.CuttingCharges,0)+ISNULL(si.OtherExpense,0)
         +ISNULL(si.LabourCharges,0)+ISNULL(si.BendingChanelling,0) AS GrandTotal,
       si.CompanyId
FROM SaleInvoice si
OUTER APPLY (
  SELECT SUM(ISNULL(NetAmount,0)) AS SubTotal FROM OrderDetail
  WHERE OrderId = si.OrderId AND CompanyId = si.CompanyId
) od
WHERE si.CompanyId = $CID ORDER BY si.SaleInvoiceDate DESC"

Export-Query 'Gate Passes' 'tx_gate_pass.csv' "
SELECT GatePassId, OrderId, DeliveryId, CustomerId,
       CONVERT(VARCHAR,GatePassDate,23) AS GatePassDate,
       ISNULL(VehicleNo,'') AS VehicleNo, ISNULL(DriverName,'') AS DriverName,
       ISNULL(DriverMobileNo,'') AS DriverMobileNo, ISNULL(Remarks,'') AS Remarks, CompanyId
FROM GatePass WHERE CompanyId = $CID ORDER BY GatePassDate DESC"

Export-Query 'Sales Returns' 'tx_sale_return.csv' "
SELECT SaleReturnId, OrderId, DeliveryId,
       CONVERT(VARCHAR,SaleReturnDate,23) AS SaleReturnDate,
       ISNULL(Details,'') AS Details, CompanyId
FROM SalesReturn WHERE CompanyId = $CID ORDER BY SaleReturnDate DESC"

Export-Query 'Purchase Orders' 'tx_po.csv' "
SELECT po.PurchaseOrderId, po.VendorId,
       CONVERT(VARCHAR,po.PurchaseOrderDate,23) AS PurchaseOrderDate,
       ISNULL(po.PurchaseOrderStatus,'') AS PurchaseOrderStatus,
       ISNULL(po.Remarks,'') AS Remarks, ISNULL(po.BillNo,'') AS BillNo,
       ISNULL(d.ItemCount,0) AS ItemCount, ISNULL(d.TotalAmount,0) AS TotalAmount,
       po.CompanyId
FROM inv_PurchaseOrder po
LEFT JOIN (
  SELECT PurchaseOrderId, COUNT(*) AS ItemCount,
         SUM(ISNULL(ItemQuantity*ItemPrice,0)) AS TotalAmount
  FROM inv_PurchaseOrderDetail WHERE CompanyId = $CID GROUP BY PurchaseOrderId
) d ON d.PurchaseOrderId = po.PurchaseOrderId
WHERE po.CompanyId = $CID ORDER BY po.PurchaseOrderDate DESC"

Export-Query 'GRNs' 'tx_grn.csv' "
SELECT g.GrnId, g.GatePasId,
       CONVERT(VARCHAR,g.GoodRecieveDate,23) AS GoodRecieveDate,
       ISNULL(g.Status,'') AS Status, ISNULL(g.Remarks,'') AS Remarks,
       ISNULL(g.ManualBillNo,'') AS ManualBillNo, g.CompanyId
FROM inv_GoodRecieveNote g WHERE g.CompanyId = $CID ORDER BY g.GoodRecieveDate DESC"

Export-Query 'PDNs' 'tx_pdn.csv' "
SELECT p.PdnId, p.DepartmentId,
       CONVERT(VARCHAR,p.DemandNoteDate,23) AS DemandNoteDate,
       ISNULL(p.Priority,'') AS Priority, ISNULL(p.Status,'') AS Status,
       ISNULL(p.Remarks,'') AS Remarks, ISNULL(d.ItemCount,0) AS ItemCount, p.CompanyId
FROM inv_PurchaseDemandNote p
LEFT JOIN (
  SELECT PdnId, COUNT(*) AS ItemCount FROM inv_purchaseDemandNoteDetail
  WHERE CompanyId = $CID GROUP BY PdnId
) d ON d.PdnId = p.PdnId
WHERE p.CompanyId = $CID ORDER BY p.DemandNoteDate DESC"

# ── DETAIL / LINE ITEMS ────────────────────────────────────────────────────────
Write-Host "`n=== DETAIL LINES ==="

Export-Query 'Voucher Lines' 'dt_voucher_lines.csv' "
SELECT c.TransectionId, c.SrNo,
       ISNULL(c.AccountCode,'') AS AccountCode,
       ISNULL(c.AccountTitle,'') AS AccountTitle,
       ISNULL(c.Dr_Amount,0) AS Dr_Amount,
       ISNULL(c.Cr_Amount,0) AS Cr_Amount,
       ISNULL(c.Naration,'') AS Naration
FROM AccountVocherChild c WHERE c.CompanyId = $CID"

Export-Query 'SO Line Items' 'dt_so_lines.csv' "
SELECT od.OrderId, CAST(od.ItemId AS VARCHAR) AS ItemId,
       ISNULL(i.Name,'Item-'+CAST(od.ItemId AS VARCHAR)) AS ItemName,
       ISNULL(i.UnitMeasure,'') AS UnitMeasure,
       ISNULL(od.Quantity,0) AS Quantity,
       ISNULL(od.Price,0) AS Price,
       ISNULL(od.NetAmount,0) AS NetAmount
FROM OrderDetail od
LEFT JOIN Items i ON i.ItemId = od.ItemId AND i.CompanyId = od.CompanyId
WHERE od.CompanyId = $CID"

Export-Query 'PO Line Items' 'dt_po_lines.csv' "
SELECT pd.PurchaseOrderId, CAST(pd.ItemId AS VARCHAR) AS ItemId,
       ISNULL(i.Name,'Item-'+CAST(pd.ItemId AS VARCHAR)) AS ItemName,
       ISNULL(i.UnitMeasure,'') AS UnitMeasure,
       ISNULL(pd.ItemQuantity,0) AS ItemQuantity,
       ISNULL(pd.ItemPrice,0) AS ItemPrice,
       ISNULL(pd.ItemQuantity,0)*ISNULL(pd.ItemPrice,0) AS TotalPrice
FROM inv_PurchaseOrderDetail pd
LEFT JOIN Items i ON i.ItemId = pd.ItemId AND i.CompanyId = pd.CompanyId
WHERE pd.CompanyId = $CID"

Export-Query 'GRN Line Items' 'dt_grn_lines.csv' "
SELECT g.GrnId, CAST(g.ItemId AS VARCHAR) AS ItemId,
       ISNULL(i.Name,'Item-'+CAST(g.ItemId AS VARCHAR)) AS ItemName,
       ISNULL(i.UnitMeasure,'') AS UnitMeasure,
       g.WarehouseId,
       ISNULL(g.RecievedQuantity,0) AS RecievedQuantity,
       ISNULL(g.Price,0) AS Price,
       ISNULL(g.RecievedQuantity,0)*ISNULL(g.Price,0) AS TotalPrice
FROM inv_GoodRecieveNoteDetailItems g
LEFT JOIN Items i ON i.ItemId = g.ItemId AND i.CompanyId = g.CompanyId
WHERE g.CompanyId = $CID"

Export-Query 'PDN Line Items' 'dt_pdn_lines.csv' "
SELECT dd.PdnId, CAST(dd.ItemId AS VARCHAR) AS ItemId,
       ISNULL(i.Name,'Item-'+CAST(dd.ItemId AS VARCHAR)) AS ItemName,
       ISNULL(i.UnitMeasure,'') AS UnitMeasure,
       ISNULL(dd.Quantity,0) AS Quantity,
       ISNULL(dd.ApprovedQuantity,0) AS ApprovedQuantity
FROM inv_purchaseDemandNoteDetail dd
LEFT JOIN Items i ON i.ItemId = dd.ItemId AND i.CompanyId = dd.CompanyId
WHERE dd.CompanyId = $CID"

Export-Query 'Sale Return Invoices' 'dt_sale_return_inv.csv' "
SELECT si.SalesReturnInvoiceId, si.SalesReturnId, si.OrderId,
       CONVERT(VARCHAR,si.SaleReturnInvoiceDate,23) AS SaleReturnInvoiceDate,
       ISNULL(sr.Details,'') AS Details
FROM SaleReturnInvoice si
LEFT JOIN SalesReturn sr ON sr.SaleReturnId = si.SalesReturnId AND sr.CompanyId = si.CompanyId
WHERE si.CompanyId = $CID"

Export-Query 'Stock Balances' 'dt_stock.csv' "
SELECT v.ItemId,
       ISNULL(i.Name,'Item-'+CAST(v.ItemId AS VARCHAR)) AS ItemName,
       ISNULL(i.UnitMeasure,'') AS UnitMeasure,
       v.WarehouseName,
       ISNULL(v.Balance,0) AS Balance,
       ISNULL(i.MinStockLevel,0) AS MinStockLevel,
       ISNULL(i.MaxStockLevel,0) AS MaxStockLevel
FROM View_inv_warehouseItemBalance v
LEFT JOIN Items i ON i.ItemId = v.ItemId AND i.CompanyId = v.CompanyId
WHERE v.CompanyId = $CID"

$conn.Close()
Write-Host "`nAll exports done -> sqldata\"
