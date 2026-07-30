import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useCatalogue } from '../../context/CatalogueContext';
import { formatCurrency } from '../../utils/format';
import styles from './NewPDNModal.module.css';

const today = () => new Date().toISOString().split('T')[0];
const genPoId = () => 'PO-' + String(Date.now()).slice(-6);

const EMPTY_DRAFT = { product_id: '', product_code: '', product_name: '', qty: '', unit: '', gauge: '', size: '', unit_price: '' };

export default function NewPurchaseOrderModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const { items: catalogue } = useCatalogue();
  const [saving, setSaving] = useState(false);
  const [poId, setPoId] = useState(genPoId());
  const [form, setForm] = useState({
    po_date: today(), delivery_due_date: '', vendor_id: '', vendor_name: '',
    pr_ref: '', pdn_ref: '', payment_terms: 'Net 30', notes: '',
  });
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [lineItems, setLineItems] = useState([]);

  const { data: vendors }    = useDb(() => procurementDb.getVendors(companyId), [companyId]);
  const { data: pdns }       = useDb(() => procurementDb.getPdns(companyId), [companyId]);
  const { data: requisitions }= useDb(() => procurementDb.getPurchaseRequisitions(companyId), [companyId]);

  useEffect(() => {
    if (open) {
      setPoId(genPoId());
      setForm({ po_date: today(), delivery_due_date: '', vendor_id: '', vendor_name: '', pr_ref: '', pdn_ref: '', payment_terms: 'Net 30', notes: '' });
      setDraft(EMPTY_DRAFT);
      setLineItems([]);
    }
  }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setD = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));

  const handleVendorSelect = (id) => {
    const v = (vendors || []).find(v => v.id === id || v.id === Number(id));
    setForm(f => ({ ...f, vendor_id: id, vendor_name: v?.name || '' }));
  };

  const handleProductSelect = (id) => {
    const p = (catalogue || []).find(c => c.id === id || c.id === Number(id));
    if (!p) { setDraft(d => ({ ...d, product_id: id })); return; }
    setDraft(d => ({
      ...d, product_id: id, product_code: p.code, product_name: p.name,
      unit: p.unit || '', gauge: p.gauge || '', size: p.default_size || '',
    }));
  };

  const addItem = () => {
    if (!draft.product_name || !draft.qty || !draft.unit_price) {
      toast.error('Product, quantity, and unit price are required.'); return;
    }
    const qty        = parseFloat(draft.qty) || 0;
    const unit_price = parseFloat(draft.unit_price) || 0;
    setLineItems(l => [...l, { ...draft, qty, unit_price, total_price: qty * unit_price }]);
    setDraft(EMPTY_DRAFT);
  };

  const totalAmount = lineItems.reduce((s, it) => s + it.total_price, 0);

  const handleSubmit = async () => {
    if (!form.vendor_name) { toast.error('Select a vendor.'); return; }
    if (!form.delivery_due_date) { toast.error('Delivery due date is required.'); return; }
    if (lineItems.length === 0) { toast.error('Add at least one line item.'); return; }

    setSaving(true);
    try {
      const { data, error } = await procurementDb.addPurchaseOrder({
        po_id:             poId,
        pr_ref:            form.pr_ref || null,
        vendor_name:       form.vendor_name,
        po_date:           form.po_date,
        delivery_due_date: form.delivery_due_date,
        item_count:        lineItems.length,
        total_amount:      totalAmount,
        status:            'issued',
        company_id:        companyId,
      });
      if (error) throw new Error(error.message);

      // Column names must match po_line_items exactly (item_code/item_name/quantity).
      // An earlier version wrote product_code/product_name/qty, which the table does
      // not have, so every line item was rejected and thrown away — and because
      // supabase-js *returns* errors rather than throwing them, the try/catch that
      // wrapped this never fired and the failure was invisible.
      const { error: lineError } = await procurementDb.addPoLineItems(
        lineItems.map((it, i) => ({
          po_id: poId, line_no: i + 1,
          item_code: it.product_code, item_name: it.product_name,
          quantity: it.qty, unit: it.unit,
          gauge: it.gauge || null, size: it.size || null,
          unit_price: it.unit_price, total_price: it.total_price,
          company_id: companyId,
        }))
      );
      if (lineError) {
        toast.error(
          `PO ${poId} was issued, but its line items could not be saved: ${lineError.message}`,
          'Line Items Not Saved',
        );
      } else {
        toast.success(`Purchase Order ${poId} issued for ${form.vendor_name}.`, 'PO Created');
      }
      onSave({
        ...(data || {}), po_id: poId, vendor_name: form.vendor_name,
        po_date: form.po_date, delivery_due_date: form.delivery_due_date,
        item_count: lineItems.length, total_amount: totalAmount, status: 'issued',
      });
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  const vendorOptions = (vendors || []).map(v => ({
    value: v.id, label: v.name, hint: v.category,
  }));
  // Name as the label, code as the hint: the label column ellipsises, so a long code
  // prefix would eat the width and cut the name off. The hint still shows the code and
  // is searchable, so picking by code keeps working.
  const productOptions = (catalogue || []).map(c => ({
    value: c.id, label: c.name, search: c.code,
  }));
  const prOptions = (requisitions || []).map(r => ({
    value: r.pr_id, label: `${r.pr_id} — ${r.department}`, hint: r.priority,
  }));
  const pdnOptions = (pdns || []).map(p => ({
    value: p.pdn_id, label: `${p.pdn_id} — ${p.department}`, hint: p.priority,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Purchase Order"
      subtitle={`${poId} — Issue a direct purchase order to a vendor`}
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Issuing…' : `Issue PO — ${formatCurrency(totalAmount)}`}
          </Button>
        </div>
      }
    >
      <div className="fg">
        <Input label="PO No." value={poId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="PO Date *" type="date" value={form.po_date} onChange={set('po_date')} required />
        <Input label="Delivery Due Date *" type="date" value={form.delivery_due_date} onChange={set('delivery_due_date')} required />
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
            label="Vendor *"
            required
            placeholder="Search vendors..."
            emptyText="No vendors found"
            value={form.vendor_id}
            onChange={handleVendorSelect}
            options={vendorOptions}
          />
        </div>
        <div className="ff">
          <SearchableSelect
            label="Requisition Reference (Optional)"
            placeholder="Link to a PR..."
            emptyText="No requisitions"
            value={form.pr_ref}
            onChange={v => setForm(f => ({ ...f, pr_ref: v }))}
            options={prOptions}
          />
        </div>
        <div className="ff">
          <SearchableSelect
            label="PDN Reference (Optional)"
            placeholder="Link to a PDN..."
            emptyText="No PDNs"
            value={form.pdn_ref}
            onChange={v => setForm(f => ({ ...f, pdn_ref: v }))}
            options={pdnOptions}
          />
        </div>
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Notes</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="Special instructions or terms..."
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 14px',
              fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <span className={styles.itemsLabel}>Line Items <span className={styles.req}>*</span></span>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 0.7fr 0.9fr auto', gap: 10, alignItems: 'start' }}>
          <SearchableSelect
            placeholder="Select product..."
            emptyText="No products"
            value={draft.product_id}
            onChange={handleProductSelect}
            options={productOptions}
          />
          <Input type="number" min="0.001" step="0.001" placeholder="Qty" value={draft.qty} onChange={setD('qty')} />
          <Input placeholder="Unit" value={draft.unit} onChange={setD('unit')} />
          <Input type="number" min="0" step="0.01" placeholder="Unit Price" value={draft.unit_price} onChange={setD('unit_price')} />
          <Button
            style={{ height: 38, marginTop: 0 }}
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={addItem}
            type="button"
          >
            Add
          </Button>
        </div>
        <div className={styles.lineList}>
          {lineItems.length === 0
            ? <p className={styles.emptyLines}>No items added yet.</p>
            : lineItems.map((it, i) => (
              <div key={i} className={styles.lineRow}>
                <span className={styles.lineName}>{it.product_name}</span>
                <span className={styles.lineQty}>{it.qty} {it.unit}</span>
                <span className={styles.lineQty} style={{ color: 'var(--green)' }}>{formatCurrency(it.total_price)}</span>
                <button
                  type="button"
                  className={styles.lineDel}
                  onClick={() => setLineItems(l => l.filter((_, j) => j !== i))}
                >
                  <Trash2 size={11} strokeWidth={2} />
                </button>
              </div>
            ))}
        </div>
        {lineItems.length > 0 && (
          <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Total: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{formatCurrency(totalAmount)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
