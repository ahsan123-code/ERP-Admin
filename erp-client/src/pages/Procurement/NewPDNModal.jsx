import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { mastersDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';

const today = new Date().toISOString().split('T')[0];

const FALLBACK_UNITS = ['Kilogram', 'Ton', 'Piece', 'Meter', 'Foot'];

export default function NewPDNModal({ open, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const { data: departments }      = useDb(() => mastersDb.getDepartments());
  const { data: productCatalogue } = useDb(() => mastersDb.getProductCatalogue());
  const { data: units }            = useDb(() => mastersDb.getUnits());
  const [form, setForm] = useState({
    department: '', priority: 'Medium', requiredBy: '', itemId: '',
    qty: '', unit: 'Kilogram', remarks: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleItemChange = (e) => {
    const item = productCatalogue.find(p => String(p.id) === e.target.value);
    setForm(f => ({ ...f, itemId: e.target.value, unit: item?.unit ?? 'Kilogram' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.department || !form.itemId || !form.qty || !form.requiredBy) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success('Purchase Demand Note submitted successfully.', 'PDN Created');
      onSave({
        pdnId: 'PDN-' + String(Date.now()).slice(-4).padStart(4, '0'),
        department: form.department,
        pdnDate: new Date().toISOString().split('T')[0],
        priority: form.priority,
        itemCount: 1,
        status: 'submitted',
      });
      setForm({ department: '', priority: 'Medium', requiredBy: '', itemId: '', qty: '', unit: 'Kilogram', remarks: '' });
      onClose();
    }, 700);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Purchase Demand Note"
      subtitle="Raise a material request for procurement"
      size="md"
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
          <SelectField label="Item *" value={form.itemId} onChange={handleItemChange} required>
            <option value="">— Select item —</option>
            {productCatalogue.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </SelectField>
        </div>
        <Input label="Quantity *" type="number" min="1" value={form.qty} onChange={set('qty')} required />
        <SelectField label="Unit" value={form.unit} onChange={set('unit')}>
          {units.length > 0
            ? units.map(u => <option key={u.id} value={u.label}>{u.label}</option>)
            : FALLBACK_UNITS.map(u => <option key={u} value={u}>{u}</option>)
          }
        </SelectField>
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
