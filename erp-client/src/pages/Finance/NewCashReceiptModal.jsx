import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';

const today = new Date().toISOString().split('T')[0];
const genId = (prefix) => `${prefix}-` + String(Date.now()).slice(-6);

const MODES = ['Cash', 'Bank Transfer', 'Cheque'];
const CASH_IN_HAND_CODE = '11-01-001-000001';

const EMPTY = { date: today, party_name: '', amount: '', mode: 'Cash', bank_account_id: '', cheque_no: '', account_id: '', narration: '' };

export default function NewCashReceiptModal({ open, onClose, onSave, bankAccounts, chartOfAccounts }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => { if (!open) setForm(EMPTY); }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setVal = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const ledgerAccounts = chartOfAccounts.filter(a => a.account_code?.slice(0, 2) === '11');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount) || 0;
    if (!form.party_name || amount <= 0 || !form.account_id) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (form.mode !== 'Cash' && !form.bank_account_id) {
      toast.error('Please select the bank account that received the funds.');
      return;
    }

    const ledgerAccount = chartOfAccounts.find(a => a.account_id === form.account_id);
    let depositAccount, bankName = null;
    if (form.mode === 'Cash') {
      depositAccount = chartOfAccounts.find(a => a.account_code === CASH_IN_HAND_CODE);
    } else {
      const bank = bankAccounts.find(b => b.account_id === form.bank_account_id);
      bankName = bank?.bank_name ?? null;
      depositAccount = financeDb.bankCodeToAccount(chartOfAccounts, form.bank_account_id, bankAccounts);
    }
    if (!depositAccount) {
      toast.error('Could not resolve the deposit account in Chart of Accounts.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await financeDb.addCashReceived({
        cr_id:      genId('CR'),
        date:       form.date,
        party_name: form.party_name,
        amount,
        mode:       form.mode,
        cheque_no:  form.mode === 'Cheque' ? (form.cheque_no.trim() || null) : null,
        bank_name:  bankName,
        narration:  form.narration.trim() || null,
        status:     'completed',
        account_id: form.account_id,
        bank_account_id: form.mode !== 'Cash' ? form.bank_account_id : null,
      }, { depositAccount, ledgerAccount, companyId });
      if (error) throw new Error(error.message);

      toast.success(`Receipt of ${amount.toLocaleString('en-PK')} from ${form.party_name} recorded.`, 'Cash Received');
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
      title="New Cash Receipt"
      subtitle="Record a payment received from a customer"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Posting…' : 'Post Receipt'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <Input label="Party / Customer *" value={form.party_name} onChange={set('party_name')} placeholder="e.g. Sajid Sb Kot Lakhpat" required />

        <SelectField label="Mode *" value={form.mode} onChange={set('mode')} required>
          {MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </SelectField>
        {form.mode !== 'Cash' && (
          <SelectField label="Received Into (Bank) *" value={form.bank_account_id} onChange={set('bank_account_id')} required>
            <option value="">— Select bank account —</option>
            {bankAccounts.map(b => (
              <option key={b.account_id} value={b.account_id}>{b.bank_name} ({b.account_no})</option>
            ))}
          </SelectField>
        )}
        {form.mode === 'Cheque' && (
          <Input label="Cheque No." value={form.cheque_no} onChange={set('cheque_no')} placeholder="Cheque number" />
        )}

        <div className="ff">
          <SearchableSelect
            label="Ledger Account (being settled) *"
            required
            placeholder={`Search receivable / customer account (${ledgerAccounts.length})…`}
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
        <Input label="Narration" value={form.narration} onChange={set('narration')} placeholder="Notes" />
      </form>
    </Modal>
  );
}
