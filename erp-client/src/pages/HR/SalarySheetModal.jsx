
import { Fragment } from 'react';
import { FileDown, Eye, X, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { formatCurrency } from '../../utils/format';
import { downloadWordDoc, esc, companyHeader, documentFooter } from '../../utils/wordExport';
import { useWordPreview } from '../../hooks/useWordPreview';
import { useEmployeeSections } from '../../context/EmployeeSectionsContext';
import { isAdvance, isLoan } from '../../data/hr';
import styles from './SalarySheetModal.module.css';

const COMPANY = { name: 'Allied Steel Center', address: 'Lahore, Punjab, Pakistan' };

// Employees with no section on their payroll row are the admin staff.
const NO_SECTION = 'Admins';

// Columns in the printed sheet — Sr. through Stamp. Kept as a constant because the
// title, section and empty rows all have to span exactly this many.
const COL_COUNT = 21;

// Must match GeneratePayrollModal: the sheet prints Gross salary/day beside deductions
// derived from it, so a different divisor here would not add up on the page.
const PAY_DAYS_PER_MONTH = 30;

// Every column the sheet prints gets a total, including the rate and hour columns —
// the client's sheet totals those too (its "Rate/hour" total is the sum of the rates).
const TOTAL_FIELDS = [
  'gross_salary', 'salary_per_day', 'unpaid_leave_days', 'unpaid_leave_amount',
  'late_hours', 'late_rate', 'late_amount',
  'overtime_hours', 'overtime_rate', 'overtime_amount',
  'advance_salary', 'loan_granted', 'loan_previous', 'loan_deduction', 'loan_remaining',
  'total_deductions', 'net_salary',
];

const sumTotals = (rows) => rows.reduce((a, r) => {
  TOTAL_FIELDS.forEach(k => { a[k] += (r[k] || 0); });
  return a;
}, Object.fromEntries(TOTAL_FIELDS.map(k => [k, 0])));

/**
 * Groups payroll rows by section and lays the groups out in the order held in Settings —
 * shop, workshop, mosque, house — rather than alphabetically.
 *
 * `order` is the section names in their configured order. A section on an old payroll row
 * but no longer in Settings (renamed, or removed after its staff moved on) still has to
 * print, so anything unrecognised follows the configured ones, alphabetically among itself.
 * Sectionless staff come last under "Admins" whatever the ordering says.
 */
const groupBySection = (rows, order = []) => {
  const groups = new Map();
  rows.forEach((r) => {
    const key = (r.section || '').trim() || NO_SECTION;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  const rank = new Map(order.map((name, i) => [name, i]));
  const positionOf = (name) => {
    if (name === NO_SECTION) return Number.MAX_SAFE_INTEGER;
    return rank.has(name) ? rank.get(name) : order.length;
  };

  return new Map([...groups.entries()].sort(([a], [b]) => {
    const pa = positionOf(a);
    const pb = positionOf(b);
    return pa !== pb ? pa - pb : a.localeCompare(b);
  }));
};

/**
 * Excel tab names cap at 31 chars, reject [ ] : * ? / \ and must be unique —
 * so this cleans the label only; the Section column inside keeps the raw value.
 */
const sheetName = (label, used) => {
  let base = label.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Section';
  let name = base;
  let n = 2;
  while (used.has(name)) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name);
  return name;
};

// loans and employees now passed as props (fetched from Supabase in HR.jsx)
export default function SalarySheetModal({ records, employees, loans = [], month, year, onClose }) {

  const toast = useToast();
  const { showPreview, previewNode } = useWordPreview();
  // The running order set in Settings, which the section blocks and xlsx tabs follow.
  const { names: sectionOrder } = useEmployeeSections();

  const getDesig      = (empId) => employees.find(e => e.employee_id === empId)?.designation ?? '—';
  // Only proper loans — an advance lives in the same table but prints in the sheet's own
  // Advance Salary column, so letting one through here would repeat it in the Loan block.
  const getActiveLoan = (empId) =>
    loans.find(l => l.employee_id === empId && l.status === 'active' && isLoan(l)) ?? null;

  // Each payroll row plus the figures the sheet prints but reads from elsewhere: the
  // per-day rate, and the four loan columns. Derived once here so the xlsx, the Word doc
  // and the totals all read the same numbers off the same object.
  //
  // The loan figures come from the payroll row itself wherever it has them. Payroll
  // generation snapshots the balances as they stood that month, and the loans table only
  // knows today's — so reprinting an old sheet off the live table would show the balance
  // months of installments later, not the one the employee signed for. Rows generated
  // before those columns were filled fall back to the live loan, which is still better
  // than printing nothing.
  const rows = records.map((r) => {
    const stored = {
      granted:   Number(r.loan_granted)   || 0,
      previous:  Number(r.previous_loan)  || 0,
      remaining: Number(r.remaining_loan) || 0,
    };
    const hasSnapshot = stored.granted > 0 || stored.previous > 0 || stored.remaining > 0;
    const loan = hasSnapshot ? null : getActiveLoan(r.employee_id);
    return {
      ...r,
      designation:    getDesig(r.employee_id),
      salary_per_day: (r.gross_salary || 0) / PAY_DAYS_PER_MONTH,
      has_loan:       hasSnapshot || !!loan || (Number(r.loan_deduction) || 0) > 0,
      loan_granted:   hasSnapshot ? stored.granted   : (loan ? (loan.loan_amount       || 0) : 0),
      loan_previous:  hasSnapshot ? stored.previous  : (loan ? (loan.remaining_balance || 0) + (loan.monthly_deduction || 0) : 0),
      loan_remaining: hasSnapshot ? stored.remaining : (loan ? (loan.remaining_balance || 0) : 0),
    };
  });

  const totals = sumTotals(rows);

  // [section, rows] pairs — shared by the xlsx tabs, the Word doc and the on-screen sheet
  // so all three break, and order, at exactly the same places.
  const sections = [...groupBySection(rows, sectionOrder)];

  /* ─────────────────────────────────────────── XLSX export */
  /**
   * One salary-sheet worksheet: title, header, a numbered row per employee
   * (Sr. restarts on every tab) and a TOTAL row for just those rows.
   */
  const buildSalarySheet = (sheetRows, title) => {
    const aoa = [
      [title],
      ['Sr.', 'Name', 'Section', 'Designation', 'Gross Salary', 'Salary/Day',
       'Unpaid Leave Days', 'Leave Amt', 'OT Hrs', 'OT Rate', 'Total OT',
       'Late Hrs', 'Late Rate', 'Late Amt',
       'Advance Salary', 'Granted Loan', 'Prev. Loan', 'Loan Deduction', 'Rem. Loan',
       'Total Deductions', 'Net Salary', 'Signatures'],
    ];

    sheetRows.forEach((r, i) => {
      aoa.push([
        i + 1,
        r.employee_name,
        r.section || NO_SECTION,
        r.designation,
        r.gross_salary,
        +r.salary_per_day.toFixed(2),
        r.unpaid_leave_days || 0,
        r.unpaid_leave_amount || 0,
        r.overtime_hours || 0,
        r.overtime_rate || 0,
        r.overtime_amount || 0,
        r.late_hours || 0,
        r.late_rate || 0,
        r.late_amount || 0,
        r.advance_salary || 0,
        r.loan_granted,
        r.loan_previous,
        r.loan_deduction || 0,
        r.loan_remaining,
        r.total_deductions || 0,
        r.net_salary,
        '',
      ]);
    });

    const t = sumTotals(sheetRows);
    aoa.push([
      '', 'TOTAL', '', '',
      t.gross_salary, '', '', '', '', '', t.overtime_amount,
      '', '', t.late_amount,
      t.advance_salary,
      '', '', t.loan_deduction, '',
      t.total_deductions,
      t.net_salary, '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 21 } }];
    return ws;
  };

  const handleExportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const usedNames = new Set();
    const period = `${month.toUpperCase()}-${year}`;

    /* Combined sheet first, then one tab per section */
    XLSX.utils.book_append_sheet(
      wb,
      buildSalarySheet(rows, `SALARY SHEET FOR THE MONTH OF ${period}`),
      sheetName(`All Sections ${month} ${year}`, usedNames),
    );

    sections.forEach(([section, group]) => {
      XLSX.utils.book_append_sheet(
        wb,
        buildSalarySheet(group, `SALARY SHEET FOR THE MONTH OF ${period} — ${section.toUpperCase()}`),
        sheetName(section, usedNames),
      );
    });

    /* Salary slips sheet */
    const slipRows = [[`SALARY SLIPS — ${month.toUpperCase()}-${year}`], []];
    rows.forEach((r) => {
      slipRows.push([r.employee_name, '', '', r.designation]);
      slipRows.push([`${month} ${year}`]);
      slipRows.push(['', 'Rate', 'Total Days', 'Amount']);
      slipRows.push(['Gross Salary', +r.salary_per_day.toFixed(2), 30, r.gross_salary]);
      slipRows.push(['Unpaid Leave Deduction', '', r.unpaid_leave_days || 0, r.unpaid_leave_amount || 0]);
      slipRows.push(['Net Salary', '', '', (r.gross_salary - (r.unpaid_leave_amount || 0))]);
      slipRows.push(['Advance', '', '', r.advance_salary || 0]);
      slipRows.push(['Loan Deduction', '', '', r.loan_deduction || 0]);
      slipRows.push(['Overtime', r.overtime_rate || 0, r.overtime_hours || 0, r.overtime_amount || 0]);
      slipRows.push(['Late Deduction', r.late_rate || 0, r.late_hours || 0, r.late_amount || 0]);
      slipRows.push(['Salary Payable', '', '', r.net_salary]);
      slipRows.push(['Remaining Loan', '', '', r.loan_remaining]);
      slipRows.push([]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(slipRows);
    XLSX.utils.book_append_sheet(wb, ws2, sheetName(`Slip ${month}`, usedNames));

    /* Loan summary sheet — loans and advances listed under their own headings, since
       they recover on different terms and the sheet's Loan block only covers the first. */
    const active   = loans.filter(l => l.status === 'active');
    const block = (heading, rows, amountLabel, perMonthLabel) => [
      [heading], [],
      ['SR#', 'Name', amountLabel, perMonthLabel, 'Remaining Balance'],
      ...(rows.length
        ? rows.map((l, i) => [i + 1, l.employee_name, l.loan_amount, l.monthly_deduction, l.remaining_balance])
        : [['', 'None outstanding', '', '', '']]),
      ['', 'TOTAL',
        rows.reduce((s, l) => s + (Number(l.loan_amount) || 0), 0),
        rows.reduce((s, l) => s + (Number(l.monthly_deduction) || 0), 0),
        rows.reduce((s, l) => s + (Number(l.remaining_balance) || 0), 0),
      ],
    ];
    const loanRows = [
      ...block(`LOAN SUMMARY — ${month.toUpperCase()}-${year}`, active.filter(isLoan), 'Loan Amount', 'Monthly Deduction'),
      [], [],
      ...block(`ADVANCE SUMMARY — ${month.toUpperCase()}-${year}`, active.filter(isAdvance), 'Advance Amount', 'Recovery / Month'),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(loanRows);
    XLSX.utils.book_append_sheet(wb, ws3, sheetName('Loan Summary', usedNames));

    const filename = `Salary Sheet ${month} ${year}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.download(filename);
  };

  /* ─────────────────────────────────────────── Word */
  // The client's own salary sheet, column for column: a two-tier header that groups
  // Late Hours / Over time / Loan over their sub-columns, then Signatures and Stamp
  // left blank to be filled in by hand. Rebuilt from `rows`/`totals` rather than
  // scraped from the DOM — the on-screen sheet is a different, narrower layout, and
  // its signature row uses flexbox, which Word collapses into a single column.
  const buildDoc = () => {
    // The client's sheet carries no currency prefix and no decimals on money, shows a
    // dash where a money column is zero, and leaves hour columns blank at zero.
    const amt  = (v) => (v > 0 ? Math.round(v).toLocaleString('en-PK') : '-');
    const qty  = (v) => (v > 0 ? Number(v).toLocaleString('en-PK', { maximumFractionDigits: 2 }) : '');
    // Totals of the rate columns keep their fraction — the client's sheet totals
    // rates unrounded (its overtime rate total reads 577.78, not 578).
    const rate = (v) => (v > 0 ? Number(v).toLocaleString('en-PK', { maximumFractionDigits: 2 }) : '-');
    // Money the employee has taken or still owes prints red on the client's sheet.
    const owed = (v) => (v > 0 ? `<span class="owed">${Math.round(v).toLocaleString('en-PK')}</span>` : '-');

    const dataRow = (r, i) => `
      <tr>
        <td class="sr">${i + 1}</td>
        <td class="name">${esc(r.employee_name)}</td>
        <td>${amt(r.gross_salary)}</td>
        <td>${amt(r.salary_per_day)}</td>
        <td class="ctr">${qty(r.unpaid_leave_days)}</td>
        <td>${amt(r.unpaid_leave_amount)}</td>
        <td class="ctr">${qty(r.late_hours)}</td>
        <td>${amt(r.late_rate)}</td>
        <td>${amt(r.late_amount)}</td>
        <td class="ctr">${qty(r.overtime_hours)}</td>
        <td>${amt(r.overtime_rate)}</td>
        <td>${amt(r.overtime_amount)}</td>
        <td>${owed(r.advance_salary)}</td>
        ${r.has_loan ? `
        <td>${amt(r.loan_granted)}</td>
        <td>${owed(r.loan_previous)}</td>
        <td>${amt(r.loan_deduction)}</td>
        <td>${owed(r.loan_remaining)}</td>` : '<td></td><td></td><td></td><td></td>'}
        <td>${amt(r.total_deductions)}</td>
        <td>${amt(r.net_salary)}</td>
        <td class="sign"></td>
        <td class="sign"></td>
      </tr>`;

    const totalRow = (label, t, cls) => `
      <tr class="${cls}">
        <td></td>
        <td class="name">${esc(label)}</td>
        <td>${amt(t.gross_salary)}</td>
        <td>${amt(t.salary_per_day)}</td>
        <td class="ctr">${qty(t.unpaid_leave_days)}</td>
        <td>${amt(t.unpaid_leave_amount)}</td>
        <td class="ctr">${qty(t.late_hours)}</td>
        <td>${rate(t.late_rate)}</td>
        <td>${amt(t.late_amount)}</td>
        <td class="ctr">${qty(t.overtime_hours)}</td>
        <td>${rate(t.overtime_rate)}</td>
        <td>${amt(t.overtime_amount)}</td>
        <td>${amt(t.advance_salary)}</td>
        <td>${amt(t.loan_granted)}</td>
        <td>${amt(t.loan_previous)}</td>
        <td>${amt(t.loan_deduction)}</td>
        <td>${amt(t.loan_remaining)}</td>
        <td>${amt(t.total_deductions)}</td>
        <td>${amt(t.net_salary)}</td>
        <td class="sign"></td>
        <td class="sign"></td>
      </tr>`;

    // Mirrors the xlsx tabs: one block per section, each closing with its own
    // subtotal, then a grand total across every section at the very bottom.
    const sectionBlocks = sections.map(([section, group]) => `
      <tr class="section-row">
        <td colspan="${COL_COUNT}">${esc(section)} — ${group.length} employee${group.length === 1 ? '' : 's'}</td>
      </tr>
      ${group.map(dataRow).join('')}
      ${totalRow(`${section} Total`, sumTotals(group), 'subtotal-row')}
    `).join('');

    // With a single section its subtotal already is the grand total.
    const grandTotalRow = sections.length > 1 ? totalRow('Total', totals, 'total-row') : '';

    // Two signatories, one at each margin. The title sits above its own signing space,
    // closed by the rule. Built as a nested table with the align attribute rather than a
    // floated or auto-margined div, because Word honours neither.
    const sigCell = (label, align) => `
      <td width="50%" style="padding-top:26px">
        <table width="210" align="${align}" style="border-collapse:collapse">
          <tr><td style="font-size:10px;font-weight:700;color:#000;padding-bottom:30px">${label}</td></tr>
          <tr><td style="border-top:1px solid #000;height:1px;font-size:1px">&nbsp;</td></tr>
        </table>
      </td>`;

    return {
      filename: `Salary Sheet ${month} ${year}`,
      title: `Salary Sheet — ${month} ${year}`,
      landscape: true,
      // 11px is the ceiling for the cells. Measured at the real printable width — 1032px,
      // an A4 landscape less the 1.2cm margins, not the wider preview frame — every data
      // row still sits on one line at 11px; at 11.5px the longest names start breaking in
      // two and the rows go ragged. Horizontal padding is down to 2px to buy the room,
      // which is where the extra 21 columns' worth of space comes from.
      css: `
        body { font-size: 11px; }
        .sheet { width: 100%; }
        .sheet th, .sheet td { border: 1px solid #000; }
        .sheet th { background:#fff; color:#000; font-weight:700; text-align:center;
                    font-size:9.5px; padding:4px 2px; }
        .sheet td { padding:5px 2px; text-align:right; font-size:11px; }
        .sheet td.sr   { text-align:center; font-weight:700; }
        .sheet td.ctr  { text-align:center; }
        .sheet td.name { text-align:left; font-style:italic; }
        .sheet td.sign { width:44px; }
        .sheet .owed { color:#c00000; }
        .sheet tr.title-row td { font-size:18px; font-weight:700; text-align:center;
                                 padding:7px 4px; letter-spacing:0.5px; }
        .sheet tr.section-row td { font-size:11.5px; font-weight:700; text-align:left;
                                   background:#e4e4e4; text-transform:uppercase;
                                   letter-spacing:0.4px; padding:5px 5px; }
        .sheet tr.subtotal-row td { font-weight:700; background:#f7f7f7; }
        .sheet tr.total-row td { font-weight:700; background:#f0f0f0; border-top:2px solid #000; }
      `,
      body: `
        ${companyHeader(COMPANY)}
        <table class="sheet">
          <thead>
            <tr class="title-row">
              <td colspan="${COL_COUNT}">SALARY SHEET FOR THE MONTH OF ${esc(month.toUpperCase())}-${year}</td>
            </tr>
            <tr>
              <th rowspan="2" width="24">Sr.</th>
              <th rowspan="2" width="130">Name</th>
              <th rowspan="2" width="52">Gross<br>salary</th>
              <th rowspan="2" width="48">Gross<br>salary/ day</th>
              <th rowspan="2" width="40">Unpaid<br>Leaves<br>Days</th>
              <th rowspan="2" width="50">Unpaid<br>Leaves<br>Amount</th>
              <th colspan="3">Late Hours</th>
              <th colspan="3">Over time</th>
              <th rowspan="2" width="50">Advance<br>Salary</th>
              <th colspan="4">Loan</th>
              <th rowspan="2" width="54">Total<br>Deductions</th>
              <th rowspan="2" width="50">Net Salary</th>
              <th rowspan="2" width="44">Signatures</th>
              <th rowspan="2" width="44">Stamp</th>
            </tr>
            <tr>
              <th width="38"><em>total Hours</em></th>
              <th width="38"><em>Rate/ hour</em></th>
              <th width="40"><em>total amount</em></th>
              <th width="34"><em>total Hours</em></th>
              <th width="38"><em>Rate/ hour</em></th>
              <th width="40"><em>total overtime</em></th>
              <th width="46"><em>Granted Loan</em></th>
              <th width="46"><em>Previous Loan</em></th>
              <th width="46"><em>Loan Deduction</em></th>
              <th width="46"><em>Remaining Loan</em></th>
            </tr>
          </thead>
          <tbody>${sectionBlocks}${grandTotalRow}</tbody>
        </table>
        <table width="100%">
          <tr>${sigCell('Account Manager', 'left')}${sigCell('Managing Director', 'right')}</tr>
        </table>
        ${documentFooter(null, COMPANY)}`,
    };
  };

  const handlePreview  = () => showPreview(buildDoc());
  const handleDownload = () => {
    downloadWordDoc(buildDoc());
    toast.download(`Salary Sheet ${month} ${year}.doc`);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Salary Sheet — {month} {year}</span>
          <div className={styles.toolbarActions}>
            <Button variant="primary"   size="sm" icon={<Download size={14} strokeWidth={1.75} />} onClick={handleExportXLSX}>Export .xlsx</Button>
            <Button variant="secondary" size="sm" icon={<Eye size={14} strokeWidth={1.75} />} onClick={handlePreview}>Preview</Button>
            <Button variant="secondary" size="sm" icon={<FileDown size={14} strokeWidth={1.75} />} onClick={handleDownload}>Download Word</Button>
            <Button variant="ghost"     size="sm" icon={<X        size={14} strokeWidth={2}    />} onClick={onClose}>Close</Button>
          </div>
        </div>

        <div className={styles.body}>
          <div>
            <p className="co-name">{COMPANY.name}</p>
            <p className="co-meta">{COMPANY.address}</p>
            <p className="sheet-title">Salary Sheet — {month} {year}</p>

            <table>
              <thead>
                <tr>
                  <th className="center" style={{ width: 30 }}>Sr.</th>
                  <th className="left"   style={{ width: 130 }}>Name</th>
                  <th className="left"   style={{ width: 90  }}>Section</th>
                  <th className="left"   style={{ width: 110 }}>Designation</th>
                  <th>Gross Salary</th>
                  <th>Leave Ded.</th>
                  <th>OT Amt</th>
                  <th>Late Ded.</th>
                  <th>Advance</th>
                  <th>Loan Ded.</th>
                  <th>Total Ded.</th>
                  <th>Net Salary</th>
                  <th style={{ width: 60 }}>Signature</th>
                </tr>
              </thead>
              <tbody>
                {sections.map(([section, group]) => {
                  const t = sumTotals(group);
                  return (
                    <Fragment key={section}>
                      <tr className="section-row">
                        <td colSpan={13} className="left">
                          {section} — {group.length} employee{group.length === 1 ? '' : 's'}
                        </td>
                      </tr>
                      {group.map((r, i) => (
                        <tr key={r.payroll_id}>
                          <td className="center">{i + 1}</td>
                          <td className="left">{r.employee_name}</td>
                          <td className="left">{r.section || NO_SECTION}</td>
                          <td className="left">{getDesig(r.employee_id)}</td>
                          <td>{formatCurrency(r.gross_salary)}</td>
                          <td>{r.unpaid_leave_amount > 0 ? formatCurrency(r.unpaid_leave_amount) : '—'}</td>
                          <td>{r.overtime_amount > 0 ? formatCurrency(r.overtime_amount) : '—'}</td>
                          <td>{r.late_amount > 0 ? formatCurrency(r.late_amount) : '—'}</td>
                          <td>{r.advance_salary > 0 ? formatCurrency(r.advance_salary) : '—'}</td>
                          <td>{r.loan_deduction > 0 ? formatCurrency(r.loan_deduction) : '—'}</td>
                          <td>{formatCurrency(r.total_deductions)}</td>
                          <td><strong>{formatCurrency(r.net_salary)}</strong></td>
                          <td></td>
                        </tr>
                      ))}
                      <tr className="subtotal-row">
                        <td colSpan={4} className="left">{section} Total</td>
                        <td>{formatCurrency(t.gross_salary)}</td>
                        <td>{t.unpaid_leave_amount > 0 ? formatCurrency(t.unpaid_leave_amount) : '—'}</td>
                        <td>{t.overtime_amount > 0 ? formatCurrency(t.overtime_amount) : '—'}</td>
                        <td>{t.late_amount > 0 ? formatCurrency(t.late_amount) : '—'}</td>
                        <td>{formatCurrency(t.advance_salary)}</td>
                        <td>{formatCurrency(t.loan_deduction)}</td>
                        <td>{formatCurrency(t.total_deductions)}</td>
                        <td>{formatCurrency(t.net_salary)}</td>
                        <td></td>
                      </tr>
                    </Fragment>
                  );
                })}
                {sections.length > 1 && (
                <tr className="total-row">
                  <td colSpan={4} className="left">GRAND TOTAL</td>
                  <td>{formatCurrency(totals.gross_salary)}</td>
                  <td>{totals.unpaid_leave_amount > 0 ? formatCurrency(totals.unpaid_leave_amount) : '—'}</td>
                  <td>{totals.overtime_amount > 0 ? formatCurrency(totals.overtime_amount) : '—'}</td>
                  <td>{totals.late_amount > 0 ? formatCurrency(totals.late_amount) : '—'}</td>
                  <td>{formatCurrency(totals.advance_salary)}</td>
                  <td>{formatCurrency(totals.loan_deduction)}</td>
                  <td>{formatCurrency(totals.total_deductions)}</td>
                  <td>{formatCurrency(totals.net_salary)}</td>
                  <td></td>
                </tr>
                )}
              </tbody>
            </table>

            {/* Kept in step with the printed document above, which carries the same two. */}
            <div className="sig-row">
              <div className="sig-col">Account Manager</div>
              <div className="sig-col">Managing Director</div>
            </div>
            <p className="footer">
              {COMPANY.name} &nbsp;·&nbsp; Generated: {new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}
            </p>
          </div>
        </div>
      </div>
      {previewNode}
    </div>
  );
}
