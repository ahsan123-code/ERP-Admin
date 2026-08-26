import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';
import { LOAN_TYPES } from '../../data/hr';

const today = new Date().toISOString().split('T')[0];

// A salary advance: cash handed to an employee before payday and taken back out of the
// coming salary. It shares the loans table with proper loans (type tells them apart) but
// recovers differently — in one go by default, which is why the recovery field is left
// blank to mean "the whole amount" rather than asking for an installment.
export default function AddAdvanceModal({ open, onClose, onSave, employees = [] }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', advance_amount: '', recover_per_month: '', paid_date: today, purpose: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const selectedEmp = employees.find(e => e.employee_id === form.employee_id);

  const amount    = parseFloat(form.advance_amount) || 0;
  const perMonth  = parseFloat(form.recover_per_month) || 0;
  // Blank recovery means the advance comes off the next salary whole.
  const effective = perMonth > 0 ? Math.min(perMonth, amount) : amount;
  const months    = amount > 0 && effective > 0 ? Math.ceil(amount / effective) : 0;

  // An advance bigger than the salary it comes out of leaves the employee with nothing to
  // take home, so it is worth saying before the row is written — not blocking, because a
  // recovery spread over months is exactly the answer and the admin may be about to set one.
  const gross      = Number(selectedEmp?.gross_salary) || 0;
  const overSalary = gross > 0 && effective > gross;

  const reset = () => setForm({
    employee_id: '', advance_amount: '', recover_per_month: '', paid_date: today, purpose: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.advance_amount || !form.paid_date) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (amount <= 0) {
      toast.error('Advance amount must be greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        type:               LOAN_TYPES.ADVANCE,
        loan_id:            'ADV-' + String(Date.now()).slice(-6),
        employee_id:        form.employee_id,
        employee_name:      selectedEmp?.name ?? '',
        loan_amount:        amount,
        monthly_deduction:  effective,
        remaining_balance:  amount,
        disbursed_date:     form.paid_date,
        total_installments: months,
        paid_installments:  0,
        purpose:            form.purpose || null,
        status:             'active',
      };
      const { data, error } = await hrDb.addLoan(record);
      if (error) throw new Error(error.message);
      toast.success(
        `Advance of PKR ${amount.toLocaleString()} paid to ${selectedEmp?.name}. It will be deducted from the next payroll you generate.`,
        'Advance Added',
      );
      onSave(data);
      reset();
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Advance"
      subtitle="Pay salary in advance and recover it from the coming payroll"
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Add Advance'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff">
          <SelectField label="Employee *" value={form.employee_id} onChange={set('employee_id')} required>
            <option value="">— Select employee —</option>
            {employees.map(e => (
              <option key={e.employee_id} value={e.employee_id}>{e.name} ({e.employee_id})</option>
            ))}
          </SelectField>
        </div>

        {selectedEmp && (
          <div className="ff" style={{ display: 'flex', gap: 24, fontSize: 13, background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Gross salary:{' '}
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                PKR {gross.toLocaleString()}
              </strong>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>{selectedEmp.section || 'Admins'}</span>
          </div>
        )}

        <Input label="Advance Amount (PKR) *" type="number" min="1" value={form.advance_amount} onChange={set('advance_amount')} placeholder="0" required />
        <Input label="Date Paid *" type="date" value={form.paid_date} onChange={set('paid_date')} required />

        <div className="ff">
          <Input
            label="Recover Per Month (PKR)"
            type="number"
            min="1"
            value={form.recover_per_month}
            onChange={set('recover_per_month')}
            placeholder={amount > 0 ? `Leave blank for the full ${amount.toLocaleString()} next salary` : 'Leave blank to recover it all next salary'}
          />
        </div>

        {amount > 0 && (
          <div className="ff" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Recovery Plan</label>
            <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: overSalary ? 'var(--orange)' : 'var(--primary)' }}>
              PKR {effective.toLocaleString()} × {months} {months === 1 ? 'month' : 'months'}
            </div>
            {overSalary && (
              <span style={{ fontSize: 11, color: 'var(--orange)' }}>
                That is more than this employee&apos;s gross salary — the payslip will come out negative unless you spread the recovery over more months.
              </span>
            )}
          </div>
        )}

        <div className="ff">
          <Input label="Reason / Notes" placeholder="e.g. Eid advance" value={form.purpose} onChange={set('purpose')} />
        </div>

        <p className="ff" style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
          Shows on the Loans &amp; Advances tab straight away. The next payroll you generate
          puts it in the employee&apos;s <strong>Advance Salary</strong> column and writes the
          recovered amount off the balance — the advance closes itself once nothing is left.
        </p>
      </form>
    </Modal>
  );
}
