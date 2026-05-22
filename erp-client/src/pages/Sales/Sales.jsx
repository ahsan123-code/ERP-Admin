import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, ShoppingBag, Users, Truck, RotateCcw,
  ClipboardCheck, Factory, Receipt, KeyRound,
} from 'lucide-react';
import NewOrderModal from './NewOrderModal';
import NewCustomerModal from './NewCustomerModal';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { salesDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { formatDate, formatCurrency, formatNumber } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import styles from './Sales.module.css';

const SEG_TO_TAB = {
  '': 'orders', orders: 'orders',
  confirmation: 'confirmation',
  'work-order': 'work-order',
  customers: 'customers',
  delivery: 'deliveries',
  invoice: 'invoice',
  returns: 'returns',
  'gate-pass': 'gate-pass',
};
const TAB_TO_SEG = {
  orders: 'orders', confirmation: 'confirmation', 'work-order': 'work-order',
  customers: 'customers', deliveries: 'delivery', invoice: 'invoice',
  returns: 'returns', 'gate-pass': 'gate-pass',
};

const PAGE_TABS = [
  { value: 'orders',       label: 'Order Booking',      icon: ShoppingBag    },
  { value: 'confirmation', label: 'Order Confirmation',  icon: ClipboardCheck },
  { value: 'work-order',   label: 'Work Orders',         icon: Factory        },
  { value: 'customers',    label: 'Customers',           icon: Users          },
  { value: 'deliveries',   label: 'Deliveries',          icon: Truck          },
  { value: 'invoice',      label: 'Sales Invoice',       icon: Receipt        },
  { value: 'returns',      label: 'Returns',             icon: RotateCcw      },
  { value: 'gate-pass',    label: 'Gate Pass',           icon: KeyRound       },
];

const SO_COLS = [
  { key: 'so_id',         label: 'Order No.',   width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',    width: 220 },
  { key: 'order_date',    label: 'Order Date',  width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'delivery_date', label: 'Delivery',    width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'item_count',    label: 'Items',       width: 70,  align: 'right' },
  { key: 'total_amount',  label: 'Value',       width: 160, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'status',        label: 'Status',      width: 130,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const OC_COLS = [
  { key: 'confirm_id',    label: 'Confirm No.',  width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'so_ref',        label: 'Order Ref.',   width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',     width: 220 },
  { key: 'confirm_date',  label: 'Date',         width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'po_no',         label: 'PO No.',       width: 160, render: v => <span className={styles.mono}>{v}</span> },
  { key: 'payment_term',  label: 'Payment Term', width: 130 },
  { key: 'gst_applied',   label: 'GST',          width: 70, align: 'center',
    render: v => <Badge variant={v ? 'success' : 'neutral'}>{v ? 'Yes' : 'No'}</Badge> },
  { key: 'status',        label: 'Status',       width: 120,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const WO_COLS = [
  { key: 'wo_id',           label: 'WO No.',       width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'so_ref',          label: 'Order Ref.',   width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'oc_ref',          label: 'Confirm Ref.', width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name',   label: 'Customer',     width: 220 },
  { key: 'work_order_date', label: 'Date',         width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'po_no',           label: 'PO No.',       width: 160, render: v => <span className={styles.mono}>{v}</span> },
  { key: 'payment_type',    label: 'Payment',      width: 90 },
  { key: 'status',          label: 'Status',       width: 120,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const CUST_COLS = [
  { key: 'customer_id',         label: 'ID',              width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'name',                label: 'Customer',        width: 220 },
  { key: 'region',              label: 'Region/City',     width: 120 },
  { key: 'ntn',                 label: 'NTN',             width: 130, render: v => <span className={styles.mono}>{v || '—'}</span> },
  { key: 'contact',             label: 'Contact',         width: 140, render: v => <span className={styles.mono}>{v || '—'}</span> },
  { key: 'credit_limit',        label: 'Credit Limit',    width: 140, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'outstanding_balance', label: 'Outstanding',     width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${v > 0 ? styles.debit : ''}`}>{formatCurrency(v)}</span> },
  { key: 'status',              label: 'Status',          width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const DN_COLS = [
  { key: 'delivery_id',   label: 'Delivery No.', width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'so_ref',        label: 'Order',        width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',     width: 200 },
  { key: 'delivery_date', label: 'Date',         width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'vehicle_no',    label: 'Vehicle',      width: 110, render: v => <span className={styles.mono}>{v}</span> },
  { key: 'status',        label: 'Status',       width: 120,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const SINV_COLS = [
  { key: 'sale_inv_id',   label: 'Invoice No.', width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',    width: 220 },
  { key: 'date',          label: 'Date',        width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'subtotal',      label: 'Subtotal',    width: 140, align: 'right', render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'freight',       label: 'Freight',     width: 110, align: 'right', render: v => <span className={styles.mono}>{v > 0 ? formatCurrency(v) : '—'}</span> },
  { key: 'grand_total',   label: 'Grand Total', width: 150, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.totalVal}`}>{formatCurrency(v)}</span> },
  { key: 'status',        label: 'Status',      width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const RETURN_COLS = [
  { key: 'return_id',     label: 'Return No.',  width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'so_ref',        label: 'Order',       width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',    width: 200 },
  { key: 'return_date',   label: 'Date',        width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'quantity',      label: 'Qty',         width: 100, align: 'right',
    render: (v, row) => <span className={styles.mono}>{formatNumber(v)} {row.unit === 'Kilogram' ? 'kg' : row.unit}</span> },
  { key: 'amount',        label: 'Amount',      width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.debit}`}>{formatCurrency(v)}</span> },
  { key: 'reason',        label: 'Reason',      width: 180 },
  { key: 'status',        label: 'Status',      width: 110,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const GP_COLS = [
  { key: 'gate_pass_id',  label: 'Gate Pass',   width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'so_ref',        label: 'Order',        width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'dn_ref',        label: 'Delivery',     width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',     width: 200 },
  { key: 'date',          label: 'Date',         width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'vehicle_no',    label: 'Vehicle No.',  width: 110, render: v => <span className={styles.mono}>{v}</span> },
  { key: 'driver_name',   label: 'Driver',       width: 160 },
  { key: 'driver_mobile', label: 'Mobile',       width: 130, render: v => <span className={styles.mono}>{v}</span> },
  { key: 'status',        label: 'Status',       width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

export default function Sales() {
  const location = useLocation();
  const navigate  = useNavigate();
  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'orders';
  const setPageTab = (tab) => navigate(`/sales/${TAB_TO_SEG[tab] ?? tab}`, { replace: true });

  const { companyId } = useCompany();
  const [soTab,        setSoTab]        = useState('all');
  const [orderOpen,    setOrderOpen]    = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);

  const { data: customers }            = useDb(() => salesDb.getCustomers());
  const { data: dbOrders }             = useDb(() => salesDb.getSalesOrders(companyId),    [companyId]);
  const { data: deliveryNotes }        = useDb(() => salesDb.getDeliveryNotes(companyId),  [companyId]);
  const { data: orderConfirmations }   = useDb(() => salesDb.getOrderConfirmations());
  const { data: workOrders }           = useDb(() => salesDb.getWorkOrders());
  const { data: gatePasses }           = useDb(() => salesDb.getGatePasses(companyId),     [companyId]);
  const { data: salesInvoices }        = useDb(() => salesDb.getSalesInvoices(companyId),  [companyId]);
  const { data: salesReturns }         = useDb(() => salesDb.getSalesReturns(companyId),   [companyId]);

  const [orders,        setOrders]        = useState([]);
  const [customerList,  setCustomerList]  = useState([]);
  useEffect(() => { setOrders(dbOrders); },   [dbOrders]);
  useEffect(() => { setCustomerList(customers); }, [customers]);

  const handleSave         = (order) => setOrders(prev => [order, ...prev]);
  const handleCustomerSave = (cust)  => setCustomerList(prev => [cust, ...prev]);

  const openOrders      = orders.filter(o => ['pending', 'processing'].includes(o.status)).length;
  const dispatchedCount = orders.filter(o => o.status === 'dispatched').length;
  const activeCustomers = customerList.filter(c => c.status === 'active').length;

  const soData = soTab === 'all' ? orders : orders.filter(o => {
    if (soTab === 'active') return ['pending', 'processing'].includes(o.status);
    return o.status === soTab;
  });

  const tabCounts = {
    orders: orders.length, confirmation: orderConfirmations.length,
    'work-order': workOrders.length, customers: customerList.length,
    deliveries: deliveryNotes.length, invoice: salesInvoices.length,
    returns: salesReturns.length, 'gate-pass': gatePasses.length,
  };

  const stats = [
    { icon: ShoppingBag, label: 'Open Orders',     value: openOrders,      color: 'blue'   },
    { icon: Truck,       label: 'Dispatched',       value: dispatchedCount, color: 'orange' },
    { icon: Users,       label: 'Active Customers', value: activeCustomers, color: 'green'  },
    { icon: RotateCcw,   label: 'Returns',          value: salesReturns.length, color: 'purple' },
  ];

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Sales & CRM"
        subtitle="Order booking, confirmation, delivery, invoicing, and returns"
        actions={<Button icon={<Plus size={15} />} onClick={() => setOrderOpen(true)}>New Order</Button>}
      />

      <div className={styles.summaryGrid}>
        {stats.map((s) => (
          <div key={s.label} className={styles.summaryCard}>
            <div className={`${styles.summaryIcon} ${styles[s.color]}`}>
              <s.icon size={20} strokeWidth={1.75} />
            </div>
            <div>
              <p className={styles.summaryLabel}>{s.label}</p>
              <p className={styles.summaryValue}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.pageTabs}>
        {PAGE_TABS.map(t => (
          <button
            key={t.value}
            className={`${styles.pageTab} ${pageTab === t.value ? styles.pageTabActive : ''}`}
            onClick={() => setPageTab(t.value)}
          >
            <t.icon size={14} strokeWidth={1.75} />
            {t.label}
            <span className={styles.pageTabBadge}>{tabCounts[t.value]}</span>
          </button>
        ))}
      </div>

      {pageTab === 'orders' && (
        <Card padding={false}>
          <CardHeader title="Order Booking" subtitle="All sales orders" />
          <DataTable
            columns={SO_COLS} data={soData} keyField="so_id" searchPlaceholder="Search orders..."
            filterTabs={[
              { value: 'all',        label: 'All',        count: orders.length },
              { value: 'active',     label: 'Active',     count: openOrders    },
              { value: 'dispatched', label: 'Dispatched', count: dispatchedCount },
              { value: 'completed',  label: 'Completed',  count: orders.filter(o => o.status === 'completed').length },
            ]}
            activeTab={soTab} onTabChange={setSoTab}
          />
        </Card>
      )}

      {pageTab === 'confirmation' && (
        <Card padding={false}>
          <CardHeader title="Order Confirmation" subtitle="Review and confirm customer orders" />
          <DataTable columns={OC_COLS} data={orderConfirmations} keyField="confirm_id" searchPlaceholder="Search confirmations..." />
        </Card>
      )}

      {pageTab === 'work-order' && (
        <Card padding={false}>
          <CardHeader title="Work Orders" subtitle="Production work orders linked to confirmed orders" />
          <DataTable columns={WO_COLS} data={workOrders} keyField="wo_id" searchPlaceholder="Search work orders..." />
        </Card>
      )}

      {pageTab === 'customers' && (
        <Card padding={false}>
          <CardHeader
            title="Customers"
            subtitle={`${customerList.length} registered customer accounts`}
            actions={<Button icon={<Plus size={15} />} onClick={() => setCustomerOpen(true)}>New Customer</Button>}
          />
          <DataTable columns={CUST_COLS} data={customerList} keyField="customer_id" searchPlaceholder="Search by name, region, NTN..." />
        </Card>
      )}

      {pageTab === 'deliveries' && (
        <Card padding={false}>
          <CardHeader title="Delivery Notes" subtitle="Challan and dispatch records" />
          <DataTable columns={DN_COLS} data={deliveryNotes} keyField="delivery_id" searchPlaceholder="Search deliveries..." />
        </Card>
      )}

      {pageTab === 'invoice' && (
        <Card padding={false}>
          <CardHeader title="Sales Invoice" subtitle="Invoices with freight, loading, packing, toll and slitting charges" />
          <DataTable columns={SINV_COLS} data={salesInvoices} keyField="sale_inv_id" searchPlaceholder="Search invoices..." />
        </Card>
      )}

      {pageTab === 'returns' && (
        <Card padding={false}>
          <CardHeader title="Sales Returns" subtitle="Customer return and credit notes" />
          <DataTable columns={RETURN_COLS} data={salesReturns} keyField="return_id" searchPlaceholder="Search returns..." />
        </Card>
      )}

      {pageTab === 'gate-pass' && (
        <Card padding={false}>
          <CardHeader title="Gate Pass" subtitle="Vehicle exit passes for outgoing goods" />
          <DataTable columns={GP_COLS} data={gatePasses} keyField="gate_pass_id" searchPlaceholder="Search gate passes..." />
        </Card>
      )}

      <NewOrderModal    open={orderOpen}    onClose={() => setOrderOpen(false)}    onSave={handleSave} />
      <NewCustomerModal open={customerOpen} onClose={() => setCustomerOpen(false)} onSave={handleCustomerSave} />
    </div>
  );
}
