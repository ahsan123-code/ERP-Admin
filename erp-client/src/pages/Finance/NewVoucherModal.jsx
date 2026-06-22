import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/format';

const today = new Date().toISOString().split('T')[0];
const genVoucherId = () => 'VCH-' + String(Date.now()).slice(-6);

const emptyLine = () => ({ account_id: '', narration: '', debit: '', credit: '' });

export default function NewVoucherModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [voucherId, setVoucherId] = useState(genVoucherId());
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);

  const { data: chartOfAccounts } = useDb(() => financeDb.getChartOfAccounts(companyId), [companyId]);

  useEffect(() => {
    if (open) {
      setVoucherId(genVoucherId());
      setDate(today);
      setReference('');
      setLines([emptyLine(), emptyLine()]);
    }
  }, [open]);

  const acctOptions = (chartOfAccounts || []).map(a => ({
    value: a.account_id,
    label: `${a.account_code} — ${a.account_name}`,
    hint: a.account_type,
  }));

  const setLine = (i, key, value) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: value } : l));

  // Typing in debit clears credit (and vice-versa) — a line is one side only.
  const setAmount = (i, key) => (e) => {
    const value = e.target.value;
    setLines(prev => prev.map((l, idx) => idx === i
      ? { ...l, [key]: value, [key === 'debit' ? 'credit' : 'debit']: '' }
      : l));
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i) => setLines(prev => prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev);

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const filled = lines.filter(l => l.account_id && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0));
    if (filled.length < 2) {
      toast.error('A journal voucher needs at least two lines with an account and an amount.');
      return;
    }
    if (filled.some(l => (parseFloat(l.debit) || 0) > 0 && (parseFloat(l.credit) || 0) > 0)) {
      toast.error('Each line is one side only — either a debit or a credit, not both.');
      return;
    }
    if (!balanced) {
      toast.error(`Entry is not balanced. Debit ${formatCurrency(totalDebit)} ≠ Credit ${formatCurrency(totalCredit)}.`);
      return;
    }

    setSaving(true);
    try {
      const resolved = filled.map(l => {
        const account = chartOfAccounts.find(a => a.account_id === l.account_id);
        return {
          account,
          debit:  parseFloat(l.debit)  || 0,
          credit: parseFloat(l.credit) || 0,
          narration: l.narration.trim() || null,
        };
      });
      if (resolved.some(r => !r.account)) throw new Error('One of the selected accounts could not be found.');

      await financeDb.addJournalVoucher({
        date, companyId, lines: resolved, reference: reference.trim() || null,
      });

      toast.success(`Journal voucher posted (${formatCurrency(totalDebit)}).`, 'Voucher Created');
      onSave();
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
      title="New Journal Voucher"
      subtitle="Manual double-entry — add lines until Debit equals Credit"
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving || !balanced}>
            {saving ? 'Posting…' : balanced ? `Post Voucher — ${formatCurrency(totalDebit)}` : 'Not balanced'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Voucher No." value={voucherId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Date *" type="date" value={date} onChange={e => setDate(e.target.value)} required />
        <Input label="Reference" placeholder="Invoice/PO/SO No. (optional)" value={reference} onChange={e => setReference(e.target.value)} />
        <div />

        <div className="ff">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 32px', gap: 8, padding: '0 2px 6px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <span>Account</span><span>Narration</span>
            <span style={{ textAlign: 'right' }}>Debit</span>
            <span style={{ textAlign: 'right' }}>Credit</span>
            <span />
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 32px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <SearchableSelect
                placeholder="Search account…"
                emptyText="No accounts"
                value={l.account_id}
                onChange={(val) => setLine(i, 'account_id', val)}
                options={acctOptions}
              />
              <Input placeholder="Line narration" value={l.narration} onChange={e => setLine(i, 'narration', e.target.value)} />
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={l.debit} onChange={setAmount(i, 'debit')} />
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={l.credit} onChange={setAmount(i, 'credit')} />
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 2}
                title={lines.length <= 2 ? 'A voucher needs at least two lines' : 'Remove line'}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: 6, cursor: lines.length <= 2 ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--border-subtle)', background: 'transparent',
                  color: lines.length <= 2 ? 'var(--text-tertiary)' : 'var(--red, #ef4444)',
                  opacity: lines.length <= 2 ? 0.4 : 1,
                }}
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ))}

          <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addLine} style={{ marginTop: 2 }}>
            Add Line
          </Button>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 32px', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Totals</span>
            <span style={{ textAlign: 'right', color: balanced ? 'var(--green)' : 'var(--text-tertiary)' }}>
              {balanced ? 'Balanced ✓' : 'Unbalanced'}
            </span>
            <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalDebit)}</span>
            <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalCredit)}</span>
            <span />
          </div>
          {!balanced && totalDebit !== totalCredit && (
            <p style={{ fontSize: 11, color: 'var(--orange)', marginTop: 6, textAlign: 'right' }}>
              Difference: {formatCurrency(Math.abs(totalDebit - totalCredit))}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
