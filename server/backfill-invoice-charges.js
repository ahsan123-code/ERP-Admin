// Restores the invoice fields the GenX export carried but import-all dropped:
// CuttingCharges, OtherExpense and ManualBillNo (the "Book #" on the printed bill).
//
// Until now grand_total included cutting and other while the stored charge columns did
// not, so the printed breakdown could not add up to the net amount on any invoice that
// had either. Reads the same CSV the importer reads.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const CSV = path.join(__dirname, 'sqldata', 'tx_sale_invoice.csv');

// Minimal CSV reader: this export is machine-written with no embedded commas or quotes.
function rows(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map(l => {
    const cells = l.split(',');
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

(async () => {
  const all = rows(CSV).filter(r => num(r.CuttingCharges) || num(r.OtherExpense) || (r.ManualBillNo || '').trim());
  console.log(`${all.length} invoices carry cutting, other charges or a bill number`);

  let done = 0;
  const CHUNK = 500;
  for (let i = 0; i < all.length; i += CHUNK) {
    const batch = all.slice(i, i + CHUNK);
    await pg.query(
      `UPDATE sales_invoices s SET cutting = v.cutting, other_charges = v.other, manual_bill_no = NULLIF(v.bill, '')
       FROM (SELECT * FROM unnest($1::text[], $2::numeric[], $3::numeric[], $4::text[])
             AS t(id, cutting, other, bill)) v
       WHERE s.sale_inv_id = v.id`,
      [batch.map(r => `INV-${r.SaleInvoiceId}`), batch.map(r => num(r.CuttingCharges)),
       batch.map(r => num(r.OtherExpense)), batch.map(r => (r.ManualBillNo || '').trim())],
    );
    done += batch.length;
    process.stdout.write(`\r  ${done}/${all.length}`);
  }

  const chk = await pg.query(`
    SELECT count(*) FILTER (WHERE cutting > 0)        AS with_cutting,
           count(*) FILTER (WHERE other_charges > 0)  AS with_other,
           count(*) FILTER (WHERE manual_bill_no IS NOT NULL) AS with_bill_no,
           count(*) FILTER (WHERE abs(grand_total - (subtotal + freight + loading_unloading
                 + packing + toll_tax + slitting + cutting + other_charges)) > 0.5) AS unbalanced
    FROM sales_invoices`);
  console.log('\n', chk.rows[0]);
  await pg.end();
})().catch(e => { console.error('\nFAILED:', e.message); pg.end(); process.exit(1); });
