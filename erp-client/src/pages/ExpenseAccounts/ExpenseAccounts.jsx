import { useState, useMemo } from 'react';
import { Plus, Store, Info, Coins } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import EmptyState from '../../components/shared/EmptyState';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { branches } from '../../data/masters';
import { formatCurrency } from '../../utils/format';
import styles from './ExpenseAccounts.module.css';

// Expense accounts live under this prefix, matching the "General Expense" category in
// NewAccountModal. Every dropdown that offers expense accounts selects on the leading
// "12", so an account created here appears in them for its branch and nowhere else.
const EXPENSE_PREFIX = '12-99';

const EMPTY = { name: '', openingBalance: '', description: '' };

const COLS = [
  { key: 'account_code', label: 'Code', width: 150, render: v => <span className={styles.code}>{v}</span> },
  { key: 'account_name', label: 'Expense Account' },
  {
    key: 'balance', label: 'Balance', width: 160, align: 'right',
    render: v => Number(v)
      ? <span className={styles.mono}>{formatCurrency(v)}</span>
      : <span className={styles.nil}>—</span>,
  },
];

export default function ExpenseAccounts() {
  const toast = useToast();
  const { companyId } = useCompany();

  // One branch selection drives both halves of the page: the list shows that branch's
  // accounts and the form writes to it. Two separate selectors (one to view, one to add)
  // read as a trap — it is too easy to file an account against the branch you are
  // looking away from.
  const [branchId, setBranchId] = useState(companyId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Changing branchId re-runs the query, so switching branch refreshes the list.
  const { data: chart, loading, error, refetch } =
    useDb(() => financeDb.getChartOfAccounts(branchId), [branchId]);

  const accounts = useMemo(
    () => (chart || []).filter(a => (a.account_code || '').startsWith('12')),
    [chart],
  );

  const branchName = (id) =>
    branches.find(b => String(b.id) === String(id))?.name || `Branch ${id}`;

  // The next free sequence under the prefix, from the branch being written to.
  const nextCode = (existing) => {
    const used = existing
      .map(a => a.account_code)
      .filter(c => c?.startsWith(`${EXPENSE_PREFIX}-`))
      .map(c => parseInt(c.slice(EXPENSE_PREFIX.length + 1), 10))
      .filter(n => !isNaN(n));
    const next = used.length ? Math.max(...used) + 1 : 1;
    return `${EXPENSE_PREFIX}-${String(next).padStart(6, '0')}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Account name is required.'); return; }

    setSaving(true);
    try {
      // Re-read at save time: another user may have added an account since this loaded.
      const { data: target, error: readErr } = await financeDb.getChartOfAccounts(branchId);
      if (readErr) throw new Error(readErr.message);

      const name = form.name.trim();
      if ((target || []).some(a => (a.account_name || '').toLowerCase() === name.toLowerCase())) {
        throw new Error(`"${name}" already exists in ${branchName(branchId)}.`);
      }

      const code = nextCode(target || []);
      const { error: saveErr } = await financeDb.addChartAccount({
        // account_id is unique across the whole table, so it carries the branch —
        // without the suffix a code reused in another branch would collide.
        account_id:   `ACCT-${code}-C${branchId}`,
        account_code: code,
        account_name: name,
        account_type: 'Expense',
        parent_code:  EXPENSE_PREFIX,
        balance:      parseFloat(form.openingBalance) || 0,
        company_id:   branchId,
        description:  form.description.trim() || null,
      });
      if (saveErr) throw new Error(saveErr.message);

      toast.success(`"${name}" added to ${branchName(branchId)}.`, 'Expense Account Created');
      setForm(EMPTY);
      refetch();
    } catch (err) {
      toast.error(err.message, 'Could Not Add Account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Expense Accounts"
        subtitle="Create expense heads for a branch. An account appears only in the expense dropdowns of the branch it belongs to."
      />

      <div className={styles.branchBar}>
        <span className={styles.branchLabel}>Branch</span>
        <div className={styles.segment} role="tablist" aria-label="Branch">
          {branches.map(b => {
            const active = b.id === branchId;
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.segBtn} ${active ? styles.segBtnActive : ''}`}
                onClick={() => setBranchId(b.id)}
              >
                <Store size={14} strokeWidth={1.75} />
                {b.name}
                {active && !loading && <span className={styles.segCount}>{accounts.length}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.grid}>
        <Card padding={false}>
          <CardHeader title="Add Expense Account" />
          <form className={styles.form} onSubmit={handleSubmit}>
            <Input
              label="Account Name"
              placeholder="e.g. Office Rent, Vehicle Repair, Electricity Bill"
              value={form.name}
              onChange={set('name')}
              required
              autoFocus
            />

            <div className={styles.formRow}>
              <Input
                label="Opening Balance"
                type="number" min="0" step="0.01" placeholder="0.00"
                value={form.openingBalance}
                onChange={set('openingBalance')}
                hint="PKR — leave blank for zero"
              />
              <Input
                label="Description"
                placeholder="Optional note"
                value={form.description}
                onChange={set('description')}
              />
            </div>

            <div className={styles.target}>
              <Info size={14} className={styles.targetIcon} />
              <span>
                This account will be created in <strong>{branchName(branchId)}</strong> and
                will only appear in that branch&apos;s expense dropdowns.
                Use the Branch selector above to change it.
              </span>
            </div>

            <div className={styles.actions}>
              <Button type="submit" variant="primary" icon={<Plus size={15} />} disabled={saving}>
                {saving ? 'Saving…' : `Add to ${branchName(branchId)}`}
              </Button>
            </div>
          </form>
        </Card>

        <Card padding={false}>
          <CardHeader
            title={`${branchName(branchId)} — Expense Accounts`}
            subtitle={
              error   ? <span className={styles.error}>Could not load accounts: {error}</span>
              : loading ? 'Loading…'
              : `${accounts.length} account${accounts.length === 1 ? '' : 's'}`
            }
          />
          {!loading && !error && accounts.length === 0
            ? (
              <EmptyState
                icon={Coins}
                message={`No expense accounts in ${branchName(branchId)}`}
                description="Add one using the form on the left — it will show up here and in this branch's expense dropdowns."
              />
            )
            : (
              <DataTable
                columns={COLS}
                data={accounts}
                keyField="account_id"
                searchPlaceholder="Search expense accounts..."
              />
            )}
        </Card>
      </div>
    </div>
  );
}
