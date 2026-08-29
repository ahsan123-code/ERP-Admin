import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
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

  // Loans and advances recovered out of this month's salaries. They were paid out of a
  // cash pocket when granted (see financeDb.addLoanWithPosting) and sit in "Loan to
  // Employees" until recovered, so payroll has to credit that account back down — without
  // this leg the receivable would only ever grow.
  const totalRecovered = pending.reduce(
    (s, r) => s + (Number(r.loan_deduction) || 0) + (Number(r.advance_salary) || 0), 0);

  // What the staff actually earned. Taking it as net + recovered keeps the entry balanced
  // by construction: the earnings are settled partly in cash and partly by writing the
  // loan down.
  const totalEarned = totalNet + totalRecovered;

  const expenseAccounts = (chartOfAccounts || []).filter(a => a.account_code?.slice(0, 2) === '12');
  const defaultSalary   = expenseAccounts.find(a => /salaries\s*(and|&)?\s*wages/i.test(a.account_name || ''));

  const [form, setForm] = useState({ date: today, expense_account_id: '', source_account_id: 'CASH' });

  useEffect(() => {
    if (open) setForm({ date: today, expense_account_id: defaultSalary?.account_id || '', source_account_id: 'CASH' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setVal = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pending.length === 0) { toast.error('No pending payroll to disburse for this period.'); return; }
    if (!form.expense_account_id) { toast.error('Select the salary expense account.'); return; }

    const expenseAccount = chartOfAccounts.find(a => a.account_id === form.expense_account_id);
    const sourceAccount  = form.source_account_id === 'CASH'
      ? chartOfAccounts.find(a => a.account_code === CASH_IN_HAND_CODE)
      : financeDb.bankCodeToAccount(chartOfAccounts, form.source_account_id, bankAccounts);
    if (!expenseAccount || !sourceAccount) {
      toast.error('Could not resolve the accounts in the Chart of Accounts.');
      return;
    }

    setSaving(true);
    try {
      const loanControl = totalRecovered > 0
        ? await financeDb.ensureLedgerAccount({
            code: financeDb.EMPLOYEE_LOAN_CONTROL,
            name: 'Loan to Employees', type: 'Asset', parent: '11-01-007', companyId,
          })
        : null;
      if (totalRecovered > 0 && !loanControl) {
        toast.error('Could not resolve the "Loan to Employees" account.');
        setSaving(false);
        return;
      }

      const voucherId = 'SAL-' + String(Date.now()).slice(-6);
      const legs = [
        { account: expenseAccount, debit: totalEarned, credit: 0 },
        { account: sourceAccount,  debit: 0, credit: totalNet },
      ];
      if (totalRecovered > 0) {
        legs.push({ account: loanControl, debit: 0, credit: totalRecovered });
      }
      await financeDb.postJournalEntry({
        voucherId, voucherType: 'Payment', date: form.date, companyId,
        legs,
        narration: `Salary paid for ${month} ${year} (${pending.length} employees)`,
        reference: `Payroll ${month} ${year}`,
      });

      // Mark every disbursed row paid.
      await Promise.all(pending.map(r => hrDb.updatePayroll(r.payroll_id, { status: 'paid' })));

      toast.success(
        totalRecovered > 0
          ? `Payroll for ${month} ${year} disbursed — ${formatCurrency(totalNet)} paid out and ${formatCurrency(totalRecovered)} recovered against loans/advances.`
          : `Payroll for ${month} ${year} disbursed — ${formatCurrency(totalNet)} posted to accounts.`,
        'Payroll Disbursed');
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
          {totalRecovered > 0 && (
            <span>Recovered from loans/advances: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--orange)' }}>{formatCurrency(totalRecovered)}</strong></span>
          )}
        </div>

        <Input label="Payment Date *" type="date" value={form.date} onChange={set('date')} required />

        <div className="ff">
          <SearchableSelect
            label="Salary Expense Account *"
            required
            placeholder={`Search expense account (${expenseAccounts.length})…`}
            emptyText="No matching accounts"
            value={form.expense_account_id}
            onChange={setVal('expense_account_id')}
            options={expenseAccounts.map(a => ({
              value: a.account_id,
              label: a.account_name,
              search: a.account_code,
            }))}
          />
        </div>

        <SelectField label="Paid From *" value={form.source_account_id} onChange={set('source_account_id')} required>
          <option value="CASH">Cash In Hand</option>
          {(bankAccounts || []).map(b => (
            <option key={b.account_id} value={b.account_id}>{b.bank_name} ({b.account_no})</option>
          ))}
        </SelectField>

        <p className="ff" style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
          Posts a voucher — <strong>debit</strong> {`{salary expense}`} {formatCurrency(totalEarned)}, <strong>credit</strong> {`{cash/bank}`} {formatCurrency(totalNet)}
          {totalRecovered > 0 && <> and <strong>credit</strong> Loan to Employees {formatCurrency(totalRecovered)}</>}
          {' '}— then marks these {pending.length} payroll rows as paid. It will appear in Reports → Ledger under each account.
        </p>
      </form>
    </Modal>
  );
}
