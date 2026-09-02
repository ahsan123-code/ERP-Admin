// Removes purchase-invoice vouchers whose bill no longer exists, and reverses the
// balances they are still holding up.
//
// A recorded bill posts a balanced double entry under `${bill_id}-1`, `${bill_id}-2` …
// (see procurementDb.postPurchaseInvoiceVoucher). Deleting the bill was never deleting
// that voucher: procurementDb.deletePdn cascaded into `purchase_invoices` and left the
// ledger alone, so the credit stayed on Trade Creditors with no document behind it and
// the Purchases figure stayed inflated by the same amount. Both sides of that are fixed
// in erp-client/src/lib/db.js now — deletePdn reverses the voucher before dropping the
// bill, and deletePurchaseInvoice does the same for a single-row delete. This script
// clears what the old behaviour already left in the database.
//
// The balance reversal mirrors financeDb.applyVoucherToBalances exactly: the account
// CODE decides the normal side (10/13/14 credit-normal, everything else debit-normal),
// because account_type is unset on most of the chart. Anything that disagrees with that
// rule disagrees with the Trial Balance.
//
// Idempotent: it only ever matches vouchers with no `purchase_invoices` row, so a second
// run finds nothing. Every run writes a JSON backup of the rows it is about to delete.
//
// Run: node cleanup-orphan-purchase-invoice-vouchers.js [--dry-run]
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });

const DRY_RUN = process.argv.includes('--dry-run');

// The leg suffix postJournalEntry appends. [0-9] rather than \d: the driver passes the
// pattern through as written and a doubled backslash silently matches nothing, which
// makes every voucher look like an orphan.
const GROUP_OF = `regexp_replace(voucher_id, '-[0-9]+$', '')`;

const CREDIT_NORMAL_PREFIXES = ['10', '13', '14'];
const isCreditNormal = (accountCode) => CREDIT_NORMAL_PREFIXES.includes(String(accountCode ?? '').slice(0, 2));

const money = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  const client = await pg.connect();
  try {
    await client.query('BEGIN');

    const { rows: lines } = await client.query(`
      SELECT l.id, l.voucher_id, ${GROUP_OF} AS group_id, l.company_id,
             l.account_code, l.account_title, l.debit, l.credit
        FROM voucher_lines l
       WHERE l.voucher_id LIKE 'PBILL-%'
         AND NOT EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.bill_id = ${GROUP_OF})
       ORDER BY l.voucher_id`);

    const { rows: vouchers } = await client.query(`
      SELECT v.id, v.voucher_id, ${GROUP_OF} AS group_id, v.company_id, v.date,
             v.account_name, v.debit, v.credit
        FROM vouchers v
       WHERE v.voucher_id LIKE 'PBILL-%'
         AND NOT EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.bill_id = ${GROUP_OF})
       ORDER BY v.voucher_id`);

    const { rows: items } = await client.query(`
      SELECT pii.* FROM purchase_invoice_items pii
       WHERE NOT EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.bill_id = pii.bill_id)
       ORDER BY pii.bill_id, pii.line_no`);

    if (!vouchers.length && !lines.length && !items.length) {
      console.log('No orphaned purchase-invoice vouchers or item rows. Nothing to do.');
      await client.query('ROLLBACK');
      return;
    }

    const groups = [...new Set(vouchers.map(v => v.group_id))];
    console.log(`Orphaned bills: ${groups.length ? groups.join(', ') : '(none)'}`);
    console.log(`  ${vouchers.length} voucher row(s), ${lines.length} voucher line(s), ${items.length} item row(s)\n`);

    // Net the reversal per (company, account) first. Two orphans hitting Trade Creditors
    // would otherwise be applied as two read-modify-write updates against the same row.
    const deltas = new Map();
    for (const l of lines) {
      const key = `${l.company_id}|${l.account_code}`;
      const applied = isCreditNormal(l.account_code)
        ? Number(l.credit || 0) - Number(l.debit || 0)
        : Number(l.debit || 0) - Number(l.credit || 0);
      deltas.set(key, (deltas.get(key) || 0) - applied);   // subtract what was applied
    }

    console.log('Balance corrections:');
    for (const [key, delta] of deltas) {
      const [companyId, accountCode] = key.split('|');
      const { rows: [account] } = await client.query(
        `SELECT account_id, account_name, balance FROM chart_of_accounts
          WHERE account_code = $1 AND company_id = $2`, [accountCode, companyId]);
      if (!account) {
        console.log(`  ! ${accountCode} (company ${companyId}) is not in the chart — balance left alone`);
        continue;
      }
      const before = Number(account.balance || 0);
      console.log(`  ${accountCode} ${account.account_name}: ${money(before)} → ${money(before + delta)}  (${delta >= 0 ? '+' : ''}${money(delta)})`);
      if (!DRY_RUN) {
        await client.query(
          `UPDATE chart_of_accounts SET balance = $1 WHERE account_id = $2 AND company_id = $3`,
          [before + delta, account.account_id, companyId]);
      }
    }

    const backupPath = path.join(__dirname, `backup-orphan-pbill-vouchers-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ groups, vouchers, lines, items }, null, 2));
    console.log(`\nBackup written: ${path.basename(backupPath)}`);

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('\n--dry-run: rolled back, nothing changed.');
      return;
    }

    const voucherIds = vouchers.map(v => v.voucher_id);
    const lineIds = lines.map(l => l.id);
    const itemIds = items.map(i => i.id);
    if (lineIds.length)    await client.query(`DELETE FROM voucher_lines WHERE id = ANY($1::int[])`, [lineIds]);
    if (voucherIds.length) await client.query(`DELETE FROM vouchers WHERE voucher_id = ANY($1::text[])`, [voucherIds]);
    if (itemIds.length)    await client.query(`DELETE FROM purchase_invoice_items WHERE id = ANY($1::int[])`, [itemIds]);

    await client.query('COMMIT');
    console.log(`\nDeleted ${voucherIds.length} voucher row(s), ${lineIds.length} line(s), ${itemIds.length} item row(s).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pg.end();
  }
})();
