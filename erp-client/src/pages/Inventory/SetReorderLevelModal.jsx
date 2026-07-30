import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { inventoryDb } from '../../lib/db';
import { formatNumber } from '../../utils/format';

// Set the reorder limit (low-stock threshold) for a single stock item.
// When current stock falls at or below this limit the item is flagged Low;
// zero stock is flagged Critical. A limit of 0 disables the alert.
export default function SetReorderLevelModal({ open, item, onClose, onSaved }) {
  const toast = useToast();
  const [value, setValue]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) setValue(String(Number(item.reorder_level) || 0));
  }, [open, item]);

  const unit = item?.unit === 'Kilogram' ? 'kg' : (item?.unit || 'kg');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!item) return;
    const limit = parseFloat(value);
    if (Number.isNaN(limit) || limit < 0) {
      toast.error('Enter a valid reorder limit (0 or more).');
      return;
    }
    setSaving(true);
    try {
      const { error } = await inventoryDb.updateStockItem(item.id, { reorder_level: limit });
      if (error) throw new Error(error.message);
      toast.success(
        limit > 0
          ? `Reorder limit for "${item.item_name}" set to ${formatNumber(limit)} ${unit}.`
          : `Low-stock alert disabled for "${item.item_name}".`,
        'Limit Updated'
      );
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err.message, 'Update Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set Reorder Limit"
      subtitle={item ? item.item_name : ''}
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Limit'}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff" style={{ display: 'flex', gap: 24, fontSize: 13, background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
          <span>Current Stock: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{formatNumber(item?.current_stock || 0)} {unit}</strong></span>
        </div>
        <Input
          label={`Reorder Limit (${unit}) *`}
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 500"
          autoFocus
          required
        />
        <p className="ff" style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
          Stock at or below this limit is flagged <strong style={{ color: 'var(--orange)' }}>Low</strong>; zero stock is flagged <strong style={{ color: 'var(--red)' }}>Critical</strong>. Set 0 to turn the alert off.
        </p>
      </form>
    </Modal>
  );
}
