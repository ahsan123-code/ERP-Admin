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

const EMPTY = { date: today, from_account_id: '', to_account_id: '', amount: '', narration: '' };

export default function NewTransferModal({ open, onClose, onSave, bankAccounts, chartOfAccounts }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => { if (!open) setForm(EMPTY); }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount) || 0;
    if (!form.from_account_id || !form.to_account_id || amount <= 0) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (form.from_account_id === form.to_account_id) {
      toast.error('From and To accounts must be different.');
      return;
    }

    const fromBank = bankAccounts.find(b => b.account_id === form.from_account_id);
    const toBank   = bankAccounts.find(b => b.account_id === form.to_account_id);
    const fromAccount = financeDb.bankCodeToAccount(chartOfAccounts, form.from_account_id);
    const toAccount   = financeDb.bankCodeToAccount(chartOfAccounts, form.to_account_id);
    if (!fromAccount || !toAccount) {
      toast.error('Selected bank account has no linked chart-of-accounts entry.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await financeDb.addInterBankTransfer({
        ibt_id:       genId('IBT'),
        date:         form.date,
        from_account: `${fromBank.bank_name} - ${fromBank.account_no}`,
        to_account:   `${toBank.bank_name} - ${toBank.account_no}`,
        from_account_id: fromBank.account_id,
        to_account_id:   toBank.account_id,
        amount,
        narration:    form.narration.trim() || null,
        status:       'completed',
      }, { fromAccount, toAccount, companyId });
      if (error) throw new Error(error.message);

      toast.success(`Transfer of ${amount.toLocaleString('en-PK')} posted.`, 'Transfer Completed');
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
      title="New Inter-Bank Transfer"
      subtitle="Move funds between two bank accounts"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Posting…' : 'Post Transfer'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <div />
        <div className="ff">
          <SelectField label="From Account *" value={form.from_account_id} onChange={set('from_account_id')} required>
            <option value="">— Select source bank account —</option>
            {bankAccounts.map(b => (
              <option key={b.account_id} value={b.account_id}>{b.account_id} — {b.bank_name} ({b.account_no})</option>
            ))}
          </SelectField>
        </div>
        <div className="ff">
          <SelectField label="To Account *" value={form.to_account_id} onChange={set('to_account_id')} required>
            <option value="">— Select destination bank account —</option>
            {bankAccounts.map(b => (
              <option key={b.account_id} value={b.account_id}>{b.account_id} — {b.bank_name} ({b.account_no})</option>
            ))}
          </SelectField>
        </div>
        <Input label="Amount (PKR) *" type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" required />
        <Input label="Narration" value={form.narration} onChange={set('narration')} placeholder="Reason for transfer" />
      </form>
    </Modal>
  );
}
