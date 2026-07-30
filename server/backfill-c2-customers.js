// Loads Shop #58's customer master (source CompanyId=3) into company_id=2.
//
// export-all.ps1 only ever pulled CompanyId=1, so customers.csv holds Shop #41 alone.
// import-company3.js worked around the gap by synthesising customers from order names
// ("CID=3 may have its own customers"), which left Shop #58 with 13 placeholder rows —
// no contact details, no credit limit, and names that do not match its own invoices.
// The Customer Current Balance report therefore showed nothing for that branch: it only
// lists a customer with a balance or an invoice, and none of the 13 had either.
//
// Run export-c3-customers.ps1 first to produce sqldata/c3_customers.csv (204 rows).
//
// Two things this has to get right:
//
//  * customer_id is UNIQUE across the whole table and company 1 uses "CUST-{CustomerId}".
//    Shop #58's source ids restart at 1, so importing them unchanged would collide with —
//    and with an upsert, overwrite — Shop #41's customers. Company 2's ids get a "-C2"
//    suffix.
//
//  * the 13 placeholders are unreferenced (no order, invoice or voucher points at them),
//    and 11 duplicate a real source customer once names are normalised. Those 11 are
//    deleted so each customer appears once. The 2 with no source match are kept:
//    'Mohsin Yunus Sb (Shop#46)' is probably the same person as source
//    'MOHSIN YUNUS SB (46 # Shop)', but that is a judgement call, not a safe automatic
//    merge, so it is left for someone to resolve by hand.
//
// Balances are deliberately NOT imported. Shop #41 has no customer opening balances
// either, so both branches report on the same basis; loading Shop #58's brought-forward
// figures is a separate, deliberate step.
//
// Idempotent: re-running updates details rather than duplicating.
// Run: node backfill-c2-customers.js [--dry]
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');
require('dotenv').config();

const pg  = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const DRY = process.argv.includes('--dry');
const CID = 2;                                    // app company id for Shop #58
const CSV = path.join(__dirname, 'sqldata', 'c3_customers.csv');

const str  = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
const num  = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
// Names differ in case, punctuation and double spaces between the two systems.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  if (!fs.existsSync(CSV)) {
    console.error(`Missing ${CSV}\nRun export-c3-customers.ps1 first.`);
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, trim: true, bom: true,
    relax_quotes: true, relax_column_count: true,
  }).filter(r => str(r.CustomerId) && str(r.Name));

  const client = await pg.connect();
  let began = false;
  try {
    const { rows: existing } = await client.query(
      'select customer_id, name from customers where company_id = $1', [CID]);

    const srcByNorm = new Map(rows.map(r => [norm(r.Name), r]));
    const dupes   = existing.filter(e => srcByNorm.has(norm(e.name)));
    const keepers = existing.filter(e => !srcByNorm.has(norm(e.name)));

    // Anything still pointing at a placeholder would make deleting it unsafe.
    const { rows: refs } = await client.query(`
      select (select count(*)::int from sales_orders   where customer_id = any($1)) as orders,
             (select count(*)::int from sales_invoices where customer_name = any($2)) as invoices`,
      [dupes.map(d => d.customer_id), dupes.map(d => d.name)]);

    const byId = new Map(existing.map(e => [e.customer_id, e]));
    const plan = rows.map(r => {
      const id = `CUST-${str(r.CustomerId)}-C${CID}`;
      return {
        customer_id: id,
        name:        str(r.Name),
        cnic:        str(r.CNIC),
        ntn:         str(r.NTN),
        region:      str(r.City),
        contact:     str(r.Mobile) || str(r.Phone),
        address:     str(r.Address),
        credit_limit: num(r.CreditLimit),
        exists:      byId.has(id),
      };
    });

    console.log(`\nSource customers: ${rows.length}`);
    console.log(`Company ${CID} currently has: ${existing.length} (all placeholders)`);
    console.log(`\n  insert ${plan.filter(p => !p.exists).length}`);
    console.log(`  update ${plan.filter(p =>  p.exists).length}`);
    console.log(`  delete ${dupes.length} placeholder(s) that duplicate a source customer:`);
    dupes.forEach(d => console.log(`     ${d.customer_id}  "${d.name}"  ->  "${srcByNorm.get(norm(d.name)).Name}"`));
    console.log(`  keep ${keepers.length} placeholder(s) with no source match (resolve by hand):`);
    keepers.forEach(k => console.log(`     ${k.customer_id}  "${k.name}"`));
    console.log(`\n  references to the placeholders being deleted — orders: ${refs[0].orders}, invoices: ${refs[0].invoices}`);

    if (refs[0].orders > 0 || refs[0].invoices > 0) {
      console.error('\nRefusing to delete: something now references these placeholders.');
      process.exitCode = 1;
      return;
    }
    if (DRY) { console.log('\n--dry: nothing written.'); return; }

    await client.query('begin');
    began = true;
    for (const p of plan) {
      await client.query(
        `insert into customers
           (customer_id, name, cnic, ntn, region, contact, address, credit_limit, status, company_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)
         on conflict (customer_id) do update
           set name = excluded.name, cnic = excluded.cnic, ntn = excluded.ntn,
               region = excluded.region, contact = excluded.contact,
               address = excluded.address, credit_limit = excluded.credit_limit`,
        [p.customer_id, p.name, p.cnic, p.ntn, p.region, p.contact, p.address, p.credit_limit, CID]);
    }
    if (dupes.length) {
      await client.query('delete from customers where customer_id = any($1) and company_id = $2',
        [dupes.map(d => d.customer_id), CID]);
    }
    await client.query('commit');

    const { rows: after } = await client.query(
      'select count(*)::int customers from customers where company_id = $1', [CID]);
    console.log(`\nDone. Company ${CID} now has ${after[0].customers} customers.`);
  } catch (err) {
    if (began) { try { await client.query('rollback'); } catch { /* connection gone */ } }
    console.error(`\nFailed${began ? ' — rolled back' : ' before any write'}:`, err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pg.end();
  }
})();
