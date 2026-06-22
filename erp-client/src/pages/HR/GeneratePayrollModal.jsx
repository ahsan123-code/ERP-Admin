import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';
import { formatCurrency } from '../../utils/format';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function GeneratePayrollModal({ open, onClose, onGenerated, employees = [], loans = [] }) {
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear]   = useState(now.getFullYear());
  const [saving, setSaving] = useState(false);

  const activeEmployees = (employees || []).filter(e => e.status === 'active');
  const activeLoanFor = (empId) => (loans || []).find(l => l.employee_id === empId && l.status === 'active');

  // Preview totals
  const preview = activeEmployees.map(e => {
    const loan = activeLoanFor(e.employee_id);
    const gross = Number(e.gross_salary) || 0;
    const loanDed = loan ? (Number(loan.monthly_deduction) || 0) : 0;
    const totalDed = loanDed;
    return { gross, loanDed, totalDed, net: gross - totalDed };
  });
  const totalGross = preview.reduce((s, p) => s + p.gross, 0);
  const totalNet   = preview.reduce((s, p) => s + p.net, 0);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (activeEmployees.length === 0) { toast.error('No active employees to generate payroll for.'); return; }
    setSaving(true);
    try {
      // Block duplicate generation for the same period
      const { count, error: countErr } = await hrDb.countPayrollForPeriod(month, Number(year));
      if (countErr) throw new Error(countErr.message);
      if (count > 0) {
        throw new Error(`Payroll for ${month} ${year} already exists (${count} records). Delete those first to regenerate.`);
      }

      const stamp = String(Date.now()).slice(-6);
      const records = activeEmployees.map((emp, i) => {
        const loan = activeLoanFor(emp.employee_id);
        const gross = Number(emp.gross_salary) || 0;
        const loanDed = loan ? (Number(loan.monthly_deduction) || 0) : 0;
        const remaining = loan ? (Number(loan.remaining_balance) || 0) : 0;
        const totalDed = loanDed;
        return {
          payroll_id:          `PAY-${stamp}-${String(i + 1).padStart(3, '0')}`,
          employee_id:         emp.employee_id,
          employee_name:       emp.name,
          month,
          year:                Number(year),
          section:             emp.section || null,
          gross_salary:        gross,
          unpaid_leave_days:   0,
          unpaid_leave_amount: 0,
          overtime_hours:      0,
          overtime_rate:       0,
          overtime_amount:     0,
          late_hours:          0,
          advance_salary:      0,
          loan_granted:        loan ? (Number(loan.loan_amount) || 0) : 0,
          previous_loan:       remaining + loanDed,
          loan_deduction:      loanDed,
          remaining_loan:      remaining,
          total_deductions:    totalDed,
          net_salary:          gross - totalDed,
          status:              'pending',
        };
      });

      const { error } = await hrDb.addPayrollBatch(records);
      if (error) throw new Error(error.message);

      toast.success(`Payroll generated for ${records.length} employees — ${month} ${year}.`, 'Payroll Generated');
      onGenerated(month, Number(year));
      onClose();
    } catch (err) {
      toast.error(err.message, 'Generate Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate Payroll"
      subtitle="Create payroll records for all active employees for a month"
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleGenerate} disabled={saving}>
            {saving ? 'Generating…' : `Generate (${activeEmployees.length})`}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleGenerate}>
        <SelectField label="Month *" value={month} onChange={e => setMonth(e.target.value)} required>
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </SelectField>
        <Input label="Year *" type="number" min="2000" max="2100" value={year} onChange={e => setYear(e.target.value)} required />

        <div className="ff" style={{ marginTop: 4 }}>
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Active employees</span>
              <strong>{activeEmployees.length}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total gross</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalGross)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total net (after loan deductions)</span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{formatCurrency(totalNet)}</strong>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Gross salary comes from each employee; loan installments are auto-deducted. You can fine-tune any row afterwards, then export the sheet.
          </p>
        </div>
      </form>
    </Modal>
  );
}
