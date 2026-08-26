import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';
import { isAdvance } from '../../data/hr';

const STATUSES = ['active', 'completed', 'cancelled'];

// Edits either kind of row on the Loans & Advances tab. The fields are the same for both
// — amount, what comes off each month, what is left — only the wording changes, so an
// advance is not described to the admin as a loan repayment.
export default function EditLoanModal({ loan, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    monthly_deduction: '', paid_installments: '', remaining_balance: '', status: 'active',
  });

  useEffect(() => {
    if (loan) {
      setForm({
        monthly_deduction:  loan.monthly_deduction  ?? '',
        paid_installments:  loan.paid_installments  ?? 0,
        remaining_balance:  loan.remaining_balance  ?? '',
        status:             loan.status             ?? 'active',
      });
    }
  }, [loan]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const advance = isAdvance(loan);
  const noun    = advance ? 'Advance' : 'Loan';

  const autoBalance = loan && form.paid_installments !== ''
    ? Math.max(0, loan.loan_amount - (parseInt(form.paid_installments) * parseFloat(form.monthly_deduction || loan.monthly_deduction)))
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates = {
        monthly_deduction:  parseFloat(form.monthly_deduction),
        paid_installments:  parseInt(form.paid_installments),
        remaining_balance:  parseFloat(form.remaining_balance),
        status:             form.status,
      };
      const { data, error } = await hrDb.updateLoan(loan.loan_id, updates);
      if (error) throw new Error(error.message);
      toast.success(`${noun} for ${loan.employee_name} updated.`, `${noun} Updated`);
      onSave(data);
      onClose();
    } catch (err) {
      toast.error(err.message, 'Update Failed');
    } finally {
      setSaving(false);
    }
  };

  const pct = loan && form.paid_installments
    ? Math.min(100, Math.round((parseInt(form.paid_installments) / loan.total_installments) * 100))
    : 0;

  return (
    <Modal
      open={!!loan}
      onClose={onClose}
      title={`Edit ${noun}`}
      subtitle={loan ? `${loan.loan_id} — ${loan.employee_name}` : ''}
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      }
    >
      {loan && (
        <form className="fg" onSubmit={handleSubmit}>
          {/* Read-only summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{noun} Amount</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                PKR {parseFloat(loan.loan_amount).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{advance ? 'Recovery Months' : 'Total Installments'}</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {loan.total_installments} {loan.total_installments === 1 ? 'month' : 'months'}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
              <span>{advance ? 'Recovery Progress' : 'Repayment Progress'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-muted)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--primary)', borderRadius: 99, transition: 'width 0.3s ease' }} />
            </div>
          </div>

          <Input label={advance ? 'Recovery Per Month (PKR)' : 'Monthly Deduction (PKR)'} type="number" min="1" value={form.monthly_deduction} onChange={set('monthly_deduction')} />
          <Input label={advance ? 'Months Recovered' : 'Paid Installments'} type="number" min="0" max={loan.total_installments} value={form.paid_installments} onChange={set('paid_installments')} />

          {autoBalance !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Auto-calculated Balance</label>
              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: autoBalance === 0 ? 'var(--green)' : 'var(--orange)' }}>
                PKR {autoBalance.toLocaleString()}
              </div>
            </div>
          )}

          <Input label="Remaining Balance (PKR)" type="number" min="0" value={form.remaining_balance} onChange={set('remaining_balance')} />
          <SelectField label="Status" value={form.status} onChange={set('status')}>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </SelectField>
        </form>
      )}
    </Modal>
  );
}
