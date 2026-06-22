import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { procurementDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';

const EMPTY = { name: '', ntn: '', contact: '', address: '', category: '', status: 'active' };

export default function NewVendorModal({ open, onClose, onSave, vendor = null }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const isEdit = !!vendor;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  // Prefill when editing an existing vendor
  useEffect(() => {
    if (open) {
      setForm(vendor ? {
        name: vendor.name || '', ntn: vendor.ntn || '', contact: vendor.contact || '',
        address: vendor.address || '', category: vendor.category || '', status: vendor.status || 'active',
      } : EMPTY);
    }
  }, [open, vendor]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Vendor name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name:     form.name.trim(),
        ntn:      form.ntn.trim() || null,
        contact:  form.contact.trim() || null,
        address:  form.address.trim() || null,
        category: form.category.trim() || null,
        status:   form.status,
      };
      const { data, error } = isEdit
        ? await procurementDb.updateVendor(vendor.id, payload)
        : await procurementDb.addVendor({ ...payload, rating: 3, company_id: companyId });
      if (error) throw new Error(error.message);
      toast.success(`Vendor "${form.name.trim()}" ${isEdit ? 'updated' : 'added'}.`, isEdit ? 'Vendor Updated' : 'Vendor Created');
      onSave(data);
      setForm(EMPTY);
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
      title={isEdit ? 'Edit Vendor' : 'New Vendor'}
      subtitle={isEdit ? 'Update supplier / vendor details' : 'Register a new supplier / vendor'}
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Vendor'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff">
          <Input label="Vendor Name *" value={form.name} onChange={set('name')} placeholder="e.g. Ali Steel Traders" required />
        </div>
        <Input label="NTN" value={form.ntn} onChange={set('ntn')} placeholder="Tax number" />
        <Input label="Contact" value={form.contact} onChange={set('contact')} placeholder="e.g. 03xx-xxxxxxx" />
        <Input label="Category" value={form.category} onChange={set('category')} placeholder="e.g. Steel Supplier" />
        <SelectField label="Status" value={form.status} onChange={set('status')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
        <div className="ff">
          <Input label="Address" value={form.address} onChange={set('address')} placeholder="Vendor address" />
        </div>
      </form>
    </Modal>
  );
}
