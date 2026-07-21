// Backfills so_line_items for company 2 (Shop #58) from c3_so_lines.csv.
//
// The main import-company3.js run left so_line_items empty for company 2 while its
// sales_orders landed fine, so Shop #58 orders showed no item detail in the customer
// ledger. This re-runs only that one step — same mapping and same C3-SO- id prefix as
// importSoLineItems() in import-company3.js — instead of re-importing the whole company.
//
// Idempotent: clears company 2's rows first, so a second run replaces rather than doubles.
// Run: node backfill-c2-so-lines.js [--dry]
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool }  = require('pg');
require('dotenv').config();

const pg  = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const CID = 2;
const DRY = process.argv.includes('--dry');

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function str(v) { return (!v || v === '') ? null : String(v).trim(); }

async function batch(sql, rows, chunkSize = 500) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const cols   = Object.keys(chunk[0]);
    const params = [];
    const valRows = chunk.map((row, ri) => {
      const placeholders = cols.map((_, ci) => `$${ri * cols.length + ci + 1}`);
      cols.forEach(c => params.push(row[c]));
      return `(${placeholders.join(',')})`;
    });
    await pg.query(`${sql}(${cols.join(',')}) VALUES ${valRows.join(',')} ON CONFLICT DO NOTHING`, params);
    inserted += chunk.length;
  }
  return inserted;
}

(async () => {
  const content = fs.readFileSync(path.join(__dirname, 'sqldata', 'c3_so_lines.csv'), 'utf8').replace(/^﻿/, '');
  const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true });

  const mapped = rows.map(r => ({
    so_id:       str(`C3-SO-${r.OrderId}`),
    item_name:   str(r.ItemName),
    quantity:    num(r.Quantity),
    unit:        str(r.UnitMeasure),
    unit_price:  num(r.Price),
    total_price: num(r.NetAmount),
    company_id:  CID,
  })).filter(r => r.so_id);

  // Only lines whose order actually exists are useful — an orphan line joins to nothing.
  const { rows: existing } = await pg.query('SELECT so_id FROM sales_orders WHERE company_id = $1', [CID]);
  const known = new Set(existing.map(o => o.so_id));
  const matched = mapped.filter(r => known.has(r.so_id));

  console.log(`CSV rows parsed      : ${rows.length}`);
  console.log(`Mapped with an so_id : ${mapped.length}`);
  console.log(`Matching a c2 order  : ${matched.length}`);
  console.log(`Orphans (no order)   : ${mapped.length - matched.length}`);

  const before = await pg.query('SELECT count(*)::int AS n FROM so_line_items WHERE company_id = $1', [CID]);
  console.log(`so_line_items before : ${before.rows[0].n}`);

  if (DRY) { console.log('\n--dry: nothing written.'); await pg.end(); return; }

  await pg.query('DELETE FROM so_line_items WHERE company_id = $1', [CID]);
  await batch('INSERT INTO so_line_items ', matched);

  const after = await pg.query('SELECT count(*)::int AS n FROM so_line_items WHERE company_id = $1', [CID]);
  console.log(`so_line_items after  : ${after.rows[0].n}`);

  const covered = await pg.query(
    `SELECT count(DISTINCT so.so_id)::int AS n FROM sales_orders so
      JOIN so_line_items li ON li.so_id = so.so_id AND li.company_id = $1
     WHERE so.company_id = $1`, [CID]);
  console.log(`c2 orders with detail: ${covered.rows[0].n} of ${known.size}`);

  await pg.end();
})().catch(e => { console.error(e.message); pg.end(); process.exit(1); });
