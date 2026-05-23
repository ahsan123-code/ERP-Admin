import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { useDb } from '../../hooks/useDb';
import { mastersDb, inventoryDb } from '../../lib/db';

const today = new Date().toISOString().split('T')[0];
const nextBatch = () => 'BT-' + (1060 + Math.floor(Math.random() * 40));

const UNITS = ['Kilogram', 'Ton', 'Piece', 'Meter', 'Sheet', 'Coil'];

export default function NewInwardModal({ open, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    itemId: '', itemCode: '', itemName: '', gauge: '',
    batchNo: nextBatch(), qty: '', unit: 'Kilogram',
    warehouse: '', binLocation: '', poRef: '', receivedDate: today, receivedBy: '',
  });

  const { data: productList }   = useDb(() => mastersDb.getProductCatalogue());
  const { data: warehouseList } = useDb(() => mastersDb.getWarehouses());

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleItemChange = (e) => {
    const prod = productList.find(p => String(p.id) === e.target.value);
    setForm(f => ({ ...f, itemId: e.target.value, itemCode: prod?.code ?? '', itemName: prod?.name ?? '', gauge: prod?.gauge ?? '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.itemId || !form.qty || !form.warehouse) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        item_code:     form.itemCode,
        item_name:     form.itemName,
        batch_no:      form.batchNo,
        quantity:      parseFloat(form.qty),
        unit:          form.unit,
        warehouse:     form.warehouse,
        bin_location:  form.binLocation || null,
        po_ref:        form.poRef || null,
        received_date: form.receivedDate,
        received_by:   form.receivedBy || null,
        status:        'received',
      };
      const { data, error } = await inventoryDb.addInwardRecord(record);
      if (error) throw new Error(error.message);
      toast.success('Stock inward recorded successfully.', 'Inward Created');
      onSave(data);
      setForm({
        itemId: '', itemCode: '', itemName: '', gauge: '',
        batchNo: nextBatch(), qty: '', unit: 'Kilogram',
        warehouse: '', binLocation: '', poRef: '', receivedDate: today, receivedBy: '',
      });
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Stock Inward"
      subtitle="Record incoming material receipt"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Inward'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff">
          <SelectField label="Item *" value={form.itemId} onChange={handleItemChange} required>
            <option value="">— Select item ({productList.length} available) —</option>
            {productList.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </SelectField>
        </div>
        {form.gauge && (
          <div className="ff" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Gauge (auto-detected)</label>
            <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
              {form.gauge}
            </div>
          </div>
        )}
        <Input label="Batch No." value={form.batchNo} onChange={set('batchNo')} />
        <Input label="Quantity *" type="number" min="0.01" step="0.01" value={form.qty} onChange={set('qty')} required />
        <SelectField label="Unit" value={form.unit} onChange={set('unit')}>
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </SelectField>
        <SelectField label="Warehouse *" value={form.warehouse} onChange={set('warehouse')} required>
          <option value="">— Select warehouse —</option>
          {warehouseList.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
        </SelectField>
        <Input label="Bin Location" placeholder="e.g. A-01" value={form.binLocation} onChange={set('binLocation')} />
        <Input label="PO Reference" placeholder="e.g. PO-0020" value={form.poRef} onChange={set('poRef')} />
        <Input label="Received Date" type="date" value={form.receivedDate} onChange={set('receivedDate')} />
        <div className="ff">
          <Input label="Received By" placeholder="Staff name" value={form.receivedBy} onChange={set('receivedBy')} />
        </div>
      </form>
    </Modal>
  );
}
