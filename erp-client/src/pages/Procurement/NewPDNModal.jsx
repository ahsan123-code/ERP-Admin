import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { mastersDb, procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCatalogue } from '../../context/CatalogueContext';
import { useCompany } from '../../context/CompanyContext';
import styles from './NewPDNModal.module.css';

const today = new Date().toISOString().split('T')[0];

const FALLBACK_UNITS = ['Kilogram', 'Ton', 'Piece', 'Meter', 'Foot'];

const EMPTY_FORM = { department: '', priority: 'Medium', requiredBy: '', remarks: '' };
const EMPTY_DRAFT = { itemId: '', qty: '', unit: 'Kilogram' };

export default function NewPDNModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);

  const { data: departments } = useDb(() => mastersDb.getDepartments());
  const { data: units }       = useDb(() => mastersDb.getUnits());
  const { items: productCatalogue } = useCatalogue();

  const [form, setForm]       = useState(EMPTY_FORM);
  const [draft, setDraft]     = useState(EMPTY_DRAFT);
  const [lineItems, setLineItems] = useState([]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setDraftField = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));

  const handleDraftItemChange = (e) => {
    const item = productCatalogue.find(p => String(p.id) === e.target.value);
    setDraft(d => ({ ...d, itemId: e.target.value, unit: item?.unit ?? d.unit }));
  };

  const handleAddLineItem = () => {
    if (!draft.itemId) { toast.error('Select an item to add.'); return; }
    if (!draft.qty || Number(draft.qty) <= 0) { toast.error('Enter a valid quantity.'); return; }
    const item = productCatalogue.find(p => String(p.id) === draft.itemId);
    if (!item) return;
    if (lineItems.some(li => li.itemId === item.id)) {
      toast.error(`"${item.name}" is already added.`);
      return;
    }
    setLineItems(prev => [...prev, { itemId: item.id, code: item.code, name: item.name, qty: draft.qty, unit: draft.unit }]);
    setDraft(d => ({ ...EMPTY_DRAFT, unit: d.unit }));
  };

  const handleRemoveLineItem = (itemId) => setLineItems(prev => prev.filter(li => li.itemId !== itemId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.department || !form.requiredBy) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (lineItems.length === 0) {
      toast.error('Add at least one item to the PDN.');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await procurementDb.addPdn({
        pdn_id: 'PDN-' + String(Date.now()).slice(-4).padStart(4, '0'),
        department: form.department,
        pdn_date: today,
        priority: form.priority,
        item_count: lineItems.length,
        status: 'submitted',
        remarks: form.remarks || null,
        company_id: companyId,
      });
      if (error) throw new Error(error.message);

      const { error: lineError } = await procurementDb.addPdnLineItems(
        lineItems.map(li => ({
          pdn_id: data.pdn_id,
          item_name: li.name,
          unit: li.unit,
          quantity: Number(li.qty),
          company_id: companyId,
        }))
      );
      if (lineError) throw new Error(lineError.message);

      toast.success('Purchase Demand Note submitted successfully.', 'PDN Created');
      onSave(data);
      setForm(EMPTY_FORM);
      setDraft(EMPTY_DRAFT);
      setLineItems([]);
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  const availableItems = productCatalogue.filter(p => !lineItems.some(li => li.itemId === p.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Purchase Demand Note"
      subtitle="Raise a material request for procurement"
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit PDN'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <SelectField label="Department *" value={form.department} onChange={set('department')} required>
          <option value="">— Select department —</option>
          {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </SelectField>
        <SelectField label="Priority *" value={form.priority} onChange={set('priority')}>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </SelectField>
        <Input label="Required By *" type="date" value={form.requiredBy} onChange={set('requiredBy')} required />
        <div />

        <div className="ff">
          <label className={styles.itemsLabel}>Items<span className={styles.req}>*</span></label>

          <div className={styles.addItemRow}>
            <SelectField value={draft.itemId} onChange={handleDraftItemChange}>
              <option value="">
                {productCatalogue.length === 0
                  ? '— No items yet, add via New Item —'
                  : availableItems.length === 0
                    ? '— All items added —'
                    : '— Select item —'}
              </option>
              {availableItems.map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </SelectField>
            <Input type="number" min="1" placeholder="Qty" value={draft.qty} onChange={setDraftField('qty')} />
            <SelectField value={draft.unit} onChange={setDraftField('unit')}>
              {units.length > 0
                ? units.map(u => <option key={u.id} value={u.label}>{u.label}</option>)
                : FALLBACK_UNITS.map(u => <option key={u} value={u}>{u}</option>)
              }
            </SelectField>
            <Button type="button" variant="secondary" className={styles.addItemBtn} onClick={handleAddLineItem} icon={<Plus size={14} />}>
              Add
            </Button>
          </div>

          <div className={styles.lineList}>
            {lineItems.length === 0 && (
              <span className={styles.emptyLines}>No items added yet — pick an item, set quantity, and click Add</span>
            )}
            {lineItems.map(li => (
              <div key={li.itemId} className={styles.lineRow}>
                <span className={styles.lineCode}>{li.code}</span>
                <span className={styles.lineName}>{li.name}</span>
                <span className={styles.lineQty}>{li.qty} {li.unit}</span>
                <button
                  type="button"
                  className={styles.lineDel}
                  title={`Remove "${li.name}"`}
                  onClick={() => handleRemoveLineItem(li.itemId)}
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Remarks</label>
          <textarea
            value={form.remarks}
            onChange={set('remarks')}
            rows={3}
            placeholder="Any additional notes..."
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
