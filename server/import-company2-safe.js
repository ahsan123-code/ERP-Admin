// Non-destructive importer for Ahsan Brothers, Shop #58 (Supabase company_id = 2,
// GenX CompanyId = 3). The safe counterpart to import-company3.js, and the reason it
// exists is the same reason import-all-safe.js replaced import-all.js.
//
// import-company3.js opens with thirteen unconditional statements of the form
//
//     DELETE FROM vouchers WHERE company_id = 2
//
// which clears every Shop #58 row in the table, not only the ones GenX supplied. As of
// this writing that would destroy 38 records entered in the ERP app that GenX has never
// seen and cannot return:
//
//     vouchers         26   PV-*, RV-*
//     sales_orders      4   SO-*
//     delivery_notes    4   DN-*      (every Shop #58 delivery note)
//     sales_invoices    4   INV-*     (every Shop #58 sale invoice)
//
// What makes a safe version possible is that every GenX-sourced Shop #58 row carries a
// C3- prefix on its business id — C3-VCH-, C3-SO-, C3-INV- and so on — while rows the
// app creates never do. So:
//
//   - header tables have a UNIQUE business key and are UPSERTED. Nothing is deleted,
//     and a key the app owns is never touched because the import never mentions it.
//   - line tables have no natural key, so they are delete-then-insert, but scoped to
//     company_id = 2 AND the C3- prefix, inside a transaction.
//
// Run: node import-company2-safe.js
//      node import-company2-safe.js --dry     (report only, writes nothing)
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool }  = require('pg');
require('dotenv').config();

const pg   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const DATA = path.join(__dirname, 'sqldata');
const CID  = 2;        // Supabase company_id — Shop #58. NOT the GenX CompanyId, which is 3.
const GENX = 'C3-';    // marks a row as GenX-sourced; app-created rows never carry it.
const DRY  = process.argv.includes('--dry');

const stats = [];

// ── helpers (same shapes as import-all-safe.js) ──────────────────────────────

function csv(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) { console.log(`  SKIP (not found): ${file}`); return []; }
  return parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''),
    { columns: true, skip_empty_lines: true, trim: true });
}

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function str(v) { return (!v || v === '') ? null : String(v).trim(); }
function dt(v)  { return (!v || v === '') ? null : String(v).substring(0, 10); }

// Chunked multi-row INSERT with an explicit conflict target. Rows are de-duplicated on
// the conflict key first: Postgres rejects an ON CONFLICT DO UPDATE that would touch the
// same row twice in one statement, and the source CSVs do repeat keys.
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

// One transaction per table, so a mid-run failure rolls that table back rather than
// leaving it half-emptied. --dry rolls back regardless.
async function tx(label, fn) {
  const client = await pg.connect();
  const before = Date.now();
  try {
    await client.query('BEGIN');
    const n = await fn(client);
    if (DRY) { await client.query('ROLLBACK'); }
    else     { await client.query('COMMIT'); }
    console.log(`  ${label.padEnd(22)} ${String(n).padStart(7)} rows   ${((Date.now() - before) / 1000).toFixed(1)}s${DRY ? '   (rolled back)' : ''}`);
    stats.push({ label, rows: n, ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.log(`  ${label.padEnd(22)}   FAILED (rolled back): ${e.message}`);
    stats.push({ label, rows: 0, ok: false, err: e.message });
  } finally {
    client.release();
  }
}

// Replace only this company's GenX-sourced lines. The LIKE 'C3-%' is what keeps an
// app-created line — whose parent id has no C3- prefix — out of the delete.
async function replaceScopedLines(client, table, fkCol, rows) {
  const del = await client.query(
    `DELETE FROM ${table} WHERE company_id = $1 AND ${fkCol} LIKE $2`, [CID, GENX + '%']);
  const ins = await plainInsert(client, table, rows);
  // A short export would otherwise quietly shrink the table. Better to abort the
  // transaction and leave the data as it was.
  if (del.rowCount > ins) {
    throw new Error(`refusing to shrink ${table}: would delete ${del.rowCount} but insert only ${ins}`);
  }
  return ins;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nAhsan Brothers - Shop #58  ->  company_id = ${CID}${DRY ? '   [DRY RUN - nothing is written]' : ''}`);
  console.log(`GenX-sourced rows are those prefixed ${GENX}; app-created rows are left alone.\n`);

  const before = await snapshot();

  console.log('=== HEADERS (upsert on business key, nothing deleted) ===');

  await tx('vouchers', async c => {
    const rows = csv('c3_vouchers.csv').map(r => ({
      voucher_id: `${GENX}VCH-${r.TransectionId}`, voucher_type: str(r.VoucherType) || 'JV',
      date: dt(r.VocherDate), account_name: str(r.MainAccount) || str(r.VoucherType),
      debit: num(r.TotalDebit), credit: num(r.TotalCredit), narration: str(r.Remarks),
      company_id: CID,
    })).filter(r => r.date);
    return upsert(c, 'vouchers', rows, 'voucher_id',
      ['voucher_type', 'date', 'account_name', 'debit', 'credit', 'narration']);
  });

  const orderCust = {};
  for (const o of csv('c3_orders.csv')) orderCust[o.OrderId] = `Customer-${o.CustomerId}`;

  await tx('sales_orders', async c => {
    const rows = csv('c3_orders.csv').map(r => ({
      so_id: `${GENX}SO-${r.OrderId}`, customer_name: `Customer-${r.CustomerId}`,
      order_date: dt(r.BookingDate), delivery_date: dt(r.DeliveryDate),
      status: str(r.Status) || 'pending', item_count: num(r.ItemCount),
      total_amount: num(r.TotalAmount), company_id: CID,
    })).filter(r => r.order_date);
    return upsert(c, 'sales_orders', rows, 'so_id',
      ['customer_name', 'order_date', 'delivery_date', 'status', 'item_count', 'total_amount']);
  });

  await tx('delivery_notes', async c => {
    const rows = csv('c3_delivery.csv').map(r => ({
      delivery_id: `${GENX}DN-${r.DeliveryId}`, so_ref: `${GENX}SO-${r.OrderId}`,
      customer_name: orderCust[r.OrderId] || 'Unknown', delivery_date: dt(r.SalesDate),
      vehicle_no: str(r.VehicleNo), status: 'delivered', company_id: CID,
    })).filter(r => r.delivery_date);
    return upsert(c, 'delivery_notes', rows, 'delivery_id',
      ['customer_name', 'delivery_date', 'vehicle_no']);
  });

  await tx('sales_invoices', async c => {
    const rows = csv('c3_sale_invoice.csv').map(r => {
      // num() gives 0 for a column the export does not carry, so a thinner c3 export
      // costs a zero rather than a crash.
      const charges = num(r.FreightExpense) + num(r.LoadingUnLoadingExpense) + num(r.PackingExpense)
        + num(r.TollExpense) + num(r.SlittingCharges) + num(r.CuttingCharges) + num(r.OtherExpense)
        + num(r.LabourCharges) + num(r.BendingChanelling);
      return {
        sale_inv_id: `${GENX}INV-${r.SaleInvoiceId}`, customer_name: orderCust[r.OrderId] || 'Unknown',
        so_ref: `${GENX}SO-${r.OrderId}`, dn_ref: r.DeliveryId ? `${GENX}DN-${r.DeliveryId}` : null,
        date: dt(r.SaleInvoiceDate), subtotal: num(r.SubTotal), freight: num(r.FreightExpense),
        loading_unloading: num(r.LoadingUnLoadingExpense), packing: num(r.PackingExpense),
        toll_tax: num(r.TollExpense), slitting: num(r.SlittingCharges),
        cutting: num(r.CuttingCharges), other_charges: num(r.OtherExpense),
        labour: num(r.LabourCharges), bending: num(r.BendingChanelling),
        manual_bill_no: (r.ManualBillNo || '').trim() || null,
        total_charges: charges, grand_total: num(r.GrandTotal), status: 'posted', company_id: CID,
      };
    }).filter(r => r.date);
    return upsert(c, 'sales_invoices', rows, 'sale_inv_id',
      ['customer_name', 'date', 'subtotal', 'grand_total', 'cutting', 'other_charges',
       'labour', 'bending', 'manual_bill_no', 'total_charges']);
  });

  await tx('purchase_orders', async c => {
    const rows = csv('c3_po.csv').map(r => ({
      po_id: `${GENX}PO-${r.PurchaseOrderId}`, vendor_name: `Vendor-${r.VendorId}`,
      po_date: dt(r.PurchaseOrderDate), total_amount: num(r.TotalAmount),
      item_count: num(r.ItemCount), status: str(r.PurchaseOrderStatus) || 'issued', company_id: CID,
    })).filter(r => r.po_date);
    return upsert(c, 'purchase_orders', rows, 'po_id',
      ['po_date', 'total_amount', 'item_count', 'status']);
  });

  await tx('grns', async c => {
    const rows = csv('c3_grn.csv').map(r => ({
      grn_id: `${GENX}GRN-${r.GrnId}`, received_date: dt(r.GoodRecieveDate),
      status: str(r.Status) || 'received', company_id: CID,
    })).filter(r => r.received_date);
    return upsert(c, 'grns', rows, 'grn_id', ['received_date', 'status']);
  });

  await tx('pdns', async c => {
    const deptMap = {};
    const d = await c.query('SELECT id, name FROM departments');
    for (const row of d.rows) deptMap[row.id] = row.name;
    const rows = csv('c3_pdn.csv').map(r => ({
      pdn_id: `${GENX}PDN-${r.PdnId}`, department: deptMap[r.DepartmentId] || `Dept-${r.DepartmentId}`,
      pdn_date: dt(r.DemandNoteDate), priority: str(r.Priority) || 'Normal',
      status: str(r.Status) || 'submitted', item_count: num(r.ItemCount), company_id: CID,
    })).filter(r => r.pdn_date);
    return upsert(c, 'pdns', rows, 'pdn_id', ['pdn_date', 'priority', 'status', 'item_count']);
  });

  console.log('\n=== LINES (delete scoped to company 2 + C3- prefix, then insert) ===');

  await tx('voucher_lines', async c => {
    const rows = csv('c3_voucher_lines.csv').map(r => ({
      voucher_id: `${GENX}VCH-${r.TransectionId}`, line_no: num(r.SrNo),
      account_code: str(r.AccountCode), account_title: str(r.AccountTitle),
      debit: num(r.Dr_Amount), credit: num(r.Cr_Amount), narration: str(r.Naration),
      company_id: CID,
    }));
    return replaceScopedLines(c, 'voucher_lines', 'voucher_id', rows);
  });

  await tx('so_line_items', async c => {
    const rows = csv('c3_so_lines.csv').map(r => ({
      so_id: `${GENX}SO-${r.OrderId}`, item_name: str(r.ItemName), quantity: num(r.Quantity),
      unit: str(r.UnitMeasure), unit_price: num(r.Price), total_price: num(r.NetAmount),
      company_id: CID,
    }));
    return replaceScopedLines(c, 'so_line_items', 'so_id', rows);
  });

  await tx('po_line_items', async c => {
    const rows = csv('c3_po_lines.csv').map(r => ({
      po_id: `${GENX}PO-${r.PurchaseOrderId}`, item_code: str(r.ItemId), item_name: str(r.ItemName),
      unit: str(r.UnitMeasure), quantity: num(r.ItemQuantity), unit_price: num(r.ItemPrice),
      total_price: num(r.TotalPrice), company_id: CID,
    }));
    return replaceScopedLines(c, 'po_line_items', 'po_id', rows);
  });

  await tx('grn_line_items', async c => {
    const rows = csv('c3_grn_lines.csv').map(r => ({
      grn_id: `${GENX}GRN-${r.GrnId}`, item_code: str(r.ItemId), item_name: str(r.ItemName),
      warehouse: r.WarehouseId ? `WH-${r.WarehouseId}` : null, quantity: num(r.RecievedQuantity),
      unit_price: num(r.Price), total_price: num(r.TotalPrice), company_id: CID,
    }));
    return replaceScopedLines(c, 'grn_line_items', 'grn_id', rows);
  });

  await tx('pdn_line_items', async c => {
    const rows = csv('c3_pdn_lines.csv').map(r => ({
      pdn_id: `${GENX}PDN-${r.PdnId}`, item_name: str(r.ItemName), unit: str(r.UnitMeasure),
      size: 0, quantity: num(r.Quantity), company_id: CID,
    }));
    return replaceScopedLines(c, 'pdn_line_items', 'pdn_id', rows);
  });

  await report(before);
  await pg.end();
}

// ── before/after accounting, split by origin ─────────────────────────────────

const TABLES = [
  ['vouchers', 'voucher_id'], ['sales_orders', 'so_id'], ['delivery_notes', 'delivery_id'],
  ['sales_invoices', 'sale_inv_id'], ['purchase_orders', 'po_id'], ['grns', 'grn_id'],
  ['pdns', 'pdn_id'], ['voucher_lines', 'voucher_id'], ['so_line_items', 'so_id'],
  ['po_line_items', 'po_id'], ['grn_line_items', 'grn_id'], ['pdn_line_items', 'pdn_id'],
];

async function snapshot() {
  const out = {};
  for (const [t, col] of TABLES) {
    const r = await pg.query(
      `SELECT COUNT(*) FILTER (WHERE ${col} LIKE $2) genx,
              COUNT(*) FILTER (WHERE ${col} NOT LIKE $2 OR ${col} IS NULL) app
       FROM ${t} WHERE company_id = $1`, [CID, GENX + '%']);
    out[t] = { genx: +r.rows[0].genx, app: +r.rows[0].app };
  }
  return out;
}

async function report(before) {
  const after = await snapshot();
  console.log('\n=== company 2 row counts, by origin ===\n');
  console.log('  table'.padEnd(20) + 'GenX (C3-*)'.padStart(22) + 'app-created'.padStart(20));
  let lost = 0;
  for (const [t] of TABLES) {
    const b = before[t], a = after[t];
    const g = `${b.genx} -> ${a.genx}`;
    const p = `${b.app} -> ${a.app}`;
    const flag = a.app < b.app ? '   <-- APP ROWS LOST' : '';
    if (a.app < b.app) lost += b.app - a.app;
    console.log('  ' + t.padEnd(18) + g.padStart(22) + p.padStart(20) + flag);
  }
  const failed = stats.filter(s => !s.ok);
  console.log('');
  if (lost) console.log(`  *** ${lost} app-created row(s) disappeared — investigate before trusting this run ***`);
  else      console.log('  No app-created row was touched.');
  if (failed.length) {
    console.log(`\n  ${failed.length} table(s) FAILED and were rolled back:`);
    for (const f of failed) console.log(`    ${f.label}: ${f.err}`);
  }
  if (DRY) console.log('\n  DRY RUN — every transaction was rolled back. Nothing changed.');
}

main().catch(e => { console.error('Fatal:', e.message); pg.end(); process.exit(1); });
