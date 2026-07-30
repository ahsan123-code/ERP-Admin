import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/format';

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

  // Live preview helpers
  const fromBankSel = bankAccounts.find(b => b.account_id === form.from_account_id);
  const toBankSel   = bankAccounts.find(b => b.account_id === form.to_account_id);
  const amountNum   = parseFloat(form.amount) || 0;

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

    setSaving(true);
    try {
      // Link each bank to its ledger account; auto-create it if the seed data is missing it.
      let fromAccount = financeDb.bankCodeToAccount(chartOfAccounts, form.from_account_id);
      let toAccount   = financeDb.bankCodeToAccount(chartOfAccounts, form.to_account_id);
      if (!fromAccount) fromAccount = await financeDb.ensureBankLedgerAccount(fromBank, companyId);
      if (!toAccount)   toAccount   = await financeDb.ensureBankLedgerAccount(toBank, companyId);
      if (!fromAccount || !toAccount) {
        throw new Error('Could not link the selected bank to a ledger account (unexpected account ID format).');
      }

      const { data, error } = await financeDb.addInterBankTransfer({
        ibt_id:       genId('IBT'),
        date:         form.date,
        from_account: `${fromBank.bank_name} - ${fromBank.account_no}`,
        to_account:   `${toBank.bank_name} - ${toBank.account_no}`,
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
              <option key={b.account_id} value={b.account_id}>{b.bank_name} ({b.account_no})</option>
            ))}
          </SelectField>
        </div>
        <div className="ff">
          <SelectField label="To Account *" value={form.to_account_id} onChange={set('to_account_id')} required>
            <option value="">— Select destination bank account —</option>
            {bankAccounts.map(b => (
              <option key={b.account_id} value={b.account_id}>{b.bank_name} ({b.account_no})</option>
            ))}
          </SelectField>
        </div>
        <Input label="Amount (PKR) *" type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" required />
        <Input label="Narration" value={form.narration} onChange={set('narration')} placeholder="Reason for transfer" />

        {fromBankSel && toBankSel && amountNum > 0 && fromBankSel !== toBankSel && (
          <div className="ff" style={{ marginTop: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              Posts as (double-entry Contra voucher)
            </label>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 0, fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '8px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                <span>Bank / Account Title</span>
                <span style={{ textAlign: 'right' }}>Debit</span>
                <span style={{ textAlign: 'right' }}>Credit</span>
              </div>
              {[
                { bank: toBankSel,   dr: amountNum, cr: 0 },
                { bank: fromBankSel, dr: 0, cr: amountNum },
              ].map((leg, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 0, padding: '8px 12px', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {leg.bank.bank_name}
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 11, display: 'block' }}>
                      {leg.bank.account_title || leg.bank.account_no}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: leg.dr ? 'var(--green)' : 'var(--text-tertiary)' }}>
                    {leg.dr ? formatCurrency(leg.dr) : '—'}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: leg.cr ? 'var(--orange)' : 'var(--text-tertiary)' }}>
                    {leg.cr ? formatCurrency(leg.cr) : '—'}
                  </span>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 0, padding: '8px 12px', fontSize: 13, fontWeight: 700, background: 'var(--bg-tertiary)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Totals (balanced ✓)</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(amountNum)}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(amountNum)}</span>
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
