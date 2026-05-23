import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';

const today = new Date().toISOString().split('T')[0];

const LEAVE_TYPES = ['Annual', 'Sick', 'Casual', 'Emergency', 'Maternity', 'Unpaid'];

export default function NewLeaveModal({ open, onClose, onSave, employees }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', leave_type: 'Annual', from_date: today, to_date: today, reason: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const selectedEmp = employees.find(e => e.employee_id === form.employee_id);

  const days = form.from_date && form.to_date
    ? Math.max(1, Math.round((new Date(form.to_date) - new Date(form.from_date)) / 86400000) + 1)
    : 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.from_date || !form.to_date || !form.reason) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        leave_id:      'LV-' + String(Date.now()).slice(-6),
        employee_id:   form.employee_id,
        employee_name: selectedEmp?.name ?? '',
        leave_type:    form.leave_type,
        from_date:     form.from_date,
        to_date:       form.to_date,
        days,
        reason:        form.reason,
        status:        'pending',
      };
      const { data, error } = await hrDb.applyLeave(record);
      if (error) throw new Error(error.message);
      toast.success(`Leave applied for ${selectedEmp?.name} (${days} day${days > 1 ? 's' : ''}).`, 'Leave Applied');
      onSave(data);
      setForm({ employee_id: '', leave_type: 'Annual', from_date: today, to_date: today, reason: '' });
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
      title="Apply Leave"
      subtitle="Submit a leave request for an employee"
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Apply Leave'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff">
          <SelectField label="Employee *" value={form.employee_id} onChange={set('employee_id')} required>
            <option value="">— Select employee —</option>
            {employees.map(e => (
              <option key={e.employee_id} value={e.employee_id}>{e.name} ({e.employee_id})</option>
            ))}
          </SelectField>
        </div>
        <SelectField label="Leave Type *" value={form.leave_type} onChange={set('leave_type')}>
          {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </SelectField>
        <Input label="From Date *" type="date" value={form.from_date} onChange={set('from_date')} required />
        <Input label="To Date *" type="date" value={form.to_date} min={form.from_date} onChange={set('to_date')} required />
        {form.from_date && form.to_date && (
          <div className="ff" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Duration</label>
            <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
              {days} day{days > 1 ? 's' : ''}
            </div>
          </div>
        )}
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Reason *</label>
          <textarea
            value={form.reason}
            onChange={set('reason')}
            rows={3}
            placeholder="Reason for leave..."
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
