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

// Fields shown per item type
const ITEM_CONFIGS = {
  'GI Sheet': [
    { key: 'gauge',  label: 'Gauge / MM', placeholder: 'e.g. 0.25MM' },
    { key: 'size',   label: 'Size',        placeholder: 'e.g. 4×8' },
    { key: 'weight', label: 'Weight (kg)', type: 'number', placeholder: '0.00' },
    { key: 'rate',   label: 'Rate (PKR)',  type: 'number', placeholder: '0.00' },
  ],
  'C Channel': [
    { key: 'length', label: 'Length',      placeholder: 'e.g. 20ft' },
    { key: 'gauge',  label: 'Gauge',       placeholder: 'e.g. 0.30MM' },
    { key: 'weight', label: 'Weight (kg)', type: 'number', placeholder: '0.00' },
    { key: 'rate',   label: 'Rate (PKR)',  type: 'number', placeholder: '0.00' },
  ],
  'Solar Channel': [
    { key: 'size', label: 'Size',       placeholder: 'e.g. 40×40' },
    { key: 'rate', label: 'Rate (PKR)', type: 'number', placeholder: '0.00' },
  ],
  'Workshop Items': [
    { key: 'description', label: 'Description', placeholder: 'Item description' },
    { key: 'rate',        label: 'Rate (PKR)',   type: 'number', placeholder: '0.00' },
  ],
  'Geyser Tanki': [
    { key: 'gauge',  label: 'Gauge',       placeholder: 'e.g. 0.25MM' },
    { key: 'size',   label: 'Size',        placeholder: 'e.g. 30 Gallon' },
    { key: 'weight', label: 'Weight (kg)', type: 'number', placeholder: '0.00' },
    { key: 'rate',   label: 'Rate (PKR)',  type: 'number', placeholder: '0.00' },
  ],
  'Box Control': [
    { key: 'rate', label: 'Rate (PKR)', type: 'number', placeholder: '0.00' },
  ],
  'Top n Bottom': [
    { key: 'size',   label: 'Size',        placeholder: 'e.g. 4×8' },
    { key: 'gauge',  label: 'Gauge',       placeholder: 'e.g. 0.25MM' },
    { key: 'weight', label: 'Weight (kg)', type: 'number', placeholder: '0.00' },
    { key: 'rate',   label: 'Rate (PKR)',  type: 'number', placeholder: '0.00' },
  ],
};

const ITEM_TYPES = Object.keys(ITEM_CONFIGS);

const EMPTY_FIELDS = {
  gauge: '', size: '', weight: '', rate: '', length: '', description: '',
};

export default function NewInwardModal({ open, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [itemType, setItemType] = useState('');
  const [qty, setQty] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [batchNo, setBatchNo] = useState(nextBatch());
  const [receivedDate, setReceivedDate] = useState(today);
  const [fields, setFields] = useState(EMPTY_FIELDS);

  const { data: warehouseList } = useDb(() => mastersDb.getWarehouses());

  const setField = (k) => (e) => setFields(f => ({ ...f, [k]: e.target.value }));

  const handleItemTypeChange = (e) => {
    setItemType(e.target.value);
    setFields(EMPTY_FIELDS);
  };

  const currentFields = itemType ? ITEM_CONFIGS[itemType] : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!itemType || !qty || !warehouse) {
      toast.error('Please fill in item type, quantity and warehouse.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        item_type:         itemType,
        item_name:         itemType,
        quantity_received: parseFloat(qty),
        warehouse,
        batch_no:          batchNo,
        received_date:     receivedDate,
        status:            'received',
        gauge:             fields.gauge       || null,
        size:              fields.size        || null,
        weight:            fields.weight      ? parseFloat(fields.weight)  : null,
        rate:              fields.rate        ? parseFloat(fields.rate)    : null,
        length:            fields.length      || null,
        description:       fields.description || null,
      };
      const { data, error } = await inventoryDb.addInwardRecord(record);
      if (error) throw new Error(error.message);
      toast.success(`${itemType} inward recorded.`, 'Item Added');
      onSave(data);
      // reset
      setItemType('');
      setQty('');
      setWarehouse('');
      setBatchNo(nextBatch());
      setReceivedDate(today);
      setFields(EMPTY_FIELDS);
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
      title="New Item"
      subtitle="Record incoming stock item"
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Item'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>

        {/* Item Type — always shown first */}
        <div className="ff">
          <SelectField label="Item Type *" value={itemType} onChange={handleItemTypeChange} required>
            <option value="">— Select item type —</option>
            {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </SelectField>
        </div>

        {/* Dynamic fields based on item type */}
        {currentFields.map(f => (
          <Input
            key={f.key}
            label={f.label}
            type={f.type ?? 'text'}
            placeholder={f.placeholder}
            value={fields[f.key]}
            onChange={setField(f.key)}
            step={f.type === 'number' ? '0.01' : undefined}
            min={f.type === 'number' ? '0' : undefined}
          />
        ))}

        {/* Universal fields — always shown below item-specific ones */}
        {itemType && (
          <>
            <Input
              label="Quantity *"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0"
              value={qty}
              onChange={e => setQty(e.target.value)}
              required
            />
            <SelectField label="Warehouse *" value={warehouse} onChange={e => setWarehouse(e.target.value)} required>
              <option value="">— Select warehouse —</option>
              {warehouseList.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
            </SelectField>
            <Input label="Batch No." value={batchNo} onChange={e => setBatchNo(e.target.value)} />
            <Input label="Received Date" type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
          </>
        )}

      </form>
    </Modal>
  );
}
