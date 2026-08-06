import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';
import { useEmployeeSections } from '../../context/EmployeeSectionsContext';

const today = new Date().toISOString().split('T')[0];

// No department field: every one of the 17 real employees has department set to exactly
// the same string as section, and nothing computes from department — it is displayed in
// the employee list and the two attendance views and nowhere else. Asking for both meant
// typing one value twice and let them drift apart. Section is the one kept, because the
// salary sheet groups by it and a fixed list cannot be typo'd into a new section the way
// free text can; department is written from it on save so those displays keep working.
const BLANK = {
  name: '', designation: '', section: '', joining_date: today,
  gross_salary: '', contact: '', cnic: '', address: '',
};

export default function AddEmployeeModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { names: sections } = useEmployeeSections();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(BLANK);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.designation || !form.gross_salary || !form.cnic) {
      toast.error('Please fill in all required fields.');
      return;
    }
    // Required, not optional: the salary sheet groups by section, and a blank one puts
    // the employee in the "Admins" block instead of their own.
    if (!form.section) {
      toast.error('Select a section — the salary sheet groups employees by it.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        employee_id:  'EMP-' + String(Date.now()).slice(-6),
        name:         form.name,
        cnic:         form.cnic,
        designation:  form.designation,
        section:      form.section,
        department:   form.section,
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
      setForm(BLANK);
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
        <SelectField label="Section *" value={form.section} onChange={set('section')} required>
          <option value="">— Select section —</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </SelectField>
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
