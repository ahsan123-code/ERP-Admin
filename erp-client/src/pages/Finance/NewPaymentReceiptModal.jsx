import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb, procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useCustomers } from '../../context/CustomerContext';
import { formatCurrency } from '../../utils/format';

const today = new Date().toISOString().split('T')[0];

// The fixed "pockets" the money moves through — mapped to the REAL existing cash ledger
// accounts in the chart of accounts (group 11-01-001), not invented ones.
const CASH_POCKETS = [
  { code: '11-01-001-000001', name: 'Cash in Hand' },
  { code: '11-01-001-000002', name: 'Jazz Cash (Maqsood Ahmad)' },
  { code: '11-01-001-000004', name: 'Easypaisa (Maqsood Ahmad)' },
];

const AR = { code: '11-03-001-000001', name: 'Accounts Receivable', type: 'Asset',     parent: '11-03-001' };
const AP = { code: '14-01-001-000001', name: 'Accounts Payable',    type: 'Liability', parent: '14-01-001' };

const EMPTY = { date: today, pocket: '', party: '', amount: '', narration: '' };

export default function NewPaymentReceiptModal({ open, onClose, onSave, type = 'Receipt', bankAccounts = [], chartOfAccounts = [] }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const { customers } = useCustomers();
  const { data: vendors } = useDb(() => procurementDb.getVendors());
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const isReceipt = type === 'Receipt';

  useEffect(() => { if (open) setForm(EMPTY); }, [open, type]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Pocket dropdown = the three fixed cash/wallet pockets only.
  const pocketOptions = CASH_POCKETS.map(p => ({ value: `cash:${p.code}`, label: p.name }));

  // Party dropdown = customers + vendors (type decides the control account: AR vs AP)
  const partyOptions = [
    ...(customers || []).map(c => ({ value: `cust:${c.id}`, label: c.name, hint: 'Customer' })),
    ...(vendors  || []).map(v => ({ value: `vend:${v.id}`, label: v.name, hint: 'Vendor' })),
  ];

  const selectedPocket = pocketOptions.find(o => o.value === form.pocket);
  const selectedParty  = partyOptions.find(o => o.value === form.party);
  const amountNum = parseFloat(form.amount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.pocket || !form.party || amountNum <= 0) {
      toast.error('Pick an account, a party, and an amount.');
      return;
    }
    setSaving(true);
    try {
      // Resolve the pocket ledger account (auto-create if missing)
      let pocketAccount;
      if (form.pocket.startsWith('cash:')) {
        const code = form.pocket.slice(5);
        const def = CASH_POCKETS.find(p => p.code === code);
        pocketAccount = await financeDb.ensureLedgerAccount({ code, name: def.name, type: 'Asset', parent: '11-01-001', companyId });
      } else {
        const bankId = form.pocket.slice(5);
        const bank = bankAccounts.find(b => b.account_id === bankId);
        pocketAccount = financeDb.bankCodeToAccount(chartOfAccounts, bankId) || await financeDb.ensureBankLedgerAccount(bank, companyId);
      }

      // Resolve the party control account (AR for customers, AP for vendors)
      const isVendor = form.party.startsWith('vend:');
      const ctl = isVendor ? AP : AR;
      const partyControlAccount = await financeDb.ensureLedgerAccount({ ...ctl, companyId });

      if (!pocketAccount || !partyControlAccount) {
        throw new Error('Could not resolve a ledger account for this entry.');
      }

      const { voucherId } = await financeDb.addPaymentReceipt({
        type,
        date: form.date,
        pocketAccount,
        partyControlAccount,
        partyName: selectedParty.label,
        amount: amountNum,
        narration: form.narration.trim(),
        companyId,
      });

      toast.success(`${isReceipt ? 'Receipt' : 'Payment'} voucher ${voucherId} posted.`, isReceipt ? 'Receipt Recorded' : 'Payment Recorded');
      onSave();
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  // Live double-entry preview legs
  const preview = selectedPocket && selectedParty && amountNum > 0
    ? (isReceipt
        ? [
            { name: selectedPocket.label,  dr: amountNum, cr: 0 },
            { name: selectedParty.label,   dr: 0, cr: amountNum },
          ]
        : [
            { name: selectedParty.label,   dr: amountNum, cr: 0 },
            { name: selectedPocket.label,  dr: 0, cr: amountNum },
          ])
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isReceipt ? 'New Receipt Voucher (RV)' : 'New Payment Voucher (PV)'}
      subtitle={isReceipt ? 'Record money received into a cash/bank account' : 'Record money paid out of a cash/bank account'}
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Posting…' : isReceipt ? 'Post Receipt' : 'Post Payment'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <div />
        <div className="ff">
          <SelectField
            label={isReceipt ? 'Receive Into (Account) *' : 'Pay From (Account) *'}
            value={form.pocket}
            onChange={set('pocket')}
            required
          >
            <option value="">— Select account —</option>
            {pocketOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectField>
        </div>
        <div className="ff">
          <SearchableSelect
            label={isReceipt ? 'Receive From (Party) *' : 'Pay To (Party) *'}
            placeholder="Search customer or vendor…"
            emptyText="No parties found"
            value={form.party}
            onChange={(val) => setForm(f => ({ ...f, party: val }))}
            options={partyOptions}
          />
        </div>
        <Input label="Amount (PKR) *" type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" required />
        <Input label="Narration" value={form.narration} onChange={set('narration')} placeholder="Reason / reference" />

        {preview && (
          <div className="ff" style={{ marginTop: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              Posts as (double-entry {isReceipt ? 'Receipt' : 'Payment'} voucher)
            </label>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <span>Account</span><span style={{ textAlign: 'right' }}>Debit</span><span style={{ textAlign: 'right' }}>Credit</span>
              </div>
              {preview.map((leg, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 12px', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{leg.name}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: leg.dr ? 'var(--green)' : 'var(--text-tertiary)' }}>{leg.dr ? formatCurrency(leg.dr) : '—'}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: leg.cr ? 'var(--orange)' : 'var(--text-tertiary)' }}>{leg.cr ? formatCurrency(leg.cr) : '—'}</span>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 12px', fontSize: 13, fontWeight: 700, background: 'var(--bg-tertiary)' }}>
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
