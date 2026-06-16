import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';

const today = new Date().toISOString().split('T')[0];
const genVoucherId = () => 'VCH-' + String(Date.now()).slice(-6);

const VOUCHER_TYPES = [
  { value: 'Journal',  label: 'Journal Voucher (JV)'  },
  { value: 'Payment',  label: 'Payment Voucher (PV)'  },
  { value: 'Receipt',  label: 'Receipt Voucher (RV)'  },
  { value: 'Contra',   label: 'Contra Voucher (CV)'   },
  { value: 'BankPay',  label: 'Bank Payment (BP)'     },
  { value: 'BankRec',  label: 'Bank Receipt (BR)'     },
];

const EMPTY = { voucher_type: 'Journal', date: today, account_id: '', debit: '', credit: '', narration: '', reference: '' };

export default function NewVoucherModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [voucherId, setVoucherId] = useState(genVoucherId());
  const [form, setForm] = useState(EMPTY);

  const { data: chartOfAccounts } = useDb(() => financeDb.getChartOfAccounts(companyId), [companyId]);

  useEffect(() => {
    if (open) { setForm(EMPTY); setVoucherId(genVoucherId()); }
  }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.voucher_type || !form.account_id || (!form.debit && !form.credit) || !form.narration) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (form.debit && form.credit) {
      toast.error('A voucher line cannot have both debit and credit. Use separate lines.');
      return;
    }

    const account = chartOfAccounts.find(a => a.account_id === form.account_id);
    const debit  = parseFloat(form.debit) || 0;
    const credit = parseFloat(form.credit) || 0;
    setSaving(true);
    try {
      const { data, error } = await financeDb.addVoucher({
        voucher_id:   voucherId,
        voucher_type: form.voucher_type,
        date:         form.date,
        account_name: account?.account_name ?? '—',
        debit,
        credit,
        narration:    form.narration,
        reference:    form.reference.trim() || null,
        company_id:   companyId,
      });
      if (error) throw new Error(error.message);

      await financeDb.applyVoucherToBalances(account, debit, credit);

      toast.success(`Voucher ${voucherId} posted to general ledger.`, 'Voucher Created');
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
        <Input label="Voucher No." value={voucherId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <SelectField label="Voucher Type *" value={form.voucher_type} onChange={set('voucher_type')}>
          {VOUCHER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </SelectField>
        <div />
        <div className="ff">
          <SearchableSelect
            label="Account"
            required
            placeholder={chartOfAccounts.length > 0 ? 'Search by account name or code…' : 'No accounts found'}
            emptyText="No matching accounts"
            value={form.account_id}
            onChange={(val) => setForm(f => ({ ...f, account_id: val }))}
            options={chartOfAccounts.map(a => ({
              value: a.account_id,
              label: `${a.account_code} — ${a.account_name}`,
              hint: a.account_type,
            }))}
          />
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
