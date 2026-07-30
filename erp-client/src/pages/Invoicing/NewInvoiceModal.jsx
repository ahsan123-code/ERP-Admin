import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { mastersDb, invoicingDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCustomers } from '../../context/CustomerContext';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/format';
import styles from '../Procurement/NewPDNModal.module.css';

const today    = new Date().toISOString().split('T')[0];
const nextInvNo = () => 'INV-' + String(50 + Math.floor(Math.random() * 50)).padStart(4, '0');

// The invoice type decides the rate for every line on the invoice. Zero-rated and
// exempt supplies must not be taxed — previously 18% was applied whatever the type
// was selected, which overstated the tax on both.
const TAX_RATE_BY_TYPE = { standard: 18, zero_rated: 0, exempt: 0 };

const EMPTY = {
  invoiceNo: nextInvNo(), customer_id: '', cnic: '', ntn: '',
  invoiceDate: today, invoiceType: 'standard',
};
const EMPTY_DRAFT = { productId: '', code: '', name: '', unit: '', qty: '', rate: '' };

export default function NewInvoiceModal({ open, onClose, onSave, prefillCustomer }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState(() => prefillCustomer
    ? { ...EMPTY, customer_id: prefillCustomer.customer_id, cnic: prefillCustomer.cnic ?? '', ntn: prefillCustomer.ntn ?? '' }
    : EMPTY
  );
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [lineItems, setLineItems] = useState([]);

  const { customers }              = useCustomers();
  const { data: productCatalogue } = useDb(() => mastersDb.getProductCatalogue());

  useEffect(() => {
    if (open && prefillCustomer) {
      setForm(f => ({ ...f, customer_id: prefillCustomer.customer_id, cnic: prefillCustomer.cnic ?? '', ntn: prefillCustomer.ntn ?? '' }));
    }
    if (!open) {
      setForm({ ...EMPTY, invoiceNo: nextInvNo() });
      setDraft(EMPTY_DRAFT);
      setLineItems([]);
    }
  }, [open, prefillCustomer]);

  const set  = (k) => (e) => setForm(f  => ({ ...f, [k]: e.target.value }));
  const setD = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));

  const handleCustomerChange = (e) => {
    const c = customers.find(cu => cu.customer_id === e.target.value);
    setForm(f => ({ ...f, customer_id: e.target.value, cnic: c?.cnic ?? '', ntn: c?.ntn ?? '' }));
  };

  const handleProductSelect = (id) => {
    const p = (productCatalogue || []).find(c => String(c.id) === String(id));
    if (!p) { setDraft(d => ({ ...d, productId: id })); return; }
    setDraft(d => ({ ...d, productId: id, code: p.code, name: p.name, unit: p.unit || 'Kilo Grams' }));
  };

  const taxRate = TAX_RATE_BY_TYPE[form.invoiceType] ?? 0;

  const addItem = () => {
    if (!draft.name) { toast.error('Select a product.'); return; }
    if (!(parseFloat(draft.qty) > 0))  { toast.error('Enter a quantity greater than zero.'); return; }
    if (!(parseFloat(draft.rate) > 0)) { toast.error('Enter a rate greater than zero.'); return; }
    const qty  = parseFloat(draft.qty);
    const rate = parseFloat(draft.rate);
    setLineItems(l => [...l, { ...draft, qty, rate, lineSubtotal: qty * rate }]);
    setDraft(EMPTY_DRAFT);
  };

  const subtotal  = lineItems.reduce((s, it) => s + it.lineSubtotal, 0);
  const taxAmount = subtotal * taxRate / 100;
  const totalVal  = subtotal + taxAmount;

  const selectedCustomer = customers.find(c => c.customer_id === form.customer_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id)      { toast.error('Select a customer.'); return; }
    if (!form.cnic || !form.ntn){ toast.error('CNIC and NTN are required for FBR submission.'); return; }
    if (lineItems.length === 0) { toast.error('Add at least one item to the invoice.'); return; }

    setSaving(true);
    try {
      const payload = {
        invoice_id:    form.invoiceNo,
        customer_id:   form.customer_id,
        customer_name: selectedCustomer?.name ?? '',
        cnic:          form.cnic,
        ntn:           form.ntn,
        invoice_date:  form.invoiceDate,
        invoice_type:  form.invoiceType,
        subtotal,
        tax_amount:    taxAmount,
        total_value:   totalVal,
        fbr_status:    'pending',
      };
      const { data, error } = await invoicingDb.addInvoice(payload);
      if (error) throw new Error(error.message);

      // These rows become the Items array sent to AJK-IRD. tax_rate is stored per
      // line so the payload is rebuilt at the rate the invoice was raised at rather
      // than being re-derived at the default 18%.
      const { error: itemErr } = await invoicingDb.addInvoiceItems(
        lineItems.map((it, i) => ({
          invoice_id:  form.invoiceNo,
          line_no:     i + 1,
          item_code:   it.code || null,
          item_name:   it.name,
          category:    'Steel',
          unit:        it.unit || null,
          quantity:    it.qty,
          unit_price:  it.rate,
          subtotal:    it.lineSubtotal,
          tax_rate:    taxRate,
          tax_amount:  it.lineSubtotal * taxRate / 100,
          total_price: it.lineSubtotal * (1 + taxRate / 100),
          company_id:  companyId,
        }))
      );
      if (itemErr) {
        toast.error(
          `Invoice ${form.invoiceNo} was created, but its items could not be saved: ${itemErr.message}. FBR submission will fall back to a single generic line.`,
          'Item Detail Not Saved',
        );
      } else {
        toast.success(`Invoice ${form.invoiceNo} created with ${lineItems.length} item${lineItems.length > 1 ? 's' : ''} and queued for FBR.`, 'Invoice Created');
      }

      onSave(data || payload);
      setForm({ ...EMPTY, invoiceNo: nextInvNo() });
      setDraft(EMPTY_DRAFT);
      setLineItems([]);
      onClose();
    } catch (err) {
      toast.error(`Failed to save invoice: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const productOptions = (productCatalogue || []).map(p => ({
    value: String(p.id), label: p.name, search: p.code,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Invoice"
      subtitle="Create and submit to FBR e-invoicing"
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Submitting…' : `Create & Submit — ${formatCurrency(totalVal)}`}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Invoice No." value={form.invoiceNo} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Invoice Date *" type="date" value={form.invoiceDate} onChange={set('invoiceDate')} required />

        <div className="ff">
          <SelectField label="Customer *" value={form.customer_id} onChange={handleCustomerChange} required>
            <option value="">— Select customer —</option>
            {customers.map(c => (
              <option key={c.customer_id} value={c.customer_id}>{c.name}{c.region ? ` (${c.region})` : ''}</option>
            ))}
          </SelectField>
        </div>

        {selectedCustomer && (
          <div className="ff" style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
            <span>NTN: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{selectedCustomer.ntn || '—'}</strong></span>
            <span>CNIC: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{selectedCustomer.cnic || '—'}</strong></span>
            <span>Contact: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{selectedCustomer.contact || '—'}</strong></span>
          </div>
        )}

        <Input label="CNIC (Buyer) *"  value={form.cnic} onChange={set('cnic')} placeholder="XXXXX-XXXXXXX-X" required />
        <Input label="NTN *"           value={form.ntn}  onChange={set('ntn')}  placeholder="1234567-8"       required />

        <SelectField label="Invoice Type *" value={form.invoiceType} onChange={set('invoiceType')}>
          <option value="standard">Standard (18% GST)</option>
          <option value="zero_rated">Zero Rated</option>
          <option value="exempt">Exempt</option>
        </SelectField>
      </form>

      <div style={{ marginTop: 20 }}>
        <span className={styles.itemsLabel}>
          Invoice Items <span className={styles.req}>*</span>
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            taxed at {taxRate}% — set by the invoice type above
          </span>
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 1fr auto', gap: 10, alignItems: 'start' }}>
          <SearchableSelect
            placeholder="Select product..."
            emptyText="No products"
            value={draft.productId}
            onChange={handleProductSelect}
            options={productOptions}
          />
          <Input type="number" min="0.001" step="0.001" placeholder="Qty" value={draft.qty} onChange={setD('qty')} />
          <Input placeholder="Unit" value={draft.unit} onChange={setD('unit')} />
          <Input type="number" min="0" step="0.01" placeholder="Rate" value={draft.rate} onChange={setD('rate')} />
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
            ? <p className={styles.emptyLines}>No items added yet — pick a product, set quantity and rate, then click Add.</p>
            : lineItems.map((it, i) => (
              <div key={i} className={styles.lineRow}>
                <span className={styles.lineName}>{it.name}</span>
                <span className={styles.lineQty}>{it.qty} {it.unit}</span>
                <span className={styles.lineQty}>@ {formatCurrency(it.rate)}</span>
                <span className={styles.lineQty} style={{ color: 'var(--green)' }}>{formatCurrency(it.lineSubtotal)}</span>
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
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sub-total</label>
            <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)' }}>{formatCurrency(subtotal)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tax ({taxRate}% GST)</label>
            <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--orange)' }}>{formatCurrency(taxAmount)}</div>
          </div>
          <div className="ff" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total Value (inc. GST)</label>
            <div style={{ padding: '12px 16px', background: 'var(--blue-muted)', border: '1px solid var(--blue-dim)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{formatCurrency(totalVal)}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
