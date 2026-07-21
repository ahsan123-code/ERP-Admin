import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { procurementDb, mastersDb, inventoryDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useCatalogue } from '../../context/CatalogueContext';
import { formatCurrency } from '../../utils/format';
import styles from './NewPDNModal.module.css';

const today = () => new Date().toISOString().split('T')[0];
const genGrnId = () => 'GRN-' + String(Date.now()).slice(-6);

const EMPTY_DRAFT = { product_id: '', product_code: '', product_name: '', ordered_qty: '', received_qty: '', unit: '', unit_price: '' };

export default function NewGrnModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const { items: catalogue } = useCatalogue();
  const [saving, setSaving] = useState(false);
  const [grnId, setGrnId] = useState(genGrnId());
  const [form, setForm] = useState({
    received_date: today(), po_ref: '', gp_ref: '',
    vendor_name: '', received_by: '', warehouse: '', remarks: '',
  });
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [lineItems, setLineItems] = useState([]);

  const { data: purchaseOrders }  = useDb(() => procurementDb.getPurchaseOrders(companyId),   [companyId]);
  const { data: gatePasses }      = useDb(() => procurementDb.getGatePassesInward(companyId), [companyId]);
  const { data: warehouses }      = useDb(() => mastersDb.getWarehouses());

  useEffect(() => {
    if (open) {
      setGrnId(genGrnId());
      setForm({ received_date: today(), po_ref: '', gp_ref: '', vendor_name: '', received_by: '', warehouse: '', remarks: '' });
      setDraft(EMPTY_DRAFT);
      setLineItems([]);
    }
  }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setD = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));

  const handlePoSelect = (poId) => {
    const po = (purchaseOrders || []).find(p => p.po_id === poId);
    setForm(f => ({ ...f, po_ref: poId, vendor_name: po?.vendor_name || f.vendor_name }));
  };

  const handleGpSelect = (gpId) => {
    const gp = (gatePasses || []).find(g => g.gp_id === gpId);
    setForm(f => ({
      ...f, gp_ref: gpId,
      po_ref: f.po_ref || gp?.po_ref || '',
      vendor_name: f.vendor_name || gp?.vendor_name || '',
    }));
  };

  const handleProductSelect = (id) => {
    const p = (catalogue || []).find(c => c.id === id || c.id === Number(id));
    if (!p) { setDraft(d => ({ ...d, product_id: id })); return; }
    setDraft(d => ({ ...d, product_id: id, product_code: p.code, product_name: p.name, unit: p.unit || '' }));
  };

  const addItem = () => {
    if (!draft.product_name || !draft.received_qty) {
      toast.error('Product and received quantity are required.'); return;
    }
    const received_qty = parseFloat(draft.received_qty) || 0;
    const unit_price   = parseFloat(draft.unit_price)   || 0;
    setLineItems(l => [...l, { ...draft, received_qty, ordered_qty: parseFloat(draft.ordered_qty) || 0, unit_price, total_value: received_qty * unit_price }]);
    setDraft(EMPTY_DRAFT);
  };

  const totalValue = lineItems.reduce((s, it) => s + it.total_value, 0);

  const handleSubmit = async () => {
    if (!form.vendor_name) { toast.error('Vendor name is required.'); return; }
    if (!form.warehouse) { toast.error('Select the warehouse where the goods were received.'); return; }
    if (lineItems.length === 0) { toast.error('Add at least one received item.'); return; }

    setSaving(true);
    try {
      const totalQtyReceived = lineItems.reduce((s, it) => s + it.received_qty, 0);
      const { data, error } = await procurementDb.addGrn({
        grn_id:             grnId,
        po_ref:             form.po_ref     || null,
        vendor_name:        form.vendor_name,
        received_date:      form.received_date,
        received_by:        form.received_by || null,
        item_count:         lineItems.length,
        total_qty_received: totalQtyReceived,
        warehouse:          form.warehouse || null,
        status:             'posted',
        company_id:         companyId,
      });
      if (error) throw new Error(error.message);

      try {
        await procurementDb.addGrnLineItems(
          lineItems.map((it, i) => ({
            grn_id: grnId, line_no: i + 1,
            product_code: it.product_code, product_name: it.product_name,
            ordered_qty: it.ordered_qty, received_qty: it.received_qty,
            unit: it.unit, unit_price: it.unit_price, total_value: it.total_value,
            company_id: companyId,
          }))
        );
      } catch (_) { /* grn_line_items may not exist — non-fatal */ }

      // Add the received goods into stock, in the selected warehouse.
      const { error: stockErr } = await inventoryDb.receiveIntoStock(lineItems, form.warehouse, companyId);
      if (stockErr) {
        toast.error(`GRN saved, but stock could not be updated: ${stockErr.message}`, 'Stock Not Updated');
      }

      // Posting a GRN closes the linked PO (goods fully received)
      if (form.po_ref) {
        try { await procurementDb.updatePurchaseOrderStatus(form.po_ref, 'completed'); } catch (_) { /* non-fatal */ }
      }

      const whNote = form.warehouse ? ` Stock updated in ${form.warehouse}.` : '';
      toast.success(`Goods Receipt Note ${grnId} posted.${whNote}`, 'GRN Created');
      onSave({
        ...(data || {}), grn_id: grnId, po_ref: form.po_ref,
        vendor_name: form.vendor_name, received_date: form.received_date,
        item_count: lineItems.length, total_value: totalValue, status: 'posted',
      }, form.po_ref);
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  const poOptions = (purchaseOrders || [])
    .filter(p => ['issued', 'confirmed', 'partially_received'].includes(p.status))
    .map(p => ({ value: p.po_id, label: `${p.po_id} — ${p.vendor_name}`, hint: p.status }));
  const gpOptions = (gatePasses || []).map(g => ({
    value: g.gp_id, label: `${g.gp_id} — ${g.vehicle_no || 'No vehicle'}`, hint: g.driver_name,
  }));
  const productOptions = (catalogue || []).map(c => ({
    value: c.id, label: c.name, hint: c.code,
  }));
  const warehouseOptions = (warehouses || []).map(w => ({ value: w.name || w.id, label: w.name }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Goods Receipt Note"
      subtitle={`${grnId} — Record received goods from vendor`}
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Posting…' : `Post GRN — ${formatCurrency(totalValue)}`}
          </Button>
        </div>
      }
    >
      <div className="fg">
        <Input label="GRN No." value={grnId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Date Received *" type="date" value={form.received_date} onChange={set('received_date')} required />
        <div className="ff">
          <SearchableSelect
            label="Purchase Order Reference"
            placeholder="Link to PO..."
            emptyText="No POs found"
            value={form.po_ref}
            onChange={handlePoSelect}
            options={poOptions}
          />
        </div>
        <div className="ff">
          <SearchableSelect
            label="Gate Pass Reference"
            placeholder="Link to Gate Pass Inward..."
            emptyText="No gate passes"
            value={form.gp_ref}
            onChange={handleGpSelect}
            options={gpOptions}
          />
        </div>
        <Input label="Vendor / Supplier *" value={form.vendor_name} onChange={set('vendor_name')} placeholder="Vendor name" required />
        <Input label="Received By" value={form.received_by} onChange={set('received_by')} placeholder="Store keeper name" />
        {warehouseOptions.length > 0 ? (
          <SelectField label="Warehouse * (received goods added to stock here)" value={form.warehouse} onChange={set('warehouse')} required>
            <option value="">Select warehouse...</option>
            {warehouseOptions.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </SelectField>
        ) : (
          <Input label="Warehouse *" value={form.warehouse} onChange={set('warehouse')} placeholder="e.g. Main Store" required />
        )}
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Remarks</label>
          <textarea
            value={form.remarks}
            onChange={set('remarks')}
            rows={2}
            placeholder="Condition of goods, shortages, damages..."
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 14px',
              fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <span className={styles.itemsLabel}>Items Received <span className={styles.req}>*</span></span>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.6fr 0.6fr 0.6fr 0.8fr auto', gap: 10, alignItems: 'start' }}>
          <SearchableSelect
            placeholder="Select product..."
            emptyText="No products"
            value={draft.product_id}
            onChange={handleProductSelect}
            options={productOptions}
          />
          <Input type="number" min="0" step="0.001" placeholder="Ordered" value={draft.ordered_qty} onChange={setD('ordered_qty')} />
          <Input type="number" min="0.001" step="0.001" placeholder="Received" value={draft.received_qty} onChange={setD('received_qty')} />
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
                <span className={styles.lineCode}>{it.product_code}</span>
                <span className={styles.lineName}>{it.product_name}</span>
                <span className={styles.lineQty}>{it.received_qty}/{it.ordered_qty} {it.unit}</span>
                {it.total_value > 0 && <span className={styles.lineQty} style={{ color: 'var(--green)' }}>{formatCurrency(it.total_value)}</span>}
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
        {lineItems.length > 0 && totalValue > 0 && (
          <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Total Value: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{formatCurrency(totalValue)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
