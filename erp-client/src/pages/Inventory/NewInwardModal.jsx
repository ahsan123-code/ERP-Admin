import { useState, useEffect } from 'react';
import {
  Check, Plus, Trash2, Package, Layers, Zap, Wrench,
  Droplets, Box, ArrowUpDown, Minus, Hash, X,
} from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { useDb } from '../../hooks/useDb';
import { mastersDb, inventoryDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';
import styles from './NewInwardModal.module.css';

const today   = new Date().toISOString().split('T')[0];
const nextBatch = () => 'BT-' + (1060 + Math.floor(Math.random() * 40));

const BUILTIN_ICONS = {
  'GI Sheet':       Layers,
  'C Channel':      Minus,
  'Solar Channel':  Zap,
  'Workshop Items': Wrench,
  'Geyser Tanki':   Droplets,
  'Box Control':    Box,
  'Top n Bottom':   ArrowUpDown,
};

const COMPANY_ITEMS = {
  1: ['GI Sheet', 'C Channel'],
  2: ['Solar Channel', 'Workshop Items', 'Geyser Tanki', 'Box Control', 'Top n Bottom'],
};

const EMPTY_FIELDS = { size: '', gauge: '' };

function TypeIcon({ name, size = 14 }) {
  const Icon = BUILTIN_ICONS[name] ?? Package;
  return <Icon size={size} strokeWidth={1.75} />;
}

export default function NewInwardModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();

  const [saving, setSaving]           = useState(false);
  const [itemType, setItemType]       = useState('');
  const [fields, setFields]           = useState(EMPTY_FIELDS);
  const [batchNo]                     = useState(nextBatch);
  const [newTypeName, setNewTypeName] = useState('');
  const [addingType, setAddingType]   = useState(false);
  const [deletingId, setDeletingId]   = useState(null);
  const [customKey, setCustomKey]     = useState(0);

  const { data: customTypes } = useDb(
    () => inventoryDb.getCustomItemTypes(companyId),
    [companyId, customKey],
  );

  const allCustomTypes = customTypes ?? [];
  const builtinItems   = COMPANY_ITEMS[companyId] ?? [];

  useEffect(() => {
    setItemType('');
    setFields(EMPTY_FIELDS);
    setNewTypeName('');
  }, [companyId]);

  const setField = (k) => (e) => setFields(f => ({ ...f, [k]: e.target.value }));

  const handleSelect = (name) => {
    setItemType(prev => prev === name ? '' : name);
    setFields(EMPTY_FIELDS);
  };

  const handleAddCustomType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    const exists = [...builtinItems, ...allCustomTypes.map(t => t.name)]
      .some(n => n.toLowerCase() === name.toLowerCase());
    if (exists) { toast.error(`"${name}" already exists.`); return; }
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

  const handleSubmit = async () => {
    if (!itemType) { toast.error('Please select an item type.'); return; }
    setSaving(true);
    try {
      const { error: inwardError } = await inventoryDb.addInwardRecord({
        item_type: itemType,
        item_name: itemType,
        company_id: companyId,
        quantity_received: null,
        warehouse: '',
        batch_no: batchNo,
        received_date: today,
        status: 'received',
        size: fields.size || null,
        gauge: fields.gauge || null,
      });
      if (inwardError) throw new Error(inwardError.message);

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
      setItemType(''); setFields(EMPTY_FIELDS); setNewTypeName('');
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  const catalogueName = [itemType, fields.size, fields.gauge].filter(Boolean).join(', ');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Item"
      subtitle="Pick a type, fill in details, and save to catalogue"
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving || !itemType}>
            {saving ? 'Saving…' : 'Save Item'}
          </Button>
        </div>
      }
    >
      <div className={styles.wrap}>

        {/* ── Add custom type bar ── */}
        <div className={styles.addTypeBar}>
          <span className={styles.addTypeBarIcon}>
            <Plus size={15} strokeWidth={2.5} />
          </span>
          <div className={styles.addTypeBarText}>
            <span className={styles.addTypeBarTitle}>Add Custom Type</span>
            <span className={styles.addTypeBarSub}>Create a new item type for your catalogue</span>
          </div>
          <div className={styles.addTypeBarForm}>
            <input
              className={styles.addTypeBarInput}
              placeholder="e.g. Aluminum Sheet"
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomType(); } }}
              maxLength={60}
            />
            <button
              type="button"
              className={styles.addTypeBarBtn}
              onClick={handleAddCustomType}
              disabled={addingType || !newTypeName.trim()}
            >
              {addingType ? '…' : <><Plus size={13} strokeWidth={2.5} /> Add</>}
            </button>
          </div>
        </div>

        {/* ── Built-in types ── */}
        {builtinItems.length > 0 && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Built-in</span>
            <div className={styles.chipRow}>
              {builtinItems.map(name => {
                const active = itemType === name;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                    onClick={() => handleSelect(name)}
                  >
                    <span className={styles.chipIcon}>
                      <TypeIcon name={name} size={13} />
                    </span>
                    <span className={styles.chipName}>{name}</span>
                    {active && <Check size={12} className={styles.chipCheck} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Custom types ── */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Custom</span>
        </div>

        <div className={styles.chipRow}>
          {allCustomTypes.map(t => {
            const active = itemType === t.name;
            return (
              <button
                key={t.id}
                type="button"
                className={`${styles.chip} ${styles.chipCustom} ${active ? styles.chipActive : ''}`}
                onClick={() => handleSelect(t.name)}
              >
                <span className={styles.chipIcon}>
                  <Package size={13} strokeWidth={1.75} />
                </span>
                <span className={styles.chipName}>{t.name}</span>
                {active
                  ? <Check size={12} className={styles.chipCheck} />
                  : (
                    <span
                      className={styles.chipDel}
                      role="button"
                      title={`Delete "${t.name}"`}
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustomType(t.id, t.name); }}
                    >
                      {deletingId === t.id ? '…' : <Trash2 size={11} strokeWidth={2} />}
                    </span>
                  )
                }
              </button>
            );
          })}

          {allCustomTypes.length === 0 && (
            <span className={styles.emptyCustom}>No custom types yet — add one above</span>
          )}
        </div>

        {/* ── Details section — only when type selected ── */}
        {itemType && (
          <div className={styles.detailsSection}>
            <div className={styles.detailsHeader}>
              <span className={styles.detailsIconBadge}>
                <TypeIcon name={itemType} size={13} />
              </span>
              <span className={styles.detailsTitle}>{itemType}</span>
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => { setItemType(''); setFields(EMPTY_FIELDS); }}
                title="Clear selection"
              >
                <X size={12} />
                <span>Clear</span>
              </button>
            </div>

            <div className={styles.fieldsRow}>
              <Input
                label="Size"
                placeholder="e.g. 4×8 ft"
                value={fields.size}
                onChange={setField('size')}
                hint="Optional"
              />
              <Input
                label="Gauge / MM"
                placeholder="e.g. 0.25MM"
                value={fields.gauge}
                onChange={setField('gauge')}
                hint="Optional"
              />
            </div>

            <div className={styles.metaRow}>
              <div className={styles.batchPill}>
                <Hash size={11} strokeWidth={2} />
                <span className={styles.batchNum}>{batchNo}</span>
              </div>
              <div className={styles.previewPill}>
                <span className={styles.previewLabel}>Saves as</span>
                <span className={styles.previewValue}>{catalogueName || itemType}</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
