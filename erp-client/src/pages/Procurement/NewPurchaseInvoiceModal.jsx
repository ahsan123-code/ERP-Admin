import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/format';

const today = () => new Date().toISOString().split('T')[0];
const genBillId = () => 'PBILL-' + String(Date.now()).slice(-5);

export default function NewPurchaseInvoiceModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [billId, setBillId] = useState(genBillId());
  const [form, setForm] = useState({
    bill_date: today(), bill_no: '', po_ref: '', grn_ref: '',
    vendor_name: '', items_total: '', tax_amount: '', grand_total: '',
    payment_terms: 'Net 30', due_date: '', notes: '',
  });

  const { data: purchaseOrders } = useDb(() => procurementDb.getPurchaseOrders(companyId), [companyId]);
  const { data: grns }           = useDb(() => procurementDb.getGrns(companyId),           [companyId]);

  useEffect(() => {
    if (open) {
      setBillId(genBillId());
      setForm({
        bill_date: today(), bill_no: '', po_ref: '', grn_ref: '',
        vendor_name: '', items_total: '', tax_amount: '', grand_total: '',
        payment_terms: 'Net 30', due_date: '', notes: '',
      });
    }
  }, [open]);

  const set = (k) => (e) => setForm(f => {
    const next = { ...f, [k]: e.target.value };
    // Auto-compute grand total when items_total or tax_amount changes
    if (k === 'items_total' || k === 'tax_amount') {
      const base = parseFloat(k === 'items_total' ? e.target.value : f.items_total) || 0;
      const tax  = parseFloat(k === 'tax_amount'  ? e.target.value : f.tax_amount)  || 0;
      next.grand_total = (base + tax).toFixed(2);
    }
    return next;
  });

  const handlePoSelect = (poId) => {
    const po = (purchaseOrders || []).find(p => p.po_id === poId);
    setForm(f => ({
      ...f, po_ref: poId,
      vendor_name:  f.vendor_name  || po?.vendor_name  || '',
      items_total:  f.items_total  || String(po?.total_amount || ''),
      grand_total:  f.grand_total  || String((parseFloat(po?.total_amount || 0) + parseFloat(f.tax_amount || 0)).toFixed(2)),
    }));
  };

  const handleGrnSelect = (grnId) => {
    const grn = (grns || []).find(g => g.grn_id === grnId);
    setForm(f => ({
      ...f, grn_ref: grnId,
      vendor_name:  f.vendor_name  || grn?.vendor_name  || '',
      po_ref:       f.po_ref       || grn?.po_ref        || '',
      items_total:  f.items_total  || String(grn?.total_value || ''),
      grand_total:  f.grand_total  || String((parseFloat(grn?.total_value || 0) + parseFloat(f.tax_amount || 0)).toFixed(2)),
    }));
  };

  const handleSubmit = async () => {
    if (!form.vendor_name) { toast.error('Vendor name is required.'); return; }
    if (!form.grand_total) { toast.error('Grand total is required.'); return; }
    if (!form.bill_date)   { toast.error('Bill date is required.'); return; }

    const itemsTotal  = parseFloat(form.items_total)  || 0;
    const taxAmount   = parseFloat(form.tax_amount)   || 0;
    const grandTotal  = parseFloat(form.grand_total)  || 0;

    setSaving(true);
    try {
      const { data, error } = await procurementDb.addPurchaseInvoice({
        bill_id:       billId,
        bill_no:       form.bill_no      || null,
        po_ref:        form.po_ref       || null,
        grn_ref:       form.grn_ref      || null,
        vendor_name:   form.vendor_name,
        bill_date:     form.bill_date,
        due_date:      form.due_date     || null,
        payment_terms: form.payment_terms,
        items_total:   itemsTotal,
        tax_amount:    taxAmount,
        grand_total:   grandTotal,
        notes:         form.notes        || null,
        status:        'unpaid',
        company_id:    companyId,
      });
      if (error) throw new Error(error.message);
      toast.success(`Purchase Invoice ${billId} recorded.`, 'Bill Created');
      onSave({
        ...(data || {}), bill_id: billId, vendor_name: form.vendor_name,
        bill_date: form.bill_date, grand_total: grandTotal,
        po_ref: form.po_ref, grn_ref: form.grn_ref, status: 'unpaid',
      });
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  const poOptions  = (purchaseOrders || []).map(p => ({
    value: p.po_id, label: `${p.po_id} — ${p.vendor_name}`, hint: formatCurrency(p.total_amount),
  }));
  const grnOptions = (grns || []).map(g => ({
    value: g.grn_id, label: `${g.grn_id} — ${g.vendor_name || ''}`, hint: g.received_date,
  }));

  const grandTotal  = parseFloat(form.grand_total)  || 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Purchase Invoice"
      subtitle={`${billId} — Record vendor bill / purchase invoice`}
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : `Record Bill — ${formatCurrency(grandTotal)}`}
          </Button>
        </div>
      }
    >
      <div className="fg">
        <Input label="Bill ID" value={billId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Vendor Invoice No." value={form.bill_no} onChange={set('bill_no')} placeholder="Vendor's own invoice number" />
        <Input label="Bill Date *" type="date" value={form.bill_date} onChange={set('bill_date')} required />
        <Input label="Due Date" type="date" value={form.due_date} onChange={set('due_date')} />
        <Input label="Vendor / Supplier *" value={form.vendor_name} onChange={set('vendor_name')} placeholder="Vendor name" required />
        <SelectField label="Payment Terms" value={form.payment_terms} onChange={set('payment_terms')}>
          <option value="Advance">Advance</option>
          <option value="Net 15">Net 15</option>
          <option value="Net 30">Net 30</option>
          <option value="Net 45">Net 45</option>
          <option value="Net 60">Net 60</option>
          <option value="COD">COD</option>
        </SelectField>
        <div className="ff">
          <SearchableSelect
            label="Purchase Order Reference"
            placeholder="Link to PO..."
            emptyText="No POs"
            value={form.po_ref}
            onChange={handlePoSelect}
            options={poOptions}
          />
        </div>
        <div className="ff">
          <SearchableSelect
            label="GRN Reference"
            placeholder="Link to GRN..."
            emptyText="No GRNs"
            value={form.grn_ref}
            onChange={handleGrnSelect}
            options={grnOptions}
          />
        </div>
        <Input
          label="Items Total (PKR) *"
          type="number" min="0" step="0.01"
          value={form.items_total} onChange={set('items_total')}
          placeholder="Net amount before tax"
        />
        <Input
          label="Tax / GST (PKR)"
          type="number" min="0" step="0.01"
          value={form.tax_amount} onChange={set('tax_amount')}
          placeholder="0.00"
        />
        <Input
          label="Grand Total (PKR) *"
          type="number" min="0" step="0.01"
          value={form.grand_total} onChange={set('grand_total')}
          placeholder="Auto-calculated from above"
          style={grandTotal > 0 ? { fontWeight: 700, color: 'var(--text-primary)' } : {}}
        />
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Notes</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="Any additional notes about this purchase..."
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 14px',
              fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </div>
    </Modal>
  );
}
