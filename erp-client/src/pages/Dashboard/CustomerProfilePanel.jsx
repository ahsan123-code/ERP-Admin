import { useState, useEffect } from 'react';
import { X, Receipt, ShoppingBag, Wallet, Phone, MapPin } from 'lucide-react';
import { salesDb } from '../../lib/db';
import styles from './CustomerProfilePanel.module.css';

const TABS = [
  { id: 'invoices', label: 'Invoices',  Icon: Receipt    },
  { id: 'orders',   label: 'Orders',    Icon: ShoppingBag },
  { id: 'payments', label: 'Payments',  Icon: Wallet      },
];

const FMT = (n) => n != null
  ? `PKR ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
  : '—';

function StatusPill({ status }) {
  const map = {
    synced: styles.pillGreen, pending: styles.pillOrange, failed: styles.pillRed,
    active: styles.pillGreen, completed: styles.pillGreen, confirmed: styles.pillBlue,
    delivered: styles.pillGreen, cancelled: styles.pillRed, draft: styles.pillGray,
    processing: styles.pillBlue,
  };
  return (
    <span className={`${styles.pill} ${map[status?.toLowerCase()] ?? styles.pillGray}`}>
      {status ?? '—'}
    </span>
  );
}

function Empty({ label }) {
  return <div className={styles.empty}>{label}</div>;
}

function Skeleton() {
  return (
    <div className={styles.skeleton}>
      {[1, 2, 3, 4].map(i => <div key={i} className={styles.skRow} />)}
    </div>
  );
}

function InvoicesTab({ data, loading }) {
  if (loading) return <Skeleton />;
  if (!data || data.length === 0) return <Empty label="No invoices found for this customer" />;
  return (
    <div className={styles.list}>
      {data.map(inv => (
        <div key={inv.invoice_id} className={styles.row}>
          <div className={styles.rowLeft}>
            <span className={styles.rowId}>{inv.invoice_id}</span>
            <span className={styles.rowDate}>{inv.invoice_date?.slice(0, 10)}</span>
          </div>
          <div className={styles.rowRight}>
            <span className={styles.rowAmt}>{FMT(inv.total_value)}</span>
            <StatusPill status={inv.fbr_status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function OrdersTab({ data, loading }) {
  if (loading) return <Skeleton />;
  if (!data || data.length === 0) return <Empty label="No sales orders found for this customer" />;
  return (
    <div className={styles.list}>
      {data.map(o => (
        <div key={o.so_id} className={styles.row}>
          <div className={styles.rowLeft}>
            <span className={styles.rowId}>{o.so_id}</span>
            <span className={styles.rowDate}>{o.order_date?.slice(0, 10)}</span>
          </div>
          <div className={styles.rowRight}>
            <span className={styles.rowAmt}>{FMT(o.total_amount)}</span>
            <StatusPill status={o.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentsTab({ data, loading }) {
  if (loading) return <Skeleton />;
  if (!data || data.length === 0) return <Empty label="No payment records found for this customer" />;
  return (
    <div className={styles.list}>
      {data.map(v => (
        <div key={v.id} className={styles.row}>
          <div className={styles.rowLeft}>
            <span className={styles.rowId}>{v.voucher_id}</span>
            <span className={styles.rowDate}>{v.date?.slice(0, 10)}</span>
          </div>
          <div className={styles.rowRight}>
            {v.credit > 0 && (
              <span className={styles.credit}>
                +PKR {Number(v.credit).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
              </span>
            )}
            {v.debit > 0 && (
              <span className={styles.debit}>
                -PKR {Number(v.debit).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CustomerProfilePanel({ customer, onClose, onNewInvoice, onNewOrder }) {
  const [tab,      setTab]      = useState('invoices');
  const [invoices, setInvoices] = useState(null);
  const [orders,   setOrders]   = useState(null);
  const [payments, setPayments] = useState(null);
  const [loading,  setLoading]  = useState(false);

  // Reset when customer changes
  useEffect(() => {
    setTab('invoices');
    setInvoices(null);
    setOrders(null);
    setPayments(null);
  }, [customer?.customer_id]);

  // Lazy-fetch per tab
  useEffect(() => {
    if (!customer) return;

    if (tab === 'invoices' && invoices === null) {
      setLoading(true);
      salesDb.getCustomerInvoices(customer.name)
        .then(({ data }) => { setInvoices(data ?? []); setLoading(false); });
    }
    if (tab === 'orders' && orders === null) {
      setLoading(true);
      salesDb.getCustomerOrders(customer.customer_id)
        .then(({ data }) => { setOrders(data ?? []); setLoading(false); });
    }
    if (tab === 'payments' && payments === null) {
      setLoading(true);
      salesDb.getCustomerPayments(customer.name)
        .then(({ data }) => { setPayments(data ?? []); setLoading(false); });
    }
  }, [tab, customer]);

  if (!customer) return null;

  const initials = customer.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <aside className={styles.panel}>

        {/* ── Panel header ── */}
        <div className={styles.panelHeader}>
          <div className={styles.customerHead}>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.headInfo}>
              <h2 className={styles.custName}>{customer.name}</h2>
              <span className={styles.custId}>{customer.customer_id}</span>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* ── Meta grid ── */}
        <div className={styles.metaGrid}>
          {[
            { label: 'NTN',          value: customer.ntn || '—' },
            { label: 'CNIC',         value: customer.cnic || '—' },
            { label: 'Outstanding',  value: FMT(customer.outstanding_balance), highlight: true },
            { label: 'Credit Limit', value: FMT(customer.credit_limit) },
            customer.contact && { label: 'Contact', value: customer.contact },
            customer.region  && { label: 'Region',  value: customer.region },
          ].filter(Boolean).map(({ label, value, highlight }) => (
            <div key={label} className={styles.metaItem}>
              <span className={styles.metaLabel}>{label}</span>
              <span className={`${styles.metaValue} ${highlight ? styles.metaHighlight : ''}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* ── Action buttons ── */}
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => onNewInvoice(customer)}>
            <Receipt size={15} />
            New Invoice
          </button>
          <button className={`${styles.actionBtn} ${styles.actionSecondary}`} onClick={() => onNewOrder(customer)}>
            <ShoppingBag size={15} />
            New Order
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className={styles.tabs}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className={styles.content}>
          {tab === 'invoices' && <InvoicesTab data={invoices} loading={loading} />}
          {tab === 'orders'   && <OrdersTab   data={orders}   loading={loading} />}
          {tab === 'payments' && <PaymentsTab data={payments} loading={loading} />}
        </div>

      </aside>
    </>
  );
}
