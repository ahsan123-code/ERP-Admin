import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import MultiSearchableSelect from '../../components/ui/MultiSearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/format';

const today = new Date().toISOString().split('T')[0];
const genId = (prefix) => `${prefix}-` + String(Date.now()).slice(-6);

const CASH_IN_HAND_CODE = '11-01-001-000001';
const CATEGORIES = ['Office Supplies', 'Travel & Conveyance', 'Refreshments', 'Repairs & Maintenance', 'Utilities', 'Miscellaneous'];

const EMPTY = { date: today, description: '', category: CATEGORIES[0], approved_by: '', source_account_id: 'CASH' };

// One slip often covers several heads at once — cutting charges that are part labour and
// part consumables — and with a single account picker the only way to record that was to
// key the same description in twice. Accounts are now picked together and each carries its
// own amount; the entry's total is their sum, and the voucher debits each head separately
// against one credit to the cash or bank it was paid from.
export default function NewPettyCashModal({ open, onClose, onSave, bankAccounts, chartOfAccounts }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  // Selected account ids, in the order they were picked.
  const [accountIds, setAccountIds] = useState([]);
  // Amount per account id, kept separately so deselecting and reselecting an account
  // does not silently resurrect an amount the user had already moved on from.
  const [amounts, setAmounts] = useState({});

  useEffect(() => {
    if (!open) { setForm(EMPTY); setAccountIds([]); setAmounts({}); }
  }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const expenseAccounts = chartOfAccounts.filter(a => a.account_code?.slice(0, 2) === '12');
  const accountById = (id) => chartOfAccounts.find(a => a.account_id === id);

  const handleAccountsChange = (next) => {
    setAccountIds(next);
    // Drop the amounts of accounts that were just removed.
    setAmounts(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => next.includes(id))));
  };

  const setAmount = (id) => (e) => setAmounts(prev => ({ ...prev, [id]: e.target.value }));

  const rows = accountIds.map(id => ({
    id,
    account: accountById(id),
    raw: amounts[id] ?? '',
    amount: parseFloat(amounts[id]) || 0,
  }));

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const missingAmounts = rows.filter(r => r.amount <= 0).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) { toast.error('Description is required.'); return; }
    if (rows.length === 0)        { toast.error('Select at least one expense account.'); return; }
    if (missingAmounts > 0) {
      toast.error(`Enter an amount for every selected account — ${missingAmounts} still ${missingAmounts === 1 ? 'has' : 'have'} none.`);
      return;
    }
    const unresolved = rows.filter(r => !r.account);
    if (unresolved.length > 0) {
      toast.error('Could not resolve every selected account in the Chart of Accounts.');
      return;
    }

    const sourceAccount = form.source_account_id === 'CASH'
      ? chartOfAccounts.find(a => a.account_code === CASH_IN_HAND_CODE)
      : financeDb.bankCodeToAccount(chartOfAccounts, form.source_account_id);
    if (!sourceAccount) {
      toast.error('Could not resolve the source account in Chart of Accounts.');
      return;
    }

    setSaving(true);
    try {
      const pcId = genId('PC');
      const { data, error, lineError } = await financeDb.addPettyCash({
        pc_id:        pcId,
        date:         form.date,
        description:  form.description.trim(),
        category:     form.category,
        amount:       total,
        approved_by:  form.approved_by.trim() || null,
        status:       'approved',
        source_account_id: form.source_account_id,
      }, {
        sourceAccount,
        lines: rows.map(r => ({ account: r.account, amount: r.amount })),
        companyId,
      });
      if (error) throw new Error(error.message);

      // The entry and its voucher are already saved by this point, so a failure to write
      // the split must not discard them — report it, since the entry would otherwise show
      // the right total against only its first account.
      if (lineError) {
        toast.error(
          `Entry ${pcId} was posted, but its account split could not be saved: ${lineError.message}`,
          'Split Not Saved',
        );
      } else {
        toast.success(
          `Petty cash entry of ${formatCurrency(total)} recorded across ${rows.length} expense account${rows.length === 1 ? '' : 's'}.`,
          'Petty Cash',
        );
      }
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
            {saving ? 'Posting…' : total > 0 ? `Post Entry — ${formatCurrency(total)}` : 'Post Entry'}
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
          <MultiSearchableSelect
            label="Expense Accounts *"
            required
            placeholder={`Search expense accounts (${expenseAccounts.length})…`}
            emptyText="No matching accounts"
            values={accountIds}
            onChange={handleAccountsChange}
            options={expenseAccounts.map(a => ({
              value: a.account_id,
              label: a.account_name,
              search: a.account_code,
              hint: a.account_code,
            }))}
          />
        </div>

        <div className="ff">
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 8 }}>
            Amount Per Account <span style={{ color: 'var(--red)' }}>*</span>
          </label>

          {rows.length === 0 ? (
            <p style={{ margin: 0, padding: '12px 14px', background: 'var(--bg-tertiary)', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-muted)' }}>
              Pick one or more expense accounts above, then enter what each was charged.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(r => (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px auto', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.account?.account_name ?? 'Unknown account'}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                      {r.account?.account_code ?? r.id}
                    </div>
                  </div>
                  <Input
                    type="number" min="0.01" step="0.01"
                    value={r.raw}
                    onChange={setAmount(r.id)}
                    placeholder="0.00"
                    aria-label={`Amount for ${r.account?.account_name ?? r.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => handleAccountsChange(accountIds.filter(id => id !== r.id))}
                    title="Remove this account"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, padding: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, padding: '10px 14px', background: 'var(--blue-muted)', border: '1px solid var(--blue-dim)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Total ({rows.length} account{rows.length === 1 ? '' : 's'})
                </span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--blue)' }}>
                  {formatCurrency(total)}
                </strong>
              </div>

              {missingAmounts > 0 && (
                <span style={{ fontSize: 11, color: 'var(--orange)' }}>
                  {missingAmounts} selected account{missingAmounts === 1 ? '' : 's'} still {missingAmounts === 1 ? 'needs an amount' : 'need amounts'}.
                </span>
              )}
            </div>
          )}
        </div>

        <SelectField label="Paid From *" value={form.source_account_id} onChange={set('source_account_id')} required>
          <option value="CASH">Cash In Hand</option>
          {bankAccounts.map(b => (
            <option key={b.account_id} value={b.account_id}>{b.bank_name} ({b.account_no})</option>
          ))}
        </SelectField>

        <Input label="Approved By" value={form.approved_by} onChange={set('approved_by')} placeholder="Name" />

        <p className="ff" style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
          Posts one voucher — <strong>debit</strong> each expense account for its own amount,
          <strong> credit</strong> {form.source_account_id === 'CASH' ? 'Cash In Hand' : 'the selected bank'} for the {formatCurrency(total)} total.
          It appears in Reports → Ledger under every account it touches.
        </p>
      </form>
    </Modal>
  );
}
