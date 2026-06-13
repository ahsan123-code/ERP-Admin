import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';

const today = new Date().toISOString().split('T')[0];
const genId = (prefix) => `${prefix}-` + String(Date.now()).slice(-6);

const CASH_IN_HAND_CODE = '11-01-001-000001';
const CATEGORIES = ['Office Supplies', 'Travel & Conveyance', 'Refreshments', 'Repairs & Maintenance', 'Utilities', 'Miscellaneous'];

const EMPTY = { date: today, description: '', category: CATEGORIES[0], amount: '', approved_by: '', expense_account_id: '', source_account_id: 'CASH' };

export default function NewPettyCashModal({ open, onClose, onSave, bankAccounts, chartOfAccounts }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => { if (!open) setForm(EMPTY); }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const expenseAccounts = chartOfAccounts.filter(a => a.account_code?.slice(0, 2) === '12');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount) || 0;
    if (!form.description || amount <= 0 || !form.expense_account_id) {
      toast.error('Please fill in all required fields.');
      return;
    }

    const expenseAccount = chartOfAccounts.find(a => a.account_id === form.expense_account_id);
    const sourceAccount = form.source_account_id === 'CASH'
      ? chartOfAccounts.find(a => a.account_code === CASH_IN_HAND_CODE)
      : financeDb.bankCodeToAccount(chartOfAccounts, form.source_account_id);
    if (!sourceAccount) {
      toast.error('Could not resolve the source account in Chart of Accounts.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await financeDb.addPettyCash({
        pc_id:        genId('PC'),
        date:         form.date,
        description:  form.description,
        category:     form.category,
        amount,
        approved_by:  form.approved_by.trim() || null,
        status:       'approved',
        expense_account_id: form.expense_account_id,
        source_account_id:  form.source_account_id,
      }, { sourceAccount, expenseAccount, companyId });
      if (error) throw new Error(error.message);

      toast.success(`Petty cash entry of ${amount.toLocaleString('en-PK')} recorded.`, 'Petty Cash');
      onSave(data);
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
      title="New Petty Cash Entry"
      subtitle="Record a small day-to-day expense"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Posting…' : 'Post Entry'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <SelectField label="Category *" value={form.category} onChange={set('category')} required>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </SelectField>

        <div className="ff">
          <Input label="Description *" value={form.description} onChange={set('description')} placeholder="What was this expense for?" required />
        </div>

        <div className="ff">
          <SelectField label="Expense Account *" value={form.expense_account_id} onChange={set('expense_account_id')} required>
            <option value="">— Select expense account —</option>
            {expenseAccounts.map(a => (
              <option key={a.account_id} value={a.account_id}>{a.account_code} — {a.account_name}</option>
            ))}
          </SelectField>
        </div>

        <SelectField label="Paid From *" value={form.source_account_id} onChange={set('source_account_id')} required>
          <option value="CASH">Cash In Hand</option>
          {bankAccounts.map(b => (
            <option key={b.account_id} value={b.account_id}>{b.account_id} — {b.bank_name} ({b.account_no})</option>
          ))}
        </SelectField>
        <Input label="Amount (PKR) *" type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" required />

        <Input label="Approved By" value={form.approved_by} onChange={set('approved_by')} placeholder="Name" />
      </form>
    </Modal>
  );
}
