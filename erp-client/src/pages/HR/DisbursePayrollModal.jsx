import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb, hrDb } from '../../lib/db';
import { formatCurrency } from '../../utils/format';

const today = new Date().toISOString().split('T')[0];
const CASH_IN_HAND_CODE = '11-01-001-000001';

// Posts one salary voucher for the month (Debit salary expense, Credit cash/bank)
// and marks the period's pending payroll rows as paid — so payroll hits the
// general ledger and shows in Account History, and reduces the cash/bank balance.
export default function DisbursePayrollModal({ open, month, year, records = [], chartOfAccounts = [], bankAccounts = [], companyId = 1, onClose, onDone }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const pending  = (records || []).filter(r => r.status !== 'paid');
  const totalNet = pending.reduce((s, r) => s + (Number(r.net_salary) || 0), 0);

  const expenseAccounts = (chartOfAccounts || []).filter(a => a.account_code?.slice(0, 2) === '12');
  const defaultSalary   = expenseAccounts.find(a => /salaries\s*(and|&)?\s*wages/i.test(a.account_name || ''));

  const [form, setForm] = useState({ date: today, expense_account_id: '', source_account_id: 'CASH' });

  useEffect(() => {
    if (open) setForm({ date: today, expense_account_id: defaultSalary?.account_id || '', source_account_id: 'CASH' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pending.length === 0) { toast.error('No pending payroll to disburse for this period.'); return; }
    if (!form.expense_account_id) { toast.error('Select the salary expense account.'); return; }

    const expenseAccount = chartOfAccounts.find(a => a.account_id === form.expense_account_id);
    const sourceAccount  = form.source_account_id === 'CASH'
      ? chartOfAccounts.find(a => a.account_code === CASH_IN_HAND_CODE)
      : financeDb.bankCodeToAccount(chartOfAccounts, form.source_account_id);
    if (!expenseAccount || !sourceAccount) {
      toast.error('Could not resolve the accounts in the Chart of Accounts.');
      return;
    }

    setSaving(true);
    try {
      const voucherId = 'SAL-' + String(Date.now()).slice(-6);
      await financeDb.postJournalEntry({
        voucherId, voucherType: 'Payment', date: form.date, companyId,
        legs: [
          { account: expenseAccount, debit: totalNet, credit: 0 },
          { account: sourceAccount,  debit: 0, credit: totalNet },
        ],
        narration: `Salary paid for ${month} ${year} (${pending.length} employees)`,
        reference: `Payroll ${month} ${year}`,
      });

      // Mark every disbursed row paid.
      await Promise.all(pending.map(r => hrDb.updatePayroll(r.payroll_id, { status: 'paid' })));

      toast.success(`Payroll for ${month} ${year} disbursed — ${formatCurrency(totalNet)} posted to accounts.`, 'Payroll Disbursed');
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message, 'Disburse Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Disburse Payroll"
      subtitle={`Pay salaries for ${month} ${year} and post to accounts`}
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving || pending.length === 0}>
            {saving ? 'Posting…' : `Disburse ${formatCurrency(totalNet)}`}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff" style={{ display: 'flex', gap: 24, fontSize: 13, background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
          <span>Employees: <strong style={{ color: 'var(--text-primary)' }}>{pending.length}</strong></span>
          <span>Total net: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{formatCurrency(totalNet)}</strong></span>
        </div>

        <Input label="Payment Date *" type="date" value={form.date} onChange={set('date')} required />

        <div className="ff">
          <SelectField label="Salary Expense Account *" value={form.expense_account_id} onChange={set('expense_account_id')} required>
            <option value="">— Select expense account —</option>
            {expenseAccounts.map(a => (
              <option key={a.account_id} value={a.account_id}>{a.account_code} — {a.account_name}</option>
            ))}
          </SelectField>
        </div>

        <SelectField label="Paid From *" value={form.source_account_id} onChange={set('source_account_id')} required>
          <option value="CASH">Cash In Hand</option>
          {(bankAccounts || []).map(b => (
            <option key={b.account_id} value={b.account_id}>{b.account_id} — {b.bank_name} ({b.account_no})</option>
          ))}
        </SelectField>

        <p className="ff" style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
          Posts a voucher — <strong>debit</strong> {`{salary expense}`} and <strong>credit</strong> {`{cash/bank}`} for {formatCurrency(totalNet)} — then marks these {pending.length} payroll rows as paid. It will appear in Reports → Ledger under both accounts.
        </p>
      </form>
    </Modal>
  );
}
