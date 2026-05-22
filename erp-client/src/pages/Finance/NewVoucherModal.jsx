import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { chartOfAccounts } from '../../data/finance';

const today = new Date().toISOString().split('T')[0];
const nextVch = () => 'VCH-' + String(202 + Math.floor(Math.random() * 20)).padStart(4, '0');

const VOUCHER_TYPES = [
  { value: 'Journal',  label: 'Journal Voucher (JV)'  },
  { value: 'Payment',  label: 'Payment Voucher (PV)'  },
  { value: 'Receipt',  label: 'Receipt Voucher (RV)'  },
  { value: 'Contra',   label: 'Contra Voucher (CV)'   },
  { value: 'BankPay',  label: 'Bank Payment (BP)'     },
  { value: 'BankRec',  label: 'Bank Receipt (BR)'     },
];

export default function NewVoucherModal({ open, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    voucherId: nextVch(), voucherType: 'Journal', date: today,
    accountId: '', debit: '', credit: '', narration: '', reference: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.voucherType || !form.accountId || (!form.debit && !form.credit) || !form.narration) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (form.debit && form.credit) {
      toast.error('A voucher line cannot have both debit and credit. Use separate lines.');
      return;
    }
    const account = chartOfAccounts.find(a => a.accountId === form.accountId);
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success(`Voucher ${form.voucherId} posted to general ledger.`, 'Voucher Created');
      onSave({
        voucherId: form.voucherId,
        voucherType: form.voucherType,
        date: form.date,
        accountName: account?.accountName ?? '—',
        debit: parseFloat(form.debit) || 0,
        credit: parseFloat(form.credit) || 0,
        narration: form.narration,
        reference: form.reference,
      });
      setForm({ voucherId: nextVch(), voucherType: 'Journal', date: today, accountId: '', debit: '', credit: '', narration: '', reference: '' });
      onClose();
    }, 700);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Voucher"
      subtitle="Post an accounting entry to the general ledger"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Posting…' : 'Post Voucher'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Voucher No." value={form.voucherId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <SelectField label="Voucher Type *" value={form.voucherType} onChange={set('voucherType')}>
          {VOUCHER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </SelectField>
        <div />
        <div className="ff">
          <SelectField label="Account *" value={form.accountId} onChange={set('accountId')} required>
            <option value="">— Select account —</option>
            {chartOfAccounts.map(a => (
              <option key={a.accountId} value={a.accountId}>
                {a.accountCode} — {a.accountName} ({a.accountType})
              </option>
            ))}
          </SelectField>
        </div>
        <Input label="Debit (PKR)" type="number" min="0" step="0.01" value={form.debit} onChange={set('debit')} placeholder="0.00" />
        <Input label="Credit (PKR)" type="number" min="0" step="0.01" value={form.credit} onChange={set('credit')} placeholder="0.00" />
        <Input label="Reference" placeholder="Invoice/PO/SO No." value={form.reference} onChange={set('reference')} />
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Narration *</label>
          <textarea
            value={form.narration}
            onChange={set('narration')}
            rows={3}
            placeholder="Description of the transaction..."
            required
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 14px',
              fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </form>
    </Modal>
  );
}
