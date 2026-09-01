// Puts the Book # into the ledger narration of sales vouchers already posted without it.
//
// The Book # is the number written in the physical bill book. It lived only on
// sales_invoices, while the ledger reads vouchers/voucher_lines, so it never appeared in
// any ledger however carefully it was entered — and it is usually filled in after
// dispatch, by which time the voucher had already been posted.
//
// postSalesInvoiceVoucher and the Book # editor both write it now. This is for the
// vouchers posted before that.
//
// Only touches vouchers whose narration is the one the app writes
// ("Sales invoice INV-… — Customer"). Imported history annotates its own rows differently
// and the Account Ledger parses those narrations to find each voucher's invoice and its
// item detail, so rewriting one would cost that link.
//
// Goes through PostgREST rather than a direct pg connection: db.<project>.supabase.co
// does not resolve on every network, and the REST endpoint is the one that reliably does.
//
//   node backfill-sales-voucher-book-no.js           # dry run, prints what it would do
//   node backfill-sales-voucher-book-no.js --apply   # writes
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in server/.env');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

// Must match salesDb.salesVoucherNarration in erp-client/src/lib/db.js, or a bill
// corrected later would be worded differently from one backfilled here.
const narrationFor = (saleInvId, customerName, bookNo) => {
  const base = `Sales invoice ${saleInvId} — ${customerName}`;
  const book = String(bookNo ?? '').trim();
  return book ? `${base} (Book # ${book})` : base;
};

const chunk = (arr, n) => arr.reduce((out, x, i) => {
  if (i % n === 0) out.push([]);
  out[out.length - 1].push(x);
  return out;
}, []);

(async () => {
  // 1. every invoice posted as a Sales voucher by the app
  const { data: vouchers, error: vErr } = await db
    .from('vouchers')
    .select('reference, company_id, narration')
    .eq('voucher_type', 'Sales')
    .like('narration', 'Sales invoice %');
  if (vErr) throw new Error(vErr.message);

  const byRef = new Map();
  for (const v of vouchers || []) {
    if (v.reference && !byRef.has(v.reference)) byRef.set(v.reference, v);
  }
  const refs = [...byRef.keys()];
  console.log(`${refs.length} invoice(s) posted as Sales vouchers`);

  // 2. the ones whose bill carries a Book #
  const targets = [];
  for (const part of chunk(refs, 100)) {
    const { data, error } = await db
      .from('sales_invoices')
      .select('sale_inv_id, customer_name, manual_bill_no')
      .in('sale_inv_id', part);
    if (error) throw new Error(error.message);
    for (const inv of data || []) {
      const book = String(inv.manual_bill_no ?? '').trim();
      if (!book) continue;
      // Already carries it — a re-run must be a no-op.
      if ((byRef.get(inv.sale_inv_id)?.narration || '').includes('(Book # ')) continue;
      targets.push(inv);
    }
  }

  console.log(`${targets.length} sales voucher(s) missing their Book #`);
  if (targets.length === 0) return;

  for (const t of targets.slice(0, 10)) {
    console.log(`  ${t.sale_inv_id}  Book # ${t.manual_bill_no}  ${t.customer_name}`);
  }
  if (targets.length > 10) console.log(`  … and ${targets.length - 10} more`);

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to write.');
    return;
  }

  let vCount = 0, lCount = 0;
  for (const t of targets) {
    const narration = narrationFor(t.sale_inv_id, t.customer_name, t.manual_bill_no);

    // Both tables: the ledger prefers the line narration and falls back to the voucher's,
    // and the customer ledger view coalesces the two, so updating one leaves the old text
    // showing on the other.
    const { data: vRows, error: e1 } = await db
      .from('vouchers').update({ narration })
      .eq('reference', t.sale_inv_id).eq('voucher_type', 'Sales')
      .like('narration', 'Sales invoice %')
      .select('voucher_id');
    if (e1) throw new Error(`${t.sale_inv_id}: ${e1.message}`);

    const { data: lRows, error: e2 } = await db
      .from('voucher_lines').update({ narration })
      .like('voucher_id', `${t.sale_inv_id}-%`)
      .like('narration', 'Sales invoice %')
      .select('voucher_id');
    if (e2) throw new Error(`${t.sale_inv_id}: ${e2.message}`);

    vCount += (vRows || []).length;
    lCount += (lRows || []).length;
    console.log(`  ${t.sale_inv_id} -> Book # ${t.manual_bill_no}`);
  }

  console.log(`\nUpdated ${vCount} voucher row(s) and ${lCount} voucher line(s).`);
})().catch(err => { console.error(err.message || err); process.exit(1); });
