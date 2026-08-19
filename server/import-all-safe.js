// Non-destructive replacement for import-all.js.
//
// import-all.js clears its target tables with unconditional DELETEs, which
// destroys (a) company 2's ledger lines, whose headers are scoped to company 1
// and therefore survive, leaving orphans, and (b) transactions entered in the
// ERP app itself (INV-/PBILL-/RV-/CHQ- prefixes) that GenX has never seen.
//
// This version:
//   - header tables have a UNIQUE business key, so they UPSERT. No deletes.
//   - line tables have no natural key, so they delete-then-insert, but scoped
//     to company_id = 1 AND the GenX id prefix, inside a transaction.
//   - name-keyed tables (branches/departments/vendors) upsert on name.
//
// Run: node import-all-safe.js
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool }  = require('pg');
require('dotenv').config();

const pg   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const DATA = path.join(__dirname, 'sqldata');
const CID  = 1;

const stats = [];

// ── helpers ──────────────────────────────────────────────────────────────────

function csv(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) { console.log(`  SKIP (not found): ${file}`); return []; }
  return parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''),
    { columns: true, skip_empty_lines: true, trim: true });
}

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function str(v) { return (!v || v === '') ? null : String(v).trim(); }
function dt(v)  { return (!v || v === '') ? null : String(v).substring(0, 10); }

// Chunked multi-row INSERT with an explicit conflict target.
// Rows are de-duplicated on the conflict key first: Postgres rejects an
// ON CONFLICT DO UPDATE that would touch the same row twice in one statement,
// and the source CSVs do contain repeated keys (e.g. stock rows per warehouse).
async function upsert(client, table, rows, conflictCol, updateCols, chunkSize = 400) {
  if (!rows.length) return 0;
  const seen = new Map();
  for (const r of rows) seen.set(r[conflictCol], r);   // last occurrence wins
  rows = [...seen.values()];
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const cols  = Object.keys(chunk[0]);
    const params = [];
    const valRows = chunk.map((row, ri) => {
      const ph = cols.map((_, ci) => `$${ri * cols.length + ci + 1}`);
      cols.forEach(c => params.push(row[c]));
      return `(${ph.join(',')})`;
    });
    const setClause = updateCols.length
      ? `DO UPDATE SET ${updateCols.map(c => `${c}=EXCLUDED.${c}`).join(', ')}`
      : 'DO NOTHING';
    await client.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${valRows.join(',')}
       ON CONFLICT (${conflictCol}) ${setClause}`, params);
    done += chunk.length;
  }
  return done;
}

async function plainInsert(client, table, rows, chunkSize = 400) {
  if (!rows.length) return 0;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const cols  = Object.keys(chunk[0]);
    const params = [];
    const valRows = chunk.map((row, ri) => {
      const ph = cols.map((_, ci) => `$${ri * cols.length + ci + 1}`);
      cols.forEach(c => params.push(row[c]));
      return `(${ph.join(',')})`;
    });
    await client.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${valRows.join(',')}`, params);
    done += chunk.length;
  }
  return done;
}

// Everything below runs in one transaction per table, so a mid-run failure
// rolls back rather than leaving a table half-emptied.
async function tx(label, fn) {
  const client = await pg.connect();
  const before = Date.now();
  try {
    await client.query('BEGIN');
    const n = await fn(client);
    await client.query('COMMIT');
    console.log(`  ${label.padEnd(24)} ${String(n).padStart(7)} rows   ${((Date.now() - before) / 1000).toFixed(1)}s`);
    stats.push({ label, rows: n, ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.log(`  ${label.padEnd(24)}   FAILED (rolled back): ${e.message}`);
    stats.push({ label, rows: 0, ok: false, err: e.message });
  } finally {
    client.release();
  }
}

// Replace only this company's GenX-sourced lines, leaving every other row alone.
async function replaceScopedLines(client, table, fkCol, prefix, rows) {
  const del = await client.query(
    `DELETE FROM ${table} WHERE company_id = $1 AND ${fkCol} LIKE $2`, [CID, prefix + '%']);
  const ins = await plainInsert(client, table, rows);
  if (del.rowCount > ins) {
    throw new Error(`refusing to shrink ${table}: would delete ${del.rowCount} but insert only ${ins}`);
  }
  return ins;
}

// ── master data (upsert on name; never deleted) ───────────────────────────────

async function importNameKeyed(client, table, names) {
  let n = 0;
  for (const name of names) {
    const r = await client.query(
      `SELECT id FROM ${table} WHERE name = $1 AND company_id = $2`, [name, CID]);
    if (!r.rowCount) {
      await client.query(`INSERT INTO ${table} (name, company_id) VALUES ($1,$2)`, [name, CID]);
      n++;
    }
  }
  return n;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log('=== MASTER DATA (upsert, nothing deleted) ===');

  await tx('branches', async c => {
    const names = [...new Set(csv('branches.csv').map(r => str(r.BranchName)).filter(Boolean))];
    return importNameKeyed(c, 'branches', names);
  });

  await tx('departments', async c => {
    const names = [...new Set(csv('departments.csv').map(r => str(r.DepartmentName)).filter(Boolean))];
    return importNameKeyed(c, 'departments', names);
  });

  await tx('units', async c => {
    const rows = csv('units.csv').map(r => str(r.UnitMeasure)).filter(Boolean);
    let n = 0;
    for (const label of [...new Set(rows)]) {
      await c.query(`INSERT INTO units (label) VALUES ($1) ON CONFLICT (label) DO NOTHING`, [label]);
      n++;
    }
    return n;
  });

  await tx('chart_of_accounts', async c => {
    const rows = csv('chart_of_accounts.csv').filter(r => r.ChartAccount).map(r => ({
      account_id: r.ChartAccount, account_code: r.ChartAccount,
      account_name: r.Title || r.Alias || r.ChartAccount,
      account_type: str(r.AccountType), balance: num(r.OpeningBalance), company_id: CID,
    }));
    return upsert(c, 'chart_of_accounts', rows, 'account_id', ['account_name', 'balance']);
  });

  await tx('bank_accounts', async c => {
    const rows = csv('bank_accounts.csv').map(r => ({
      account_id: `BANK-${r.BankAccountId}`, bank_name: str(r.BankName),
      branch_name: str(r.BranchCode), account_no: str(r.AccountCode),
      account_title: str(r.AccountTitle), account_type: str(r.AccountType) || 'Current',
      balance: num(r.OpeningBalance), status: r.AccountStatus ? 'active' : 'inactive', company_id: CID,
    }));
    return upsert(c, 'bank_accounts', rows, 'account_id', ['bank_name', 'balance']);
  });

  await tx('customers', async c => {
    const rows = csv('customers.csv').map(r => ({
      customer_id: `CUST-${r.CustomerId}`, name: str(r.Name), cnic: str(r.CNIC), ntn: str(r.NTN),
      region: str(r.City), contact: str(r.Mobile) || str(r.Phone), address: str(r.Address),
      credit_limit: num(r.CreditLimit), status: 'active', company_id: CID,
    })).filter(r => r.name);
    return upsert(c, 'customers', rows, 'customer_id', ['name', 'credit_limit']);
  });

  await tx('vendors', async c => {
    // No unique key on vendors, so match on (name, company_id) and only add what's missing.
    const rows = csv('vendors.csv').map(r => ({
      name: str(r.VenderName), ntn: str(r.NTN), contact: str(r.MobileNumber) || str(r.Phone),
      address: str(r.Address), category: str(r.VenderType) || 'Supplier',
    })).filter(r => r.name);
    let n = 0;
    for (const v of rows) {
      const ex = await c.query(`SELECT id FROM vendors WHERE name = $1 AND company_id = $2`, [v.name, CID]);
      if (ex.rowCount) {
        await c.query(
          `UPDATE vendors SET ntn=COALESCE($1,ntn), contact=COALESCE($2,contact),
                              address=COALESCE($3,address) WHERE id=$4`,
          [v.ntn, v.contact, v.address, ex.rows[0].id]);
      } else {
        await c.query(
          `INSERT INTO vendors (name,ntn,contact,address,category,status,company_id)
           VALUES ($1,$2,$3,$4,$5,'active',$6)`,
          [v.name, v.ntn, v.contact, v.address, v.category, CID]);
        n++;
      }
    }
    return n;
  });

  console.log('\n=== TRANSACTIONS (upsert on business key, nothing deleted) ===');

  await tx('vouchers', async c => {
    const rows = csv('tx_vouchers.csv').map(r => ({
      voucher_id: `VCH-${r.TransectionId}`, voucher_type: str(r.VoucherType) || 'JV',
      date: dt(r.VocherDate), account_name: str(r.MainAccount) || str(r.VoucherType),
      debit: num(r.TotalDebit), credit: num(r.TotalCredit), narration: str(r.Remarks), company_id: CID,
    })).filter(r => r.date);
    return upsert(c, 'vouchers', rows, 'voucher_id',
      ['voucher_type', 'date', 'account_name', 'debit', 'credit', 'narration']);
  });

  const custMap = {};
  {
    const r = await pg.query('SELECT customer_id, name FROM customers WHERE company_id = $1', [CID]);
    for (const row of r.rows) custMap[row.customer_id.replace('CUST-', '')] = row.name;
  }
  const orderCust = {};
  for (const o of csv('tx_orders.csv')) orderCust[o.OrderId] = custMap[o.CustomerId] || `Customer-${o.CustomerId}`;

  await tx('sales_orders', async c => {
    const rows = csv('tx_orders.csv').map(r => ({
      so_id: `SO-${r.OrderId}`, customer_id: custMap[r.CustomerId] ? `CUST-${r.CustomerId}` : null,
      customer_name: custMap[r.CustomerId] || `Customer-${r.CustomerId}`,
      order_date: dt(r.BookingDate), delivery_date: dt(r.DeliveryDate),
      status: str(r.Status) || 'pending', item_count: num(r.ItemCount),
      total_amount: num(r.TotalAmount), company_id: CID,
    })).filter(r => r.order_date);
    return upsert(c, 'sales_orders', rows, 'so_id',
      ['customer_name', 'order_date', 'delivery_date', 'status', 'item_count', 'total_amount']);
  });

  await tx('delivery_notes', async c => {
    const rows = csv('tx_delivery.csv').map(r => ({
      delivery_id: `DN-${r.DeliveryId}`, so_ref: `SO-${r.OrderId}`,
      customer_name: orderCust[r.OrderId] || 'Unknown', delivery_date: dt(r.SalesDate),
      vehicle_no: str(r.VehicleNo), status: 'delivered', company_id: CID,
    })).filter(r => r.delivery_date);
    return upsert(c, 'delivery_notes', rows, 'delivery_id',
      ['customer_name', 'delivery_date', 'vehicle_no']);
  });

  await tx('sales_invoices', async c => {
    const rows = csv('tx_sale_invoice.csv').map(r => ({
      sale_inv_id: `INV-${r.SaleInvoiceId}`, customer_name: orderCust[r.OrderId] || 'Unknown',
      so_ref: `SO-${r.OrderId}`, dn_ref: r.DeliveryId ? `DN-${r.DeliveryId}` : null,
      date: dt(r.SaleInvoiceDate), subtotal: num(r.SubTotal), freight: num(r.FreightExpense),
      loading_unloading: num(r.LoadingUnLoadingExpense), packing: num(r.PackingExpense),
      toll_tax: num(r.TollExpense), slitting: num(r.SlittingCharges),
      // Cutting, other charges and the manual bill number were exported all along but
      // dropped here, so the printed breakdown could never add up to the net amount on
      // the 1,223 invoices that carry a cutting charge. Labour and bending were not
      // exported at all, and were missing from the exported GrandTotal as well — see
      // export-all.ps1, which now carries both.
      cutting: num(r.CuttingCharges), other_charges: num(r.OtherExpense),
      labour: num(r.LabourCharges), bending: num(r.BendingChanelling),
      manual_bill_no: (r.ManualBillNo || '').trim() || null,
      total_charges: num(r.FreightExpense) + num(r.LoadingUnLoadingExpense) + num(r.PackingExpense)
        + num(r.TollExpense) + num(r.SlittingCharges) + num(r.CuttingCharges) + num(r.OtherExpense)
        + num(r.LabourCharges) + num(r.BendingChanelling),
      grand_total: num(r.GrandTotal), status: 'posted', company_id: CID,
    })).filter(r => r.date);
    return upsert(c, 'sales_invoices', rows, 'sale_inv_id',
      ['customer_name', 'date', 'subtotal', 'grand_total', 'cutting', 'other_charges',
       'labour', 'bending', 'manual_bill_no', 'total_charges']);
  });

  await tx('gate_passes', async c => {
    const rows = csv('tx_gate_pass.csv').map(r => ({
      gate_pass_id: `GP-${r.GatePassId}`, so_ref: `SO-${r.OrderId}`,
      dn_ref: r.DeliveryId ? `DN-${r.DeliveryId}` : null,
      customer_name: custMap[r.CustomerId] || `Customer-${r.CustomerId}`,
      date: dt(r.GatePassDate), vehicle_no: str(r.VehicleNo), driver_name: str(r.DriverName),
      driver_mobile: str(r.DriverMobileNo), status: 'issued', company_id: CID,
    })).filter(r => r.date);
    return upsert(c, 'gate_passes', rows, 'gate_pass_id', ['customer_name', 'date', 'vehicle_no']);
  });

  await tx('sales_returns', async c => {
    const rows = csv('tx_sale_return.csv').map(r => ({
      return_id: `SR-${r.SaleReturnId}`, so_ref: `SO-${r.OrderId}`,
      customer_name: orderCust[r.OrderId] || 'Unknown', return_date: dt(r.SaleReturnDate),
      reason: str(r.Details), status: 'processed', company_id: CID,
    })).filter(r => r.return_date);
    return upsert(c, 'sales_returns', rows, 'return_id', ['customer_name', 'return_date', 'reason']);
  });

  await tx('purchase_orders', async c => {
    const rows = csv('tx_po.csv').map(r => ({
      po_id: `PO-${r.PurchaseOrderId}`, vendor_name: `Vendor-${r.VendorId}`,
      po_date: dt(r.PurchaseOrderDate), total_amount: num(r.TotalAmount),
      item_count: num(r.ItemCount), status: str(r.PurchaseOrderStatus) || 'issued', company_id: CID,
    })).filter(r => r.po_date);
    return upsert(c, 'purchase_orders', rows, 'po_id', ['po_date', 'total_amount', 'item_count', 'status']);
  });

  await tx('grns', async c => {
    const rows = csv('tx_grn.csv').map(r => ({
      grn_id: `GRN-${r.GrnId}`, received_date: dt(r.GoodRecieveDate),
      status: str(r.Status) || 'received', company_id: CID,
    })).filter(r => r.received_date);
    return upsert(c, 'grns', rows, 'grn_id', ['received_date', 'status']);
  });

  await tx('pdns', async c => {
    const deptMap = {};
    const d = await c.query('SELECT id, name FROM departments');
    for (const row of d.rows) deptMap[row.id] = row.name;
    const rows = csv('tx_pdn.csv').map(r => ({
      pdn_id: `PDN-${r.PdnId}`, department: deptMap[r.DepartmentId] || `Dept-${r.DepartmentId}`,
      pdn_date: dt(r.DemandNoteDate), priority: str(r.Priority) || 'Normal',
      status: str(r.Status) || 'submitted', item_count: num(r.ItemCount), company_id: CID,
    })).filter(r => r.pdn_date);
    return upsert(c, 'pdns', rows, 'pdn_id', ['pdn_date', 'priority', 'status', 'item_count']);
  });

  await tx('sale_return_invoices', async c => {
    const rows = csv('dt_sale_return_inv.csv').map(r => ({
      crn_id: `SRI-${r.SalesReturnInvoiceId}`, sr_ref: `SR-${r.SalesReturnId}`,
      customer_name: orderCust[r.OrderId] || 'Unknown', date: dt(r.SaleReturnInvoiceDate),
      reason: str(r.Details), subtotal: 0, tax_amount: 0, total_amount: 0,
      status: 'processed', company_id: CID,
    })).filter(r => r.date);
    return upsert(c, 'sale_return_invoices', rows, 'crn_id', ['customer_name', 'date', 'reason']);
  });

  await tx('stock_items', async c => {
    const rows = csv('dt_stock.csv').map(r => ({
      item_code: str(r.ItemId), item_name: str(r.ItemName), unit: str(r.UnitMeasure),
      current_stock: num(r.Balance), reorder_level: num(r.MinStockLevel),
      warehouse: str(r.WarehouseName) || 'Main', status: 'active', company_id: CID,
    })).filter(r => r.item_code);
    return upsert(c, 'stock_items', rows, 'item_code',
      ['item_name', 'current_stock', 'reorder_level', 'warehouse']);
  });

  console.log('\n=== DETAIL LINES (scoped replace: company 1 + GenX prefix only) ===');

  await tx('voucher_lines', async c => {
    const rows = csv('dt_voucher_lines.csv').map(r => ({
      voucher_id: `VCH-${r.TransectionId}`, line_no: num(r.SrNo),
      account_code: str(r.AccountCode), account_title: str(r.AccountTitle),
      debit: num(r.Dr_Amount), credit: num(r.Cr_Amount), narration: str(r.Naration), company_id: CID,
    }));
    return replaceScopedLines(c, 'voucher_lines', 'voucher_id', 'VCH-', rows);
  });

  await tx('so_line_items', async c => {
    const rows = csv('dt_so_lines.csv').map(r => ({
      so_id: `SO-${r.OrderId}`, item_name: str(r.ItemName), quantity: num(r.Quantity),
      unit: str(r.UnitMeasure), unit_price: num(r.Price), total_price: num(r.NetAmount), company_id: CID,
    }));
    return replaceScopedLines(c, 'so_line_items', 'so_id', 'SO-', rows);
  });

  await tx('po_line_items', async c => {
    const rows = csv('dt_po_lines.csv').map(r => ({
      po_id: `PO-${r.PurchaseOrderId}`, item_code: str(r.ItemId), item_name: str(r.ItemName),
      unit: str(r.UnitMeasure), quantity: num(r.ItemQuantity), unit_price: num(r.ItemPrice),
      total_price: num(r.TotalPrice), company_id: CID,
    }));
    return replaceScopedLines(c, 'po_line_items', 'po_id', 'PO-', rows);
  });

  await tx('grn_line_items', async c => {
    const rows = csv('dt_grn_lines.csv').map(r => ({
      grn_id: `GRN-${r.GrnId}`, item_code: str(r.ItemId), item_name: str(r.ItemName),
      warehouse: r.WarehouseId ? `WH-${r.WarehouseId}` : null,
      quantity: num(r.RecievedQuantity), unit_price: num(r.Price),
      total_price: num(r.TotalPrice), company_id: CID,
    }));
    return replaceScopedLines(c, 'grn_line_items', 'grn_id', 'GRN-', rows);
  });

  await tx('pdn_line_items', async c => {
    const rows = csv('dt_pdn_lines.csv').map(r => ({
      pdn_id: `PDN-${r.PdnId}`, item_name: str(r.ItemName), unit: str(r.UnitMeasure),
      size: 0, quantity: num(r.Quantity), company_id: CID,
    }));
    return replaceScopedLines(c, 'pdn_line_items', 'pdn_id', 'PDN-', rows);
  });

  const failed = stats.filter(s => !s.ok);
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  console.log(failed.length ? `${failed.length} table(s) FAILED and were rolled back.` : 'All tables imported.');

  await pg.end();
}

main().catch(e => { console.error('Fatal:', e.message); pg.end(); process.exit(1); });
