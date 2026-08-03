// Puts the real vendor name on imported purchase orders and goods-receipt notes.
//
// The purchase-bill screen offers a PO and a GRN dropdown, labelled "<id> — <vendor>".
// The imported documents make that label useless in opposite ways:
//
//   purchase_orders : 2,506 of 2,512 read "Vendor-44", "Vendor-242" — the source export
//                     carried a numeric vendor id, never the name.
//   grns            : 2,502 of 2,506 have no vendor at all, so the label ends in a dash.
//
// The name was never exported with either document, but it is recorded against the
// posting they produced. Each imported purchase voucher writes its documents into the
// line narration and carries the vendor on its own leg under Trade Creditors:
//
//   line 1  "Purchases Charged,GRN:GRN-17-01-0016,PO:DM-17-01-0016"
//   line 2  account 14-01-001-000xxx, title "HANIF NAEEM SB"     <- the vendor
//
// Joining those two recovers 1,736 names for each table. The rest belong to receipts that
// were never billed, so no voucher names them; those keep what they have.
//
// Only placeholder or empty names are replaced — a name already corrected by hand stays.
// Idempotent: re-running finds nothing left to fill.
//
// Run: node backfill-po-grn-vendor-names.js          (dry run, default)
//      node backfill-po-grn-vendor-names.js --apply  (writes)
const { Pool } = require('pg');
require('dotenv').config();

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const APPLY = process.argv.includes('--apply');

(async () => {
  const client = await pg.connect();
  let began = false;
  try {
    // The vendor leg of every imported purchase voucher.
    const { rows: legs } = await client.query(`
      select l.voucher_id, l.company_id, l.account_title
      from voucher_lines l
      join vouchers v on v.voucher_id = l.voucher_id and v.company_id = l.company_id
      where v.voucher_type = 'PI' and l.account_code like '14-01-001-%'
        and l.account_title is not null`);
    const vendorOf = new Map();
    for (const l of legs) {
      const k = `${l.company_id}|${l.voucher_id}`;
      if (!vendorOf.has(k)) vendorOf.set(k, l.account_title);
    }

    // The documents each voucher names.
    const { rows: refs } = await client.query(`
      select l.voucher_id, l.company_id, l.narration
      from voucher_lines l
      join vouchers v on v.voucher_id = l.voucher_id and v.company_id = l.company_id
      where v.voucher_type = 'PI' and l.narration ~ 'GRN:'`);

    const grnVendor = new Map();
    const poVendor  = new Map();
    for (const r of refs) {
      const vendor = vendorOf.get(`${r.company_id}|${r.voucher_id}`);
      if (!vendor) continue;
      const g = /GRN:\s*([A-Za-z0-9-]+)/.exec(r.narration)?.[1];
      const p = /PO:\s*([A-Za-z0-9-]+)/.exec(r.narration)?.[1];
      if (g) { const k = `${r.company_id}|${g}`; if (!grnVendor.has(k)) grnVendor.set(k, vendor); }
      if (p) { const k = `${r.company_id}|${p}`; if (!poVendor.has(k))  poVendor.set(k, vendor); }
    }

    // Both tables store the id with the prefix doubled ("GRN-GRN-…", "PO-DM-…") while the
    // narration writes it once, so the bare form is tried as well.
    const lookup = (map, companyId, id) =>
      map.get(`${companyId}|${id}`)
      ?? map.get(`${companyId}|${String(id).replace(/^GRN-/, '')}`)
      ?? map.get(`${companyId}|${String(id).replace(/^PO-/, '')}`)
      ?? null;

    const { rows: grns } = await client.query(`
      select grn_id, company_id, vendor_name from grns
      where vendor_name is null or btrim(vendor_name) = '' or vendor_name like 'Vendor-%'`);
    const { rows: pos } = await client.query(`
      select po_id, company_id, vendor_name from purchase_orders
      where vendor_name is null or btrim(vendor_name) = '' or vendor_name like 'Vendor-%'`);

    const grnPlan = grns.map(g => ({ ...g, vendor: lookup(grnVendor, g.company_id, g.grn_id) }))
                        .filter(g => g.vendor);
    const poPlan  = pos.map(p => ({ ...p, vendor: lookup(poVendor, p.company_id, p.po_id) }))
                       .filter(p => p.vendor);

    console.table([
      { table: 'grns',            needing_a_name: grns.length, recoverable: grnPlan.length },
      { table: 'purchase_orders', needing_a_name: pos.length,  recoverable: poPlan.length },
    ]);
    console.log('\nGRN sample:');
    console.table(grnPlan.slice(0, 6).map(g => ({ id: g.grn_id, now: g.vendor_name || '(blank)', becomes: g.vendor })));
    console.log('PO sample:');
    console.table(poPlan.slice(0, 6).map(p => ({ id: p.po_id, now: p.vendor_name, becomes: p.vendor })));

    if (!APPLY) {
      console.log('\nDry run — nothing written. Re-run with --apply to make these changes.');
      return;
    }

    await client.query('begin');
    began = true;

    // One statement per table, joining against the values as a set. Issuing 3,472
    // single-row updates instead meant 3,472 round-trips to a hosted database, which took
    // long enough to look like a hang.
    const applyNames = async (table, idColumn, plan, idOf) => {
      if (plan.length === 0) return;
      const ids      = plan.map(idOf);
      const vendors  = plan.map(r => r.vendor);
      const companies = plan.map(r => r.company_id);
      await client.query(`
        update ${table} t
        set vendor_name = v.vendor
        from (select unnest($1::text[]) as id,
                     unnest($2::text[]) as vendor,
                     unnest($3::int[])  as company_id) v
        where t.${idColumn} = v.id and t.company_id = v.company_id`,
        [ids, vendors, companies]);
    };

    await applyNames('grns', 'grn_id', grnPlan, g => g.grn_id);
    await applyNames('purchase_orders', 'po_id', poPlan, p => p.po_id);

    await client.query('commit');
    began = false;

    console.log(`\nNamed ${grnPlan.length} GRN(s) and ${poPlan.length} PO(s).`);
    const { rows: after } = await client.query(`
      select 'grns' t, count(*)::int total,
             count(*) filter (where vendor_name is null or vendor_name like 'Vendor-%')::int still_unnamed
      from grns where company_id = 1
      union all
      select 'purchase_orders', count(*)::int,
             count(*) filter (where vendor_name is null or vendor_name like 'Vendor-%')::int
      from purchase_orders where company_id = 1`);
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
