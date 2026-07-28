// One-time backfill: give Shop #58 (company 2) its own copy of Shop #41's vendors.
//
// Vendors are scoped per branch, and every one of the 270 existing rows belongs to
// company 1, so Shop #58 had an empty vendor list once the company filter was
// applied. This copies them across so both branches start from the same suppliers.
//
// The two copies are independent from here on: editing a vendor in one branch does
// not affect the other, which is the point of per-branch scoping.
//
// Dry run by default — prints what it would copy and changes nothing.
// Pass --apply to actually write.
//
//   node server/backfill-shop58-vendors.js
//   node server/backfill-shop58-vendors.js --apply
//
// Idempotent: a vendor whose name already exists for the target company is skipped,
// so re-running never produces duplicates.
const { Pool } = require('pg');
require('dotenv').config();

const APPLY  = process.argv.includes('--apply');
const SOURCE = 1;   // Allied Steel Center / Shop #41
const TARGET = 2;   // Shop #58

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  family: 4,
});

async function main() {
  const client = await pool.connect();

  const { rows: companies } = await client.query(
    `SELECT id, name FROM companies WHERE id = ANY($1) ORDER BY id`, [[SOURCE, TARGET]]
  );
  const nameOf = Object.fromEntries(companies.map(c => [c.id, c.name]));
  if (!nameOf[TARGET]) {
    console.error(`Company ${TARGET} does not exist — nothing to copy into.`);
    client.release(); await pool.end(); process.exit(1);
  }
  console.log(`Copying vendors: [${SOURCE}] ${nameOf[SOURCE]}  ->  [${TARGET}] ${nameOf[TARGET]}\n`);

  // Match on name: vendors have no natural key beyond it, and a name already
  // present in the target is the only reliable sign it was copied before.
  const { rows: toCopy } = await client.query(`
    SELECT v.name, v.ntn, v.contact, v.address, v.category, v.rating, v.status
    FROM vendors v
    WHERE v.company_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM vendors t
        WHERE t.company_id = $2 AND lower(btrim(t.name)) = lower(btrim(v.name))
      )
    ORDER BY v.name
  `, [SOURCE, TARGET]);

  const { rows: existing } = await client.query(
    `SELECT count(*)::int n FROM vendors WHERE company_id = $1`, [TARGET]);

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — target already has ${existing[0].n} vendor(s); ${toCopy.length} to copy\n`);
  if (toCopy.length === 0) {
    console.log('Nothing to do.');
    client.release(); await pool.end(); return;
  }

  await client.query('BEGIN');
  try {
    for (const v of toCopy) {
      await client.query(
        `INSERT INTO vendors (name, ntn, contact, address, category, rating, status, company_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [v.name, v.ntn, v.contact, v.address, v.category, v.rating ?? 3, v.status ?? 'active', TARGET]
      );
    }

    const preview = toCopy.slice(0, 8).map(v => `  · ${v.name}`).join('\n');
    console.log(preview + (toCopy.length > 8 ? `\n  … and ${toCopy.length - 8} more` : ''));

    if (APPLY) {
      await client.query('COMMIT');
      const { rows: after } = await client.query(
        `SELECT count(*)::int n FROM vendors WHERE company_id = $1`, [TARGET]);
      console.log(`\nCommitted. ${nameOf[TARGET]} now has ${after[0].n} vendor(s).`);
    } else {
      await client.query('ROLLBACK');
      console.log(`\nDRY RUN — rolled back, nothing written.`);
      console.log(`Would copy ${toCopy.length} vendor(s). Re-run with --apply to write.`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\nFailed, rolled back — no vendors were copied: ${err.message}`);
    client.release(); await pool.end(); process.exit(1);
  }

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error('Backfill failed:', err.message);
  pool.end();
  process.exit(1);
});
