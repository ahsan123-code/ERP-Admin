import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { procurementDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/format';
import styles from './NewPDNModal.module.css';

const today = new Date().toISOString().split('T')[0];

export default function ApprovePRModal({ open, pr, vendors, onClose, onApproved }) {
  const toast = useToast();
  const { companyId } = useCompany();
  // vendor_id drives the picker; the PO records its vendor by name, so both are held.
  // Keying on the id rather than the name matters here — Shop #41 has three vendor
  // names carried by two rows each ("Abdul Wahab Sb (Karachi)" among them), and a
  // name-keyed list would collide on those.
  const [vendorId, setVendorId]         = useState('');
  const [vendorName, setVendorName]     = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [lines, setLines]               = useState([]);   // { item_name, unit, quantity, rate }
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving]             = useState(false);

  // Load the originating PDN's items so the buyer can price each one
  useEffect(() => {
    if (!open || !pr?.pdn_ref) { setLines([]); return; }
    setLoadingItems(true);
    procurementDb.getPdnLineItems(pr.pdn_ref).then(({ data }) => {
      setLines((data || []).map(li => ({
        item_name: li.item_name || '—',
        unit:      li.unit || '',
        quantity:  Number(li.quantity) || 0,
        rate:      '',
      })));
      setLoadingItems(false);
    });
  }, [open, pr]);

  const setRate = (idx) => (e) => {
    const v = e.target.value;
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, rate: v } : l));
  };

  const lineTotal = (l) => (Number(l.quantity) || 0) * (parseFloat(l.rate) || 0);
  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  const vendorOptions = (vendors || []).map(v => ({
    value: v.id, label: v.name, hint: v.category,
  }));

  const handleVendorSelect = (id) => {
    const v = (vendors || []).find(v => v.id === id || v.id === Number(id));
    setVendorId(id);
    setVendorName(v?.name || '');
  };

  const handleClose = () => {
    setVendorId('');
    setVendorName('');
    setDeliveryDate('');
    setLines([]);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendorId) { toast.error('Please select a vendor.'); return; }
    if (!deliveryDate) { toast.error('Please set a delivery due date.'); return; }
    if (lines.length && lines.some(l => !l.rate || parseFloat(l.rate) <= 0)) {
      toast.error('Enter a rate for every item.'); return;
    }
    setSaving(true);
    try {
      const poId = 'PO-' + String(Date.now()).slice(-6);
      const { data: poData, error: poError } = await procurementDb.addPurchaseOrder({
        po_id: poId,
        vendor_name: vendorName,
        po_date: today,
        delivery_due_date: deliveryDate,
        pr_ref: pr.pr_id,
        item_count: lines.length || (pr.item_count ?? 0),
        total_amount: grandTotal,
        status: 'issued',
        company_id: companyId,
      });
      if (poError) throw new Error(poError.message);

      if (lines.length) {
        try {
          await procurementDb.addPoLineItems(
            lines.map(l => ({
              po_id: poId,
              item_name: l.item_name,
              unit: l.unit,
              quantity: Number(l.quantity) || 0,
              unit_price: parseFloat(l.rate) || 0,
              total_price: lineTotal(l),
            }))
          );
        } catch (_) { /* po_line_items optional — non-fatal */ }
      }

      const { error: prError } = await procurementDb.updatePurchaseRequisitionStatus(pr.pr_id, 'approved');
      if (prError) throw new Error(prError.message);

      toast.success(`PO "${poId}" issued (${formatCurrency(grandTotal)}) and PR approved.`, 'PR Approved');
      onApproved({ ...pr, status: 'approved' }, { ...poData, total_amount: grandTotal, item_count: lines.length, status: 'issued', po_id: poId, vendor_name: vendorName });
      handleClose();
    } catch (err) {
      toast.error(err.message, 'Approve Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Approve Requisition"
      subtitle={pr ? `Issue Purchase Order from ${pr.pr_id}` : ''}
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating PO…' : `Approve & Issue PO — ${formatCurrency(grandTotal)}`}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <SearchableSelect
          label="Vendor"
          required
          placeholder="Search vendors..."
          emptyText="No vendors found"
          value={vendorId}
          onChange={handleVendorSelect}
          options={vendorOptions}
        />
        <Input
          label="Delivery Due Date *"
          type="date"
          value={deliveryDate}
          onChange={e => setDeliveryDate(e.target.value)}
          required
        />

        <div className="ff">
          <label className={styles.itemsLabel}>Items &amp; Rates<span className={styles.req}>*</span></label>

          {loadingItems ? (
            <p className={styles.emptyLines}>Loading items…</p>
          ) : lines.length === 0 ? (
            <p className={styles.emptyLines}>No items found on the originating PDN — PO will be created with zero amount.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 0.7fr 1fr 1fr', gap: 10, padding: '0 4px 6px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <span>Item</span><span>Unit</span><span style={{ textAlign: 'right' }}>Qty</span><span>Rate (PKR)</span><span style={{ textAlign: 'right' }}>Line Total</span>
              </div>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 0.7fr 1fr 1fr', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{l.item_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.unit}</span>
                  <span style={{ fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.quantity}</span>
                  <Input type="number" min="0" step="0.01" placeholder="0.00" value={l.rate} onChange={setRate(i)} />
                  <span style={{ fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', color: lineTotal(l) > 0 ? 'var(--green)' : 'var(--text-tertiary)' }}>
                    {formatCurrency(lineTotal(l))}
                  </span>
                </div>
              ))}
              <div style={{ textAlign: 'right', marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                PO Total: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{formatCurrency(grandTotal)}</span>
              </div>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
