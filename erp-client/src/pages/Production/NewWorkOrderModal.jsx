import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { mastersDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';

const today = new Date().toISOString().split('T')[0];
const nextWO = () => 'WO-' + String(10 + Math.floor(Math.random() * 90)).padStart(4, '0');

const MACHINES = ['Rolling Mill #1', 'Rolling Mill #2', 'Slitting Machine', 'Shearing Line', 'Cold Draw Bench'];

export default function NewWorkOrderModal({ open, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const { data: productCatalogue } = useDb(() => mastersDb.getProductCatalogue());
  const [form, setForm] = useState({
    workOrderId: nextWO(), productId: '', qty: '',
    startDate: today, endDate: '', assignedMachine: '', notes: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.productId || !form.qty || !form.endDate) {
      toast.error('Please fill in all required fields.');
      return;
    }
    const product = productCatalogue.find(p => String(p.id) === form.productId);
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success(`Work Order ${form.workOrderId} created successfully.`, 'Work Order Created');
      onSave({
        workOrderId: form.workOrderId,
        product: product?.name ?? '—',
        quantity: parseFloat(form.qty),
        startDate: form.startDate,
        endDate: form.endDate,
        rawMaterialsAllocated: false,
        qcPassed: false,
        status: 'in_progress',
      });
      setForm({ workOrderId: nextWO(), productId: '', qty: '', startDate: today, endDate: '', assignedMachine: '', notes: '' });
      onClose();
    }, 700);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Work Order"
      subtitle="Schedule a new production run"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Work Order'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Work Order No." value={form.workOrderId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <div />
        <div className="ff">
          <SelectField label="Product *" value={form.productId} onChange={set('productId')} required>
            <option value="">— Select product —</option>
            {productCatalogue.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </SelectField>
        </div>
        <Input label="Quantity (kg) *" type="number" min="1" value={form.qty} onChange={set('qty')} placeholder="0.00" required />
        <SelectField label="Assigned Machine" value={form.assignedMachine} onChange={set('assignedMachine')}>
          <option value="">— Select machine —</option>
          {MACHINES.map(m => <option key={m} value={m}>{m}</option>)}
        </SelectField>
        <Input label="Start Date *" type="date" value={form.startDate} onChange={set('startDate')} required />
        <Input label="End Date *" type="date" value={form.endDate} onChange={set('endDate')} min={form.startDate} required />
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Notes</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={3}
            placeholder="Special instructions or notes..."
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
