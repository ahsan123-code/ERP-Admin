
import { Fragment } from 'react';
import { FileDown, Eye, X, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { formatCurrency } from '../../utils/format';
import { downloadWordDoc, esc, companyHeader, documentFooter } from '../../utils/wordExport';
import { useWordPreview } from '../../hooks/useWordPreview';
import styles from './SalarySheetModal.module.css';

const COMPANY = { name: 'Allied Steel Center', address: 'Lahore, Punjab, Pakistan' };

// Employees with no section on their payroll row are the admin staff.
const NO_SECTION = 'Admins';

const sumTotals = (rows) => rows.reduce((a, r) => ({
  gross_salary:    a.gross_salary    + (r.gross_salary    || 0),
  unpaid_leave_amount: a.unpaid_leave_amount + (r.unpaid_leave_amount || 0),
  advance_salary:  a.advance_salary  + (r.advance_salary  || 0),
  overtime_amount: a.overtime_amount + (r.overtime_amount || 0),
  late_amount:     a.late_amount     + (r.late_amount     || 0),
  loan_deduction:  a.loan_deduction  + (r.loan_deduction  || 0),
  total_deductions:a.total_deductions+ (r.total_deductions|| 0),
  net_salary:      a.net_salary      + (r.net_salary      || 0),
}), { gross_salary: 0, unpaid_leave_amount: 0, advance_salary: 0, overtime_amount: 0, late_amount: 0, loan_deduction: 0, total_deductions: 0, net_salary: 0 });

/** Groups payroll rows by section, first-appearance order, sectionless staff last. */
const groupBySection = (rows) => {
  const groups = new Map();
  rows.forEach((r) => {
    const key = (r.section || '').trim() || NO_SECTION;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const admins = groups.get(NO_SECTION);
  if (admins) { groups.delete(NO_SECTION); groups.set(NO_SECTION, admins); }
  return groups;
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

  const getDesig      = (empId) => employees.find(e => e.employee_id === empId)?.designation ?? '—';
  const getActiveLoan = (empId) => loans.find(l => l.employee_id === empId && l.status === 'active') ?? null;

  const totals = sumTotals(records);

  // [section, rows] pairs — shared by the xlsx tabs, the Word doc and the
  // on-screen sheet so all three break at exactly the same places.
  const sections = [...groupBySection(records)];

  /* ─────────────────────────────────────────── XLSX export */
  /**
   * One salary-sheet worksheet: title, header, a numbered row per employee
   * (Sr. restarts on every tab) and a TOTAL row for just those rows.
   */
  const buildSalarySheet = (rows, title) => {
    const aoa = [
      [title],
      ['Sr.', 'Name', 'Section', 'Designation', 'Gross Salary', 'Salary/Day',
       'Unpaid Leave Days', 'Leave Amt', 'OT Hrs', 'OT Rate', 'Total OT',
       'Late Hrs', 'Late Rate', 'Late Amt',
       'Advance Salary', 'Granted Loan', 'Prev. Loan', 'Loan Deduction', 'Rem. Loan',
       'Total Deductions', 'Net Salary', 'Signatures'],
    ];

    rows.forEach((r, i) => {
      const loan      = getActiveLoan(r.employee_id);
      const prevLoan  = loan ? loan.remaining_balance + loan.monthly_deduction : 0;
      const remLoan   = loan ? loan.remaining_balance : 0;
      const grantedLoan = loan ? loan.loan_amount : 0;

      aoa.push([
        i + 1,
        r.employee_name,
        r.section || NO_SECTION,
        getDesig(r.employee_id),
        r.gross_salary,
        +(r.gross_salary / 30).toFixed(2),
        r.unpaid_leave_days || 0,
        r.unpaid_leave_amount || 0,
        r.overtime_hours || 0,
        r.overtime_rate || 0,
        r.overtime_amount || 0,
        r.late_hours || 0,
        r.late_rate || 0,
        r.late_amount || 0,
        r.advance_salary || 0,
        grantedLoan,
        prevLoan,
        r.loan_deduction || 0,
        remLoan,
        r.total_deductions || 0,
        r.net_salary,
        '',
      ]);
    });

    const t = sumTotals(rows);
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
      buildSalarySheet(records, `SALARY SHEET FOR THE MONTH OF ${period}`),
      sheetName(`All Sections ${month} ${year}`, usedNames),
    );

    sections.forEach(([section, rows]) => {
      XLSX.utils.book_append_sheet(
        wb,
        buildSalarySheet(rows, `SALARY SHEET FOR THE MONTH OF ${period} — ${section.toUpperCase()}`),
        sheetName(section, usedNames),
      );
    });

    /* Salary slips sheet */
    const slipRows = [[`SALARY SLIPS — ${month.toUpperCase()}-${year}`], []];
    records.forEach((r) => {
      const loan    = getActiveLoan(r.employee_id);
      const remLoan = loan ? loan.remaining_balance : 0;
      slipRows.push([r.employee_name, '', '', getDesig(r.employee_id)]);
      slipRows.push([`${month} ${year}`]);
      slipRows.push(['', 'Rate', 'Total Days', 'Amount']);
      slipRows.push(['Gross Salary', +(r.gross_salary / 30).toFixed(2), 30, r.gross_salary]);
      slipRows.push(['Unpaid Leave Deduction', '', r.unpaid_leave_days || 0, r.unpaid_leave_amount || 0]);
      slipRows.push(['Net Salary', '', '', (r.gross_salary - (r.unpaid_leave_amount || 0))]);
      slipRows.push(['Advance', '', '', r.advance_salary || 0]);
      slipRows.push(['Loan Deduction', '', '', r.loan_deduction || 0]);
      slipRows.push(['Overtime', r.overtime_rate || 0, r.overtime_hours || 0, r.overtime_amount || 0]);
      slipRows.push(['Late Deduction', r.late_rate || 0, r.late_hours || 0, r.late_amount || 0]);
      slipRows.push(['Salary Payable', '', '', r.net_salary]);
      slipRows.push(['Remaining Loan', '', '', remLoan]);
      slipRows.push([]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(slipRows);
    XLSX.utils.book_append_sheet(wb, ws2, sheetName(`Slip ${month}`, usedNames));

    /* Loan summary sheet */
    const activeLoans = loans.filter(l => l.status === 'active');
    const loanRows = [
      [`LOAN SUMMARY — ${month.toUpperCase()}-${year}`], [],
      ['SR#', 'Name', 'Loan Amount', 'Monthly Deduction', 'Remaining Balance'],
      ...activeLoans.map((l, i) => [i + 1, l.employee_name, l.loan_amount, l.monthly_deduction, l.remaining_balance]),
      ['', 'TOTAL',
        activeLoans.reduce((s, l) => s + (l.loan_amount || 0), 0),
        activeLoans.reduce((s, l) => s + (l.monthly_deduction || 0), 0),
        activeLoans.reduce((s, l) => s + (l.remaining_balance || 0), 0),
      ],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(loanRows);
    XLSX.utils.book_append_sheet(wb, ws3, sheetName('Loan Summary', usedNames));

    const filename = `Salary Sheet ${month} ${year}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.download(filename);
  };

  /* ─────────────────────────────────────────── Word */
  // Rebuilt from `records`/`totals` rather than scraped from the DOM: the on-screen
  // signature row uses flexbox, which Word would collapse into a single column.
  const buildDoc = () => {
    const money = (v) => (v > 0 ? formatCurrency(v) : '—');

    const dataRow = (r, i) => `
      <tr>
        <td class="w-center">${i + 1}</td>
        <td class="lft">${esc(r.employee_name)}</td>
        <td class="lft">${esc(r.section || NO_SECTION)}</td>
        <td class="lft">${esc(getDesig(r.employee_id))}</td>
        <td>${formatCurrency(r.gross_salary)}</td>
        <td>${money(r.unpaid_leave_amount)}</td>
        <td>${money(r.overtime_amount)}</td>
        <td>${money(r.late_amount)}</td>
        <td>${money(r.advance_salary)}</td>
        <td>${money(r.loan_deduction)}</td>
        <td>${formatCurrency(r.total_deductions)}</td>
        <td><strong>${formatCurrency(r.net_salary)}</strong></td>
        <td></td>
      </tr>`;

    const totalRow = (label, t, cls) => `
      <tr class="${cls}">
        <td colspan="4" class="lft">${esc(label)}</td>
        <td>${formatCurrency(t.gross_salary)}</td>
        <td>${money(t.unpaid_leave_amount)}</td>
        <td>${money(t.overtime_amount)}</td>
        <td>${money(t.late_amount)}</td>
        <td>${formatCurrency(t.advance_salary)}</td>
        <td>${formatCurrency(t.loan_deduction)}</td>
        <td>${formatCurrency(t.total_deductions)}</td>
        <td>${formatCurrency(t.net_salary)}</td>
        <td></td>
      </tr>`;

    // Mirrors the xlsx tabs: one block per section, each closing with its own
    // subtotal, then a grand total across every section at the very bottom.
    const rows = sections.map(([section, group]) => `
      <tr class="section-row">
        <td colspan="13" class="lft">${esc(section)} — ${group.length} employee${group.length === 1 ? '' : 's'}</td>
      </tr>
      ${group.map(dataRow).join('')}
      ${totalRow(`${section} Total`, sumTotals(group), 'subtotal-row')}
    `).join('');

    // With a single section its subtotal already is the grand total.
    const grandTotalRow = sections.length > 1 ? totalRow('GRAND TOTAL', totals, 'total-row') : '';

    const sigCell = (label) => `
      <td width="33%" style="padding-top:34px">
        <div style="border-top:1px solid #000;padding-top:4px;text-align:center;
                    font-size:8px;color:#444;width:150px">${label}</div>
      </td>`;

    return {
      filename: `Salary Sheet ${month} ${year}`,
      title: `Salary Sheet — ${month} ${year}`,
      landscape: true,
      css: `
        body { font-size: 9px; }
        .sheet { width: 100%; }
        .sheet th { background:#1a1a1a; color:#fff; padding:4px 5px; text-align:center;
                    border:1px solid #333; font-size:8px; }
        .sheet th.lft { text-align:left; }
        .sheet td { padding:3px 5px; border:1px solid #ddd; text-align:right; font-size:8.5px; }
        .sheet td.lft { text-align:left; }
        .sheet tr.total-row td { font-weight:700; border-top:2px solid #000; background:#f0f0f0; }
        .sheet tr.section-row td { font-weight:700; background:#e4e4e4; text-transform:uppercase;
                                   letter-spacing:0.4px; font-size:8.5px; border:1px solid #bbb; }
        .sheet tr.subtotal-row td { font-weight:700; background:#f7f7f7; }
      `,
      body: `
        ${companyHeader(COMPANY, { title: `Salary Sheet — ${month} ${year}` })}
        <table class="sheet">
          <thead>
            <tr>
              <th width="26">Sr.</th><th class="lft" width="120">Name</th>
              <th class="lft" width="80">Section</th><th class="lft" width="100">Designation</th>
              <th>Gross Salary</th><th>Leave Ded.</th><th>OT Amt</th><th>Late Ded.</th>
              <th>Advance</th><th>Loan Ded.</th><th>Total Ded.</th><th>Net Salary</th>
              <th width="60">Signature</th>
            </tr>
          </thead>
          <tbody>${rows}${grandTotalRow}</tbody>
        </table>
        <table width="100%">
          <tr>${sigCell('Prepared By')}${sigCell('Checked By')}${sigCell('Approved By')}</tr>
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

            <div className="sig-row">
              <div className="sig-col">Prepared By</div>
              <div className="sig-col">Checked By</div>
              <div className="sig-col">Approved By</div>
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
