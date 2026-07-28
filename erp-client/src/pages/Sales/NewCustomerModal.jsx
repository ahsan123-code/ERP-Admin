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

const today = new Date().toISOString().split('T')[0];

const EMPTY = {
  name: '', contact: '', ntn: '', cnic: '',
  region: '', address: '', credit_limit: '',
  customer_type: '', payment_terms: 'Cash',
  opening_balance: '', opening_balance_date: today,
};

export default function NewCustomerModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openingBalance = parseFloat(form.opening_balance) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Customer name is required.'); return; }
    if (!form.contact.trim()) { toast.error('Contact number is required.'); return; }
    if (!form.region) { toast.error('Please select a region.'); return; }

    setSaving(true);
    const customerId = 'CUST-' + String(Date.now()).slice(-6);
    const openingBalance = parseFloat(form.opening_balance) || 0;
    const payload = {
      customer_id:         customerId,
      name:                form.name.trim(),
      contact:             form.contact.trim(),
      ntn:                 form.ntn.trim()  || null,
      cnic:                form.cnic.trim() || null,
      region:              form.region,
      address:             form.address.trim() || null,
      credit_limit:        form.credit_limit ? parseFloat(form.credit_limit) : 0,
      opening_balance:     openingBalance,
      opening_balance_date: openingBalance !== 0 ? form.opening_balance_date : null,
      // Seeded from the opening balance so the customer list shows what they owe
      // from day one. Once invoices exist the balance report derives the figure
      // from ledger activity instead, so this is not double-counted.
      outstanding_balance: openingBalance,
      status:              'active',
      company_id:          companyId,
    };

    const { data, error } = await salesDb.addCustomer(payload);

    if (error) {
      setSaving(false);
      toast.error(error.message || 'Failed to save customer.');
      return;
    }

    // Post the brought-forward balance to the ledger. The customer row is already
    // saved, so a posting failure must not discard it — warn instead, because an
    // unposted opening balance has to be corrected by hand.
    let postingError = null;
    if (openingBalance !== 0) {
      try {
        await salesDb.postCustomerOpeningBalance({
          customerName: form.name.trim(),
          amount:       openingBalance,
          date:         form.opening_balance_date,
          companyId,
        });
      } catch (err) {
        postingError = err;
      }
    }
    setSaving(false);

    if (postingError) {
      toast.error(
        `${form.name} was added, but the opening balance could not be posted to the ledger: ${postingError.message}`,
        'Opening Balance Not Posted',
      );
    } else {
      toast.success(`${form.name} added to customer list.`, 'Customer Added');
    }
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

        {/* Opening balance — for customers carried over from the old system */}
        <Input
          label="Opening Balance (PKR)"
          type="number"
          step="0.01"
          value={form.opening_balance}
          onChange={set('opening_balance')}
          placeholder="0  —  amount already owed"
        />

        {openingBalance !== 0 && (
          <Input
            label="Balance As Of *"
            type="date"
            value={form.opening_balance_date}
            onChange={set('opening_balance_date')}
            required
          />
        )}

        {/* Info note — full width */}
        <div className="ff" style={{
          fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--bg-tertiary)',
          padding: '9px 13px', borderRadius: 'var(--radius-md)', lineHeight: 1.6,
        }}>
          NTN is required for FBR sales tax invoices. Credit limit of 0 means cash-only customer.
          {openingBalance > 0 && (
            <>
              <br />
              Opening balance of <strong style={{ color: 'var(--blue)' }}>PKR {openingBalance.toLocaleString('en-PK')}</strong> will
              be posted to the ledger as a debit to Accounts Receivable — this customer starts out owing you that amount.
            </>
          )}
          {openingBalance < 0 && (
            <>
              <br />
              A negative opening balance means the customer is <strong style={{ color: 'var(--green)' }}>in credit</strong> by
              PKR {Math.abs(openingBalance).toLocaleString('en-PK')} — you owe them, e.g. an advance already paid.
            </>
          )}
        </div>

      </form>
    </Modal>
  );
}
