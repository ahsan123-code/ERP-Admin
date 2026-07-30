import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useCatalogue } from '../../context/CatalogueContext';
import { formatCurrency } from '../../utils/format';
import styles from './NewPDNModal.module.css';

const today = () => new Date().toISOString().split('T')[0];
const genBillId = () => 'PBILL-' + String(Date.now()).slice(-5);

const EMPTY_FORM = {
  bill_date: today(), bill_no: '', po_ref: '', grn_ref: '',
  vendor_name: '', tax_amount: '', payment_terms: 'Net 30', due_date: '', notes: '',
};
const EMPTY_DRAFT = { product_id: '', item_code: '', item_name: '', unit: '', gauge: '', size: '', qty: '', unit_price: '' };

// A pulled PO/GRN row and a hand-typed row end up in the same shape so the list,
// the totals and the insert never have to care where a line came from.
const toLine = (row) => {
  const qty   = parseFloat(row.quantity)   || 0;
  const price = parseFloat(row.unit_price) || 0;
  return {
    item_code:   row.item_code || '',
    item_name:   row.item_name || '',
    unit:        row.unit  || '',
    gauge:       row.gauge || '',
    size:        row.size  || '',
    qty,
    unit_price:  price,
    // Legacy imported rows can carry a null/zero total even with a real qty and
    // rate, so recompute rather than trusting the stored figure.
    total_price: parseFloat(row.total_price) || qty * price,
  };
};

export default function NewPurchaseInvoiceModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const { items: catalogue } = useCatalogue();
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [billId, setBillId] = useState(genBillId());
  const [form, setForm] = useState(EMPTY_FORM);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [lineItems, setLineItems] = useState([]);

  const { data: purchaseOrders } = useDb(() => procurementDb.getPurchaseOrders(companyId), [companyId]);
  const { data: grns }           = useDb(() => procurementDb.getGrns(companyId),           [companyId]);

  useEffect(() => {
    if (open) {
      setBillId(genBillId());
      setForm({ ...EMPTY_FORM, bill_date: today() });
      setDraft(EMPTY_DRAFT);
      setLineItems([]);
    }
  }, [open]);

  const set  = (k) => (e) => setForm(f  => ({ ...f, [k]: e.target.value }));
  const setD = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));

  const handleProductSelect = (id) => {
    const p = (catalogue || []).find(c => String(c.id) === String(id));
    if (!p) { setDraft(d => ({ ...d, product_id: id })); return; }
    setDraft(d => ({
      ...d, product_id: id, item_code: p.code, item_name: p.name,
      unit: p.unit || '', gauge: p.gauge || '', size: p.default_size || '',
    }));
  };

  // Pulls the referenced document's items onto the bill. Replaces whatever is in
  // the list: a bill is raised against one PO or one GRN, so merging two sources
  // would silently double the quantities.
  const pullLines = async (fetcher, label) => {
    setPulling(true);
    try {
      const { data, error } = await fetcher();
      if (error) throw new Error(error.message);
      const lines = (data || []).map(toLine).filter(l => l.item_name);
      if (lines.length === 0) {
        toast.error(`${label} has no stored line items — add the items by hand.`, 'Nothing to Pull');
        return;
      }
      setLineItems(lines);
      toast.success(`${lines.length} item${lines.length > 1 ? 's' : ''} loaded from ${label}.`, 'Items Pulled');
    } catch (err) {
      toast.error(err.message, 'Could Not Load Items');
    } finally {
      setPulling(false);
    }
  };

  const handlePoSelect = (poId) => {
    const po = (purchaseOrders || []).find(p => p.po_id === poId);
    setForm(f => ({ ...f, po_ref: poId, vendor_name: f.vendor_name || po?.vendor_name || '' }));
    if (poId) pullLines(() => procurementDb.getPoLineItems(poId), `PO ${poId}`);
  };

  const handleGrnSelect = (grnId) => {
    const grn = (grns || []).find(g => g.grn_id === grnId);
    setForm(f => ({
      ...f, grn_ref: grnId,
      vendor_name: f.vendor_name || grn?.vendor_name || '',
      po_ref:      f.po_ref      || grn?.po_ref      || '',
    }));
    // Billing off the GRN is the accurate path: it holds what actually arrived,
    // so a short delivery is invoiced at the received quantity, not the ordered one.
    if (grnId) pullLines(() => procurementDb.getGrnLineItems(grnId), `GRN ${grnId}`);
  };

  const addItem = () => {
    if (!draft.item_name) { toast.error('Select or name a product.'); return; }
    if (!(parseFloat(draft.qty) > 0))        { toast.error('Enter a quantity greater than zero.'); return; }
    if (!(parseFloat(draft.unit_price) >= 0)) { toast.error('Enter a unit price.'); return; }
    const qty   = parseFloat(draft.qty);
    const price = parseFloat(draft.unit_price);
    setLineItems(l => [...l, { ...draft, qty, unit_price: price, total_price: qty * price }]);
    setDraft(EMPTY_DRAFT);
  };

  const itemsTotal = lineItems.reduce((s, it) => s + it.total_price, 0);
  const taxAmount  = parseFloat(form.tax_amount) || 0;
  const grandTotal = itemsTotal + taxAmount;

  const handleSubmit = async () => {
    if (!form.vendor_name)      { toast.error('Vendor name is required.'); return; }
    if (!form.bill_date)        { toast.error('Bill date is required.'); return; }
    if (lineItems.length === 0) { toast.error('Add at least one item to the bill.'); return; }

    setSaving(true);
    try {
      const { data, error } = await procurementDb.addPurchaseInvoice({
        bill_id:       billId,
        bill_no:       form.bill_no      || null,
        po_ref:        form.po_ref       || null,
        grn_ref:       form.grn_ref      || null,
        vendor_name:   form.vendor_name,
        bill_date:     form.bill_date,
        due_date:      form.due_date     || null,
        payment_terms: form.payment_terms,
        items_total:   itemsTotal,
        tax_amount:    taxAmount,
        grand_total:   grandTotal,
        notes:         form.notes        || null,
        status:        'unpaid',
        company_id:    companyId,
      });
      if (error) throw new Error(error.message);

      const { error: lineError } = await procurementDb.addPurchaseInvoiceItems(
        lineItems.map((it, i) => ({
          bill_id: billId, line_no: i + 1,
          item_code: it.item_code || null, item_name: it.item_name,
          unit: it.unit || null, gauge: it.gauge || null, size: it.size || null,
          quantity: it.qty,
          unit_price: it.unit_price, total_price: it.total_price,
          company_id: companyId,
        }))
      );
      if (lineError) {
        toast.error(
          `Bill ${billId} was recorded, but its item detail could not be saved: ${lineError.message}`,
          'Item Detail Not Saved',
        );
      }

      // Post the bill to the ledger (Purchases/tax debit, AP credit). The bill row
      // is already saved by this point, so a posting failure must not discard it —
      // report it instead, since an unposted bill needs correcting by hand.
      let postingError = null;
      try {
        await procurementDb.postPurchaseInvoiceVoucher({
          invoice: {
            bill_id: billId, bill_date: form.bill_date, vendor_name: form.vendor_name,
            items_total: itemsTotal, tax_amount: taxAmount, grand_total: grandTotal,
          },
          companyId,
        });
      } catch (err) {
        postingError = err;
      }

      if (postingError) {
        toast.error(
          `Bill ${billId} was recorded, but the ledger entry failed: ${postingError.message}. The vendor's balance will not reflect this bill until it is posted.`,
          'Bill Not Posted to Ledger',
        );
      } else if (!lineError) {
        toast.success(
          `Purchase Invoice ${billId} recorded with ${lineItems.length} item${lineItems.length > 1 ? 's' : ''} and posted to the ledger.`,
          'Bill Created',
        );
      }

      onSave({
        ...(data || {}), bill_id: billId, vendor_name: form.vendor_name,
        bill_date: form.bill_date, grand_total: grandTotal,
        po_ref: form.po_ref, grn_ref: form.grn_ref, status: 'unpaid',
      });
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  const poOptions  = (purchaseOrders || []).map(p => ({
    value: p.po_id, label: `${p.po_id} — ${p.vendor_name}`, hint: formatCurrency(p.total_amount),
  }));
  const grnOptions = (grns || []).map(g => ({
    value: g.grn_id, label: `${g.grn_id} — ${g.vendor_name || ''}`, hint: g.received_date,
  }));
  const productOptions = (catalogue || []).map(c => ({
    value: String(c.id), label: c.name, search: c.code,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Purchase Invoice"
      subtitle={`${billId} — Record vendor bill / purchase invoice`}
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : `Record Bill — ${formatCurrency(grandTotal)}`}
          </Button>
        </div>
      }
    >
      <div className="fg">
        <Input label="Bill ID" value={billId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Vendor Invoice No." value={form.bill_no} onChange={set('bill_no')} placeholder="Vendor's own invoice number" />
        <Input label="Bill Date *" type="date" value={form.bill_date} onChange={set('bill_date')} required />
        <Input label="Due Date" type="date" value={form.due_date} onChange={set('due_date')} />
        <Input label="Vendor / Supplier *" value={form.vendor_name} onChange={set('vendor_name')} placeholder="Vendor name" required />
        <SelectField label="Payment Terms" value={form.payment_terms} onChange={set('payment_terms')}>
          <option value="Advance">Advance</option>
          <option value="Net 15">Net 15</option>
          <option value="Net 30">Net 30</option>
          <option value="Net 45">Net 45</option>
          <option value="Net 60">Net 60</option>
          <option value="COD">COD</option>
        </SelectField>
        <div className="ff">
          <SearchableSelect
            label="Purchase Order Reference"
            placeholder="Link to PO — loads its items"
            emptyText="No POs"
            value={form.po_ref}
            onChange={handlePoSelect}
            options={poOptions}
          />
        </div>
        <div className="ff">
          <SearchableSelect
            label="GRN Reference"
            placeholder="Link to GRN — loads received items"
            emptyText="No GRNs"
            value={form.grn_ref}
            onChange={handleGrnSelect}
            options={grnOptions}
          />
        </div>
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Notes</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="Any additional notes about this purchase..."
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 14px',
              fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <span className={styles.itemsLabel}>
          Billed Items <span className={styles.req}>*</span>
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            {pulling ? 'loading from linked document…' : 'link a PO or GRN above to pull its items, or add them here'}
          </span>
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 1fr auto', gap: 10, alignItems: 'start' }}>
          <SearchableSelect
            placeholder="Select product..."
            emptyText="No products"
            value={draft.product_id}
            onChange={handleProductSelect}
            options={productOptions}
          />
          <Input type="number" min="0.001" step="0.001" placeholder="Qty" value={draft.qty} onChange={setD('qty')} />
          <Input placeholder="Unit" value={draft.unit} onChange={setD('unit')} />
          <Input type="number" min="0" step="0.01" placeholder="Unit Price" value={draft.unit_price} onChange={setD('unit_price')} />
          <Button
            style={{ height: 38, marginTop: 0 }}
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={addItem}
          >
            Add
          </Button>
        </div>

        <div className={styles.lineList}>
          {lineItems.length === 0
            ? <p className={styles.emptyLines}>No items on this bill yet.</p>
            : lineItems.map((it, i) => (
              <div key={i} className={styles.lineRow}>
                <span className={styles.lineName}>
                  {it.item_name}
                  {(it.gauge || it.size) && (
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 6, fontSize: 11 }}>
                      {[it.size, it.gauge].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className={styles.lineQty}>{it.qty} {it.unit}</span>
                <span className={styles.lineQty}>@ {formatCurrency(it.unit_price)}</span>
                <span className={styles.lineQty} style={{ color: 'var(--green)' }}>{formatCurrency(it.total_price)}</span>
                <button
                  type="button"
                  className={styles.lineDel}
                  onClick={() => setLineItems(l => l.filter((_, j) => j !== i))}
                >
                  <Trash2 size={11} strokeWidth={2} />
                </button>
              </div>
            ))}
        </div>

        <div className="fg" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Items Total (PKR)</label>
            <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)' }}>
              {formatCurrency(itemsTotal)}
            </div>
          </div>
          <Input
            label="Tax / GST (PKR)"
            type="number" min="0" step="0.01"
            value={form.tax_amount} onChange={set('tax_amount')}
            placeholder="0.00"
          />
          <div className="ff" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Grand Total (PKR)</label>
            <div style={{ padding: '12px 16px', background: 'var(--blue-muted)', border: '1px solid var(--blue-dim)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>
              {formatCurrency(grandTotal)}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
