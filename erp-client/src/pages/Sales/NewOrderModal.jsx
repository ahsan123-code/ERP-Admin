import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { salesDb, mastersDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';

const today = new Date().toISOString().split('T')[0];

const EMPTY_ORDER = { customer_id: '', orderDate: today, deliveryDate: '', productId: '', qty: '', ratePerKg: '', remarks: '' };

export default function NewOrderModal({ open, onClose, onSave, prefillCustomer }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_ORDER);

  const { data: customers }        = useDb(() => salesDb.getCustomers());
  const { data: productCatalogue } = useDb(() => mastersDb.getProductCatalogue());

  useEffect(() => {
    if (open && prefillCustomer) {
      setForm(f => ({ ...f, customer_id: prefillCustomer.customer_id }));
    }
    if (!open) setForm(EMPTY_ORDER);
  }, [open, prefillCustomer]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const selectedCustomer = customers.find(c => c.customer_id === form.customer_id);

  const totalValue = form.qty && form.ratePerKg
    ? (parseFloat(form.qty) * parseFloat(form.ratePerKg)).toLocaleString('en-PK', { maximumFractionDigits: 0 })
    : '—';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customer_id || !form.productId || !form.qty || !form.ratePerKg || !form.deliveryDate) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success(`Sales order for ${selectedCustomer?.name} created.`, 'Order Created');
      onSave({
        so_id:         'SO-' + String(Date.now()).slice(-4).padStart(4, '0'),
        customer_name: selectedCustomer?.name ?? '—',
        order_date:    form.orderDate,
        delivery_date: form.deliveryDate,
        item_count:    1,
        total_amount:  parseFloat(form.qty) * parseFloat(form.ratePerKg),
        status:        'pending',
      });
      setForm({ customer_id: '', orderDate: today, deliveryDate: '', productId: '', qty: '', ratePerKg: '', remarks: '' });
      onClose();
    }, 700);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Sales Order"
      subtitle="Create a customer order"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Order'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff">
          <SelectField label="Customer *" value={form.customer_id} onChange={set('customer_id')} required>
            <option value="">— Select customer —</option>
            {customers.map(c => (
              <option key={c.customer_id} value={c.customer_id}>{c.name} ({c.region})</option>
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

        <Input label="Order Date *"    type="date" value={form.orderDate}    onChange={set('orderDate')} required />
        <Input label="Delivery Date *" type="date" value={form.deliveryDate} onChange={set('deliveryDate')} min={form.orderDate} required />

        <div className="ff">
          <SelectField label="Product *" value={form.productId} onChange={set('productId')} required>
            <option value="">— Select product —</option>
            {productCatalogue.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </SelectField>
        </div>

        <Input label="Quantity (kg) *"      type="number" min="1"   value={form.qty}       onChange={set('qty')}       placeholder="0"    required />
        <Input label="Rate per kg (PKR) *"  type="number" min="1"   value={form.ratePerKg} onChange={set('ratePerKg')} placeholder="0.00" required />

        <div className="ff" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total Value</label>
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            PKR {totalValue}
          </div>
        </div>

        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Remarks</label>
          <textarea
            value={form.remarks}
            onChange={set('remarks')}
            rows={3}
            placeholder="Delivery instructions, special requirements..."
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 14px',
              fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </form>
    </Modal>
  );
}
