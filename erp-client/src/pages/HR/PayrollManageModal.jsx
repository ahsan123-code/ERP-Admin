import { useState } from 'react';
import { X, Calculator } from 'lucide-react';
import Button from '../../components/ui/Button';
import { formatCurrency } from '../../utils/format';
import styles from './PayrollManageModal.module.css';

export default function PayrollManageModal({ record, onSave, onClose }) {
  const [form, setForm] = useState({
    gross_salary:        record.gross_salary    ?? 0,
    advance_salary:      record.advance_salary  ?? 0,
    overtime_hours:      record.overtime_hours  ?? 0,
    overtime_rate:       record.overtime_rate   ?? 0,
    late_hours:          record.late_hours      ?? 0,
    late_rate:           record.late_rate       ?? 0,
    loan_deduction:      record.loan_deduction  ?? 0,
    unpaid_leave_amount: record.unpaid_leave_amount ?? 0,
  });

  // Overtime adds, late time deducts — both computed as hours × rate/hour.
  const overtimeAmount = +(form.overtime_hours * form.overtime_rate).toFixed(2);
  const lateAmount     = +(form.late_hours * form.late_rate).toFixed(2);

  const totalDed = form.loan_deduction + form.unpaid_leave_amount + lateAmount;
  const netPay   = form.gross_salary + overtimeAmount - form.advance_salary - totalDed;

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: Number(e.target.value) || 0 }));

  const handleSave = () => {
    onSave({
      ...record,
      gross_salary:         form.gross_salary,
      advance_salary:       form.advance_salary,
      overtime_hours:       form.overtime_hours,
      overtime_rate:        form.overtime_rate,
      overtime_amount:      overtimeAmount,
      late_hours:           form.late_hours,
      late_rate:            form.late_rate,
      late_amount:          lateAmount,
      loan_deduction:       form.loan_deduction,
      unpaid_leave_amount:  form.unpaid_leave_amount,
      total_deductions:     totalDed,
      net_salary:           netPay,
    });
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <p className={styles.title}>Edit Payroll — {record.employee_name}</p>
            <p className={styles.sub}>{record.month} {record.year} · {record.section} · {record.employee_id}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={styles.body}>
          <div className={styles.formula}>
            Net Pay = Gross + Overtime − Advance − Loan − Leave − Late
          </div>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>Gross Salary</span>
              <input className={styles.input} type="number" value={form.gross_salary} onChange={set('gross_salary')} min={0} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Advance Salary</span>
              <input className={styles.input} type="number" value={form.advance_salary} onChange={set('advance_salary')} min={0} />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Overtime Hours</span>
              <input className={styles.input} type="number" value={form.overtime_hours} onChange={set('overtime_hours')} min={0} step="0.5" />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Overtime Rate / hr</span>
              <input className={styles.input} type="number" value={form.overtime_rate} onChange={set('overtime_rate')} min={0} />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Late Hours</span>
              <input className={styles.input} type="number" value={form.late_hours} onChange={set('late_hours')} min={0} step="0.5" />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Late Rate / hr</span>
              <input className={styles.input} type="number" value={form.late_rate} onChange={set('late_rate')} min={0} />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Loan Deduction</span>
              <input className={styles.input} type="number" value={form.loan_deduction} onChange={set('loan_deduction')} min={0} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Leave Deduction</span>
              <input className={styles.input} type="number" value={form.unpaid_leave_amount} onChange={set('unpaid_leave_amount')} min={0} />
            </label>
          </div>

          <div className={styles.breakdown}>
            <div className={styles.bRow}><span>Gross Salary</span><span className={styles.mono}>{formatCurrency(form.gross_salary)}</span></div>
            <div className={styles.bRow}><span>+ Overtime ({form.overtime_hours}h × {formatCurrency(form.overtime_rate)})</span><span className={`${styles.mono} ${styles.pos}`}>{formatCurrency(overtimeAmount)}</span></div>
            <div className={styles.bRow}><span>− Advance Salary</span><span className={`${styles.mono} ${styles.neg}`}>({formatCurrency(form.advance_salary)})</span></div>
            <div className={styles.bRow}><span>− Loan Deduction</span><span className={`${styles.mono} ${styles.neg}`}>({formatCurrency(form.loan_deduction)})</span></div>
            <div className={styles.bRow}><span>− Leave Deduction</span><span className={`${styles.mono} ${styles.neg}`}>({formatCurrency(form.unpaid_leave_amount)})</span></div>
            <div className={styles.bRow}><span>− Late ({form.late_hours}h × {formatCurrency(form.late_rate)})</span><span className={`${styles.mono} ${styles.neg}`}>({formatCurrency(lateAmount)})</span></div>
            <div className={`${styles.bRow} ${styles.netRow}`}>
              <span>Net Pay</span>
              <span className={`${styles.mono} ${netPay >= 0 ? styles.netPos : styles.neg}`}>{formatCurrency(netPay)}</span>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Calculator size={14} />} onClick={handleSave}>Save Payroll</Button>
        </div>
      </div>
    </div>
  );
}
