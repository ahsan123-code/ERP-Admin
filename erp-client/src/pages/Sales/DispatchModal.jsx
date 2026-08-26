import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { salesDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/format';
import styles from '../Procurement/NewPDNModal.module.css';

const today = new Date().toISOString().split('T')[0];

// The charge fields the printed sale bill breaks out, in the order it lists them.
const CHARGE_FIELDS = [
  ['bending',           'Bending (PKR)'],
  ['freight',           'Freight (PKR)'],
  ['loading_unloading', 'Loading & Unloading (PKR)'],
  ['cutting',           'Cutting (PKR)'],
  ['labour',            'Labour (PKR)'],
  ['packing',           'Packing (PKR)'],
  ['toll_tax',          'Toll Tax (PKR)'],
  ['slitting',          'Slitting (PKR)'],
  ['other_charges',     'Other Charges (PKR)'],
];

const EMPTY = {
  delivery_date: today, vehicle_no: '', driver_name: '', driver_mobile: '', dispatched_by: '',
  sale_type: 'credit', gst_rate: '0', manual_bill_no: '',
  ...Object.fromEntries(CHARGE_FIELDS.map(([k]) => [k, '0'])),
};

// The number written on the physical bill book, printed on the sale bill as "Book #".
// 19,503 of the 24,021 imported invoices carry one and the client still writes them, but
// nothing in the app ever set it, so every bill raised here printed that line blank.
// It stays optional: the second branch's 4,491 invoices have none at all. The numbers
// repeat across books over the years — 5,797 distinct values across 19,503 rows — so it
// is free text with no uniqueness check, which would fire constantly on legitimate reuse.
const MANUAL_BILL_NO_MAX = 20;

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

  // The order's items, so the invoice this dispatch generates can state what was
  // sold instead of a bare subtotal. A multi-item order used to lose every line
  // at this point, because nothing was carried from the order onto the invoice.
  const soRef = workOrder?.so_ref;
  const { data: orderLines } = useDb(
    () => salesDb.getSoLineItems(soRef ? [soRef] : []),
    [soRef],
  );

  const subtotal = order?.total_amount ?? 0;
  const charges = CHARGE_FIELDS.reduce((sum, [k]) => sum + (parseFloat(form[k]) || 0), 0);
  // GST is charged on the goods and the services billed with them, which is what the
  // subtotal and charges together are — not on the goods alone.
  const gstRate   = parseFloat(form.gst_rate) || 0;
  const gstAmount = Math.round((subtotal + charges) * gstRate) / 100;
  const grandTotal = subtotal + charges + gstAmount;

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
        manual_bill_no:     form.manual_bill_no.trim() || null,
        subtotal,
        ...Object.fromEntries(CHARGE_FIELDS.map(([k]) => [k, parseFloat(form[k]) || 0])),
        total_charges:      charges,
        gst_rate:           gstRate,
        gst_amount:         gstAmount,
        grand_total:        grandTotal,
        sale_type:          form.sale_type,
        status:             'posted',
        company_id:         companyId,
      });
      if (invErr) throw new Error(invErr.message);

      // Copy the order's items onto the invoice. Snapshotting rather than joining
      // back to so_line_items keeps the invoice truthful if the order is edited
      // afterwards — an issued invoice must not change retroactively.
      if (orderLines.length > 0) {
        const { error: itemErr } = await salesDb.addSalesInvoiceItems(
          orderLines.map((l, i) => ({
            sale_inv_id: invoice.sale_inv_id,
            line_no:     l.line_no ?? i + 1,
            item_name:   l.item_name,
            unit:        l.unit  || null,
            gauge:        l.gauge || null,
            size:         l.size  || null,
            coils_rolls:  l.coils_rolls  ?? null,
            no_of_sheets: l.no_of_sheets ?? null,
            quantity:    parseFloat(l.quantity) || 0,
            unit_price:  parseFloat(l.unit_price) || 0,
            total_price: parseFloat(l.total_price) || (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0),
            company_id:  companyId,
          }))
        );
        if (itemErr) {
          toast.error(
            `Invoice ${invoice.sale_inv_id} was created, but its item detail could not be saved: ${itemErr.message}`,
            'Item Detail Not Saved',
          );
        }
      }

      // Post the invoice to the ledger (AR debit / sales + charges credit). The invoice
      // row is already saved by this point, so a posting failure must not discard it —
      // report it instead, since an unposted invoice needs to be corrected by hand.
      let postingError = null;
      try {
        await salesDb.postSalesInvoiceVoucher({ invoice, companyId });
      } catch (postErr) {
        postingError = postErr;
      }

      const { data: updatedWorkOrder, error: woErr } = await salesDb.updateWorkOrderStatus(workOrder.id, 'completed');
      if (woErr) throw new Error(woErr.message);

      const { data: updatedOrder, error: ordErr } = await salesDb.updateSalesOrderStatus(order.id, 'dispatched');
      if (ordErr) throw new Error(ordErr.message);

      if (postingError) {
        toast.error(
          `Order "${order.so_id}" dispatched and invoiced, but the ledger entry failed: ${postingError.message}. The customer's balance will not reflect this invoice until it is posted.`,
          'Invoice Not Posted to Ledger',
        );
      } else {
        toast.success(`Order "${order.so_id}" dispatched — delivery, gate pass and invoice created and posted.`, 'Dispatched');
      }
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

        <Input
          label="Manual Bill No. (Book #)"
          value={form.manual_bill_no}
          onChange={set('manual_bill_no')}
          placeholder="e.g. 48-2"
          maxLength={MANUAL_BILL_NO_MAX}
          hint="From the physical bill book — prints on the sale bill. Leave blank if unused; you can fill it in later from Invoicing."
        />

        <Input label="Dispatched By" value={form.dispatched_by} onChange={set('dispatched_by')} placeholder="Name / employee" />

        <Input label="Vehicle No *"     value={form.vehicle_no}    onChange={set('vehicle_no')}    placeholder="e.g. LEA-1234" required />
        <Input label="Driver Name"      value={form.driver_name}   onChange={set('driver_name')}   placeholder="Driver's name" />
        <Input label="Driver Mobile"    value={form.driver_mobile} onChange={set('driver_mobile')} placeholder="03XX-XXXXXXX" />

        {CHARGE_FIELDS.map(([key, label]) => (
          <Input key={key} label={label} type="number" min="0" value={form[key]} onChange={set(key)} />
        ))}
        <Input label="GST (%)" type="number" min="0" max="100" step="0.01"
               value={form.gst_rate} onChange={set('gst_rate')} />

        <div className="ff">
          <span className={styles.itemsLabel}>
            Items Being Invoiced
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
              from order {soRef} — edit the order to change these
            </span>
          </span>
          <div className={styles.lineList} style={{ marginTop: 0 }}>
            {orderLines.length === 0
              ? <p className={styles.emptyLines}>This order has no stored item detail — the invoice will carry totals only.</p>
              : orderLines.map((l, i) => (
                <div key={i} className={styles.lineRow}>
                  <span className={styles.lineName}>{l.item_name}</span>
                  <span className={styles.lineQty}>{l.quantity} {l.unit}</span>
                  <span className={styles.lineQty}>@ {formatCurrency(l.unit_price)}</span>
                  <span className={styles.lineQty} style={{ color: 'var(--green)' }}>
                    {formatCurrency(l.total_price || (l.quantity || 0) * (l.unit_price || 0))}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="ff" style={{ display: 'flex', gap: 24, fontSize: 13, background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
          <span>Subtotal: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>PKR {subtotal.toLocaleString('en-PK')}</strong></span>
          <span>Charges: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>PKR {charges.toLocaleString('en-PK')}</strong></span>
          <span>GST: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>PKR {gstAmount.toLocaleString('en-PK')}</strong></span>
          <span>Grand Total: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>PKR {grandTotal.toLocaleString('en-PK')}</strong></span>
        </div>
      </form>
    </Modal>
  );
}
