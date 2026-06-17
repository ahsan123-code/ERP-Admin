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
import styles from './NewPDNModal.module.css';

const today = () => new Date().toISOString().split('T')[0];
const genPrId = () => 'PR-' + String(Date.now()).slice(-6);

const EMPTY_DRAFT = { product_id: '', product_code: '', product_name: '', qty: '', unit: '' };

export default function NewPurchaseRequisitionModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const { items: catalogue } = useCatalogue();
  const [saving, setSaving] = useState(false);
  const [prId, setPrId] = useState(genPrId());
  const [form, setForm] = useState({ date: today(), department: '', priority: 'Medium', requested_by: '', pdn_ref: '', notes: '' });
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [lineItems, setLineItems] = useState([]);

  const { data: pdns } = useDb(() => procurementDb.getPdns(companyId), [companyId]);

  useEffect(() => {
    if (open) {
      setPrId(genPrId());
      setForm({ date: today(), department: '', priority: 'Medium', requested_by: '', pdn_ref: '', notes: '' });
      setDraft(EMPTY_DRAFT);
      setLineItems([]);
    }
  }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setD = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));

  const handleProductSelect = (id) => {
    const p = catalogue.find(c => c.id === id || c.id === Number(id));
    if (!p) { setDraft(d => ({ ...d, product_id: id })); return; }
    setDraft(d => ({ ...d, product_id: id, product_code: p.code, product_name: p.name, unit: p.unit || '' }));
  };

  const addItem = () => {
    if (!draft.product_name || !draft.qty) {
      toast.error('Select a product and enter quantity.'); return;
    }
    setLineItems(l => [...l, { ...draft, qty: parseFloat(draft.qty) || 0 }]);
    setDraft(EMPTY_DRAFT);
  };

  const handleSubmit = async () => {
    if (!form.department) {
      toast.error('Department is required.'); return;
    }
    if (lineItems.length === 0) {
      toast.error('Add at least one item to the requisition.'); return;
    }
    setSaving(true);
    try {
      const { data, error } = await procurementDb.addPurchaseRequisition({
        pr_id: prId,
        pdn_ref: form.pdn_ref || null,
        department: form.department,
        date: form.date,
        status: 'submitted',
        item_count: lineItems.length,
      });
      if (error) throw new Error(error.message);

      // Try inserting line items — silently skip if table absent
      try {
        await procurementDb.addPrLineItems(
          lineItems.map((it, i) => ({
            pr_id: prId, line_no: i + 1,
            product_code: it.product_code, product_name: it.product_name,
            qty: it.qty, unit: it.unit,
          }))
        );
      } catch (_) { /* non-fatal if pr_line_items table doesn't exist */ }

      toast.success(`Purchase Requisition ${prId} submitted.`, 'PR Created');
      onSave({ ...(data || {}), pr_id: prId, status: 'submitted', item_count: lineItems.length, department: form.department, date: form.date });
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  const productOptions = (catalogue || []).map(c => ({
    value: c.id,
    label: `${c.code} — ${c.name}`,
    hint: c.unit,
  }));

  const pdnOptions = (pdns || []).map(p => ({
    value: p.pdn_id,
    label: `${p.pdn_id} — ${p.department}`,
    hint: p.priority,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Purchase Requisition"
      subtitle={`${prId} — Request materials for purchase`}
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit Requisition'}
          </Button>
        </div>
      }
    >
      <div className="fg">
        <Input label="PR No." value={prId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <Input label="Department *" value={form.department} onChange={set('department')} placeholder="e.g. Production, Store" required />
        <Input label="Requested By *" value={form.requested_by} onChange={set('requested_by')} placeholder="Employee name or designation" required />
        <SelectField label="Priority" value={form.priority} onChange={set('priority')}>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </SelectField>
        <div className="ff">
          <SearchableSelect
            label="PDN Reference (Optional)"
            placeholder="Link to a Purchase Demand Note..."
            emptyText="No PDNs found"
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
            placeholder="Additional notes or justification..."
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 14px',
              fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <span className={styles.itemsLabel}>Items Requested <span className={styles.req}>*</span></span>
        <div className={styles.addItemRow}>
          <SearchableSelect
            placeholder="Select product from catalogue..."
            emptyText="No products found"
            value={draft.product_id}
            onChange={handleProductSelect}
            options={productOptions}
          />
          <Input type="number" min="0.001" step="0.001" placeholder="Qty" value={draft.qty} onChange={setD('qty')} />
          <Input placeholder="Unit" value={draft.unit} onChange={setD('unit')} />
          <Button className={styles.addItemBtn} variant="secondary" icon={<Plus size={14} />} onClick={addItem} type="button">
            Add
          </Button>
        </div>
        <div className={styles.lineList}>
          {lineItems.length === 0
            ? <p className={styles.emptyLines}>No items added yet. Add at least one product.</p>
            : lineItems.map((it, i) => (
              <div key={i} className={styles.lineRow}>
                <span className={styles.lineCode}>{it.product_code}</span>
                <span className={styles.lineName}>{it.product_name}</span>
                <span className={styles.lineQty}>{it.qty} {it.unit}</span>
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
      </div>
    </Modal>
  );
}
