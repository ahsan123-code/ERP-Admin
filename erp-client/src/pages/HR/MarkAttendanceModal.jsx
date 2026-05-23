import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';

const today = new Date().toISOString().split('T')[0];

const STATUSES = [
  { value: 'present', label: 'Present' },
  { value: 'absent',  label: 'Absent'  },
  { value: 'leave',   label: 'On Leave' },
  { value: 'late',    label: 'Late'    },
  { value: 'half_day',label: 'Half Day' },
];

export default function MarkAttendanceModal({ open, onClose, onSave, employees }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', date: today, check_in: '', check_out: '', status: 'present',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const selectedEmp = employees.find(e => e.employee_id === form.employee_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.date) {
      toast.error('Please select an employee and date.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        employee_id:   form.employee_id,
        employee_name: selectedEmp?.name ?? '',
        date:          form.date,
        check_in:      form.check_in  || null,
        check_out:     form.check_out || null,
        status:        form.status,
      };
      const { data, error } = await hrDb.markAttendance(record);
      if (error) throw new Error(error.message);
      toast.success(`Attendance marked for ${selectedEmp?.name}.`, 'Attendance Recorded');
      onSave(data);
      setForm({ employee_id: '', date: today, check_in: '', check_out: '', status: 'present' });
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
      title="Mark Attendance"
      subtitle="Record employee attendance for a date"
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Mark Attendance'}
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
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <SelectField label="Status *" value={form.status} onChange={set('status')}>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </SelectField>
        <Input label="Check In" type="time" value={form.check_in} onChange={set('check_in')} />
        <Input label="Check Out" type="time" value={form.check_out} onChange={set('check_out')} />
      </form>
    </Modal>
  );
}
