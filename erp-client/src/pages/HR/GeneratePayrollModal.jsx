import { useState, useMemo } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { isAdvance, isLoan, monthlyRecovery } from '../../data/hr';
import { formatCurrency } from '../../utils/format';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const HOURS_PER_DAY = 8;
// A month is 30 days for pay purposes regardless of its real length — the client's own
// salary sheet works this way (a 38,000 salary reads 1,267/day on a 31-day July), and
// the sheet prints this per-day figure next to the deductions derived from it, so the
// two have to come from the same divisor or the page does not add up on paper.
const PAY_DAYS_PER_MONTH = 30;

// Overtime is paid at 4/3 of the ordinary hourly rate, the premium the client's sheet
// applies: on 25,000 gross the late deduction runs at 104/hour (25,000 / 30 / 8) while
// overtime earns 139/hour, and the same 1.333 ratio holds on every row of theirs.
// Deductions stay at the ordinary rate — only earned overtime carries the premium.
const OVERTIME_MULTIPLIER = 4 / 3;

export default function GeneratePayrollModal({ open, onClose, onGenerated, employees = [], loans = [] }) {
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear]   = useState(now.getFullYear());
  const [saving, setSaving] = useState(false);

  const monthNo = MONTHS.indexOf(month) + 1;

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

  // Who already has a row for this period. Generation used to refuse the whole month once
  // any row existed, so an employee hired after payroll had been run could not be added
  // without deleting the month and regenerating — losing every advance typed in by hand.
  // Now only the employees still missing a row are generated.
  const { data: existing } = useDb(
    () => hrDb.getPayrollRecords(month, Number(year)),
    [month, year]
  );
  const alreadyPaid = useMemo(
    () => new Set((existing || []).map(r => r.employee_id)),
    [existing]
  );

  const activeEmployees = (employees || []).filter(e => e.status === 'active');
  const pendingEmployees = activeEmployees.filter(e => !alreadyPaid.has(e.employee_id));
  const activeLoanFor = (empId) =>
    (loans || []).find(l => l.employee_id === empId && l.status === 'active' && isLoan(l));

  // Advances are summed rather than taken one at a time the way loans are: an employee can
  // easily draw two small advances inside one month, and both are owed out of that salary.
  const activeAdvancesFor = (empId) =>
    (loans || []).filter(l => l.employee_id === empId && l.status === 'active' && isAdvance(l));

  // Everything derived for one employee for the selected month.
  const calcFor = (emp) => {
    const gross  = Number(emp.gross_salary) || 0;
    const rows   = attByEmp[emp.employee_id] || [];
    const absentDays = rows.filter(a => a.status === 'absent').length;
    const lateHours  = rows.reduce((s, a) => s + (Number(a.late_hours) || 0), 0);
    const otHours    = rows.reduce((s, a) => s + (Number(a.overtime_hours) || 0), 0);
    const perDay = gross / PAY_DAYS_PER_MONTH;
    const hourly = perDay / HOURS_PER_DAY;
    const unpaidAmount = Math.round(perDay * absentDays);
    // Stored even when the employee was never late: the salary sheet prints a
    // standing rate/hour in the Late Hours block whether or not it was applied.
    const lateRate     = +hourly.toFixed(2);
    const lateAmount   = Math.round(lateRate * lateHours);
    const otRate       = +(hourly * OVERTIME_MULTIPLIER).toFixed(2);
    const otAmount     = Math.round(otRate * otHours);
    const loan    = activeLoanFor(emp.employee_id);
    const loanDed = loan ? (Number(loan.monthly_deduction) || 0) : 0;
    // Advances outstanding on this employee come off this salary. It used to be fixed at 0
    // here and typed into each row by hand afterwards; recovering it from the advance record
    // is what makes the Loans & Advances tab feed payroll instead of only reporting it.
    const advances = activeAdvancesFor(emp.employee_id);
    const advance  = advances.reduce((s, a) => s + monthlyRecovery(a), 0);
    const totalDed = advance + loanDed + unpaidAmount + lateAmount;
    const net = gross + otAmount - totalDed;
    return { gross, absentDays, lateHours, otHours, unpaidAmount, lateRate, lateAmount, otRate, otAmount, loan, loanDed, advances, advance, totalDed, net };
  };

  // Preview totals — for the employees actually about to be written, not the whole payroll
  const preview      = pendingEmployees.map(calcFor);
  const totalGross   = preview.reduce((s, p) => s + p.gross, 0);
  const totalNet     = preview.reduce((s, p) => s + p.net, 0);
  const totalAbsent  = preview.reduce((s, p) => s + p.absentDays, 0);
  const totalOt      = preview.reduce((s, p) => s + p.otHours, 0);
  const totalDeducts = preview.reduce((s, p) => s + p.totalDed, 0);
  const totalAdvance = preview.reduce((s, p) => s + p.advance, 0);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (activeEmployees.length === 0) { toast.error('No active employees to generate payroll for.'); return; }
    setSaving(true);
    try {
      // Re-read rather than trusting the loaded list: it decides what gets written, and
      // the modal may have been sitting open while another tab generated the same period.
      const { data: current, error: readErr } = await hrDb.getPayrollRecords(month, Number(year));
      if (readErr) throw new Error(readErr.message);
      const paid = new Set((current || []).map(r => r.employee_id));
      const toGenerate = activeEmployees.filter(e => !paid.has(e.employee_id));
      if (toGenerate.length === 0) {
        throw new Error(`Every active employee already has a payroll row for ${month} ${year}. Delete a row to regenerate it.`);
      }

      const stamp = String(Date.now()).slice(-6);
      const calcs = toGenerate.map(calcFor);
      const records = toGenerate.map((emp, i) => {
        const c = calcs[i];
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
          late_rate:           c.lateRate,
          late_amount:         c.lateAmount,
          advance_salary:      c.advance,
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

      // Write the recovery back onto the advances now that the salary rows carrying it
      // exist. Without this the same advance would be deducted again every month, because
      // its balance would sit there untouched — the reason it happens here and not on
      // disburse is that generation is the step that decides the figure, and it refuses to
      // write a second row for a period it has already covered, so it cannot run twice.
      const advanceUpdates = calcs.flatMap(c =>
        (c.advances || []).map((a) => {
          const taken     = monthlyRecovery(a);
          const remaining = Math.max(0, (Number(a.remaining_balance) || 0) - taken);
          return hrDb.updateLoan(a.loan_id, {
            remaining_balance: remaining,
            paid_installments: (Number(a.paid_installments) || 0) + (taken > 0 ? 1 : 0),
            status:            remaining <= 0 ? 'completed' : 'active',
          });
        }),
      );
      const settled = await Promise.all(advanceUpdates);
      const failed  = settled.filter(r => r?.error).length;

      const skipped   = activeEmployees.length - records.length;
      const recovered = calcs.reduce((s, c) => s + c.advance, 0);
      toast.success(
        `Payroll generated for ${records.length} employee${records.length === 1 ? '' : 's'} — ${month} ${year}.` +
        (recovered > 0 ? ` ${formatCurrency(recovered)} of advances recovered.` : '') +
        (skipped > 0 ? ` ${skipped} already had a row and ${skipped === 1 ? 'was' : 'were'} left untouched.` : ''),
        'Payroll Generated',
      );
      // The payroll itself is written either way — say so rather than failing the whole run,
      // but do not let a stale advance balance pass silently, since it deducts again next month.
      if (failed > 0) {
        toast.error(
          `${failed} advance balance${failed === 1 ? '' : 's'} could not be updated. Correct ${failed === 1 ? 'it' : 'them'} on the Loans & Advances tab before generating next month.`,
          'Advance Not Recovered',
        );
      }
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
      subtitle="Create payroll records for active employees who do not have one yet"
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleGenerate} disabled={saving || pendingEmployees.length === 0}>
            {saving ? 'Generating…' : `Generate (${pendingEmployees.length})`}
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
              <span style={{ color: 'var(--text-secondary)' }}>To generate · already have a row</span>
              <strong>{pendingEmployees.length} · {activeEmployees.length - pendingEmployees.length}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total gross</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalGross)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Absent days · Overtime hrs (from attendance)</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{totalAbsent} · {totalOt}</strong>
            </div>
            {totalAdvance > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Advances recovered this run</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--orange)' }}>{formatCurrency(totalAdvance)}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total deductions (advance + loan + absent + late)</span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--orange)' }}>{formatCurrency(totalDeducts)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total net payable</span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{formatCurrency(totalNet)}</strong>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Absent days, late hours and overtime are pulled from this month's attendance (per-day = gross ÷ {PAY_DAYS_PER_MONTH} days, per-hour = per-day ÷ {HOURS_PER_DAY}). Loan installments and outstanding advances are auto-deducted, and generating writes the recovered advance off its balance — an advance that is fully recovered closes itself. Employees who already have a row for this period are skipped, so a new hire can be added without regenerating the month. You can fine-tune any row afterwards, then export or disburse the sheet.
          </p>
        </div>
      </form>
    </Modal>
  );
}
