import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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

const AR = { code: '11-03-001-000001', name: 'Accounts Receivable', type: 'Asset', parent: '11-03-001' };
const AP = { code: '14-01-001-000001', name: 'Accounts Payable', type: 'Liability', parent: '14-01-001' };

// One row of the voucher: which party, how much, and why. The cash/bank side lives on
// the voucher header, not the line — a voucher moves money through one pocket only.
const emptyLine = () => ({ party: '', amount: '', narration: '' });

const EMPTY = { date: today, pocket: '', narration: '' };

// mode: 'cash' = cash/wallet only (PV/RV), 'bank' = bank accounts only (BPV/BRV)
export default function NewPaymentReceiptModal({ open, onClose, onSave, type = 'Receipt', mode = 'cash', bankAccounts = [], chartOfAccounts = [] }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const { customers } = useCustomers();
  const { data: vendors } = useDb(() => procurementDb.getVendors());
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [lines, setLines] = useState([emptyLine()]);

  const isReceipt = type === 'Receipt';

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setLines([emptyLine()]);
  }, [open, type]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const setLine = (i, key, value) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: value } : l));

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i) => setLines(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  // Pocket dropdown — cash/wallet for PV/RV, bank accounts for BPV/BRV
  const pocketOptions = mode === 'bank'
    ? (bankAccounts || []).map(b => ({ value: `bank:${b.account_id}`, label: `${b.bank_name} — ${b.account_no}` }))
    : CASH_POCKETS.map(p => ({ value: `cash:${p.code}`, label: p.name }));

  // Party dropdown = customers + vendors (type decides the control account: AR vs AP)
  const partyOptions = [
    ...(customers || []).map(c => ({ value: `cust:${c.id}`, label: c.name, hint: 'Customer' })),
    ...(vendors || []).map(v => ({ value: `vend:${v.id}`, label: v.name, hint: 'Vendor' })),
  ];

  const selectedPocket = pocketOptions.find(o => o.value === form.pocket);

  // Lines the user has actually filled in — a half-typed row at the bottom is ignored
  // rather than treated as an error.
  const filledLines = lines
    .map(l => ({ ...l, amountNum: parseFloat(l.amount) || 0 }))
    .filter(l => l.party && l.amountNum > 0);
  const total = filledLines.reduce((s, l) => s + l.amountNum, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.pocket) {
      toast.error(isReceipt ? 'Pick the account the money came into.' : 'Pick the account the money was paid from.');
      return;
    }
    if (!filledLines.length) {
      toast.error('Add at least one line with a party and an amount.');
      return;
    }
    // A row with an amount but no party (or vice-versa) is a mistake, not an empty row.
    const halfFilled = lines.some(l => (!!l.party) !== ((parseFloat(l.amount) || 0) > 0));
    if (halfFilled) {
      toast.error('Every line needs both a party and an amount.');
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

      if (!pocketAccount) {
        throw new Error('Could not resolve a ledger account for this entry.');
      }

      // Resolve the control accounts once (AR for customers, AP for vendors) rather than
      // per line — a voucher with ten customer lines still only needs AR looked up once.
      const needsAR = filledLines.some(l => l.party.startsWith('cust:'));
      const needsAP = filledLines.some(l => l.party.startsWith('vend:'));
      const [arAccount, apAccount] = await Promise.all([
        needsAR ? financeDb.ensureLedgerAccount({ ...AR, companyId }) : null,
        needsAP ? financeDb.ensureLedgerAccount({ ...AP, companyId }) : null,
      ]);
      if ((needsAR && !arAccount) || (needsAP && !apAccount)) {
        throw new Error('Could not resolve the receivable/payable control account.');
      }

      const parties = filledLines.map(l => ({
        controlAccount: l.party.startsWith('vend:') ? apAccount : arAccount,
        name: partyOptions.find(o => o.value === l.party).label,
        amount: l.amountNum,
        narration: l.narration.trim() || null,
      }));

      const { voucherId } = await financeDb.addPaymentReceipt({
        type,
        date: form.date,
        pocketAccount,
        parties,
        narration: form.narration.trim(),
        companyId,
      });

      toast.success(
        `${isReceipt ? 'Receipt' : 'Payment'} voucher ${voucherId} posted — ${formatCurrency(total)} across ${parties.length} ${parties.length === 1 ? 'line' : 'lines'}.`,
        isReceipt ? 'Receipt Recorded' : 'Payment Recorded',
      );
      onSave();
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  // Live double-entry preview: one leg per filled line, plus the single cash/bank leg
  // carrying their total.
  const preview = selectedPocket && filledLines.length
    ? (() => {
      const partyLegs = filledLines.map(l => ({
        name: partyOptions.find(o => o.value === l.party)?.label || '—',
        dr: isReceipt ? 0 : l.amountNum,
        cr: isReceipt ? l.amountNum : 0,
      }));
      const pocketLeg = {
        name: selectedPocket.label,
        dr: isReceipt ? total : 0,
        cr: isReceipt ? 0 : total,
      };
      return isReceipt ? [pocketLeg, ...partyLegs] : [...partyLegs, pocketLeg];
    })()
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === 'bank'
          ? (isReceipt ? 'Bank Receipt Voucher (BRV)' : 'Bank Payment Voucher (BPV)')
          : (isReceipt ? 'New Receipt Voucher (RV)' : 'New Payment Voucher (PV)')
      }
      subtitle={
        mode === 'bank'
          ? (isReceipt ? 'Record money received into a bank account' : 'Record money paid out of a bank account')
          : (isReceipt ? 'Record money received into a cash/bank account' : 'Record money paid out of a cash/bank account')
      }
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving || !filledLines.length}>
            {saving
              ? 'Posting…'
              : filledLines.length
                ? `${isReceipt ? 'Post Receipt' : 'Post Payment'} — ${formatCurrency(total)}`
                : (isReceipt ? 'Post Receipt' : 'Post Payment')}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <div />
        <div className="ff">
          <SelectField
            label={
              mode === 'bank'
                ? (isReceipt ? 'Receive Into (Bank Account) *' : 'Pay From (Bank Account) *')
                : (isReceipt ? 'Receive Into (Account) *' : 'Pay From (Account) *')
            }
            value={form.pocket}
            onChange={set('pocket')}
            required
          >
            <option value="">— Select account —</option>
            {pocketOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectField>
        </div>
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
            {isReceipt ? 'Received From' : 'Paid To'} — add a line per party
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 32px', gap: 8, padding: '0 2px 6px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <span>Party</span><span>Narration</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
            <span />
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 32px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <SearchableSelect
                placeholder="Search customer or vendor…"
                emptyText="No parties found"
                value={l.party}
                onChange={(val) => setLine(i, 'party', val)}
                options={partyOptions}
              />
              <Input placeholder="Invoice / reason" value={l.narration} onChange={e => setLine(i, 'narration', e.target.value)} />
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={l.amount} onChange={e => setLine(i, 'amount', e.target.value)} />
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 1}
                title={lines.length <= 1 ? 'A voucher needs at least one line' : 'Remove line'}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: 6, cursor: lines.length <= 1 ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--border-subtle)', background: 'transparent',
                  color: lines.length <= 1 ? 'var(--text-tertiary)' : 'var(--red, #ef4444)',
                  opacity: lines.length <= 1 ? 0.4 : 1,
                }}
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ))}

          <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addLine} style={{ marginTop: 2 }}>
            Add Line
          </Button>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 32px', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: 'var(--text-secondary)' }}>{isReceipt ? 'Total Received' : 'Total Paid'}</span>
            <span />
            <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(total)}</span>
            <span />
          </div>
        </div>

        <div className="ff">
          <Input label="Narration" value={form.narration} onChange={set('narration')} placeholder="Applies to the whole voucher — lines can have their own" />
        </div>

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
                <span style={{ color: 'var(--text-secondary)' }}>Totals (balanced)</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(total)}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
