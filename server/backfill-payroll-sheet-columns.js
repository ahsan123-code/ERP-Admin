// Fills the salary sheet's empty columns and repairs the short Total Deductions.
//
// Two gaps, both dating from how payroll_records were written rather than from the data
// itself. The printed salary sheet now carries the client's full column layout, which is
// what made them visible:
//
//   * late_rate / late_amount were never stored. GeneratePayrollModal computed the hourly
//     rate, spent it on the late deduction, and dropped it — the insert listed late_hours
//     alone. So the sheet's "Late Hours -> Rate/hour" and "total amount" columns print
//     blank on every existing row (35 of 38 have no rate; all 38 have a NULL amount),
//     even though the client's sheet shows a standing rate whether or not anyone was late.
//
//   * total_deductions left out the advance. PayrollManageModal summed loan + leave + late
//     and then subtracted the advance from net separately, so a row with an advance
//     printed a correct net against a total that was short by exactly the advance. Two
//     rows are affected: April 2026 Hafiz Tuqeer Sb (7,000 stored, 34,000 owed) and
//     June 2026 Salman Khan (0 stored, 5,000 owed). The client's own sheet counts the
//     advance as a deduction — on theirs, advance 20,000 with nothing else reads 20,000.
//
// net_salary is deliberately not touched. Every one of the 38 rows already satisfies
// net = gross + overtime - (advance + loan + leave + late), so the nets were right all
// along and only the deductions column disagreed. This script asserts that per row and
// skips any row where it does not hold, rather than quietly moving someone's pay.
//
// The hourly rate is gross / 30 / 8, matching GeneratePayrollModal. Both existing payroll
// periods (April and June 2026) are 30-day months, so this is the same figure the old
// daysInMonth divisor produced — no historical amount shifts.
//
// Only NULL/zero columns are filled and only mismatched totals rewritten, so re-running
// is safe and a figure corrected by hand is never overwritten.
//
// Run: node backfill-payroll-sheet-columns.js          (dry run, default)
//      node backfill-payroll-sheet-columns.js --apply  (writes)
const { Pool } = require('pg');
require('dotenv').config();

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, family: 4 });

const APPLY = process.argv.includes('--apply');
const PAY_DAYS_PER_MONTH = 30;
const HOURS_PER_DAY = 8;
const OVERTIME_MULTIPLIER = 4 / 3;

const n = (v) => Number(v) || 0;

(async () => {
  const { rows } = await pg.query(`
    SELECT payroll_id, employee_name, month, year, gross_salary, unpaid_leave_amount,
           overtime_hours, overtime_rate, overtime_amount,
           late_hours, late_rate, late_amount, advance_salary,
           loan_deduction, total_deductions, net_salary
      FROM payroll_records
     ORDER BY year, month, employee_name`);

  const updates = [];
  const skipped = [];

  for (const r of rows) {
    const hourly = +(n(r.gross_salary) / PAY_DAYS_PER_MONTH / HOURS_PER_DAY).toFixed(2);
    const set = {};

    if (!n(r.late_rate) && n(r.gross_salary) > 0) set.late_rate = hourly;
    const rate = set.late_rate ?? n(r.late_rate);

    // Same gap on the Over time block's Rate/hour, at the 4/3 premium the client pays.
    // Filled only where no overtime was actually worked, so the stored overtime_amount
    // and net cannot be contradicted — a row with hours already has a rate that was
    // applied to real money, and re-rating it here would silently change someone's pay.
    if (!n(r.overtime_rate) && n(r.gross_salary) > 0 && !n(r.overtime_hours)) {
      set.overtime_rate = +(hourly * OVERTIME_MULTIPLIER).toFixed(2);
    }
    // Only ever fills a blank: the column was added with DEFAULT 0, so every existing row
    // reads 0 whether or not late hours were worked. A non-zero amount is left alone —
    // it was either calculated correctly or corrected by hand.
    const due = Math.round(rate * n(r.late_hours));
    if (!n(r.late_amount) && due > 0) set.late_amount = due;

    const lateAmount = set.late_amount ?? n(r.late_amount);
    const owed = n(r.advance_salary) + n(r.loan_deduction) + n(r.unpaid_leave_amount) + lateAmount;

    if (Math.abs(owed - n(r.total_deductions)) > 0.5) {
      // Only safe to rewrite the total if the stored net already agrees with it — that
      // proves the deduction really was applied and only the column was wrong.
      const impliedNet = n(r.gross_salary) + n(r.overtime_amount) - owed;
      if (Math.abs(impliedNet - n(r.net_salary)) > 0.5) {
        skipped.push({ ...r, owed, impliedNet });
        continue;
      }
      set.total_deductions = owed;
    }

    if (Object.keys(set).length > 0) updates.push({ id: r.payroll_id, name: r.employee_name, period: `${r.month} ${r.year}`, set });
  }

  const byCol = {};
  updates.forEach(u => Object.keys(u.set).forEach(k => { byCol[k] = (byCol[k] || 0) + 1; }));

  console.log(`payroll_records: ${rows.length} rows, ${updates.length} to update`);
  console.log('columns:', Object.entries(byCol).map(([k, v]) => `${k}=${v}`).join(', ') || 'none');

  updates.filter(u => 'total_deductions' in u.set).forEach(u => {
    console.log(`  total_deductions  ${u.period}  ${u.name}  -> ${u.set.total_deductions}`);
  });
  if (skipped.length) {
    console.log(`\n${skipped.length} row(s) SKIPPED — net does not corroborate the deduction:`);
    skipped.forEach(s => console.log(`  ${s.month} ${s.year} ${s.employee_name}: stored net ${s.net_salary}, implied ${s.impliedNet}`));
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to write.');
    await pg.end();
    return;
  }

  let written = 0;
  for (const u of updates) {
    const cols = Object.keys(u.set);
    const assignments = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    await pg.query(
      `UPDATE payroll_records SET ${assignments} WHERE payroll_id = $1`,
      [u.id, ...cols.map(c => u.set[c])],
    );
    written++;
  }
  console.log(`\nWrote ${written} row(s).`);
  await pg.end();
})().catch(async (e) => { console.error(e.message); await pg.end(); process.exit(1); });
