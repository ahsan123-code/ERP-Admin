// Links each customer to its ledger account, for both branches.
//
// The Customer Current Balance report derives a customer's position from
// sales_invoices alone. That is wrong on both branches, in opposite ways:
//
//   Shop #41 — 612 of 753 customers have invoices, but the figure ignores all the
//              voucher history, which is where most of the real movement lives.
//   Shop #58 — its sales were never recorded as invoices at all (only 1 of 206
//              customers has one), so the report is effectively empty.
//
// The true positions are in voucher_lines against each customer's own sub-ledger
// account (account_code 11-01-003-*): 620 accounts / 48,521 lines for Shop #41 and
// 184 / 9,992 for Shop #58. What was missing is the join key — customers has no
// account_code column, though both source exports carry one for every row.
//
// This adds the column and fills it from the source CSVs. The report can then read a
// customer's balance straight off the ledger instead of inferring it from invoices.
//
// Idempotent: the DDL is IF NOT EXISTS and rows are matched on customer_id.
// Run: node backfill-customer-account-codes.js [--dry]
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');
require('dotenv').config();

const pg  = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const DRY = process.argv.includes('--dry');

const str = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };

// customer_id is built the same way each branch's import built it, so the codes land
// on the rows already in the table.
const SOURCES = [
  { companyId: 1, file: 'customers.csv',    id: (r) => `CUST-${str(r.CustomerId)}` },
  { companyId: 2, file: 'c3_customers.csv', id: (r) => `CUST-${str(r.CustomerId)}-C2` },
];

(async () => {
  const client = await pg.connect();
  let began = false;
  try {
    const plan = [];
    for (const src of SOURCES) {
      const file = path.join(__dirname, 'sqldata', src.file);
      if (!fs.existsSync(file)) {
        console.error(`Missing ${file} — skipping company ${src.companyId}.`);
        continue;
      }
      const rows = parse(fs.readFileSync(file, 'utf8'), {
        columns: true, skip_empty_lines: true, trim: true, bom: true,
        relax_quotes: true, relax_column_count: true,
      });
      for (const r of rows) {
        const code = str(r.AccountCode);
        const id = src.id(r);
        if (code && id) plan.push({ companyId: src.companyId, customerId: id, code });
      }
    }

    // How many of these codes actually carry ledger movement — the rest will simply
    // report a nil balance rather than being wrong.
    for (const cid of [1, 2]) {
      const codes = plan.filter(p => p.companyId === cid).map(p => p.code);
      const { rows: known } = await client.query(
        `select count(*)::int matched from customers where company_id = $1 and customer_id = any($2)`,
        [cid, plan.filter(p => p.companyId === cid).map(p => p.customerId)]);
      const { rows: inLedger } = await client.query(
        `select count(distinct account_code)::int n from voucher_lines
         where company_id = $1 and account_code = any($2)`, [cid, codes]);
      console.log(`company ${cid}: ${codes.length} codes from source, ` +
                  `${known[0].matched} match a customer row, ` +
                  `${inLedger[0].n} of those accounts appear in voucher_lines`);
    }

    if (DRY) { console.log('\n--dry: nothing written.'); return; }

    await client.query('begin');
    began = true;
    await client.query('alter table customers add column if not exists account_code text');
    await client.query('create index if not exists customers_account_code_idx on customers (company_id, account_code)');

    let updated = 0;
    for (const p of plan) {
      const { rowCount } = await client.query(
        'update customers set account_code = $1 where customer_id = $2 and company_id = $3',
        [p.code, p.customerId, p.companyId]);
      updated += rowCount;
    }
    await client.query('commit');

    const { rows: after } = await client.query(
      `select company_id, count(*)::int customers,
              count(account_code)::int with_code
       from customers group by 1 order by 1`);
    console.log(`\nUpdated ${updated} customer rows.`);
    console.table(after);
  } catch (err) {
    if (began) { try { await client.query('rollback'); } catch { /* connection gone */ } }
    console.error(`\nFailed${began ? ' — rolled back' : ' before any write'}:`, err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pg.end();
  }
})();
