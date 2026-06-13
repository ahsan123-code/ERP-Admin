import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { salesDb } from '../../lib/db';

const today = new Date().toISOString().split('T')[0];

const PAYMENT_TERMS = [
  'Cash', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90',
];

const EMPTY = { po_no: '', payment_term: 'Cash', gst_applied: true, contact_person: '', confirm_date: today };

const genPoNo = () => 'PO-' + String(Date.now()).slice(-6);

export default function ConfirmOrderModal({ open, onClose, order, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) setForm({ ...EMPTY, po_no: genPoNo() });
  }, [open]);

  const set = (k) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!order) return;

    setSaving(true);
    try {
      const { data, error } = await salesDb.addOrderConfirmation({
        confirm_id:     'OC-' + String(Date.now()).slice(-4).padStart(4, '0'),
        so_ref:         order.so_id,
        customer_id:    order.customer_id,
        customer_name:  order.customer_name,
        confirm_date:   form.confirm_date,
        po_no:          form.po_no.trim(),
        contact_person: form.contact_person.trim() || null,
        payment_term:   form.payment_term,
        gst_applied:    form.gst_applied,
        status:         'approved',
      });
      if (error) throw new Error(error.message);

      const { data: updatedOrder, error: updErr } = await salesDb.updateSalesOrderStatus(order.id, 'processing');
      if (updErr) throw new Error(updErr.message);

      const { data: workOrder, error: woErr } = await salesDb.addWorkOrder({
        wo_id:            'WO-' + String(Date.now()).slice(-6),
        so_ref:           order.so_id,
        oc_ref:           data.confirm_id,
        customer_name:    order.customer_name,
        work_order_date:  form.confirm_date,
        payment_type:     form.payment_term,
        po_no:            data.po_no,
        status:           'pending',
      });
      if (woErr) throw new Error(woErr.message);

      toast.success(`Order "${order.so_id}" confirmed and work order created.`, 'Order Confirmed');
      onSave(data, updatedOrder, workOrder);
      onClose();
    } catch (err) {
      toast.error(err.message, 'Confirm Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm Order"
      subtitle={order ? `Order ${order.so_id} — ${order.customer_name}` : ''}
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Confirming…' : 'Confirm Order'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input
          label="PO Number (auto-generated)"
          value={form.po_no}
          onChange={set('po_no')}
          placeholder="e.g. PO-2026-001"
        />
        <SelectField label="Payment Term" value={form.payment_term} onChange={set('payment_term')}>
          {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
        </SelectField>

        <Input
          label="Contact Person"
          value={form.contact_person}
          onChange={set('contact_person')}
          placeholder="Name of customer's representative"
        />
        <Input label="Confirm Date *" type="date" value={form.confirm_date} onChange={set('confirm_date')} required />

        <div className="ff" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <input
            type="checkbox"
            id="gst_applied"
            checked={form.gst_applied}
            onChange={set('gst_applied')}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="gst_applied" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            GST applies to this order
          </label>
        </div>
      </form>
    </Modal>
  );
}
