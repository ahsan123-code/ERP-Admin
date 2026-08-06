import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { hrDb } from '../../lib/db';
import { useEmployeeSections } from '../../context/EmployeeSectionsContext';

const STATUSES = ['active', 'inactive', 'terminated'];

export default function EditEmployeeModal({ employee, onClose, onSave }) {
  const toast = useToast();
  const { names: sections } = useEmployeeSections();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', designation: '', section: '',
    joining_date: '', gross_salary: '', contact: '', cnic: '', address: '', status: 'active',
  });

  useEffect(() => {
    if (employee) {
      setForm({
        name:         employee.name          ?? '',
        designation:  employee.designation   ?? '',
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
    if (!form.name || !form.gross_salary) {
      toast.error('Name and gross salary are required.');
      return;
    }
    setSaving(true);
    try {
      const updates = {
        name:         form.name,
        designation:  form.designation,
        section:      form.section || null,
        // Written from section, which replaced the duplicate department input. Falls back
        // to whatever the record already held so the sectionless accounts keep their own
        // department (the two login accounts read "Purchase Deptt.") instead of being
        // blanked by a form that no longer asks for it.
        department:   form.section || employee.department || null,
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
        <SelectField label="Section" value={form.section} onChange={set('section')}>
          <option value="">— Select section —</option>
          {/* A section already on the record but no longer offered still has to appear,
              or opening this form would show it blank and silently clear it on save. */}
          {(sections.includes(form.section) || !form.section
            ? sections
            : [form.section, ...sections]
          ).map(s => <option key={s} value={s}>{s}</option>)}
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
