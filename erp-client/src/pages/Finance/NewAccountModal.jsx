import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { isCreditNormal } from '../../utils/accounts';
import { useCompany } from '../../context/CompanyContext';

// Account categories the user sees — mapped to accounting types + code prefixes
const ACCOUNT_CATEGORIES = [
    { label: 'Dasti (Cash / Wallet)', type: 'Asset', prefix: '11-01-001' },
    { label: 'Salary Payable', type: 'Liability', prefix: '14-02' },
    { label: 'General Expense', type: 'Expense', prefix: '12-99' },
    { label: 'General Income', type: 'Income', prefix: '10-99' },
    { label: 'Accounts Receivable (AR)', type: 'Asset', prefix: '11-03' },
    { label: 'Accounts Payable (AP)', type: 'Liability', prefix: '14-01' },
    { label: 'Bank Account', type: 'Asset', prefix: '11-05-001' },
    { label: 'Owner Equity', type: 'Equity', prefix: '13-01' },
];

const EMPTY = { name: '', category: '', openingBalance: '', openingDate: '', description: '' };

export default function NewAccountModal({ open, onClose, onSave, existingAccounts = [] }) {
    const toast = useToast();
    const { companyId } = useCompany();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY);

    useEffect(() => { if (open) setForm(EMPTY); }, [open]);

    const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

    // Auto-generate next available account_code under chosen prefix
    const generateCode = (prefix) => {
        const existing = existingAccounts
            .map(a => a.account_code)
            .filter(c => c?.startsWith(prefix + '-'))
            .map(c => parseInt(c.replace(prefix + '-', ''), 10))
            .filter(n => !isNaN(n));
        const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
        return `${prefix}-${String(next).padStart(6, '0')}`;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { toast.error('Account name is required.'); return; }
        if (!form.category) { toast.error('Please select an account category.'); return; }

        const cat = ACCOUNT_CATEGORIES.find(c => c.label === form.category);
        if (!cat) { toast.error('Invalid category selected.'); return; }

        // Duplicate name check (same company)
        const duplicate = existingAccounts.some(
            a => a.account_name?.toLowerCase() === form.name.trim().toLowerCase()
                && a.company_id === companyId
        );
        if (duplicate) { toast.error(`An account named "${form.name.trim()}" already exists.`); return; }

        setSaving(true);
        try {
            const code = generateCode(cat.prefix);
            const accountId = `ACCT-${code}-C${companyId}`;
            const opening = parseFloat(form.openingBalance) || 0;

            // The opening balance posts as a real Journal voucher against Capital rather
            // than being written straight onto the account row — see
            // financeDb.addChartAccountWithOpening.
            const { error, voucherId, openingFailed } = await financeDb.addChartAccountWithOpening({
                account: {
                    account_id: accountId,
                    account_code: code,
                    account_name: form.name.trim(),
                    account_type: cat.type,
                    parent_code: cat.prefix,
                    company_id: companyId,
                    description: form.description.trim() || null,
                },
                openingBalance: opening,
                date: form.openingDate || undefined,
                companyId,
            });

            if (error) throw new Error(error.message);

            const name = form.name.trim();
            if (openingFailed) {
                toast.error(`Account "${name}" was created, but the opening balance could not be posted. Enter it as a journal voucher.`, 'Opening Balance Not Posted');
            } else if (voucherId) {
                toast.success(`Account "${name}" created. Opening balance posted as ${voucherId}.`, 'Account Added');
            } else {
                toast.success(`Account "${name}" created.`, 'Account Added');
            }
            onSave();
            onClose();
        } catch (err) {
            toast.error(err.message, 'Save Failed');
        } finally {
            setSaving(false);
        }
    };

    const selectedCat = ACCOUNT_CATEGORIES.find(c => c.label === form.category);
    const openingAmount = Math.abs(parseFloat(form.openingBalance) || 0);
    // Which side the opening balance lands on, previewed from the chosen category's code
    // prefix — the same classifier db.js and the Trial Balance use.
    const opensOnCredit = isCreditNormal(selectedCat?.prefix);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="New Account"
            subtitle="Add a new account to the chart of accounts"
            size="sm"
            footer={
                <div className="factions">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={saving}>
                        {saving ? 'Saving…' : 'Create Account'}
                    </Button>
                </div>
            }
        >
            <form className="fg" onSubmit={handleSubmit}>

                <SelectField
                    label="Account Category *"
                    value={form.category}
                    onChange={set('category')}
                    required
                >
                    <option value="">— Select category —</option>
                    {ACCOUNT_CATEGORIES.map(c => (
                        <option key={c.label} value={c.label}>{c.label}</option>
                    ))}
                </SelectField>

                {selectedCat && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: -4 }}>
                        Type: <strong>{selectedCat.type}</strong> · Code prefix: <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{selectedCat.prefix}-XXXXXX</code>
                    </p>
                )}

                <Input
                    label="Account Name *"
                    placeholder="e.g. Dasti Usman, Salary Payable — April, Office Expenses"
                    value={form.name}
                    onChange={set('name')}
                    required
                />

                <Input
                    label="Opening Balance (PKR)"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.openingBalance}
                    onChange={set('openingBalance')}
                />

                {openingAmount > 0 && (
                    <>
                        <Input
                            label="Opening Balance Date"
                            type="date"
                            value={form.openingDate}
                            onChange={set('openingDate')}
                        />
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: -4 }}>
                            Posts as a Journal voucher: <strong>{opensOnCredit ? 'Capital' : form.name.trim() || 'this account'}</strong> debit{' '}
                            {openingAmount.toLocaleString()} / <strong>{opensOnCredit ? form.name.trim() || 'this account' : 'Capital'}</strong> credit{' '}
                            {openingAmount.toLocaleString()}. Leave the date blank to use today.
                        </p>
                    </>
                )}

                <Input
                    label="Description (optional)"
                    placeholder="Any notes about this account…"
                    value={form.description}
                    onChange={set('description')}
                />

            </form>
        </Modal>
    );
}
