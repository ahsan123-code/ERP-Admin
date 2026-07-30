// Loads Shop #58's chart of accounts (source CompanyId=3) into company_id=2.
//
// export-all.ps1 only ever pulled CompanyId=1, so Shop #58 landed in Supabase with no
// chart at all — just two accounts auto-created by ensureLedgerAccount during posting.
// Every expense / vendor / bank / income dropdown on that branch was therefore empty.
// Run export-c3-chart.ps1 first to produce sqldata/c3_chart_of_accounts.csv (486 rows).
//
// Two things this has to get right:
//
//  * account_id is UNIQUE across the whole table, and company 1 uses the bare account
//    code as its id. Inserting Shop #58's rows under the same ids would collide with —
//    and overwrite — Shop #41's chart, so company 2's ids are suffixed "-C2".
//
//  * company 2 already holds two auto-created rows. One of them (11-01-001-000001
//    "Cash in Hand") also exists in the source chart; it is updated in place rather
//    than inserted again, so the branch does not end up with two accounts sharing a
//    code — which would also break ensureLedgerAccount's .maybeSingle() lookup.
//    The other (11-03-001-000001 "Accounts Receivable") is app-invented, absent from
//    the source, and is left alone because the posting code depends on it.
//
// Balances are only set on newly inserted rows; an existing row keeps whatever balance
// it has, so this never clobbers figures already derived from postings.
//
// Idempotent: re-running updates names/types rather than duplicating.
// Run: node backfill-c2-chart-of-accounts.js [--dry]
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');
require('dotenv').config();

const pg  = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const DRY = process.argv.includes('--dry');
const CID = 2;                                   // app company id for Shop #58
const CSV = path.join(__dirname, 'sqldata', 'c3_chart_of_accounts.csv');

const str = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };

(async () => {
  if (!fs.existsSync(CSV)) {
    console.error(`Missing ${CSV}\nRun export-c3-chart.ps1 first.`);
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, trim: true, bom: true,
    relax_quotes: true, relax_column_count: true,
  }).filter(r => str(r.ChartAccount));

  const client = await pg.connect();
  let began = false;
  try {
    const { rows: existing } = await client.query(
      'select account_id, account_code, account_name from chart_of_accounts where company_id = $1', [CID]);
    const byCode = new Map(existing.map(a => [a.account_code, a]));

    const inserts = [];
    const updates = [];
    for (const r of rows) {
      const code = str(r.ChartAccount);
      const name = str(r.Title) || str(r.Alias) || code;
      const type = str(r.AccountType);
      const hit  = byCode.get(code);
      if (hit) updates.push({ account_id: hit.account_id, code, name, type, was: hit.account_name });
      else     inserts.push({ account_id: `${code}-C${CID}`, code, name, type, balance: num(r.OpeningBalance) });
    }

    const orphans = existing.filter(a => !rows.some(r => str(r.ChartAccount) === a.account_code));

    const grp = inserts.reduce((m, i) => { const g = i.code.slice(0, 2); m[g] = (m[g] || 0) + 1; return m; }, {});
    console.log(`\nSource rows: ${rows.length}`);
    console.log(`Company ${CID} already has: ${existing.length}`);
    console.log(`\n  insert ${inserts.length}  by group: ${JSON.stringify(grp)}`);
    console.log(`  update ${updates.length} matched by code:`);
    updates.forEach(u => console.log(`     ${u.code}  "${u.was}" -> "${u.name}"  (keeps id ${u.account_id})`));
    console.log(`  leave ${orphans.length} untouched (not in source, still needed by posting code):`);
    orphans.forEach(o => console.log(`     ${o.account_code}  "${o.account_name}"  ${o.account_id}`));

    if (DRY) { console.log('\n--dry: nothing written.'); return; }

    await client.query('begin');
    began = true;
    for (const i of inserts) {
      await client.query(
        `insert into chart_of_accounts (account_id, account_code, account_name, account_type, balance, company_id)
         values ($1,$2,$3,$4,$5,$6)`,
        [i.account_id, i.code, i.name, i.type, i.balance, CID]);
    }
    for (const u of updates) {
      await client.query(
        `update chart_of_accounts set account_name = $1, account_type = $2 where account_id = $3`,
        [u.name, u.type, u.account_id]);
    }
    await client.query('commit');

    const { rows: after } = await client.query(
      `select left(account_code,2) grp, count(*)::int n from chart_of_accounts
       where company_id = $1 group by 1 order by 1`, [CID]);
    console.log(`\nInserted ${inserts.length}, updated ${updates.length}. Company ${CID} chart is now:`);
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
