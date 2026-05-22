import { useRef } from 'react';
import { Printer, X, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { formatCurrency } from '../../utils/format';
import styles from './SalarySheetModal.module.css';

const COMPANY = { name: 'Allied Steel Center', address: 'Lahore, Punjab, Pakistan' };

// loans and employees now passed as props (fetched from Supabase in HR.jsx)
export default function SalarySheetModal({ records, employees, loans = [], month, year, onClose }) {
  const printRef = useRef();
  const toast = useToast();

  const getDesig      = (empId) => employees.find(e => e.employee_id === empId)?.designation ?? '—';
  const getActiveLoan = (empId) => loans.find(l => l.employee_id === empId && l.status === 'active') ?? null;

  const totals = records.reduce((a, r) => ({
    gross_salary:    a.gross_salary    + (r.gross_salary    || 0),
    advance_salary:  a.advance_salary  + (r.advance_salary  || 0),
    loan_deduction:  a.loan_deduction  + (r.loan_deduction  || 0),
    total_deductions:a.total_deductions+ (r.total_deductions|| 0),
    net_salary:      a.net_salary      + (r.net_salary      || 0),
  }), { gross_salary: 0, advance_salary: 0, loan_deduction: 0, total_deductions: 0, net_salary: 0 });

  /* ─────────────────────────────────────────── XLSX export */
  const handleExportXLSX = () => {
    const wb = XLSX.utils.book_new();

    const mainRows = [
      [`SALARY SHEET FOR THE MONTH OF ${month.toUpperCase()}-${year}`],
      ['Sr.', 'Name', 'Section', 'Designation', 'Gross Salary', 'Salary/Day',
       'Unpaid Leave Days', 'Leave Amt', 'OT Hrs', 'OT Rate', 'Total OT',
       'Advance Salary', 'Granted Loan', 'Prev. Loan', 'Loan Deduction', 'Rem. Loan',
       'Total Deductions', 'Net Salary', 'Signatures'],
    ];

    records.forEach((r, i) => {
      const loan      = getActiveLoan(r.employee_id);
      const prevLoan  = loan ? loan.remaining_balance + loan.monthly_deduction : 0;
      const remLoan   = loan ? loan.remaining_balance : 0;
      const grantedLoan = loan ? loan.loan_amount : 0;

      mainRows.push([
        i + 1,
        r.employee_name,
        r.section || '—',
        getDesig(r.employee_id),
        r.gross_salary,
        +(r.gross_salary / 30).toFixed(2),
        r.unpaid_leave_days || 0,
        r.unpaid_leave_amount || 0,
        r.overtime_hours || 0,
        r.overtime_rate || 0,
        r.overtime_amount || 0,
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

    mainRows.push([
      '', 'TOTAL', '', '',
      totals.gross_salary, '', '', '', '', '', '',
      totals.advance_salary,
      '', '', totals.loan_deduction, '',
      totals.total_deductions,
      totals.net_salary, '',
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet(mainRows);
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 18 } }];
    XLSX.utils.book_append_sheet(wb, ws1, `${month} ${year}`);

    /* Salary slips sheet */
    const slipRows = [`SALARY SLIPS — ${month.toUpperCase()}-${year}`, []];
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
      slipRows.push(['Salary Payable', '', '', r.net_salary]);
      slipRows.push(['Remaining Loan', '', '', remLoan]);
      slipRows.push([]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(slipRows);
    XLSX.utils.book_append_sheet(wb, ws2, `Slip ${month}`);

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
    XLSX.utils.book_append_sheet(wb, ws3, 'Loan Summary');

    const filename = `Salary Sheet ${month} ${year}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.download(filename);
  };

  /* ─────────────────────────────────────────── Print */
  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=1200,height=750');
    win.document.write(`
      <!DOCTYPE html><html><head>
        <title>Salary Sheet — ${month} ${year}</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: Arial, sans-serif; font-size: 9.5px; padding: 20px; color:#000; }
          .co-name { text-align:center; font-size:15px; font-weight:700; }
          .co-meta  { text-align:center; font-size:9px; color:#555; margin-top:2px; }
          .sheet-title { text-align:center; font-size:11px; font-weight:700; text-transform:uppercase;
                         letter-spacing:1px; margin:10px 0 12px; border-bottom:2px solid #000; padding-bottom:5px; }
          table { width:100%; border-collapse:collapse; }
          th { background:#1a1a1a; color:#fff; padding:4px 5px; text-align:center; border:1px solid #333; white-space:nowrap; }
          th.left { text-align:left; }
          td { padding:3px 5px; border:1px solid #ddd; text-align:right; }
          td.left { text-align:left; }
          td.center { text-align:center; }
          tr.total-row td { font-weight:700; border-top:2px solid #000; background:#f0f0f0; }
          .sig-row { display:flex; justify-content:space-between; margin-top:30px; }
          .sig-col { text-align:center; width:150px; border-top:1px solid #000; padding-top:4px; font-size:8px; color:#444; }
          .footer { text-align:center; margin-top:14px; font-size:8px; color:#999; border-top:1px solid #ddd; padding-top:6px; }
        </style>
      </head><body>${content}</body></html>
    `);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 400);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Salary Sheet — {month} {year}</span>
          <div className={styles.toolbarActions}>
            <Button variant="primary"   size="sm" icon={<Download size={14} strokeWidth={1.75} />} onClick={handleExportXLSX}>Export .xlsx</Button>
            <Button variant="secondary" size="sm" icon={<Printer  size={14} strokeWidth={1.75} />} onClick={handlePrint}>Print</Button>
            <Button variant="ghost"     size="sm" icon={<X        size={14} strokeWidth={2}    />} onClick={onClose}>Close</Button>
          </div>
        </div>

        <div className={styles.body}>
          <div ref={printRef}>
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
                  <th>Advance</th>
                  <th>Loan Ded.</th>
                  <th>Total Ded.</th>
                  <th>Net Salary</th>
                  <th style={{ width: 60 }}>Signature</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.payroll_id}>
                    <td className="center">{i + 1}</td>
                    <td className="left">{r.employee_name}</td>
                    <td className="left">{r.section || '—'}</td>
                    <td className="left">{getDesig(r.employee_id)}</td>
                    <td>{formatCurrency(r.gross_salary)}</td>
                    <td>{r.unpaid_leave_amount > 0 ? formatCurrency(r.unpaid_leave_amount) : '—'}</td>
                    <td>{r.overtime_amount > 0 ? formatCurrency(r.overtime_amount) : '—'}</td>
                    <td>{r.advance_salary > 0 ? formatCurrency(r.advance_salary) : '—'}</td>
                    <td>{r.loan_deduction > 0 ? formatCurrency(r.loan_deduction) : '—'}</td>
                    <td>{formatCurrency(r.total_deductions)}</td>
                    <td><strong>{formatCurrency(r.net_salary)}</strong></td>
                    <td></td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={4} className="left">TOTAL</td>
                  <td>{formatCurrency(totals.gross_salary)}</td>
                  <td>—</td><td>—</td>
                  <td>{formatCurrency(totals.advance_salary)}</td>
                  <td>{formatCurrency(totals.loan_deduction)}</td>
                  <td>{formatCurrency(totals.total_deductions)}</td>
                  <td>{formatCurrency(totals.net_salary)}</td>
                  <td></td>
                </tr>
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
    </div>
  );
}
