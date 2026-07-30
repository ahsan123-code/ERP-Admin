
import { FileDown, Eye, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import { formatCurrency } from '../../utils/format';
import { downloadWordDoc, esc, labelValueTable, companyHeader, documentFooter } from '../../utils/wordExport';
import { useWordPreview } from '../../hooks/useWordPreview';
import styles from './PayslipModal.module.css';

const COMPANY = {
  name:    'Allied Steel Center',
  address: 'Main Market, Lahore, Punjab, Pakistan',
  ntn:     '9207491-5',
};

const num = (v) => Number(v) || 0;

export default function PayslipModal({ record, onClose }) {


  const { showPreview, previewNode } = useWordPreview();

  if (!record) return null;

  // The payroll_records row is snake_case; normalise (with camelCase fallbacks) so the
  // slip always renders real figures instead of blanks/NaN.
  const r = {
    employeeName:    record.employee_name    ?? record.employeeName ?? '—',
    employeeId:      record.employee_id       ?? record.employeeId   ?? '—',
    month:           record.month             ?? '',
    year:            record.year              ?? '',
    section:         record.section           ?? '',
    status:          record.status            ?? '',
    grossSalary:     num(record.gross_salary  ?? record.grossSalary),
    overtime:        num(record.overtime_amount),
    unpaidLeave:     num(record.unpaid_leave_amount),
    advance:         num(record.advance_salary),
    loanDeduction:   num(record.loan_deduction),
    totalDeductions: num(record.total_deductions ?? record.deductions),
    netSalary:       num(record.net_salary    ?? record.netPay),
  };

  // Earnings and deductions line items (only non-zero components are shown).
  const earnings = [
    ['Gross Salary', r.grossSalary],
    r.overtime > 0 ? ['Overtime', r.overtime] : null,
  ].filter(Boolean);
  const totalEarnings = earnings.reduce((s, [, v]) => s + v, 0);

  const knownDeductions = [
    r.unpaidLeave > 0   ? ['Unpaid Leave', r.unpaidLeave] : null,
    r.advance > 0       ? ['Advance Salary', r.advance] : null,
    r.loanDeduction > 0 ? ['Loan Deduction', r.loanDeduction] : null,
  ].filter(Boolean);
  const accountedDeductions = knownDeductions.reduce((s, [, v]) => s + v, 0);
  const otherDeductions = r.totalDeductions - accountedDeductions;
  const deductions = [
    ...knownDeductions,
    otherDeductions > 0.5 ? ['Other Deductions', otherDeductions] : null,
  ].filter(Boolean);

  // Zip earnings and deductions into aligned rows for the two-column table.
  const rowCount = Math.max(earnings.length, deductions.length, 1);
  const bodyRows = Array.from({ length: rowCount }, (_, i) => ({
    earnLabel: earnings[i]?.[0] ?? '',
    earnVal:   earnings[i] ? formatCurrency(earnings[i][1]) : '',
    dedLabel:  deductions[i]?.[0] ?? '',
    dedVal:    deductions[i] ? formatCurrency(deductions[i][1]) : '',
  }));

  // The on-screen slip uses flexbox/grid, which Word cannot render, so the document
  // is rebuilt here from the same `r`/`bodyRows` data using tables instead.
  const buildDoc = () => {
    const infoLeft = labelValueTable([
      ['Employee:', esc(r.employeeName)],
      ['Emp. ID:', esc(r.employeeId)],
      ['Status:', esc(r.status?.toUpperCase() || '—')],
    ]);
    const infoRight = labelValueTable([
      ['Month:', `${esc(r.month)} ${esc(r.year)}`],
      ['Section:', esc(r.section || '—')],
    ]);

    const rows = bodyRows.map(br => `
      <tr>
        <td>${esc(br.earnLabel)}</td>
        <td class="w-right w-mono">${br.earnVal}</td>
        <td>${esc(br.dedLabel)}</td>
        <td class="w-right w-mono">${br.dedVal}</td>
      </tr>`).join('');

    return {
      filename: `Payslip ${r.employeeName} ${r.month} ${r.year}`,
      title: `Payslip — ${r.employeeName} ${r.month} ${r.year}`,
      css: `
        .slip { width: 100%; font-size: 11px; margin-bottom: 14px; }
        .slip th { background: #1a1a1a; color: #fff; padding: 6px 10px; font-size: 10px;
                   text-align: left; border: 1px solid #1a1a1a; }
        .slip td { padding: 6px 10px; font-size: 11px; border: 1px solid #ddd; }
        .slip tfoot td { font-weight: 700; border-top: 2px solid #000; background: #f5f5f5; }
      `,
      body: `
        ${companyHeader(COMPANY, { title: `Salary Slip — ${r.month} ${r.year}` })}
        <table width="100%" style="margin-bottom:14px">
          <tr><td valign="top" width="50%">${infoLeft}</td><td valign="top" width="50%">${infoRight}</td></tr>
        </table>
        <table class="slip">
          <thead>
            <tr>
              <th>Earnings</th><th class="w-right" width="110">Amount</th>
              <th>Deductions</th><th class="w-right" width="110">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td>Total Earnings</td><td class="w-right w-mono">${formatCurrency(totalEarnings)}</td>
              <td>Total Deductions</td><td class="w-right w-mono">${formatCurrency(r.totalDeductions)}</td>
            </tr>
          </tfoot>
        </table>
        <table width="100%" style="background:#f5f5f5;border:1px solid #ddd">
          <tr>
            <td style="padding:10px 14px;font-weight:700;font-size:13px">Net Pay</td>
            <td align="right" style="padding:10px 14px;font-weight:700;font-size:15px;
                       font-family:'Courier New',monospace">${formatCurrency(r.netSalary)}</td>
          </tr>
        </table>
        ${documentFooter('This is a computer-generated payslip and does not require a signature.', COMPANY)}`,
    };
  };

  const handlePreview  = () => showPreview(buildDoc());
  const handleDownload = () => downloadWordDoc(buildDoc());

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Payslip — {r.employeeName}</span>
          <div className={styles.toolbarActions}>
            <Button variant="secondary" size="sm" icon={<Eye size={14} strokeWidth={1.75} />} onClick={handlePreview}>
              Preview
            </Button>
            <Button variant="primary" size="sm" icon={<FileDown size={14} strokeWidth={1.75} />} onClick={handleDownload}>
              Download Word
            </Button>
            <Button variant="ghost" size="sm" icon={<X size={14} strokeWidth={2} />} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.payslip}>
            <div className="header">
              <div className="co-name">{COMPANY.name}</div>
              <div className="co-meta">{COMPANY.address} &nbsp;|&nbsp; NTN: {COMPANY.ntn}</div>
            </div>

            <div className="title">Salary Slip — {r.month} {r.year}</div>

            <div className="info-grid">
              <div className="field"><span className="field-label">Employee:</span><span className="field-val">{r.employeeName}</span></div>
              <div className="field"><span className="field-label">Month:</span><span className="field-val">{r.month} {r.year}</span></div>
              <div className="field"><span className="field-label">Emp. ID:</span><span className="field-val">{r.employeeId}</span></div>
              <div className="field"><span className="field-label">Section:</span><span className="field-val">{r.section || '—'}</span></div>
              <div className="field"><span className="field-label">Status:</span><span className="field-val">{r.status?.toUpperCase() || '—'}</span></div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Earnings</th>
                  <th className="right">Amount</th>
                  <th>Deductions</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((br, i) => (
                  <tr key={i}>
                    <td>{br.earnLabel}</td>
                    <td className="right">{br.earnVal}</td>
                    <td>{br.dedLabel}</td>
                    <td className="right">{br.dedVal}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total Earnings</td>
                  <td className="right">{formatCurrency(totalEarnings)}</td>
                  <td>Total Deductions</td>
                  <td className="right">{formatCurrency(r.totalDeductions)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="net-pay">
              <span className="net-label">Net Pay</span>
              <span className="net-value">{formatCurrency(r.netSalary)}</span>
            </div>

            <div className="footer">
              This is a computer-generated payslip and does not require a signature.
            </div>
          </div>
        </div>
      </div>
      {previewNode}
    </div>
  );
}
