import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';

const SECTIONS = ['Shop 41', 'Workshop', 'Mosque', 'Home', 'Office', 'Admin'];
const STATUSES = ['active', 'inactive', 'terminated'];

export default function EditEmployeeModal({ employee, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', designation: '', department: '', section: '',
    joining_date: '', gross_salary: '', contact: '', cnic: '', address: '', status: 'active',
  });

  useEffect(() => {
    if (employee) {
      setForm({
        name:         employee.name          ?? '',
        designation:  employee.designation   ?? '',
        department:   employee.department    ?? '',
        section:      employee.section       ?? '',
        joining_date: employee.joining_date  ?? '',
        gross_salary: employee.gross_salary  ?? '',
        contact:      employee.contact       ?? '',
        cnic:         employee.cnic          ?? '',
        address:      employee.address       ?? '',
        status:       employee.status        ?? 'active',
      });
    }
  }, [employee]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.department || !form.gross_salary) {
      toast.error('Name, department and gross salary are required.');
      return;
    }
    setSaving(true);
    try {
      const updates = {
        name:         form.name,
        designation:  form.designation,
        department:   form.department,
        section:      form.section || null,
        joining_date: form.joining_date || null,
        gross_salary: parseFloat(form.gross_salary),
        contact:      form.contact || null,
        cnic:         form.cnic || null,
        address:      form.address || null,
        status:       form.status,
      };
      const { data, error } = await hrDb.updateEmployee(employee.employee_id, updates);
      if (error) throw new Error(error.message);
      toast.success(`${form.name} updated successfully.`, 'Employee Updated');
      onSave(data);
      onClose();
    } catch (err) {
      toast.error(err.message, 'Update Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!employee}
      onClose={onClose}
      title="Edit Employee"
      subtitle={employee ? `${employee.employee_id} — ${employee.name}` : ''}
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff">
          <Input label="Full Name *" value={form.name} onChange={set('name')} required />
        </div>
        <Input label="Designation" placeholder="e.g. Machine Operator" value={form.designation} onChange={set('designation')} />
        <Input label="Department *" placeholder="e.g. Production" value={form.department} onChange={set('department')} required />
        <SelectField label="Section" value={form.section} onChange={set('section')}>
          <option value="">— Select section —</option>
          {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </SelectField>
        <Input label="Joining Date" type="date" value={form.joining_date} onChange={set('joining_date')} />
        <Input label="Gross Salary (PKR) *" type="number" min="1" value={form.gross_salary} onChange={set('gross_salary')} required />
        <Input label="Contact No." placeholder="0300-1234567" value={form.contact} onChange={set('contact')} />
        <Input label="CNIC" placeholder="xxxxx-xxxxxxx-x" value={form.cnic} onChange={set('cnic')} />
        <SelectField label="Status" value={form.status} onChange={set('status')}>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </SelectField>
        <div className="ff">
          <Input label="Address" placeholder="Full residential address" value={form.address} onChange={set('address')} />
        </div>
      </form>
    </Modal>
  );
}
