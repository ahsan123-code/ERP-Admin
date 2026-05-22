import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { mastersDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';

const today = new Date().toISOString().split('T')[0];

const DESIGNATIONS = [
  'Production Manager', 'Store Manager', 'Accounts Officer', 'HR Officer',
  'Sales Executive', 'Procurement Officer', 'Machine Operator', 'Lab Technician',
  'Security Guard', 'Driver', 'Helper', 'Admin Clerk',
];

export default function AddEmployeeModal({ open, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const { data: departments } = useDb(() => mastersDb.getDepartments());
  const [form, setForm] = useState({
    name: '', designation: '', department: '', joiningDate: today,
    salary: '', contact: '', cnic: '', address: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.designation || !form.department || !form.salary || !form.cnic) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success(`${form.name} added to employee records.`, 'Employee Added');
      onSave({
        employeeId: 'EMP-' + String(Date.now()).slice(-4).padStart(4, '0'),
        name: form.name,
        cnic: form.cnic,
        designation: form.designation,
        department: form.department,
        joiningDate: form.joiningDate,
        salary: parseFloat(form.salary),
        contact: form.contact,
        status: 'active',
      });
      setForm({ name: '', designation: '', department: '', joiningDate: today, salary: '', contact: '', cnic: '', address: '' });
      onClose();
    }, 700);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Employee"
      subtitle="Register a new employee in the HR system"
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Add Employee'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff">
          <Input label="Full Name *" placeholder="e.g. Muhammad Ahmed" value={form.name} onChange={set('name')} required />
        </div>
        <SelectField label="Designation *" value={form.designation} onChange={set('designation')} required>
          <option value="">— Select designation —</option>
          {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </SelectField>
        <SelectField label="Department *" value={form.department} onChange={set('department')} required>
          <option value="">— Select department —</option>
          {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </SelectField>
        <Input label="Joining Date *" type="date" value={form.joiningDate} onChange={set('joiningDate')} required />
        <Input label="Basic Salary (PKR) *" type="number" min="1" value={form.salary} onChange={set('salary')} placeholder="0" required />
        <Input label="Contact No." placeholder="0300-1234567" value={form.contact} onChange={set('contact')} />
        <Input label="CNIC *" placeholder="xxxxx-xxxxxxx-x" value={form.cnic} onChange={set('cnic')} required />
        <div className="ff">
          <Input label="Address" placeholder="Full residential address" value={form.address} onChange={set('address')} />
        </div>
      </form>
    </Modal>
  );
}
