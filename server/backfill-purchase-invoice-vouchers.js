// Backfill: post existing purchase invoices to the ledger.
//
// Bills recorded before postPurchaseInvoiceVoucher existed only ever touched the
// `purchase_invoices` table, so they never reached `vouchers`/`voucher_lines` and
// are invisible to the vendor ledger and vendor balances. This replays the same
// double entry the app now writes at save time.
//
// Dry run by default — prints what it would post and changes nothing.
// Pass --apply to actually write.
//
//   node server/backfill-purchase-invoice-vouchers.js
//   node server/backfill-purchase-invoice-vouchers.js --apply
//
// Idempotent: a bill that already has a `Purchase` voucher is skipped, so re-running
// after a partial failure is safe.
const { Pool } = require('pg');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');

// Credentials come from the gitignored server/.env, matching the other tracked
// backfill scripts. The migrate-*.js scripts embed the connection string inline,
// but those are covered by .gitignore — this file is not.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  family: 4,
});

// Must match postPurchaseInvoiceVoucher in erp-client/src/lib/db.js.
// 14-01-001-000000 "Trade Creditors" is the control account — NOT 14-01-001-000001,
// which is a real supplier (BASHIR PIPE INDUSTRY).
const PURCHASES = { code: '12-01-001-000000', name: 'Purchases',           type: 'Expense',   parent: '12-01-001' };
const SALES_TAX = { code: '12-06-003-000001', name: 'Sales Tax (ST)',      type: 'Expense',   parent: '12-06-003' };
const CHARGES   = { code: '12-01-030-000000', name: 'Charges On Purchase', type: 'Expense',   parent: '12-01-030' };
const PAYABLE   = { code: '14-01-001-000000', name: 'Trade Creditors',     type: 'Liability', parent: '14-01-001' };

const num = (v) => parseFloat(v) || 0;

// Mirrors financeDb.ensureLedgerAccount: find by code + company, create if missing.
async function ensureAccount(client, { code, name, type, parent }, companyId) {
  const { rows } = await client.query(
    `SELECT * FROM chart_of_accounts WHERE account_code = $1 AND company_id = $2 LIMIT 1`,
    [code, companyId]
  );
  if (rows[0]) return rows[0];
  const { rows: created } = await client.query(
    `INSERT INTO chart_of_accounts (account_id, account_code, account_name, account_type, parent_code, balance, company_id)
     VALUES ($1, $2, $3, $4, $5, 0, $6) RETURNING *`,
    [`AUTO-${code}-C${companyId}`, code, name, type, parent, companyId]
  );
  console.log(`    + created missing account ${code} "${name}" for company ${companyId}`);
  return created[0];
}

// Mirrors financeDb.applyVoucherToBalances. Income/Equity/Liability (10/13/14) are
// credit-normal; everything else is debit-normal.
async function applyBalance(client, account, debit, credit) {
  const prefix = (account.account_code || '').slice(0, 2);
  const creditNormal = ['10', '13', '14'].includes(prefix);
  const delta = creditNormal ? (credit - debit) : (debit - credit);
  await client.query(
    `UPDATE chart_of_accounts SET balance = coalesce(balance, 0) + $1 WHERE account_id = $2`,
    [delta, account.account_id]
  );
}

async function main() {
  const client = await pool.connect();

  const { rows: bills } = await client.query(`
    SELECT pi.bill_id, pi.vendor_name, pi.bill_date,
           pi.items_total, pi.tax_amount, pi.grand_total, pi.company_id
    FROM purchase_invoices pi
    WHERE NOT EXISTS (
      SELECT 1 FROM vouchers v
      WHERE v.reference = pi.bill_id AND v.voucher_type = 'Purchase'
    )
    ORDER BY pi.bill_date, pi.bill_id
  `);

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${bills.length} bill(s) with no ledger entry\n`);
  if (bills.length === 0) {
    console.log('Nothing to do.');
    client.release();
    await pool.end();
    return;
  }

  await client.query('BEGIN');
  let posted = 0, skipped = 0, totalValue = 0;

  try {
    for (const b of bills) {
      const grandTotal = num(b.grand_total);
      const companyId  = b.company_id ?? 1;

      if (grandTotal <= 0) {
        console.log(`  – ${b.bill_id}: grand_total is ${grandTotal}, skipped`);
        skipped++;
        continue;
      }
      if (!b.bill_date) {
        console.log(`  – ${b.bill_id}: no bill_date, skipped`);
        skipped++;
        continue;
      }

      const debitParts = [
        { ...PURCHASES, amount: num(b.items_total) },
        { ...SALES_TAX, amount: num(b.tax_amount) },
      ].filter(p => p.amount > 0);

      // Keep the entry balanced when the components don't add up to the total.
      const named = debitParts.reduce((s, p) => s + p.amount, 0);
      const remainder = grandTotal - named;
      if (Math.abs(remainder) > 0.005) {
        debitParts.push({ ...CHARGES, amount: remainder });
      }

      const debitAccounts = [];
      for (const p of debitParts) debitAccounts.push(await ensureAccount(client, p, companyId));
      const apAccount = await ensureAccount(client, PAYABLE, companyId);

      const narration = `Purchase invoice ${b.bill_id} — ${b.vendor_name}`;
      const legs = [
        ...debitAccounts.map((account, i) => ({ account, debit: debitParts[i].amount, credit: 0, shown: account.account_name })),
        { account: apAccount, debit: 0, credit: grandTotal, shown: b.vendor_name },
      ];

      // vouchers.voucher_id is UNIQUE, so each leg gets its own `${billId}-N`,
      // exactly as postJournalEntry does.
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        const legId = `${b.bill_id}-${i + 1}`;
        await client.query(
          `INSERT INTO vouchers (voucher_id, voucher_type, date, account_name, debit, credit, narration, reference, company_id)
           VALUES ($1,'Purchase',$2,$3,$4,$5,$6,$7,$8)`,
          [legId, b.bill_date, leg.shown, leg.debit, leg.credit, narration, b.bill_id, companyId]
        );
        await client.query(
          `INSERT INTO voucher_lines (voucher_id, line_no, account_code, account_title, debit, credit, narration, company_id)
           VALUES ($1,1,$2,$3,$4,$5,$6,$7)`,
          [legId, leg.account.account_code, leg.shown, leg.debit, leg.credit, narration, companyId]
        );
        await applyBalance(client, leg.account, leg.debit, leg.credit);
      }

      const legSummary = debitParts.map(p => `${p.name} ${p.amount.toFixed(2)}`).join(' + ');
      console.log(`  ✓ ${b.bill_id}  ${String(b.bill_date).slice(0, 10)}  ${b.vendor_name}`);
      console.log(`      Dr ${legSummary}   Cr Trade Creditors ${grandTotal.toFixed(2)}`);
      posted++;
      totalValue += grandTotal;
    }

    if (APPLY) {
      await client.query('COMMIT');
      console.log(`\nCommitted. Posted ${posted} bill(s), skipped ${skipped}. Total ${totalValue.toFixed(2)}.`);
    } else {
      await client.query('ROLLBACK');
      console.log(`\nDRY RUN — rolled back, nothing written.`);
      console.log(`Would post ${posted} bill(s), skip ${skipped}. Total ${totalValue.toFixed(2)}.`);
      console.log(`Re-run with --apply to write.`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\nFailed, rolled back — no bills were posted: ${err.message}`);
    client.release();
    await pool.end();
    process.exit(1);
  }

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error('Backfill failed:', err.message);
  pool.end();
  process.exit(1);
});
