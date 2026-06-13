// One-time backfill: derive chart_of_accounts.balance (and linked bank_accounts.balance)
// from the historical voucher_lines ledger (90k real double-entry line items, each with
// its own account_code, debit, credit) — so Net Profit / Balance Sheet / Total Bank
// Balance reflect existing voucher history. New vouchers posted from the UI from now on
// update these balances incrementally via financeDb.applyVoucherToBalances.
//
// Any account_code referenced in voucher_lines but missing from chart_of_accounts
// (mostly per-customer/per-vendor sub-ledger accounts) is created first, named from
// voucher_lines.account_title, so its balance can be included.
//
// Normal-balance rule, by account_code prefix:
//   10 (Income), 13 (Owner Equity), 14 (Liability) -> balance = total_credit - total_debit
//   11 (Asset), 12 (Expense)                       -> balance = total_debit - total_credit
// Bank-linked accounts (account_code 11-05-001-NNNNNN) also set bank_accounts.balance
// for BANK-N to (total_debit - total_credit).
//
// Usage:
//   node backfill-account-balances.js          (dry run — prints summary, writes nothing)
//   node backfill-account-balances.js --apply  (writes the computed balances)

const { Pool } = require('pg');
require('dotenv').config();

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const APPLY = process.argv.includes('--apply');
const COMPANY_ID = 1;

function bankIdFor(accountCode) {
  const m = accountCode && accountCode.match(/^11-05-001-0*(\d+)$/);
  return m ? `BANK-${m[1]}` : null;
}

(async () => {
  const client = await pg.connect();
  try {
    const { rows: sums } = await client.query(
      `SELECT account_code, SUM(debit) AS total_debit, SUM(credit) AS total_credit, COUNT(*) AS line_count
       FROM voucher_lines WHERE company_id = $1 GROUP BY account_code`,
      [COMPANY_ID]
    );

    const { rows: coaRows } = await client.query(
      `SELECT account_id, account_code, account_name FROM chart_of_accounts WHERE company_id = $1`,
      [COMPANY_ID]
    );
    const coaByCode = new Map(coaRows.map(c => [c.account_code, c]));

    // Most common account_title per account_code, for creating missing chart_of_accounts rows.
    const { rows: titleRows } = await client.query(
      `SELECT account_code, account_title, COUNT(*) AS n
       FROM voucher_lines WHERE company_id = $1
       GROUP BY account_code, account_title ORDER BY account_code, n DESC`,
      [COMPANY_ID]
    );
    const titleByCode = new Map();
    for (const t of titleRows) if (!titleByCode.has(t.account_code)) titleByCode.set(t.account_code, t.account_title);

    const toCreate = [];
    const computed = [];

    for (const s of sums) {
      const debit  = parseFloat(s.total_debit)  || 0;
      const credit = parseFloat(s.total_credit) || 0;
      const existing = coaByCode.get(s.account_code);
      const account_name = existing ? existing.account_name : (titleByCode.get(s.account_code) || s.account_code);
      if (!existing) toCreate.push({ account_id: s.account_code, account_code: s.account_code, account_name });

      const prefix = s.account_code.slice(0, 2);
      const isCreditNormal = ['10', '13', '14'].includes(prefix);
      const balance = isCreditNormal ? (credit - debit) : (debit - credit);
      const bankId = bankIdFor(s.account_code);

      computed.push({
        account_code: s.account_code, account_name, line_count: s.line_count, isNew: !existing,
        debit, credit, balance, bankId, bankBalance: bankId ? (debit - credit) : null,
      });
    }

    const sumBy = prefixes => computed.filter(m => prefixes.includes(m.account_code.slice(0, 2)))
      .reduce((s, m) => s + m.balance, 0);
    const revenue  = sumBy(['10']);
    const expenses = sumBy(['12']);
    const assets   = sumBy(['11']);
    const liabsEq  = sumBy(['13', '14']);

    console.log(`voucher_lines grouped by account_code: ${sums.length}`);
    console.log(`Existing chart_of_accounts rows used:  ${computed.length - toCreate.length}`);
    console.log(`New chart_of_accounts rows to create:  ${toCreate.length}`);
    console.log('');
    console.log('Projected summary after backfill:');
    console.log(`  Revenue (10):        ${revenue.toLocaleString('en-PK')}`);
    console.log(`  Expenses (12):       ${expenses.toLocaleString('en-PK')}`);
    console.log(`  Net Profit:          ${(revenue - expenses).toLocaleString('en-PK')}`);
    console.log(`  Assets (11):         ${assets.toLocaleString('en-PK')}`);
    console.log(`  Liabilities+Equity:  ${liabsEq.toLocaleString('en-PK')}`);

    const bankBalances = new Map();
    for (const m of computed) {
      if (m.bankId) bankBalances.set(m.bankId, (bankBalances.get(m.bankId) || 0) + m.bankBalance);
    }
    const totalBankBalance = [...bankBalances.values()].reduce((s, v) => s + v, 0);
    console.log(`  Bank accounts affected: ${bankBalances.size}, total bank balance: ${totalBankBalance.toLocaleString('en-PK')}`);

    if (toCreate.length) {
      console.log('');
      console.log('Sample new chart_of_accounts rows to be created:');
      for (const c of toCreate.slice(0, 10)) console.log(`  ${c.account_code} — "${c.account_name}"`);
      if (toCreate.length > 10) console.log(`  ... and ${toCreate.length - 10} more`);
    }

    if (!APPLY) {
      console.log('');
      console.log('DRY RUN — no changes written. Re-run with --apply to write these balances.');
      return;
    }

    console.log('');
    console.log('Applying...');
    await client.query('BEGIN');

    for (const c of toCreate) {
      await client.query(
        `INSERT INTO chart_of_accounts (account_id, account_code, account_name, balance, company_id)
         VALUES ($1, $2, $3, 0, $4)`,
        [c.account_id, c.account_code, c.account_name, COMPANY_ID]
      );
    }

    // Reset all balances to 0 first, then set computed balances for accounts in the ledger.
    await client.query('UPDATE chart_of_accounts SET balance = 0 WHERE company_id = $1', [COMPANY_ID]);
    await client.query('UPDATE bank_accounts SET balance = 0 WHERE company_id = $1', [COMPANY_ID]);
    for (const m of computed) {
      await client.query(
        'UPDATE chart_of_accounts SET balance = $1 WHERE account_code = $2 AND company_id = $3',
        [m.balance, m.account_code, COMPANY_ID]
      );
    }
    for (const [bankId, balance] of bankBalances) {
      await client.query('UPDATE bank_accounts SET balance = $1 WHERE account_id = $2 AND company_id = $3', [balance, bankId, COMPANY_ID]);
    }

    await client.query('COMMIT');
    console.log(`Done. Created ${toCreate.length} accounts, updated ${computed.length} chart_of_accounts balances and ${bankBalances.size} bank accounts.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pg.end();
  }
})();
