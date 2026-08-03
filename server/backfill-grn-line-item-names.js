// Gives the purchased goods their real names, gauges and sizes.
//
// The Vendor Ledger has never shown item detail. The link was there all along — every
// imported PI voucher writes its source documents into the line narration:
//
//   "Vendor Charged,GRN:GRN-26-05-0001,PO:PO-26-05-0001-Bill#57-2"
//
// and 2,401 of the 2,470 PI vouchers name a GRN that has lines in grn_line_items. What is
// missing is what those lines are: the old system exported purchases by code only, so all
// 3,544 rows read "Item-001-01-08-0042" with no unit, gauge or size. (Sales came across
// with real names, which is why only the purchase side is blank.)
//
// products.csv is the catalogue those codes index, stored as a tree:
//
//   001-00-0000  = GI          <- material, from segment 1
//   001-08-0000  = 0.50MM      <- gauge,    from segment 3
//   001-08-0042  = 48"         <- size,     from segments 3 + 4
//
// Segment 3 carries the gauge, not segment 2. Two independent checks say so:
//   * 209 of the 522 purchase codes use a segment-3 index that also appears in the sales
//     codes, where the real gauge is known from the real name — and 198 of those (94.7%)
//     agree with what products.csv says the index means.
//   * Reading segment 2 instead puts 394 of 522 codes at 0.25MM, a gauge that appears
//     nowhere in ten years of sales; reading segment 3 gives 2.00 / 1.50 / 1.20 / 1.00 /
//     3.00MM, which is exactly what the business trades in.
//
// Quantities, prices and GRN links are already correct and are not touched. The unit is
// set to Kilo Grams: the export left it blank, the recorded prices (Rs 250/unit against
// sales rates of Rs 100-400 per kg) are per-kilo, and 92% of the sales lines are in kg.
//
// Only rows still holding a placeholder name are updated, so re-running is safe and a
// name corrected by hand is never overwritten.
//
// Run: node backfill-grn-line-item-names.js          (dry run, default)
//      node backfill-grn-line-item-names.js --apply  (writes)
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');
require('dotenv').config();

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });
const APPLY = process.argv.includes('--apply');

const readCsv = (file) => parse(fs.readFileSync(path.join(__dirname, 'sqldata', file), 'utf8'), {
  columns: true, skip_empty_lines: true, trim: true, bom: true,
  relax_quotes: true, relax_column_count: true,
});

// Trailing junk on a few catalogue entries ('49.5"`') is import noise, not part of the size.
const clean = (s) => String(s ?? '').replace(/[`'"]+$/, '').trim();

(async () => {
  const client = await pg.connect();
  let began = false;
  try {
    const catalogue = {};
    for (const r of readCsv('products.csv')) {
      if (r.ItemId) catalogue[r.ItemId] = clean(r.Name);
    }

    // Not every branch of the catalogue is a sheet. Fittings (Thermostate, L-3, Control
    // Box) sit at the same depth, so their "gauge" and "size" nodes hold a name rather
    // than a number — those stay empty instead of becoming "NaN mm".
    const numeric = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) && /^\s*[\d.]/.test(String(v ?? '')) ? n : null;
    };

    // code -> { item_name, gauge, size, unit }
    const decode = (code) => {
      const p = String(code || '').split('-');
      if (p.length < 4) return null;
      const [mat, , g, sz] = p;
      const material = catalogue[`${mat}-00-0000`] || null;
      const mm   = numeric(catalogue[`${mat}-${g}-0000`]);
      const inch = numeric(catalogue[`${mat}-${g}-${sz}`]);
      if (!material && mm == null && inch == null) return null;
      return {
        item_name: material || `Item ${code}`,
        // Normalised to the form the ledgers render ("0.50 mm", `48"`), matching how the
        // sales side reads once itemGauge/itemSize have parsed it.
        gauge: mm   != null ? `${mm.toFixed(2)} mm` : null,
        size:  inch != null ? `${inch}"`            : null,
        // Sheet steel is bought by weight; a thermostat is bought by the piece. The export
        // recorded no unit either way, so it is only asserted where the row decoded as a
        // sheet — a fitting keeps an empty unit and shows a bare count.
        unit: (mm != null || inch != null) ? 'Kilo Grams' : null,
      };
    };

    // Placeholder names, plus any row an earlier run left holding a non-numeric spec, so
    // re-running repairs rather than skips them.
    const NEEDS_FILL = `(item_name like 'Item-%' or item_name is null
                         or gauge like 'NaN%' or size like 'NaN%')`;
    const { rows: lines } = await client.query(`
      select id, item_code, item_name, gauge, size, unit
      from grn_line_items
      where ${NEEDS_FILL}
      order by id`);

    // Every code in the table, not only the ones needing a name — a row named on an earlier
    // run can still need its unit corrected, and that repair runs off this map.
    const { rows: allCodes } = await client.query(
      'select distinct item_code from grn_line_items where item_code is not null');
    const byCode = new Map();
    for (const { item_code } of allCodes) {
      const d = decode(item_code);
      if (d) byCode.set(item_code, { code: item_code, ...d });
    }

    const plan = [];
    const undecodable = new Map();
    for (const l of lines) {
      const d = byCode.get(l.item_code);
      if (!d) { undecodable.set(l.item_code, (undecodable.get(l.item_code) || 0) + 1); continue; }
      plan.push({ id: l.id, ...d });
    }

    console.log(`${lines.length} placeholder line(s); ${plan.length} decodable across ${byCode.size} distinct codes.\n`);
    console.table([...byCode.values()].slice(0, 15).map(p => ({
      code: p.code, item: p.item_name, gauge: p.gauge || '—', size: p.size || '—',
    })));

    const full = plan.filter(p => p.gauge && p.size).length;
    console.table([
      { result: 'name + gauge + size', lines: full },
      { result: 'name only (gauge or size missing from the catalogue)', lines: plan.length - full },
      { result: 'no catalogue entry at all — left untouched', lines: lines.length - plan.length },
    ]);
    if (undecodable.size) {
      console.log('\nCodes with no catalogue entry:');
      console.table([...undecodable].slice(0, 10).map(([code, n]) => ({ code, lines: n })));
    }

    if (!APPLY) {
      console.log('\nDry run — nothing written. Re-run with --apply to make these changes.');
      return;
    }

    await client.query('begin');
    began = true;
    // One statement per distinct code rather than per row: 522 updates, not 3,544.
    for (const [code, d] of byCode) {
      await client.query(`
        update grn_line_items
        set item_name = $1, gauge = $2, size = $3, unit = coalesce($4, unit)
        where item_code = $5 and ${NEEDS_FILL}`,
        [d.item_name, d.gauge, d.size, d.unit, code]);
    }

    // A fitting that decoded without a gauge or a size is not bought by weight, so it must
    // not carry a kg unit — otherwise "50 Number" reads as "50 kg". Corrects rows an
    // earlier run stamped before the sheet/fitting distinction existed.
    const fittingCodes = [...byCode].filter(([, d]) => d.unit === null).map(([code]) => code);
    if (fittingCodes.length) {
      await client.query(`
        update grn_line_items set unit = null
        where item_code = any($1) and gauge is null and size is null`, [fittingCodes]);
    }

    await client.query('commit');
    began = false;

    const { rows: after } = await client.query(`
      select count(*)::int lines,
             count(*) filter (where item_name not like 'Item-%')::int named,
             count(gauge)::int with_gauge, count(size)::int with_size
      from grn_line_items`);
    console.log('\nDone.');
    console.table(after);

    const { rows: sample } = await client.query(`
      select grn_id, item_name, gauge, size, quantity, unit
      from grn_line_items order by id desc limit 8`);
    console.table(sample);
  } catch (err) {
    if (began) await client.query('rollback');
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pg.end();
  }
})();
