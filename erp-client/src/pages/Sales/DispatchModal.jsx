import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { salesDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';

const today = new Date().toISOString().split('T')[0];

const EMPTY = {
  delivery_date: today, vehicle_no: '', driver_name: '', driver_mobile: '', dispatched_by: '',
  sale_type: 'credit',
  freight: '0', loading_unloading: '0', packing: '0', toll_tax: '0', slitting: '0',
};

// A "Cash" payment term on the work order means the goods are paid for on the spot;
// anything else (Net 7/15/30…) is a credit sale.
const defaultSaleType = (wo) => (wo?.payment_type === 'Cash' ? 'cash' : 'credit');

const genId = (prefix) => `${prefix}-${String(Date.now()).slice(-6)}`;

export default function DispatchModal({ open, onClose, workOrder, order, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) setForm({ ...EMPTY, sale_type: defaultSaleType(workOrder) });
  }, [open, workOrder]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const subtotal = order?.total_amount ?? 0;
  const charges = ['freight', 'loading_unloading', 'packing', 'toll_tax', 'slitting']
    .reduce((sum, k) => sum + (parseFloat(form[k]) || 0), 0);
  const grandTotal = subtotal + charges;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!workOrder || !order) return;
    if (!form.vehicle_no.trim()) { toast.error('Vehicle number is required.'); return; }

    setSaving(true);
    try {
      const { data: deliveryNote, error: dnErr } = await salesDb.addDeliveryNote({
        delivery_id:   genId('DN'),
        so_ref:        workOrder.so_ref,
        customer_name: workOrder.customer_name,
        delivery_date: form.delivery_date,
        dispatched_by: form.dispatched_by.trim() || null,
        vehicle_no:    form.vehicle_no.trim(),
        status:        'delivered',
        company_id:    companyId,
      });
      if (dnErr) throw new Error(dnErr.message);

      const { data: gatePass, error: gpErr } = await salesDb.addGatePass({
        gate_pass_id:  genId('GP'),
        so_ref:        workOrder.so_ref,
        dn_ref:        deliveryNote.delivery_id,
        customer_name: workOrder.customer_name,
        date:          form.delivery_date,
        vehicle_no:    form.vehicle_no.trim(),
        driver_name:   form.driver_name.trim() || null,
        driver_mobile: form.driver_mobile.trim() || null,
        status:        'issued',
        company_id:    companyId,
      });
      if (gpErr) throw new Error(gpErr.message);

      const { data: invoice, error: invErr } = await salesDb.addSalesInvoice({
        sale_inv_id:        genId('INV'),
        dn_ref:             deliveryNote.delivery_id,
        so_ref:             workOrder.so_ref,
        customer_name:      workOrder.customer_name,
        date:               form.delivery_date,
        subtotal,
        freight:            parseFloat(form.freight) || 0,
        loading_unloading:  parseFloat(form.loading_unloading) || 0,
        packing:            parseFloat(form.packing) || 0,
        toll_tax:           parseFloat(form.toll_tax) || 0,
        slitting:           parseFloat(form.slitting) || 0,
        total_charges:      charges,
        grand_total:        grandTotal,
        sale_type:          form.sale_type,
        status:             'posted',
        company_id:         companyId,
      });
      if (invErr) throw new Error(invErr.message);

      const { data: updatedWorkOrder, error: woErr } = await salesDb.updateWorkOrderStatus(workOrder.id, 'completed');
      if (woErr) throw new Error(woErr.message);

      const { data: updatedOrder, error: ordErr } = await salesDb.updateSalesOrderStatus(order.id, 'dispatched');
      if (ordErr) throw new Error(ordErr.message);

      toast.success(`Order "${order.so_id}" dispatched — delivery, gate pass and invoice created.`, 'Dispatched');
      onSave(deliveryNote, gatePass, invoice, updatedWorkOrder, updatedOrder);
      onClose();
    } catch (err) {
      toast.error(err.message, 'Dispatch Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dispatch Order"
      subtitle={workOrder ? `Work Order ${workOrder.wo_id} — ${workOrder.customer_name}` : ''}
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Dispatching…' : 'Dispatch & Generate Documents'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Delivery Date *" type="date" value={form.delivery_date} onChange={set('delivery_date')} required />
        <SelectField label="Sale Type *" value={form.sale_type} onChange={set('sale_type')}>
          <option value="cash">Cash Sale</option>
          <option value="credit">Credit Sale</option>
        </SelectField>

        <Input label="Dispatched By" value={form.dispatched_by} onChange={set('dispatched_by')} placeholder="Name / employee" />

        <Input label="Vehicle No *"     value={form.vehicle_no}    onChange={set('vehicle_no')}    placeholder="e.g. LEA-1234" required />
        <Input label="Driver Name"      value={form.driver_name}   onChange={set('driver_name')}   placeholder="Driver's name" />
        <Input label="Driver Mobile"    value={form.driver_mobile} onChange={set('driver_mobile')} placeholder="03XX-XXXXXXX" />

        <Input label="Freight (PKR)"           type="number" min="0" value={form.freight}           onChange={set('freight')} />
        <Input label="Loading/Unloading (PKR)" type="number" min="0" value={form.loading_unloading} onChange={set('loading_unloading')} />
        <Input label="Packing (PKR)"           type="number" min="0" value={form.packing}           onChange={set('packing')} />
        <Input label="Toll Tax (PKR)"          type="number" min="0" value={form.toll_tax}          onChange={set('toll_tax')} />
        <Input label="Slitting (PKR)"          type="number" min="0" value={form.slitting}          onChange={set('slitting')} />

        <div className="ff" style={{ display: 'flex', gap: 24, fontSize: 13, background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
          <span>Subtotal: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>PKR {subtotal.toLocaleString('en-PK')}</strong></span>
          <span>Charges: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>PKR {charges.toLocaleString('en-PK')}</strong></span>
          <span>Grand Total: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>PKR {grandTotal.toLocaleString('en-PK')}</strong></span>
        </div>
      </form>
    </Modal>
  );
}
