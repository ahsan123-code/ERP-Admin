import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { salesDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';
import { formatDate, formatCurrency } from '../../utils/format';

const MAX = 20;

// The bill book is filled in by hand at the counter and the number is often not to hand
// when the order is dispatched, so the one entered on dispatch has to be correctable —
// otherwise a bill raised in a hurry prints "Book #" blank for good, with no way back.
//
// Mounted only while a bill is selected, and keyed on it, so the field seeds itself from
// the row it opened on instead of needing an effect to resync on every change of invoice.
export default function BookNoModal({ invoice, onClose, onSaved }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [value, setValue] = useState(invoice.manual_bill_no ?? '');
  const [saving, setSaving] = useState(false);

  const trimmed  = value.trim();
  const original = invoice.manual_bill_no ?? '';
  const dirty    = trimmed !== original;
  const clearing = original !== '' && trimmed === '';

  const handleSave = async () => {
    if (!dirty) { onClose(); return; }
    setSaving(true);
    try {
      const { data, error } = await salesDb.updateSalesInvoice(invoice.id, {
        manual_bill_no: trimmed || null,
      });
      if (error) throw new Error(error.message);

      // The voucher was posted at dispatch, usually before this number was known, so its
      // narration still reads without a Book #. Rewriting it here is what makes the
      // number show up in the ledger — saving the bill alone never reached it.
      const { error: ledgerError } = await salesDb.updateSalesInvoiceVoucherNarration({
        saleInvId: invoice.sale_inv_id,
        narration: salesDb.salesVoucherNarration({ ...invoice, manual_bill_no: trimmed || null }),
        companyId: invoice.company_id ?? companyId,
      });

      if (ledgerError) {
        // The bill itself is saved and will print correctly; only the ledger's wording is
        // stale, which is worth saying plainly rather than reporting a clean save.
        toast.warning(
          `Book # saved on ${invoice.sale_inv_id}, but the ledger entry still shows the old text: ${ledgerError.message}`,
          'Ledger Not Updated',
        );
      } else {
        toast.success(
          clearing
            ? `Book # cleared on ${invoice.sale_inv_id}.`
            : `Book # ${trimmed} saved on ${invoice.sale_inv_id}.`,
          'Bill Updated',
        );
      }
      onSaved(data || { ...invoice, manual_bill_no: trimmed || null });
      onClose();
    } catch (err) {
      toast.error(err.message, 'Update Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Manual Bill No."
      subtitle={`${invoice.sale_inv_id} — ${invoice.customer_name}`}
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : clearing ? 'Clear Book #' : 'Save Book #'}
          </Button>
        </div>
      }
    >
      <div className="fg">
        <div className="ff" style={{ display: 'flex', gap: 24, fontSize: 13, background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Date: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{formatDate(invoice.date)}</strong>
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Total: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{formatCurrency(invoice.grand_total)}</strong>
          </span>
        </div>

        <div className="ff">
          <Input
            label="Book #"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="e.g. 48-2"
            maxLength={MAX}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && dirty) handleSave(); }}
            hint="The number written on the physical bill book. Prints on the sale bill as Book #."
          />
        </div>
      </div>
    </Modal>
  );
}
