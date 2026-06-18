import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { mastersDb, invoicingDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCustomers } from '../../context/CustomerContext';

const today    = new Date().toISOString().split('T')[0];
const nextInvNo = () => 'INV-' + String(50 + Math.floor(Math.random() * 50)).padStart(4, '0');
const TAX_RATE  = 18;

const EMPTY = {
  invoiceNo: nextInvNo(), customer_id: '', cnic: '', ntn: '',
  invoiceDate: today, invoiceType: 'standard',
  productId: '', qty: '', rate: '',
};

export default function NewInvoiceModal({ open, onClose, onSave, prefillCustomer }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState(() => prefillCustomer
    ? { ...EMPTY, customer_id: prefillCustomer.customer_id, cnic: prefillCustomer.cnic ?? '', ntn: prefillCustomer.ntn ?? '' }
    : EMPTY
  );

  const { customers }              = useCustomers();
  const { data: productCatalogue } = useDb(() => mastersDb.getProductCatalogue());

  useEffect(() => {
    if (open && prefillCustomer) {
      setForm(f => ({ ...f, customer_id: prefillCustomer.customer_id, cnic: prefillCustomer.cnic ?? '', ntn: prefillCustomer.ntn ?? '' }));
    }
    if (!open) setForm({ ...EMPTY, invoiceNo: nextInvNo() });
  }, [open, prefillCustomer]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCustomerChange = (e) => {
    const c = customers.find(cu => cu.customer_id === e.target.value);
    setForm(f => ({ ...f, customer_id: e.target.value, cnic: c?.cnic ?? '', ntn: c?.ntn ?? '' }));
  };

  const qty        = parseFloat(form.qty)  || 0;
  const rate       = parseFloat(form.rate) || 0;
  const subtotal   = qty * rate;
  const taxAmount  = subtotal * TAX_RATE / 100;
  const totalVal   = subtotal + taxAmount;
  const fmt = (n) => n ? n.toLocaleString('en-PK', { maximumFractionDigits: 2 }) : '—';

  const selectedCustomer = customers.find(c => c.customer_id === form.customer_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id || !form.productId || !form.qty || !form.rate) {
      toast.error('Please fill all required fields.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        invoice_id:    form.invoiceNo,
        customer_id:   form.customer_id,
        customer_name: selectedCustomer?.name ?? '',
        cnic:          form.cnic,
        ntn:           form.ntn,
        invoice_date:  form.invoiceDate,
        invoice_type:  form.invoiceType,
        subtotal,
        tax_amount:    taxAmount,
        total_value:   totalVal,
        fbr_status:    'pending',
      };
      const { data, error } = await invoicingDb.addInvoice(payload);
      if (error) throw new Error(error.message);
      toast.success(`Invoice ${form.invoiceNo} created and queued for FBR.`, 'Invoice Created');
      onSave(data || payload);
      setForm({ ...EMPTY, invoiceNo: nextInvNo() });
      onClose();
    } catch (err) {
      toast.error(`Failed to save invoice: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Invoice"
      subtitle="Create and submit to FBR e-invoicing"
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Submitting…' : 'Create & Submit'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Invoice No." value={form.invoiceNo} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Invoice Date *" type="date" value={form.invoiceDate} onChange={set('invoiceDate')} required />

        <div className="ff">
          <SelectField label="Customer *" value={form.customer_id} onChange={handleCustomerChange} required>
            <option value="">— Select customer —</option>
            {customers.map(c => (
              <option key={c.customer_id} value={c.customer_id}>{c.name}{c.region ? ` (${c.region})` : ''}</option>
            ))}
          </SelectField>
        </div>

        {selectedCustomer && (
          <div className="ff" style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
            <span>NTN: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{selectedCustomer.ntn || '—'}</strong></span>
            <span>CNIC: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{selectedCustomer.cnic || '—'}</strong></span>
            <span>Contact: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{selectedCustomer.contact || '—'}</strong></span>
          </div>
        )}

        <Input label="CNIC (Buyer) *"  value={form.cnic} onChange={set('cnic')} placeholder="XXXXX-XXXXXXX-X" required />
        <Input label="NTN *"           value={form.ntn}  onChange={set('ntn')}  placeholder="1234567-8"       required />

        <SelectField label="Invoice Type *" value={form.invoiceType} onChange={set('invoiceType')}>
          <option value="standard">Standard (18% GST)</option>
          <option value="zero_rated">Zero Rated</option>
          <option value="exempt">Exempt</option>
        </SelectField>

        <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

        <div className="ff">
          <SelectField label="Product / Item *" value={form.productId} onChange={set('productId')} required>
            <option value="">— Select product —</option>
            {productCatalogue.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </SelectField>
        </div>

        <Input label="Quantity (kg) *"      type="number" min="0.01" step="0.01" value={form.qty}  onChange={set('qty')}  required />
        <Input label="Rate per kg (PKR) *"  type="number" min="1"    step="0.01" value={form.rate} onChange={set('rate')} required />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sub-total</label>
          <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)' }}>PKR {fmt(subtotal)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tax ({TAX_RATE}% GST)</label>
          <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--orange)' }}>PKR {fmt(taxAmount)}</div>
        </div>
        <div className="ff" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total Value (inc. GST)</label>
          <div style={{ padding: '12px 16px', background: 'var(--blue-muted)', border: '1px solid var(--blue-dim)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>PKR {fmt(totalVal)}</div>
        </div>
      </form>
    </Modal>
  );
}
