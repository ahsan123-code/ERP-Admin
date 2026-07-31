// Restores Shop #58's voucher lines (source CompanyId=3 -> app company_id=2).
//
// import-company3.js has an importVoucherLines() step that loads c3_voucher_lines.csv,
// but only 28 of the file's 23,370 rows ever reached Supabase — the same kind of silent
// half-finished step that left so_line_items empty for this branch.
//
// The gap matters twice over:
//   * vouchers.narration holds a placeholder (the literal word "Remarks" on most rows,
//     a voucher-type label on the rest). The real free-text note lives on the line
//     records, so with them missing the Ledger Report has nothing useful to show.
//   * backfill-account-balances derives chart_of_accounts.balance from voucher_lines,
//     so Shop #58's account balances cannot be computed without them either.
//
// Same mapping as importVoucherLines() in import-company3.js, including the C3-VCH-
// voucher_id prefix that ties a line back to its voucher.
//
// Idempotent: clears company 2's rows first, so a re-run replaces rather than doubles.
// Run: node backfill-c2-voucher-lines.js [--dry]
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');
require('dotenv').config();

const pg  = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const DRY = process.argv.includes('--dry');
const CID = 2;
const CSV = path.join(__dirname, 'sqldata', 'c3_voucher_lines.csv');

const str = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };

(async () => {
  if (!fs.existsSync(CSV)) {
    console.error(`Missing ${CSV}\nRe-export it with export-company3.ps1.`);
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, trim: true, bom: true,
    relax_quotes: true, relax_column_count: true,
  });

  const mapped = rows.map(r => ({
    voucher_id:    str(`C3-VCH-${r.TransectionId}`),
    line_no:       num(r.SrNo),
    account_code:  str(r.AccountCode),
    account_title: str(r.AccountTitle),
    debit:         num(r.Dr_Amount),
    credit:        num(r.Cr_Amount),
    narration:     str(r.Naration),
    company_id:    CID,
  })).filter(r => r.voucher_id);

  const client = await pg.connect();
  let began = false;
  try {
    const { rows: before } = await client.query(
      'select count(*)::int n from voucher_lines where company_id = $1', [CID]);

    // How many will actually attach to a voucher — an orphan line shows up nowhere.
    const { rows: match } = await client.query(
      `select count(*)::int matched from vouchers
       where company_id = $1 and voucher_id = any($2)`,
      [CID, [...new Set(mapped.map(m => m.voucher_id))]]);

    const withNarration = mapped.filter(m => m.narration).length;
    console.log(`\nCSV rows:            ${rows.length}`);
    console.log(`Mapped lines:        ${mapped.length}`);
    console.log(`  carrying a remark: ${withNarration}`);
    console.log(`Distinct vouchers:   ${new Set(mapped.map(m => m.voucher_id)).size}`);
    console.log(`  matching a voucher already in company ${CID}: ${match[0].matched}`);
    console.log(`Existing rows to be replaced: ${before[0].n}`);

    if (DRY) { console.log('\n--dry: nothing written.'); return; }

    await client.query('begin');
    began = true;
    await client.query('delete from voucher_lines where company_id = $1', [CID]);

    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < mapped.length; i += CHUNK) {
      const slice = mapped.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      slice.forEach((m, j) => {
        const b = j * 8;
        values.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`);
        params.push(m.voucher_id, m.line_no, m.account_code, m.account_title,
                    m.debit, m.credit, m.narration, m.company_id);
      });
      await client.query(
        `insert into voucher_lines
           (voucher_id, line_no, account_code, account_title, debit, credit, narration, company_id)
         values ${values.join(',')}`, params);
      written += slice.length;
    }
    await client.query('commit');

    const { rows: after } = await client.query(
      `select count(*)::int lines,
              count(*) filter (where narration is not null)::int with_narration
       from voucher_lines where company_id = $1`, [CID]);
    console.log(`\nInserted ${written} lines. Company ${CID} now has ${after[0].lines} ` +
                `(${after[0].with_narration} with a remark).`);
  } catch (err) {
    if (began) { try { await client.query('rollback'); } catch { /* connection gone */ } }
    console.error(`\nFailed${began ? ' — rolled back' : ' before any write'}:`, err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pg.end();
  }
})();
