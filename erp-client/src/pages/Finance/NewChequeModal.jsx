import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { bankAccountOptions } from '../../utils/paymentSources';

const today = new Date().toISOString().split('T')[0];
const genId = (prefix) => `${prefix}-` + String(Date.now()).slice(-6);

const PARTY_TYPES = ['Customer', 'Vendor'];

const EMPTY = { party_name: '', party_type: 'Customer', cheque_no: '', due_date: today, amount: '', bank_account_id: '', account_id: '' };

export default function NewChequeModal({ open, onClose, onSave, bankAccounts, chartOfAccounts }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => { if (!open) setForm(EMPTY); }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setVal = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const ledgerAccounts = chartOfAccounts.filter(a => a.account_code?.slice(0, 2) === (form.party_type === 'Vendor' ? '14' : '11'));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount) || 0;
    if (!form.party_name || !form.cheque_no || amount <= 0 || !form.bank_account_id || !form.account_id) {
      toast.error('Please fill in all required fields.');
      return;
    }

    const bank = bankAccounts.find(b => b.account_id === form.bank_account_id);

    setSaving(true);
    try {
      const { data, error } = await financeDb.addCheque({
        cheque_id:  genId('CHQ'),
        party_name: form.party_name,
        party_type: form.party_type,
        cheque_no:  form.cheque_no,
        bank_name:  bank?.bank_name ?? null,
        issue_date: today,
        due_date:   form.due_date,
        amount,
        bank_account_id: form.bank_account_id,
        account_id:      form.account_id,
      });
      if (error) throw new Error(error.message);

      toast.success(`Cheque ${form.cheque_no} added as pending.`, 'Cheque Tracked');
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
      title="New Cheque"
      subtitle="Track a cheque pending clearance"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Add Cheque'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Party Name *" value={form.party_name} onChange={set('party_name')} placeholder="Customer or vendor name" required />
        <SelectField label="Party Type *" value={form.party_type} onChange={set('party_type')} required>
          {PARTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </SelectField>

        <Input label="Cheque No. *" value={form.cheque_no} onChange={set('cheque_no')} placeholder="Cheque number" required />
        <Input label="Due Date *" type="date" value={form.due_date} onChange={set('due_date')} required />

        <div className="ff">
          <SearchableSelect
            label="Bank Account"
            required
            placeholder="Search bank or account number…"
            emptyText="No bank accounts found"
            value={form.bank_account_id}
            onChange={(val) => setForm(f => ({ ...f, bank_account_id: val }))}
            options={bankAccountOptions(bankAccounts)}
          />
        </div>

        <div className="ff">
          <SearchableSelect
            label={`Ledger Account (${form.party_type}) *`}
            required
            placeholder={`Search ${form.party_type.toLowerCase()} account (${ledgerAccounts.length})…`}
            emptyText="No matching accounts"
            value={form.account_id}
            onChange={setVal('account_id')}
            options={ledgerAccounts.map(a => ({
              value: a.account_id,
              label: a.account_name,
              search: a.account_code,
            }))}
          />
        </div>

        <Input label="Amount (PKR) *" type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" required />
      </form>
    </Modal>
  );
}
