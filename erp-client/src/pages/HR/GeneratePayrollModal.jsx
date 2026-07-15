import { useState, useMemo } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { formatCurrency } from '../../utils/format';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const HOURS_PER_DAY = 8;

export default function GeneratePayrollModal({ open, onClose, onGenerated, employees = [], loans = [] }) {
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear]   = useState(now.getFullYear());
  const [saving, setSaving] = useState(false);

  const monthNo     = MONTHS.indexOf(month) + 1;
  const daysInMonth = new Date(Number(year), monthNo, 0).getDate();

  // Pull the selected month's attendance so absent days, late hours and overtime
  // flow into payroll automatically instead of being typed in by hand.
  const { data: monthAtt } = useDb(
    () => hrDb.getMonthlyAttendance(Number(year), monthNo),
    [year, monthNo]
  );
  const attByEmp = useMemo(() => {
    const m = {};
    (monthAtt || []).forEach(a => { (m[a.employee_id] ||= []).push(a); });
    return m;
  }, [monthAtt]);

  const activeEmployees = (employees || []).filter(e => e.status === 'active');
  const activeLoanFor = (empId) => (loans || []).find(l => l.employee_id === empId && l.status === 'active');

  // Everything derived for one employee for the selected month.
  const calcFor = (emp) => {
    const gross  = Number(emp.gross_salary) || 0;
    const rows   = attByEmp[emp.employee_id] || [];
    const absentDays = rows.filter(a => a.status === 'absent').length;
    const lateHours  = rows.reduce((s, a) => s + (Number(a.late_hours) || 0), 0);
    const otHours    = rows.reduce((s, a) => s + (Number(a.overtime_hours) || 0), 0);
    const perDay = daysInMonth > 0 ? gross / daysInMonth : 0;
    const hourly = perDay / HOURS_PER_DAY;
    const unpaidAmount = Math.round(perDay * absentDays);
    const lateAmount   = Math.round(hourly * lateHours);
    const otRate       = +hourly.toFixed(2);
    const otAmount     = Math.round(otRate * otHours);
    const loan    = activeLoanFor(emp.employee_id);
    const loanDed = loan ? (Number(loan.monthly_deduction) || 0) : 0;
    const totalDed = loanDed + unpaidAmount + lateAmount;
    const net = gross + otAmount - totalDed;
    return { gross, absentDays, lateHours, otHours, unpaidAmount, lateAmount, otRate, otAmount, loan, loanDed, totalDed, net };
  };

  // Preview totals
  const preview      = activeEmployees.map(calcFor);
  const totalGross   = preview.reduce((s, p) => s + p.gross, 0);
  const totalNet     = preview.reduce((s, p) => s + p.net, 0);
  const totalAbsent  = preview.reduce((s, p) => s + p.absentDays, 0);
  const totalOt      = preview.reduce((s, p) => s + p.otHours, 0);
  const totalDeducts = preview.reduce((s, p) => s + p.totalDed, 0);

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
        const c = calcFor(emp);
        const remaining = c.loan ? (Number(c.loan.remaining_balance) || 0) : 0;
        return {
          payroll_id:          `PAY-${stamp}-${String(i + 1).padStart(3, '0')}`,
          employee_id:         emp.employee_id,
          employee_name:       emp.name,
          month,
          year:                Number(year),
          section:             emp.section || null,
          gross_salary:        c.gross,
          unpaid_leave_days:   c.absentDays,
          unpaid_leave_amount: c.unpaidAmount,
          overtime_hours:      c.otHours,
          overtime_rate:       c.otRate,
          overtime_amount:     c.otAmount,
          late_hours:          c.lateHours,
          advance_salary:      0,
          loan_granted:        c.loan ? (Number(c.loan.loan_amount) || 0) : 0,
          previous_loan:       remaining + c.loanDed,
          loan_deduction:      c.loanDed,
          remaining_loan:      remaining,
          total_deductions:    c.totalDed,
          net_salary:          c.net,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Absent days · Overtime hrs (from attendance)</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{totalAbsent} · {totalOt}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total deductions (loan + absent + late)</span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--orange)' }}>{formatCurrency(totalDeducts)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total net payable</span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{formatCurrency(totalNet)}</strong>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Absent days, late hours and overtime are pulled from this month's attendance (per-day = gross ÷ {daysInMonth} days). Loan installments are auto-deducted. You can fine-tune any row afterwards, then export or disburse the sheet.
          </p>
        </div>
      </form>
    </Modal>
  );
}
