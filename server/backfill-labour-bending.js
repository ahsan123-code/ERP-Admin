// Restores the labour and bending charges that never left GenX, and corrects the invoice
// totals that were short by exactly those amounts.
//
// export-all.ps1 selected neither SaleInvoice.LabourCharges nor .BendingChanelling, and
// left both out of the GrandTotal it computed. So 14,678 invoices arrived in Supabase
// understated — usually by the charge that rounds the bill to a whole figure, which is
// why totals like 310,200 sat where the customer had been billed 312,000.
//
// Reads a CSV of SaleInvoiceId,CompanyId,LabourCharges,BendingChanelling exported from
// SQL Server. The previous values are copied to sales_invoices_labour_backfill_snapshot
// first, so the whole change can be reversed with a single UPDATE ... FROM.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const CSV = process.argv[2] || path.join(__dirname, 'sqldata', 'labour_bending.csv');
const SNAPSHOT = 'sales_invoices_labour_backfill_snapshot';

// The export is machine-written with no embedded commas or quotes in these four columns.
function readRows(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  return lines.slice(1).map(l => {
    const c = l.split(',');
    return { id: `INV-${c[0]}`, labour: parseFloat(c[2]) || 0, bending: parseFloat(c[3]) || 0 };
  });
}

(async () => {
  const rows = readRows(CSV);
  console.log(`${rows.length} invoices carry labour or bending in GenX`);

  await pg.query('BEGIN');
  try {
    await pg.query(`CREATE TEMP TABLE lb (sale_inv_id text PRIMARY KEY, labour numeric, bending numeric)`);
    for (let i = 0; i < rows.length; i += 500) {
      const b = rows.slice(i, i + 500);
      await pg.query(
        `INSERT INTO lb SELECT * FROM unnest($1::text[], $2::numeric[], $3::numeric[])
         ON CONFLICT (sale_inv_id) DO NOTHING`,
        [b.map(r => r.id), b.map(r => r.labour), b.map(r => r.bending)]);
    }

    // Snapshot before touching anything. Dropped and rebuilt so a re-run always records
    // the state it is actually about to change.
    await pg.query(`DROP TABLE IF EXISTS ${SNAPSHOT}`);
    await pg.query(`
      CREATE TABLE ${SNAPSHOT} AS
      SELECT s.sale_inv_id, s.labour, s.bending, s.total_charges, s.grand_total, now() AS taken_at
      FROM sales_invoices s JOIN lb USING (sale_inv_id)`);
    const snap = await pg.query(`SELECT count(*) AS n FROM ${SNAPSHOT}`);
    console.log(`snapshot written: ${snap.rows[0].n} rows in ${SNAPSHOT}`);

    const upd = await pg.query(`
      UPDATE sales_invoices s
      SET labour        = lb.labour,
          bending       = lb.bending,
          total_charges = s.total_charges - s.labour - s.bending + lb.labour + lb.bending,
          grand_total   = s.grand_total   - s.labour - s.bending + lb.labour + lb.bending
      FROM lb WHERE s.sale_inv_id = lb.sale_inv_id
        AND (s.labour, s.bending) IS DISTINCT FROM (lb.labour, lb.bending)`);
    console.log(`corrected: ${upd.rowCount} invoices`);

    const chk = await pg.query(`
      SELECT count(*) FILTER (WHERE abs(grand_total - (subtotal + total_charges + gst_amount)) > 0.5) AS unbalanced,
             count(*) FILTER (WHERE abs(total_charges - (freight + loading_unloading + packing
               + toll_tax + slitting + cutting + labour + bending + other_charges)) > 0.5) AS charges_off,
             count(*) AS total
      FROM sales_invoices`);
    console.log('after:', chk.rows[0]);
    if (chk.rows[0].unbalanced !== '0' || chk.rows[0].charges_off !== '0') {
      throw new Error('invoices do not reconcile after the update — rolling back');
    }

    await pg.query('COMMIT');
    console.log(`\ndone. to reverse:
  UPDATE sales_invoices s SET labour = b.labour, bending = b.bending,
         total_charges = b.total_charges, grand_total = b.grand_total
  FROM ${SNAPSHOT} b WHERE s.sale_inv_id = b.sale_inv_id;`);
  } catch (e) {
    await pg.query('ROLLBACK');
    throw e;
  }
  await pg.end();
})().catch(e => { console.error('FAILED:', e.message); pg.end(); process.exit(1); });
