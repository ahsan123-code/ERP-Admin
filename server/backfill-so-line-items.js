// Restores so_line_items for orders whose lines were never saved.
//
// Until commit aebb8b4 (22 Jul 2026) NewOrderModal wrote only the order header and
// discarded the product/qty/rate the user had typed. Eleven orders (16 Jun and
// 17-19 Jul 2026) are affected. The detail is not recoverable from the database —
// order, OC, work order, delivery note and invoice all hold header data only — so it
// has to be re-entered from paper records and loaded with this script.
//
// Writing so_line_items is enough to fix both places the detail shows up: the customer
// ledger report and the sales-invoice document both read it via the order's so_ref.
//
// Usage
//   node backfill-so-line-items.js --check               list the orders still missing lines
//   node backfill-so-line-items.js --template            write a CSV skeleton to fill in
//   node backfill-so-line-items.js lines.csv --dry       validate only, change nothing
//   node backfill-so-line-items.js lines.csv             insert
//   node backfill-so-line-items.js lines.csv --replace   also overwrite orders that
//                                                        already have lines
//
// --check doubles as the way to confirm the upstream fix is working: raise a new order
// in the app and it should not appear in the list.
//
// CSV columns (header row required):
//   so_id, item_name, size, gauge, unit, quantity, unit_price
// Optional: line_no (else assigned in file order), total_price (else quantity × unit_price)
//
// Safe by default: refuses to touch an order that already has lines unless --replace,
// runs in one transaction, and rolls back if anything fails.
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');
require('dotenv').config();

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });

const args     = process.argv.slice(2);
const DRY      = args.includes('--dry');
const REPLACE  = args.includes('--replace');
const TEMPLATE = args.includes('--template');
const CHECK    = args.includes('--check');
const file     = args.find(a => !a.startsWith('--'));

const TEMPLATE_PATH = path.join(__dirname, 'so-line-items-template.csv');
const COLUMNS = ['so_id', 'item_name', 'size', 'gauge', 'unit', 'quantity', 'unit_price'];

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const str = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
const money = (n) => Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Orders that are missing their lines, newest first.
async function missingOrders(client) {
  const { rows } = await client.query(`
    select o.so_id, o.order_date::date as order_date, o.customer_name,
           o.item_count, o.total_amount::float8 as total_amount, o.company_id,
           (select i.sale_inv_id from sales_invoices i where i.so_ref = o.so_id limit 1) as invoice
    from sales_orders o
    where not exists (select 1 from so_line_items s where s.so_id = o.so_id)
    order by o.order_date desc, o.so_id`);
  return rows;
}

// Writes a CSV pre-filled with the affected orders so only the item columns are left
// to type. total_amount is carried in a trailing comment column as a cross-check.
async function writeTemplate(client) {
  const orders = await missingOrders(client);
  if (!orders.length) { console.log('Nothing to do — every order has its line items.'); return; }

  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [[...COLUMNS, '_customer', '_order_date', '_order_total'].join(',')];
  for (const o of orders) {
    // One blank row per expected item; item_count is 1 for all affected orders.
    for (let i = 0; i < Math.max(1, o.item_count || 1); i++) {
      lines.push([
        o.so_id, '', '', '', 'Kilo Grams', '', '',
        esc(o.customer_name), o.order_date.toISOString().slice(0, 10), o.total_amount,
      ].join(','));
    }
  }
  fs.writeFileSync(TEMPLATE_PATH, lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${TEMPLATE_PATH}`);
  console.log(`${orders.length} order(s) to fill in. Columns starting "_" are context only and are ignored on import.`);
  console.log('Fill item_name, size, gauge, quantity and unit_price, then run:');
  console.log('  node backfill-so-line-items.js so-line-items-template.csv --dry');
}

// Summary of what is still missing, and the affected orders.
async function report(client) {
  const { rows: summary } = await client.query(`
    select case when o.so_id like 'SO-%' then 'app-created SO-*' else 'imported' end as kind,
           count(*)::int as orders,
           count(*) filter (where not exists (
             select 1 from so_line_items s where s.so_id = o.so_id))::int as missing_lines
    from sales_orders o group by 1 order by 1`);
  console.log('\n── Orders missing their line items ──');
  console.table(summary);

  const orders = await missingOrders(client);
  console.log(`\n── Affected orders (${orders.length}) ──`);
  if (orders.length) {
    console.table(orders);
    console.log('The item/size/gauge/rate for these is not stored anywhere in the database —');
    console.log('order, OC, work order, delivery note and invoice all hold header data only.');
    console.log('Run with --template to produce a CSV to fill in from paper records.');
  } else {
    console.log('None — every order has its line items.');
  }
}

async function run() {
  const client = await pg.connect();
  let began = false;
  try {
    if (CHECK)    return await report(client);
    if (TEMPLATE) return await writeTemplate(client);

    if (!file) {
      console.error('Usage: node backfill-so-line-items.js <file.csv> [--dry] [--replace]');
      console.error('       node backfill-so-line-items.js --template');
      console.error('       node backfill-so-line-items.js --check');
      process.exitCode = 1;
      return;
    }
    if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exitCode = 1; return; }

    // relax_quotes matters here: sizes are written with inch marks (48", 15"3.00MM) and
    // a hand-typed file will contain bare quotes inside unquoted fields, which strict
    // CSV parsing rejects outright.
    const rows = parse(fs.readFileSync(file, 'utf8'), {
      columns: true, skip_empty_lines: true, trim: true, bom: true,
      relax_quotes: true, relax_column_count: true,
    });

    // ── Group by order, skipping rows the user has not filled in yet ──
    const byOrder = new Map();
    const skipped = [];
    rows.forEach((r, i) => {
      const soId = str(r.so_id);
      if (!soId) return;
      if (!str(r.item_name)) { skipped.push(`${soId} (row ${i + 2}): blank item_name`); return; }
      if (!byOrder.has(soId)) byOrder.set(soId, []);
      byOrder.get(soId).push({ ...r, _row: i + 2 });
    });

    if (!byOrder.size) {
      console.log('No usable rows — every row was blank or missing item_name.');
      if (skipped.length) console.log(skipped.map(s => '  skipped: ' + s).join('\n'));
      return;
    }

    // ── Validate against the orders themselves ──
    const { rows: orders } = await client.query(
      `select o.so_id, o.total_amount::float8 as total_amount, o.company_id,
              (select count(*)::int from so_line_items s where s.so_id = o.so_id) as existing
       from sales_orders o where o.so_id = any($1)`, [[...byOrder.keys()]]);
    const orderById = new Map(orders.map(o => [o.so_id, o]));

    const errors = [];
    const plan = [];
    for (const [soId, lines] of byOrder) {
      const order = orderById.get(soId);
      if (!order) { errors.push(`${soId}: no such sales order`); continue; }
      if (order.existing > 0 && !REPLACE) {
        errors.push(`${soId}: already has ${order.existing} line(s) — pass --replace to overwrite`);
        continue;
      }

      const prepared = lines.map((l, i) => {
        const quantity = num(l.quantity);
        const unitPrice = num(l.unit_price);
        if (quantity <= 0)  errors.push(`${soId} (row ${l._row}): quantity must be greater than 0`);
        if (unitPrice <= 0) errors.push(`${soId} (row ${l._row}): unit_price must be greater than 0`);
        return {
          so_id:       soId,
          line_no:     l.line_no ? parseInt(l.line_no, 10) : i + 1,
          item_name:   str(l.item_name),
          unit:        str(l.unit) || 'Kilo Grams',
          gauge:       str(l.gauge),
          size:        str(l.size),
          quantity,
          unit_price:  unitPrice,
          total_price: l.total_price ? num(l.total_price) : +(quantity * unitPrice).toFixed(2),
          // Must come from the order: the column defaults to 1, so an omitted branch
          // would silently file the line under Shop #41.
          company_id:  order.company_id,
        };
      });

      const sum = prepared.reduce((s, l) => s + l.total_price, 0);
      const delta = +(sum - order.total_amount).toFixed(2);
      plan.push({ soId, lines: prepared, sum, orderTotal: order.total_amount, delta, existing: order.existing });
    }

    // ── Report ──
    console.log(`\n── Plan (${plan.length} order(s), ${plan.reduce((n, p) => n + p.lines.length, 0)} line(s)) ──`);
    for (const p of plan) {
      const flag = Math.abs(p.delta) > 0.5 ? `  ⚠ differs from order total by ${money(p.delta)}` : '  ✓ matches order total';
      console.log(`\n${p.soId}${p.existing ? `  (replacing ${p.existing} existing line(s))` : ''}`);
      for (const l of p.lines) {
        console.log(`   ${l.line_no}. ${l.item_name}` +
          `${l.size ? ` | size ${l.size}` : ''}${l.gauge ? ` | gauge ${l.gauge}` : ''}` +
          ` | ${l.quantity} ${l.unit} @ ${money(l.unit_price)} = ${money(l.total_price)}`);
      }
      console.log(`   lines ${money(p.sum)} vs order ${money(p.orderTotal)}${flag}`);
    }
    if (skipped.length) console.log('\nSkipped rows:\n' + skipped.map(s => '  ' + s).join('\n'));

    if (errors.length) {
      console.error(`\n${errors.length} problem(s) — nothing was written:`);
      errors.forEach(e => console.error('  ' + e));
      process.exitCode = 1;
      return;
    }
    // A mismatch is a warning, not a blocker: charges live on the invoice, not the order,
    // so a small difference can be legitimate. It is surfaced so it can be eyeballed.
    const off = plan.filter(p => Math.abs(p.delta) > 0.5);
    if (off.length) console.log(`\n⚠ ${off.length} order(s) do not match their recorded total — check before committing.`);

    if (DRY) { console.log('\n--dry: nothing written.'); return; }

    // ── Write, all or nothing ──
    await client.query('begin');
    began = true;
    let inserted = 0;
    for (const p of plan) {
      if (p.existing > 0) await client.query('delete from so_line_items where so_id = $1', [p.soId]);
      for (const l of p.lines) {
        await client.query(`
          insert into so_line_items
            (so_id, line_no, item_name, unit, gauge, size, quantity, unit_price, total_price, company_id)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [l.so_id, l.line_no, l.item_name, l.unit, l.gauge, l.size,
           l.quantity, l.unit_price, l.total_price, l.company_id]);
        inserted++;
      }
    }
    await client.query('commit');
    console.log(`\nInserted ${inserted} line(s) across ${plan.length} order(s).`);
    console.log('Verify with: node backfill-so-line-items.js --check');
  } catch (err) {
    if (began) {
      try { await client.query('rollback'); } catch { /* connection already gone */ }
      console.error('\nFailed — rolled back, nothing was written:', err.message);
    } else {
      console.error('\nFailed before any write, nothing was changed:', err.message);
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await pg.end();
  }
}

run();
