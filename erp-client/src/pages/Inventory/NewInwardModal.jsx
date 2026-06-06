import { useState, useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { useDb } from '../../hooks/useDb';
import { mastersDb, inventoryDb } from '../../lib/db'; import { useCompany } from '../../context/CompanyContext';
import styles from './NewInwardModal.module.css';

const today = new Date().toISOString().split('T')[0];
const nextBatch = () => 'BT-' + (1060 + Math.floor(Math.random() * 40));

// Same two fields for every item type — built-in or custom
const ITEM_FIELDS = [
  { key: 'size', label: 'Size', placeholder: 'e.g. 4×8' },
  { key: 'gauge', label: 'Gauge / MM', placeholder: 'e.g. 0.25MM' },
];

const COMPANY_ITEMS = {
  1: ['GI Sheet', 'C Channel'],
  2: ['Solar Channel', 'Workshop Items', 'Geyser Tanki', 'Box Control', 'Top n Bottom'],
};

const EMPTY_FIELDS = { size: '', gauge: '' };

// ── Custom dropdown ───────────────────────────────────────────────────────
function ItemTypeDropdown({ value, onChange, builtinItems, customTypes, onDeleteCustom, deletingId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = (name) => { onChange(name); setOpen(false); };

  return (
    <div className={styles.ddWrap} ref={ref}>
      <button
        type="button"
        className={`${styles.ddTrigger} ${open ? styles.ddTriggerOpen : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className={value ? styles.ddValueSelected : styles.ddValuePlaceholder}>
          {value || '— Select item type —'}
        </span>
        <span className={`${styles.ddArrow} ${open ? styles.ddArrowOpen : ''}`}>▾</span>
      </button>

      {open && (
        <div className={styles.ddPanel}>
          {builtinItems.length > 0 && (
            <>
              <div className={styles.ddGroupLabel}>Built-in</div>
              {builtinItems.map(name => (
                <div
                  key={name}
                  className={`${styles.ddOption} ${value === name ? styles.ddOptionActive : ''}`}
                  onClick={() => select(name)}
                >
                  <span className={styles.ddOptionName}>{name}</span>
                </div>
              ))}
            </>
          )}

          {customTypes.length > 0 && (
            <>
              <div className={styles.ddGroupLabel}>Custom</div>
              {customTypes.map(t => (
                <div
                  key={t.id}
                  className={`${styles.ddOption} ${value === t.name ? styles.ddOptionActive : ''}`}
                  onClick={() => select(t.name)}
                >
                  <span className={styles.ddOptionName}>{t.name}</span>
                  <button
                    type="button"
                    className={styles.ddDeleteBtn}
                    disabled={deletingId === t.id}
                    onClick={(e) => { e.stopPropagation(); onDeleteCustom(t.id, t.name); }}
                    title={`Remove "${t.name}"`}
                  >
                    {deletingId === t.id ? '…' : <Trash2 size={13} strokeWidth={2} />}
                  </button>
                </div>
              ))}
            </>
          )}

          {builtinItems.length === 0 && customTypes.length === 0 && (
            <div className={styles.ddEmpty}>No item types available</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────
export default function NewInwardModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();

  const [saving, setSaving] = useState(false);
  const [itemType, setItemType] = useState('');
  const [qty, setQty] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [batchNo, setBatchNo] = useState(nextBatch());
  const [receivedDate, setReceivedDate] = useState(today);
  const [fields, setFields] = useState(EMPTY_FIELDS);

  const [newTypeName, setNewTypeName] = useState('');
  const [addingType, setAddingType] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [customKey, setCustomKey] = useState(0);

  const { data: warehouseList } = useDb(() => mastersDb.getWarehouses());
  const { data: customTypes } = useDb(
    () => inventoryDb.getCustomItemTypes(companyId),
    [companyId, customKey],
  );

  const allCustomTypes = customTypes ?? [];
  const builtinItems = COMPANY_ITEMS[companyId] ?? [];

  // Reset selection when company changes — a value from company A is invalid in company B
  useEffect(() => {
    setItemType('');
    setFields(EMPTY_FIELDS);
  }, [companyId]);

  const setField = (k) => (e) => setFields(f => ({ ...f, [k]: e.target.value }));

  const handleItemTypeChange = (name) => {
    setItemType(name);
    setFields(EMPTY_FIELDS);
  };

  const handleAddCustomType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    const alreadyExists = [...builtinItems, ...allCustomTypes.map(t => t.name)]
      .some(n => n.toLowerCase() === name.toLowerCase());
    if (alreadyExists) { toast.error(`"${name}" already exists.`); return; }
    setAddingType(true);
    try {
      const { error } = await inventoryDb.addCustomItemType(companyId, name);
      if (error) throw new Error(error.message);
      setNewTypeName('');
      setCustomKey(k => k + 1);
      toast.success(`"${name}" added.`);
    } catch (err) {
      toast.error(err.message, 'Add Failed');
    } finally {
      setAddingType(false);
    }
  };

  const handleDeleteCustomType = async (typeId, typeName) => {
    setDeletingId(typeId);
    try {
      const { error } = await inventoryDb.deleteCustomItemType(typeId);
      if (error) throw new Error(error.message);
      if (itemType === typeName) { setItemType(''); setFields(EMPTY_FIELDS); }
      setCustomKey(k => k + 1);
      toast.success(`"${typeName}" removed.`);
    } catch (err) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setDeletingId(null);
    }
  };

  const currentFields = itemType ? ITEM_FIELDS : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!itemType) {
      toast.error('Please select an item type.');
      return;
    }
    setSaving(true);
    try {
      // 1. Save inward record
      const record = {
        item_type: itemType,
        item_name: itemType,
        company_id: companyId,
        quantity_received: parseFloat(qty),
        warehouse,
        batch_no: batchNo,
        received_date: receivedDate,
        status: 'received',
        size: fields.size || null,
        gauge: fields.gauge || null,
      };
      const { error: inwardError } = await inventoryDb.addInwardRecord(record);
      if (inwardError) throw new Error(inwardError.message);

      // 2. Add to product_catalogue so it appears at the top of the catalogue table
      const code = `CUSTOM-${companyId}-${Date.now()}`;
      const catalogueName = [itemType, fields.size, fields.gauge].filter(Boolean).join(', ');
      const { data: catalogueItem, error: catError } = await mastersDb.addProductCatalogueItem({
        code,
        name: catalogueName,
        gauge: fields.gauge || null,
        company_id: companyId,
      });
      if (catError) throw new Error(catError.message);

      toast.success(`${itemType} saved to catalogue.`, 'Item Added');
      onSave(catalogueItem);
      setItemType(''); setQty(''); setWarehouse('');
      setBatchNo(nextBatch()); setReceivedDate(today); setFields(EMPTY_FIELDS);
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

        {/* ── Item Type field + inline add ── */}
        <div className="ff">
          {/* Label row: "Item Type *" on left, add-input on right */}
          <div className={styles.itemTypeHeader}>
            <label className={styles.fieldLabel}>Item Type *</label>
            <div className={styles.addInlineRow}>
              <input
                type="text"
                className={styles.addInlineInput}
                placeholder="New type name…"
                value={newTypeName}
                onChange={e => setNewTypeName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomType(); } }}
                maxLength={60}
              />
              <button
                type="button"
                className={styles.addInlineBtn}
                onClick={handleAddCustomType}
                disabled={addingType || !newTypeName.trim()}
              >
                {addingType ? '…' : '+ Add'}
              </button>
            </div>
          </div>

          {/* Dropdown — sits below the header, full width */}
          <ItemTypeDropdown
            value={itemType}
            onChange={handleItemTypeChange}
            builtinItems={builtinItems}
            customTypes={allCustomTypes}
            onDeleteCustom={handleDeleteCustomType}
            deletingId={deletingId}
          />
        </div>

        {/* Dynamic fields per item type */}
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

        {/* Quantity, Warehouse, Batch No, Received Date removed from UI per user request */}

      </form>
    </Modal>
  );
}
