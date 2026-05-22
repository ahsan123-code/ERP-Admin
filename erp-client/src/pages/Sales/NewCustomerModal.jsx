import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { salesDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';

const REGIONS = [
  'Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad',
  'Gujranwala', 'Multan', 'Sialkot', 'Peshawar', 'Quetta',
  'Hyderabad', 'Gujrat', 'Bahawalpur', 'Sargodha', 'AJK', 'Other',
];

const CUSTOMER_TYPES = [
  'Dealer', 'Distributor', 'Contractor', 'Manufacturer',
  'Retailer', 'Walk-in', 'Government', 'Export',
];

const PAYMENT_TERMS = [
  'Cash', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90',
];

const EMPTY = {
  name: '', contact: '', ntn: '', cnic: '',
  region: '', address: '', credit_limit: '',
  customer_type: '', payment_terms: 'Cash',
};

export default function NewCustomerModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Customer name is required.'); return; }
    if (!form.contact.trim()) { toast.error('Contact number is required.'); return; }
    if (!form.region) { toast.error('Please select a region.'); return; }

    setSaving(true);
    const customerId = 'CUST-' + String(Date.now()).slice(-6);
    const payload = {
      customer_id:         customerId,
      name:                form.name.trim(),
      contact:             form.contact.trim(),
      ntn:                 form.ntn.trim()  || null,
      cnic:                form.cnic.trim() || null,
      region:              form.region,
      address:             form.address.trim() || null,
      credit_limit:        form.credit_limit ? parseFloat(form.credit_limit) : 0,
      outstanding_balance: 0,
      status:              'active',
      company_id:          companyId,
    };

    const { data, error } = await salesDb.addCustomer(payload);
    setSaving(false);

    if (error) { toast.error(error.message || 'Failed to save customer.'); return; }

    toast.success(`${form.name} added to customer list.`, 'Customer Added');
    onSave(data ?? payload);
    setForm(EMPTY);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Customer"
      subtitle="Register a new customer account"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Add Customer'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>

        {/* Business name — full width */}
        <div className="ff">
          <Input
            label="Business / Customer Name *"
            value={form.name}
            onChange={set('name')}
            placeholder="e.g. M/S Allied Steel Traders"
            required
          />
        </div>

        {/* Type + Region */}
        <SelectField label="Customer Type" value={form.customer_type} onChange={set('customer_type')}>
          <option value="">— Select type —</option>
          {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </SelectField>
        <SelectField label="Region *" value={form.region} onChange={set('region')} required>
          <option value="">— Select region —</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </SelectField>

        {/* Contact + Payment Terms */}
        <Input
          label="Mobile / Phone *"
          value={form.contact}
          onChange={set('contact')}
          placeholder="03XX-XXXXXXX"
          required
        />
        <SelectField label="Payment Terms" value={form.payment_terms} onChange={set('payment_terms')}>
          {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
        </SelectField>

        {/* Tax IDs */}
        <Input
          label="NTN (National Tax No.)"
          value={form.ntn}
          onChange={set('ntn')}
          placeholder="1234567-8"
        />
        <Input
          label="CNIC"
          value={form.cnic}
          onChange={set('cnic')}
          placeholder="XXXXX-XXXXXXX-X"
        />

        {/* Address — full width */}
        <div className="ff">
          <Input
            label="Address"
            value={form.address}
            onChange={set('address')}
            placeholder="Shop / Plot No., Street, Area, City"
          />
        </div>

        {/* Credit limit */}
        <Input
          label="Credit Limit (PKR)"
          type="number"
          min="0"
          value={form.credit_limit}
          onChange={set('credit_limit')}
          placeholder="0  —  leave blank for cash only"
        />

        {/* Info note — full width */}
        <div className="ff" style={{
          fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--bg-tertiary)',
          padding: '9px 13px', borderRadius: 'var(--radius-md)', lineHeight: 1.6,
        }}>
          NTN is required for FBR sales tax invoices. Credit limit of 0 means cash-only customer.
        </div>

      </form>
    </Modal>
  );
}
