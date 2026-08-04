// Fills fiscal_years with every year the books actually cover, plus the year ahead.
//
// The top bar's Fiscal Year selector read a one-item array hard-coded in the client
// (src/data/masters.js) that said "F-2026-2027", while this table held three unrelated
// rows ending at F-2025-2026. Neither matched the data, which runs from FY2016 to FY2026.
//
// A Pakistani fiscal year runs 1 July to 30 June and is named for the year it starts in:
// 1-Jul-2026 to 30-Jun-2027 is "F-2026-2027".
//
// Years are derived from the earliest and latest posting rather than typed in, so the list
// can never drift from the books again. One year beyond the current one is added so the
// next year is selectable before it starts; after that the app offers the new year itself
// each July, and an admin can add more from Settings.
//
// Existing rows are matched on start_date and updated, never duplicated. is_active marks
// the year containing today.
//
// Idempotent. Run: node backfill-fiscal-years.js          (dry run, default)
//                  node backfill-fiscal-years.js --apply
const { Pool } = require('pg');
require('dotenv').config();

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const APPLY = process.argv.includes('--apply');

// The fiscal year a date falls in, named by its starting year.
const fyStartOf = (d) => (d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1);
const iso = (y, m, day) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// A `date` column comes back as a Date at local midnight, so toISOString() rolls it to the
// previous day anywhere east of UTC — which made every existing row look like a new one.
// Read the local parts instead.
const ymd = (d) => { const t = new Date(d); return iso(t.getFullYear(), t.getMonth() + 1, t.getDate()); };

(async () => {
  const client = await pg.connect();
  let began = false;
  try {
    const { rows: [span] } = await client.query(`
      select min(date)::date as first, max(date)::date as last from vouchers`);
    if (!span?.first) { console.log('No postings yet — nothing to derive years from.'); return; }

    const firstFy = fyStartOf(new Date(span.first));
    const todayFy = fyStartOf(new Date());
    // One year past whichever is later: the books may run ahead of today, or behind it.
    const lastFy  = Math.max(fyStartOf(new Date(span.last)), todayFy) + 1;

    const years = [];
    for (let y = firstFy; y <= lastFy; y++) {
      years.push({
        label: `F-${y}-${y + 1}`,
        start_date: iso(y, 7, 1),
        end_date: iso(y + 1, 6, 30),
        is_active: y === todayFy,
      });
    }

    const { rows: existing } = await client.query('select id, label, start_date, is_active from fiscal_years');
    const byStart = new Map(existing.map(r => [ymd(r.start_date), r]));

    const toInsert = years.filter(y => !byStart.has(y.start_date));
    const toUpdate = years.filter(y => {
      const cur = byStart.get(y.start_date);
      return cur && (cur.label !== y.label || cur.is_active !== y.is_active);
    });

    console.log(`Books run ${span.first} → ${span.last}  (FY${firstFy} → FY${lastFy})`);
    console.table(years.map(y => ({
      ...y,
      state: byStart.has(y.start_date) ? (toUpdate.includes(y) ? 'update' : 'unchanged') : 'insert',
    })));

    if (!APPLY) {
      console.log(`\n${toInsert.length} to insert, ${toUpdate.length} to update.`);
      console.log('Dry run — nothing written. Re-run with --apply.');
      return;
    }

    await client.query('begin');
    began = true;
    for (const y of toInsert) {
      await client.query(
        'insert into fiscal_years (label, start_date, end_date, is_active) values ($1,$2,$3,$4)',
        [y.label, y.start_date, y.end_date, y.is_active]);
    }
    for (const y of toUpdate) {
      await client.query(
        'update fiscal_years set label = $1, end_date = $2, is_active = $3 where start_date = $4',
        [y.label, y.end_date, y.is_active, y.start_date]);
    }
    // Exactly one active year, whatever the previous rows claimed.
    await client.query('update fiscal_years set is_active = (start_date = $1)', [iso(todayFy, 7, 1)]);
    await client.query('commit');
    began = false;

    const { rows: after } = await client.query(
      'select id, label, start_date, end_date, is_active from fiscal_years order by start_date');
    console.log(`\nInserted ${toInsert.length}, updated ${toUpdate.length}.`);
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
