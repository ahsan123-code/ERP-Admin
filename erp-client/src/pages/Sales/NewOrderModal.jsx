import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { salesDb } from '../../lib/db';
import { useCatalogue } from '../../context/CatalogueContext';
import { useCustomers } from '../../context/CustomerContext';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/format';
import styles from '../Procurement/NewPDNModal.module.css';

const today = new Date().toISOString().split('T')[0];

const EMPTY_ORDER = { customer_id: '', orderDate: today, deliveryDate: '', remarks: '' };
const EMPTY_DRAFT = { productId: '', code: '', name: '', unit: '', gauge: '', size: '',
                      coils: '', sheets: '', qty: '', ratePerKg: '' };

export default function NewOrderModal({ open, onClose, onSave, prefillCustomer }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_ORDER);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [lineItems, setLineItems] = useState([]);

  const { customers }               = useCustomers();
  const { items: productCatalogue } = useCatalogue();

  useEffect(() => {
    if (open && prefillCustomer) {
      setForm(f => ({ ...f, customer_id: prefillCustomer.customer_id }));
    }
    if (!open) {
      setForm(EMPTY_ORDER);
      setDraft(EMPTY_DRAFT);
      setLineItems([]);
    }
  }, [open, prefillCustomer]);

  const set  = (k) => (e) => setForm(f  => ({ ...f, [k]: e.target.value }));
  const setD = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));

  const selectedCustomer = customers.find(c => c.customer_id === form.customer_id);

  const handleProductSelect = (id) => {
    const p = productCatalogue.find(c => String(c.id) === String(id));
    if (!p) { setDraft(d => ({ ...d, productId: id })); return; }
    setDraft(d => ({
      ...d, productId: id, code: p.code, name: p.name,
      unit: p.unit || 'Kilo Grams', gauge: p.gauge || '', size: p.default_size || '',
    }));
  };

  const addItem = () => {
    if (!draft.name)      { toast.error('Select a product.'); return; }
    if (!(parseFloat(draft.qty) > 0))       { toast.error('Enter a quantity greater than zero.'); return; }
    if (!(parseFloat(draft.ratePerKg) > 0)) { toast.error('Enter a rate greater than zero.'); return; }

    const qty  = parseFloat(draft.qty);
    const rate = parseFloat(draft.ratePerKg);
    setLineItems(l => [...l, { ...draft, qty, rate, total_price: qty * rate }]);
    setDraft(EMPTY_DRAFT);
  };

  const totalAmount = lineItems.reduce((s, it) => s + it.total_price, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id)  { toast.error('Select a customer.'); return; }
    if (!form.deliveryDate) { toast.error('Delivery date is required.'); return; }
    if (lineItems.length === 0) { toast.error('Add at least one item to the order.'); return; }

    setSaving(true);
    try {
      const soId = 'SO-' + String(Date.now()).slice(-4).padStart(4, '0');

      const { data, error } = await salesDb.addSalesOrder({
        so_id:         soId,
        customer_id:   form.customer_id,
        customer_name: selectedCustomer?.name ?? '—',
        order_date:    form.orderDate,
        delivery_date: form.deliveryDate,
        item_count:    lineItems.length,
        total_amount:  totalAmount,
        status:        'pending',
        company_id:    companyId,
      });
      if (error) throw new Error(error.message);

      // Persist what was actually sold. Without this the products above are
      // discarded and the order shows no item detail in the customer ledger — the order
      // header alone can't say what was sold. Failing here must not lose the saved
      // order, so it warns instead of throwing.
      //
      // item_name is the plain product name. It briefly carried a "CODE — Name" prefix
      // (so_line_items has no item_code column), but the code is no longer shown
      // anywhere in the app, and the merged form leaked into the customer ledger.
      const { error: lineError } = await salesDb.addSoLineItems(
        lineItems.map((it, i) => ({
          so_id:       soId,
          line_no:     i + 1,
          item_name:   it.name,
          quantity:    it.qty,
          unit:        it.unit || 'Kilo Grams',
          gauge:        it.gauge || null,
          size:         it.size  || null,
          // Printed on the sale bill under "Coils / Rolls" and "No of Sheets"; blank
          // where the office does not count them for that item.
          coils_rolls:  it.coils  === '' ? null : parseFloat(it.coils),
          no_of_sheets: it.sheets === '' ? null : parseFloat(it.sheets),
          unit_price:  it.rate,
          total_price: it.total_price,
          company_id:  companyId,
        }))
      );
      if (lineError) {
        toast.error(`Order ${soId} saved, but its item detail could not be stored: ${lineError.message}`, 'Item Detail Not Saved');
      } else {
        toast.success(`Sales order for ${selectedCustomer?.name} created with ${lineItems.length} item${lineItems.length > 1 ? 's' : ''}.`, 'Order Created');
      }
      onSave(data);
      setForm(EMPTY_ORDER);
      setDraft(EMPTY_DRAFT);
      setLineItems([]);
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  // Name as the label, code as the hint: the label column ellipsises, so a long code
  // prefix would eat the width and cut the name off. The hint stays searchable, so
  // picking by code keeps working.
  const productOptions = productCatalogue.map(p => ({
    value: String(p.id), label: p.name, search: p.code,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Sales Order"
      subtitle="Create a customer order"
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : `Create Order — ${formatCurrency(totalAmount)}`}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <div className="ff">
          <SelectField label="Customer *" value={form.customer_id} onChange={set('customer_id')} required>
            <option value="">— Select customer —</option>
            {customers.map(c => (
              <option key={c.customer_id} value={c.customer_id}>{c.name} ({c.region})</option>
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

        <Input label="Order Date *"    type="date" value={form.orderDate}    onChange={set('orderDate')} required />
        <Input label="Delivery Date *" type="date" value={form.deliveryDate} onChange={set('deliveryDate')} min={form.orderDate} required />

        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Remarks</label>
          <textarea
            value={form.remarks}
            onChange={set('remarks')}
            rows={2}
            placeholder="Delivery instructions, special requirements..."
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 14px',
              fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </form>

      <div style={{ marginTop: 20 }}>
        <span className={styles.itemsLabel}>Order Items <span className={styles.req}>*</span></span>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 0.7fr 0.8fr 0.8fr 1fr auto', gap: 10, alignItems: 'start' }}>
          <SearchableSelect
            placeholder={productCatalogue.length ? 'Select product...' : 'No items yet — add one via New Item'}
            emptyText="No products"
            value={draft.productId}
            onChange={handleProductSelect}
            options={productOptions}
          />
          <Input type="number" min="0" step="1" placeholder="Coils" value={draft.coils} onChange={setD('coils')} />
          <Input type="number" min="0" step="1" placeholder="Sheets" value={draft.sheets} onChange={setD('sheets')} />
          <Input type="number" min="0.001" step="0.001" placeholder="Qty" value={draft.qty} onChange={setD('qty')} />
          <Input placeholder="Unit" value={draft.unit} onChange={setD('unit')} />
          <Input type="number" min="0" step="0.01" placeholder="Rate" value={draft.ratePerKg} onChange={setD('ratePerKg')} />
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
                <span className={styles.lineName}>
                  {it.name}
                  {(it.gauge || it.size) && (
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 6, fontSize: 11 }}>
                      {[it.size, it.gauge].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className={styles.lineQty}>{it.qty} {it.unit}</span>
                <span className={styles.lineQty}>@ {formatCurrency(it.rate)}</span>
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

        {lineItems.length > 0 && (
          <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Order Total: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{formatCurrency(totalAmount)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
