import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';

const today = new Date().toISOString().split('T')[0];

export default function AddEmployeeModal({ open, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', designation: '', department: '', joining_date: today,
    gross_salary: '', contact: '', cnic: '', address: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.designation || !form.department || !form.gross_salary || !form.cnic) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        employee_id:  'EMP-' + String(Date.now()).slice(-6),
        name:         form.name,
        cnic:         form.cnic,
        designation:  form.designation,
        department:   form.department,
        joining_date: form.joining_date || null,
        gross_salary: parseFloat(form.gross_salary),
        contact:      form.contact || null,
        address:      form.address || null,
        status:       'active',
        company_id:   1,
      };
      const { data, error } = await hrDb.addEmployee(record);
      if (error) throw new Error(error.message);
      toast.success(`${form.name} added to employee records.`, 'Employee Added');
      onSave(data);
      setForm({ name: '', designation: '', department: '', joining_date: today, gross_salary: '', contact: '', cnic: '', address: '' });
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
        <Input label="Designation *" placeholder="e.g. Machine Operator" value={form.designation} onChange={set('designation')} required />
        <Input label="Department *" placeholder="e.g. Production" value={form.department} onChange={set('department')} required />
        <Input label="Joining Date" type="date" value={form.joining_date} onChange={set('joining_date')} />
        <Input label="Gross Salary (PKR) *" type="number" min="1" value={form.gross_salary} onChange={set('gross_salary')} placeholder="0" required />
        <Input label="Contact No." placeholder="0300-1234567" value={form.contact} onChange={set('contact')} />
        <Input label="CNIC *" placeholder="xxxxx-xxxxxxx-x" value={form.cnic} onChange={set('cnic')} required />
        <div className="ff">
          <Input label="Address" placeholder="Full residential address" value={form.address} onChange={set('address')} />
        </div>
      </form>
    </Modal>
  );
}
