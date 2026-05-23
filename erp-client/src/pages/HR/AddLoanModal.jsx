import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';

const today = new Date().toISOString().split('T')[0];

export default function AddLoanModal({ open, onClose, onSave, employees }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', loan_amount: '', monthly_deduction: '',
    disbursed_date: today, total_installments: '', purpose: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const selectedEmp = employees.find(e => e.employee_id === form.employee_id);

  const autoInstallments = form.loan_amount && form.monthly_deduction
    ? Math.ceil(parseFloat(form.loan_amount) / parseFloat(form.monthly_deduction))
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.loan_amount || !form.monthly_deduction || !form.disbursed_date) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    try {
      const amount = parseFloat(form.loan_amount);
      const deduction = parseFloat(form.monthly_deduction);
      const installments = form.total_installments ? parseInt(form.total_installments) : Math.ceil(amount / deduction);
      const record = {
        loan_id:            'LN-' + String(Date.now()).slice(-6),
        employee_id:        form.employee_id,
        employee_name:      selectedEmp?.name ?? '',
        loan_amount:        amount,
        monthly_deduction:  deduction,
        remaining_balance:  amount,
        disbursed_date:     form.disbursed_date,
        total_installments: installments,
        paid_installments:  0,
        purpose:            form.purpose || null,
        status:             'active',
      };
      const { data, error } = await hrDb.addLoan(record);
      if (error) throw new Error(error.message);
      toast.success(`Loan of PKR ${amount.toLocaleString()} disbursed to ${selectedEmp?.name}.`, 'Loan Added');
      onSave(data);
      setForm({ employee_id: '', loan_amount: '', monthly_deduction: '', disbursed_date: today, total_installments: '', purpose: '' });
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
      title="Add Loan"
      subtitle="Disburse a new loan or advance to an employee"
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Add Loan'}
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
        <Input label="Loan Amount (PKR) *" type="number" min="1" value={form.loan_amount} onChange={set('loan_amount')} placeholder="0" required />
        <Input label="Monthly Deduction (PKR) *" type="number" min="1" value={form.monthly_deduction} onChange={set('monthly_deduction')} placeholder="0" required />
        {autoInstallments && (
          <div className="ff" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Estimated Installments</label>
            <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
              {autoInstallments} months
            </div>
          </div>
        )}
        <Input label="Override Installments" type="number" min="1" value={form.total_installments} onChange={set('total_installments')} placeholder={autoInstallments ? `Auto: ${autoInstallments}` : 'e.g. 12'} />
        <Input label="Disbursed Date *" type="date" value={form.disbursed_date} onChange={set('disbursed_date')} required />
        <div className="ff">
          <Input label="Purpose / Notes" placeholder="e.g. Medical emergency" value={form.purpose} onChange={set('purpose')} />
        </div>
      </form>
    </Modal>
  );
}
