// Recovers the item lines of purchase bills that were saved with a total but no detail.
//
// A bill raised in the app is meant to pull its lines from the PO or the GRN it is raised
// against — the screen does that on selection and refuses to save without at least one
// line. A handful of early bills predate that and hold only a total, which leaves the
// Item / Gauge / Size / Weight columns of the Vendor Ledger empty for them.
//
// Where such a bill still points at a source document, the lines can be copied back. The
// GRN is preferred over the PO: it records what actually arrived, so a short delivery is
// billed at the received quantity rather than the ordered one.
//
// A copy is only made when the source lines add up to the bill's items_total. Item detail
// that contradicts the amount already posted is worse than none — it reads as though the
// bill were mis-stated. Mismatches are reported and skipped unless --force is passed.
//
// Idempotent: bills that already have lines are never touched.
// Run: node backfill-purchase-invoice-items-from-source.js          (dry run, default)
//      node backfill-purchase-invoice-items-from-source.js --apply
//      node backfill-purchase-invoice-items-from-source.js --apply --force
const { Pool } = require('pg');
require('dotenv').config();

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const money = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

(async () => {
  const client = await pg.connect();
  let began = false;
  try {
    const { rows: bills } = await client.query(`
      select p.bill_id, p.company_id, p.vendor_name, p.bill_date, p.po_ref, p.grn_ref,
             p.items_total
      from purchase_invoices p
      where not exists (select 1 from purchase_invoice_items i where i.bill_id = p.bill_id)
        and (p.po_ref is not null or p.grn_ref is not null)
      order by p.bill_date`);

    if (bills.length === 0) {
      console.log('Every bill with a source document already has its lines. Nothing to do.');
      return;
    }

    const plan = [];
    const skipped = [];
    for (const b of bills) {
      // GRN first — what arrived beats what was ordered.
      const { rows: grnLines } = b.grn_ref ? await client.query(`
        select item_code, item_name, unit, gauge, size, quantity, unit_price, total_price
        from grn_line_items
        where company_id = $1 and (grn_id = $2 or grn_id = 'GRN-' || $2)
        order by id`, [b.company_id, b.grn_ref]) : { rows: [] };

      const { rows: poLines } = (grnLines.length === 0 && b.po_ref) ? await client.query(`
        select item_code, item_name, unit, gauge, size, quantity, unit_price, total_price
        from po_line_items
        where company_id = $1 and po_id = $2
        order by id`, [b.company_id, b.po_ref]) : { rows: [] };

      const lines = grnLines.length ? grnLines : poLines;
      const source = grnLines.length ? `GRN ${b.grn_ref}` : (poLines.length ? `PO ${b.po_ref}` : null);
      if (!source) { skipped.push({ ...b, reason: 'source document has no lines' }); continue; }

      const sourceTotal = money(lines.reduce(
        (s, l) => s + (money(l.total_price) || money(l.quantity) * money(l.unit_price)), 0));
      const billTotal = money(b.items_total);
      const matches = Math.abs(sourceTotal - billTotal) < 0.5;

      if (!matches && !FORCE) {
        skipped.push({ ...b, reason: `source totals ${sourceTotal} but the bill says ${billTotal}` });
        continue;
      }
      plan.push({ bill: b, source, lines, sourceTotal, billTotal, matches });
    }

    console.log(`${bills.length} bill(s) missing lines; ${plan.length} recoverable.\n`);
    if (plan.length) {
      console.table(plan.flatMap(p => p.lines.map((l, i) => ({
        bill: i === 0 ? p.bill.bill_id : '',
        vendor: i === 0 ? p.bill.vendor_name : '',
        from: i === 0 ? p.source : '',
        item: l.item_name, gauge: l.gauge || '—', size: l.size || '—',
        qty: l.quantity, rate: l.unit_price, total: l.total_price,
        reconciles: i === 0 ? (p.matches ? 'yes' : 'NO — forced') : '',
      }))));
    }
    if (skipped.length) {
      console.log('Skipped:');
      console.table(skipped.map(s => ({ bill: s.bill_id, vendor: s.vendor_name, reason: s.reason })));
    }

    if (!APPLY) {
      console.log('\nDry run — nothing written. Re-run with --apply to write these lines.');
      return;
    }
    if (plan.length === 0) { console.log('\nNothing to write.'); return; }

    await client.query('begin');
    began = true;
    let written = 0;
    for (const p of plan) {
      for (let i = 0; i < p.lines.length; i++) {
        const l = p.lines[i];
        await client.query(`
          insert into purchase_invoice_items
            (bill_id, line_no, item_code, item_name, unit, gauge, size, quantity, unit_price, total_price, company_id)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [p.bill.bill_id, i + 1, l.item_code, l.item_name, l.unit, l.gauge, l.size,
           l.quantity, l.unit_price, l.total_price, p.bill.company_id]);
        written++;
      }
    }
    await client.query('commit');
    began = false;

    console.log(`\nWrote ${written} line(s) across ${plan.length} bill(s).`);
    const { rows: after } = await client.query(`
      select i.bill_id, i.item_name, i.gauge, i.size, i.quantity, i.unit
      from purchase_invoice_items i order by i.bill_id, i.line_no`);
    console.table(after);
  } catch (err) {
    if (began) await client.query('rollback');
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pg.end();
  }
})();
