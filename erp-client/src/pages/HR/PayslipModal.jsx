import { useRef } from 'react';
import { Printer, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import { formatCurrency } from '../../utils/format';
import styles from './PayslipModal.module.css';

const COMPANY = {
  name:    'Ahsan Brothers Steel',
  address: 'Main Market, Lahore, Punjab, Pakistan',
  ntn:     '9207491-5',
};

export default function PayslipModal({ record, onClose }) {
  const printRef = useRef();

  if (!record) return null;

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=700,height=600');
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payslip — ${record.employeeName} ${record.month} ${record.year}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 30px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
            .co-name { font-size: 20px; font-weight: 700; }
            .co-meta { font-size: 11px; color: #444; margin-top: 4px; }
            .title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; text-align: center; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; font-size: 11px; }
            .field { display: flex; gap: 6px; }
            .field-label { color: #666; min-width: 90px; }
            .field-val { font-weight: 600; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            thead th { background: #1a1a1a; color: #fff; padding: 6px 10px; font-size: 11px; text-align: left; }
            thead th.right { text-align: right; }
            tbody td { padding: 6px 10px; font-size: 11px; border-bottom: 1px solid #eee; }
            tbody td.right { text-align: right; font-family: monospace; }
            .net-pay { display: flex; justify-content: space-between; align-items: center; background: #f5f5f5; padding: 10px 14px; border-radius: 4px; margin-top: 8px; }
            .net-label { font-weight: 700; font-size: 14px; }
            .net-value { font-weight: 700; font-size: 16px; font-family: monospace; }
            .footer { text-align: center; font-size: 10px; color: #666; margin-top: 24px; border-top: 1px solid #ddd; padding-top: 10px; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const grossPay = record.basicSalary + record.allowances;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Payslip — {record.employeeName}</span>
          <div className={styles.toolbarActions}>
            <Button variant="primary" size="sm" icon={<Printer size={14} strokeWidth={1.75} />} onClick={handlePrint}>
              Print
            </Button>
            <Button variant="ghost" size="sm" icon={<X size={14} strokeWidth={2} />} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className={styles.body}>
          <div ref={printRef} className={styles.payslip}>
            <div className="header">
              <div className="co-name">{COMPANY.name}</div>
              <div className="co-meta">{COMPANY.address} &nbsp;|&nbsp; NTN: {COMPANY.ntn}</div>
            </div>

            <div className="title">Salary Slip — {record.month} {record.year}</div>

            <div className="info-grid">
              <div className="field"><span className="field-label">Employee:</span><span className="field-val">{record.employeeName}</span></div>
              <div className="field"><span className="field-label">Month:</span><span className="field-val">{record.month} {record.year}</span></div>
              <div className="field"><span className="field-label">Emp. ID:</span><span className="field-val">{record.employeeId}</span></div>
              <div className="field"><span className="field-label">Status:</span><span className="field-val">{record.status?.toUpperCase()}</span></div>
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
                <tr>
                  <td>Basic Salary</td>
                  <td className="right">{formatCurrency(record.basicSalary)}</td>
                  <td>Total Deductions</td>
                  <td className="right">{formatCurrency(record.deductions)}</td>
                </tr>
                <tr>
                  <td>Allowances</td>
                  <td className="right">{formatCurrency(record.allowances)}</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td><strong>Gross Pay</strong></td>
                  <td className="right"><strong>{formatCurrency(grossPay)}</strong></td>
                  <td></td>
                  <td></td>
                </tr>
              </tbody>
            </table>

            <div className="net-pay">
              <span className="net-label">Net Pay</span>
              <span className="net-value">{formatCurrency(record.netPay)}</span>
            </div>

            <div className="footer">
              This is a computer-generated payslip and does not require a signature.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
