import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  TrendingUp, ShoppingBag, Factory, Package,
  Users, Warehouse, ShoppingCart,
  ReceiptText, Landmark, ArrowRight, BarChart3,
  LayoutDashboard, Boxes, FileBarChart, Navigation, Receipt,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/shared/StatCard';
import Card, { CardHeader } from '../../components/shared/Card';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/shared/DataTable';
import { useDb } from '../../hooks/useDb';
import { dashboardDb, salesDb, inventoryDb, financeDb, procurementDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';
import { useCustomers } from '../../context/CustomerContext';
import { formatDate, timeAgo, formatCurrency } from '../../utils/format';
import { getStatus, stockStatus } from '../../utils/statusConfig';
import CustomerSearch from './CustomerSearch';
import CustomerProfilePanel from './CustomerProfilePanel';
import NewInvoiceModal from '../Invoicing/NewInvoiceModal';
import NewOrderModal from '../Sales/NewOrderModal';
import styles from './Dashboard.module.css';

const CHART_RANGES = [
  { value: '6m',  label: '6 Months' },
  { value: '1y',  label: '1 Year'   },
  { value: '3y',  label: '3 Years'  },
];

const PAGE_TABS = [
  { value: 'overview',      label: 'Overview',        icon: LayoutDashboard },
  { value: 'analytics',     label: 'Analytics',       icon: BarChart3       },
  { value: 'stock',         label: 'Available Stock', icon: Boxes           },
  { value: 'sales-summary', label: 'Sales Summary',   icon: FileBarChart    },
  { value: 'tracking',      label: 'Sales Tracking',  icon: Navigation      },
  { value: 'sales-tax',     label: 'Sales Tax',       icon: Receipt         },
];

const SEG_TO_TAB = {
  '': 'overview', analytics: 'analytics', stock: 'stock',
  'sales-summary': 'sales-summary', tracking: 'tracking', 'sales-tax': 'sales-tax',
};

const KPI_ICONS = {
  revenue:   <TrendingUp size={20} strokeWidth={1.75} />,
  orders:    <ShoppingBag size={20} strokeWidth={1.75} />,
  inventory: <Package size={20} strokeWidth={1.75} />,
  employees: <Users size={20} strokeWidth={1.75} />,
};

const MODULE_ICONS = {
  inventory:   <Warehouse size={22} strokeWidth={1.75} />,
  procurement: <ShoppingCart size={22} strokeWidth={1.75} />,
  production:  <Factory size={22} strokeWidth={1.75} />,
  sales:       <ShoppingBag size={22} strokeWidth={1.75} />,
  invoicing:   <ReceiptText size={22} strokeWidth={1.75} />,
  finance:     <Landmark size={22} strokeWidth={1.75} />,
  hr:          <Users size={22} strokeWidth={1.75} />,
};

const STOCK_COLS = [
  { key: 'item_code',     label: 'Item Code',     width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'item_name',     label: 'Item Name',     width: 260 },
  { key: 'current_stock', label: 'Current Stock', width: 140, align: 'right',
    render: (v, row) => <span className={`${styles.mono} ${stockStatus(row) === 'normal' ? styles.stockOk : styles.stockLow}`}>{Number(v).toLocaleString()} {row.unit || ''}</span> },
  { key: 'reorder_level', label: 'Reorder Level', width: 130, align: 'right', render: v => Number(v) > 0 ? <span className={styles.mono}>{Number(v).toLocaleString()}</span> : <span className={styles.nil}>—</span> },
  { key: 'warehouse',     label: 'Warehouse',     width: 180 },
  { key: 'status',        label: 'Status',        width: 100,
    render: (_, row) => { const s = getStatus(stockStatus(row)); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const SO_SUMMARY_COLS = [
  { key: 'so_id',         label: 'Order No.',  width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',   width: 220 },
  { key: 'order_date',    label: 'Order Date', width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'delivery_date', label: 'Delivery',   width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'total_amount',  label: 'Amount',     width: 160, align: 'right', render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'item_count',    label: 'Items',      width: 70,  align: 'right' },
  { key: 'status',        label: 'Status',     width: 120,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const TAX_COLS = [
  { key: 'sale_inv_id',   label: 'Invoice No.', width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',    width: 220 },
  { key: 'date',          label: 'Date',        width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'subtotal',      label: 'Subtotal',    width: 150, align: 'right', render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'gst',           label: 'GST (17%)',   width: 140, align: 'right',
    render: (_, row) => {
      const gst = Math.round(Number(row.subtotal) * 0.17);
      return gst > 0 ? <span className={styles.mono}>{formatCurrency(gst)}</span> : <span className={styles.nil}>—</span>;
    }},
  { key: 'grand_total',   label: 'Grand Total', width: 160, align: 'right', render: v => <span className={`${styles.mono} ${styles.totalVal}`}>{formatCurrency(v)}</span> },
  { key: 'status',        label: 'Status',      width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

// Split a set of bills into Cash Sale vs Credit Sale totals (amount + bill count).
// Bills default to 'credit' when untagged (historical data).
function splitBills(invoices) {
  const acc = {
    cash:   { count: 0, amount: 0 },
    credit: { count: 0, amount: 0 },
    total:  { count: 0, amount: 0 },
  };
  for (const inv of invoices) {
    const bucket = String(inv.sale_type).toLowerCase() === 'cash' ? 'cash' : 'credit';
    const amt = Number(inv.grand_total) || 0;
    acc[bucket].count += 1;
    acc[bucket].amount += amt;
    acc.total.count += 1;
    acc.total.amount += amt;
  }
  return acc;
}

// Build the daily + monthly Cash/Credit breakdown, anchored to the most recent
// bill date in the data (so demo data shows numbers, and in production the latest
// bill is today). Returns the anchor date plus per-day and per-month splits.
function buildSalesBreakdown(invoices) {
  const dates = invoices.map(i => i.date).filter(Boolean).sort();
  const anchor = dates.length ? dates[dates.length - 1] : null;
  if (!anchor) {
    const empty = splitBills([]);
    return { anchorDate: null, day: empty, month: empty };
  }
  const dayKey   = anchor.slice(0, 10);
  const monthKey = anchor.slice(0, 7);
  return {
    anchorDate: anchor,
    day:   splitBills(invoices.filter(i => i.date && i.date.slice(0, 10) === dayKey)),
    month: splitBills(invoices.filter(i => i.date && i.date.slice(0, 7) === monthKey)),
  };
}

function SalesSplitCard({ title, subtitle, data }) {
  return (
    <Card className={styles.chartCard} padding={false}>
      <div className={styles.chartInner}>
        <CardHeader title={title} subtitle={subtitle} />
        <div className={styles.stockSummary} style={{ marginTop: 'var(--sp-4)' }}>
          <div className={styles.stockStat}>
            <span className={`${styles.stockStatVal} ${styles.stockOk}`}>{formatCurrency(data.cash.amount)}</span>
            <span className={styles.stockStatLbl}>Cash Sale · {data.cash.count} bills</span>
          </div>
          <div className={styles.stockStat}>
            <span className={`${styles.stockStatVal} ${styles.stockWarn}`}>{formatCurrency(data.credit.amount)}</span>
            <span className={styles.stockStatLbl}>Credit Sale · {data.credit.count} bills</span>
          </div>
          <div className={styles.stockStat}>
            <span className={styles.stockStatVal}>{formatCurrency(data.total.amount)}</span>
            <span className={styles.stockStatLbl}>Total · {data.total.count} bills</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function buildChartData(invoices, range) {
  if (!invoices.length) return [];

  // Find actual date range in data
  const dates  = invoices.map(i => i.date).filter(Boolean).sort();
  const latest = new Date(dates[dates.length - 1]);

  if (range === '6m') {
    // Last 6 months from latest invoice date
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(latest.getFullYear(), latest.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString('en', { month: 'short', year: '2-digit' }), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`, value: 0 });
    }
    for (const inv of invoices) {
      const key = inv.date?.slice(0, 7);
      const m   = months.find(x => x.key === key);
      if (m) m.value += Number(inv.grand_total) || 0;
    }
    return months.map(({ label, value }) => ({ label, value }));
  }

  if (range === '1y') {
    // Last 12 months from latest invoice date
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(latest.getFullYear(), latest.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString('en', { month: 'short', year: '2-digit' }), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`, value: 0 });
    }
    for (const inv of invoices) {
      const key = inv.date?.slice(0, 7);
      const m   = months.find(x => x.key === key);
      if (m) m.value += Number(inv.grand_total) || 0;
    }
    return months.map(({ label, value }) => ({ label, value }));
  }

  // 3y — group by year-quarter
  const quarters = [];
  for (let i = 11; i >= 0; i--) {
    const d   = new Date(latest.getFullYear(), latest.getMonth() - i * 3, 1);
    const qn  = Math.floor(d.getMonth() / 3) + 1;
    quarters.push({ label: `Q${qn} '${String(d.getFullYear()).slice(2)}`, year: d.getFullYear(), q: qn, value: 0 });
  }
  for (const inv of invoices) {
    if (!inv.date) continue;
    const d   = new Date(inv.date);
    const qn  = Math.floor(d.getMonth() / 3) + 1;
    const bkt = quarters.find(x => x.year === d.getFullYear() && x.q === qn);
    if (bkt) bkt.value += Number(inv.grand_total) || 0;
  }
  return quarters.map(({ label, value }) => ({ label, value }));
}

function BarChart({ data }) {
  if (!data || data.length === 0 || data.every(d => d.value === 0)) {
    return <div className={styles.barChart} style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No data</div>;
  }
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className={styles.barChart}>
      {data.map((d, i) => (
        <div key={d.label} className={styles.barCol}>
          <div className={styles.bar} style={{ height: `${(d.value / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
          <span className={styles.barLabel}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function TrackingPipeline({ orders }) {
  const statuses = ['pending', 'processing', 'dispatched', 'completed', 'cancelled'];
  const grouped = statuses.map(s => ({
    status: s,
    orders: orders.filter(o => o.status === s).slice(0, 30),
    cfg: getStatus(s),
  }));
  return (
    <div className={styles.pipeline}>
      {grouped.map(g => (
        <div key={g.status} className={styles.pipelineCol}>
          <div className={styles.pipelineHeader}>
            <Badge variant={g.cfg.variant}>{g.cfg.label}</Badge>
            <span className={styles.pipelineCount}>{orders.filter(o => o.status === g.status).length}</span>
          </div>
          {g.orders.map(o => (
            <div key={o.so_id} className={styles.pipelineCard}>
              <div className={styles.pipelineId}>{o.so_id}</div>
              <div className={styles.pipelineCustomer}>{o.customer_name}</div>
              <div className={styles.pipelineAmt}>{formatCurrency(o.total_amount)}</div>
              <div className={styles.pipelineDate}>{formatDate(o.order_date)}</div>
            </div>
          ))}
          {g.orders.length === 0 && <div className={styles.pipelineEmpty}>No orders</div>}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const location = useLocation();
  const navigate  = useNavigate();
  const seg = location.pathname.split('/').filter(Boolean);
  const subView = (seg[0] === 'dashboard' && seg[1]) ? (SEG_TO_TAB[seg[1]] ?? 'overview') : 'overview';
  const setSubView = (v) => {
    if (v === 'overview') navigate('/', { replace: true });
    else navigate(`/dashboard/${v}`, { replace: true });
  };

  const { companyId } = useCompany();
  const [chartRange, setChartRange]     = useState('1y');
  const [orderFilter, setOrderFilter]   = useState('all');
  const [stockTab, setStockTab]         = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [prefillCustomer,  setPrefillCustomer]  = useState(null);
  const [showNewInvoice,   setShowNewInvoice]   = useState(false);
  const [showNewOrder,     setShowNewOrder]     = useState(false);

  const { data: activityFeed }    = useDb(() => dashboardDb.getRecentActivity());
  const { data: empRows }         = useDb(() => dashboardDb.getEmployeeCount());
  const { data: dbOrders }        = useDb(() => salesDb.getSalesOrders(companyId),        [companyId]);
  const { data: dbStockItems }    = useDb(() => inventoryDb.getStockItems(companyId),     [companyId]);
  const { data: dbSalesInvoices } = useDb(() => salesDb.getSalesInvoices(companyId),      [companyId]);
  const { customers: dbCustomers } = useCustomers();
  const { data: dbVouchers }      = useDb(() => financeDb.getVouchers(companyId),         [companyId]);
  const { data: dbPOs }           = useDb(() => procurementDb.getPurchaseOrders(companyId),[companyId]);

  const activeEmployees = empRows.length;
  const totalRevenue    = dbSalesInvoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0);
  const lowStockCount   = dbStockItems.filter(i => stockStatus(i) !== 'normal').length;

  const chartData = useMemo(() => buildChartData(dbSalesInvoices, chartRange), [dbSalesInvoices, chartRange]);
  const salesBreakdown = useMemo(() => buildSalesBreakdown(dbSalesInvoices), [dbSalesInvoices]);
  const breakdownDate  = salesBreakdown.anchorDate ? new Date(salesBreakdown.anchorDate) : null;
  const dayLabel       = breakdownDate ? formatDate(salesBreakdown.anchorDate) : '—';
  const monthLabel     = breakdownDate
    ? breakdownDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : '—';

  const liveKpis = [
    { id: 'revenue',   label: 'Total Revenue',   value: formatCurrency(totalRevenue),          rawValue: totalRevenue,    change: 0, changeType: 'neutral', accentVar: '--green',  bgVar: '--green-muted'  },
    { id: 'orders',    label: 'Sales Orders',     value: dbOrders.length > 0 ? dbOrders.length.toLocaleString() : '—', rawValue: dbOrders.length, change: 0, changeType: 'neutral', accentVar: '--blue',   bgVar: '--blue-muted'   },
    { id: 'inventory', label: 'Stock Items',      value: dbStockItems.length > 0 ? dbStockItems.length.toLocaleString() : '—', rawValue: dbStockItems.length, change: 0, changeType: 'neutral', accentVar: '--purple', bgVar: '--purple-muted' },
    { id: 'employees', label: 'Active Employees', value: activeEmployees > 0 ? String(activeEmployees) : '—', rawValue: activeEmployees, change: 0, changeType: 'neutral', accentVar: '--orange', bgVar: '--orange-muted' },
  ];

  const liveModuleCards = [
    { id: 'inventory',   label: 'Inventory',    path: '/inventory',   accentVar: '--blue',   stat1Label: 'Stock Items', stat1Value: dbStockItems.length,  stat2Label: 'Low / Critical', stat2Value: lowStockCount, stat2Warn: lowStockCount > 0 },
    { id: 'procurement', label: 'Procurement',  path: '/procurement', accentVar: '--purple', stat1Label: 'Purchase Orders', stat1Value: dbPOs.length, stat2Label: 'Vendors',   stat2Value: '—',           stat2Warn: false },
    { id: 'production',  label: 'Production',   path: '/production',  accentVar: '--orange', stat1Label: 'Work Orders', stat1Value: '—',              stat2Label: 'This Month', stat2Value: '—',           stat2Warn: false },
    { id: 'sales',       label: 'Sales & CRM',  path: '/sales',       accentVar: '--green',  stat1Label: 'Orders',      stat1Value: dbOrders.length,     stat2Label: 'Customers',  stat2Value: dbCustomers.length, stat2Warn: false },
    { id: 'invoicing',   label: 'Invoicing',    path: '/invoicing',   accentVar: '--cyan',   stat1Label: 'Invoices',    stat1Value: dbSalesInvoices.length, stat2Label: 'Total Value', stat2Value: formatCurrency(totalRevenue), stat2Warn: false },
    { id: 'finance',     label: 'Finance',      path: '/finance',     accentVar: '--blue',   stat1Label: 'Vouchers',    stat1Value: dbVouchers.length,   stat2Label: 'Overdue',    stat2Value: '—',           stat2Warn: false },
    { id: 'hr',          label: 'HR & Payroll', path: '/hr',          accentVar: '--purple', stat1Label: 'Employees',   stat1Value: activeEmployees,     stat2Label: 'On Leave',   stat2Value: '—',           stat2Warn: false },
  ];

  const filteredOrders = (orderFilter === 'all' ? dbOrders : dbOrders.filter(o => o.status === orderFilter)).slice(0, 50);
  const filteredStock  = stockTab === 'all' ? dbStockItems : dbStockItems.filter(i => stockStatus(i) === stockTab);

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const handleNewInvoice = (customer) => {
    setPrefillCustomer(customer);
    setSelectedCustomer(null);
    setShowNewInvoice(true);
  };

  const handleNewOrder = (customer) => {
    setPrefillCustomer(customer);
    setSelectedCustomer(null);
    setShowNewOrder(true);
  };

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader title="Dashboard" subtitle={dateStr} />

      <CustomerSearch onSelect={setSelectedCustomer} />

      {selectedCustomer && (
        <CustomerProfilePanel
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onNewInvoice={handleNewInvoice}
          onNewOrder={handleNewOrder}
        />
      )}

      <NewInvoiceModal
        open={showNewInvoice}
        onClose={() => { setShowNewInvoice(false); setPrefillCustomer(null); }}
        onSave={() => { setShowNewInvoice(false); setPrefillCustomer(null); }}
        prefillCustomer={prefillCustomer}
      />

      <NewOrderModal
        open={showNewOrder}
        onClose={() => { setShowNewOrder(false); setPrefillCustomer(null); }}
        onSave={() => { setShowNewOrder(false); setPrefillCustomer(null); }}
        prefillCustomer={prefillCustomer}
      />

      <div className={styles.pageTabs}>
        {PAGE_TABS.map(t => (
          <button
            key={t.value}
            className={`${styles.pageTab} ${subView === t.value ? styles.pageTabActive : ''}`}
            onClick={() => setSubView(t.value)}
          >
            <t.icon size={15} strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────── */}
      {subView === 'overview' && (
        <>
          <div className={styles.statsGrid}>
            {liveKpis.map(stat => (
              <StatCard key={stat.id} stat={stat} icon={KPI_ICONS[stat.id]} />
            ))}
          </div>

          <div className={styles.chartsRow} style={{ gridTemplateColumns: '1fr 1fr' }}>
            <SalesSplitCard
              title="Daily Sales"
              subtitle={`All bills on ${dayLabel} — Cash vs Credit`}
              data={salesBreakdown.day}
            />
            <SalesSplitCard
              title="Monthly Sales"
              subtitle={`All bills in ${monthLabel} — Cash vs Credit`}
              data={salesBreakdown.month}
            />
          </div>

          <div className={styles.chartsRow}>
            <Card className={styles.chartCard} padding={false}>
              <div className={styles.chartInner}>
                <CardHeader
                  title="Revenue Trends"
                  subtitle="Sales invoice grand totals"
                  actions={
                    <div className={styles.chartTabs}>
                      {CHART_RANGES.map(({ value: v, label: l }) => (
                        <button
                          key={v}
                          className={`${styles.chartTab} ${chartRange === v ? styles.chartTabActive : ''}`}
                          onClick={() => setChartRange(v)}
                        >{l}</button>
                      ))}
                    </div>
                  }
                />
                <div className={styles.chartContainer}>
                  <BarChart data={chartData} />
                </div>
              </div>
            </Card>

            <Card className={styles.activityCard} padding={false}>
              <div className={styles.chartInner}>
                <CardHeader title="Recent Activity" subtitle="System audit log" />
                <div className={styles.activityList}>
                  {activityFeed.length === 0 && (
                    <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>No activity yet</div>
                  )}
                  {activityFeed.map(item => (
                    <div key={item.id} className={styles.activityItem}>
                      <div className={styles.activityDot} style={{ '--dot-color': 'var(--blue)' }} />
                      <div className={styles.activityContent}>
                        <p className={styles.activityTitle}>{item.action}</p>
                        <p className={styles.activityMeta}>{item.module} · {item.user_name}</p>
                      </div>
                      <span className={styles.activityTime}>{timeAgo(item.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className={styles.modulesGrid}>
            {liveModuleCards.map(m => (
              <div
                key={m.id}
                className={styles.moduleCard}
                style={{ '--module-accent': `var(${m.accentVar})`, '--module-muted': `var(${m.accentVar}-muted)` }}
                onClick={() => navigate(m.path)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate(m.path)}
              >
                <div className={styles.moduleAccentBar} />
                <div className={styles.moduleTop}>
                  <div className={styles.moduleIconBox}>{MODULE_ICONS[m.id]}</div>
                  <ArrowRight className={styles.moduleArrow} size={16} strokeWidth={1.75} />
                </div>
                <p className={styles.moduleName}>{m.label}</p>
                <div className={styles.moduleStats}>
                  <div className={styles.moduleStat}>
                    <span className={styles.moduleStatLabel}>{m.stat1Label}</span>
                    <span className={styles.moduleStatValue}>{m.stat1Value}</span>
                  </div>
                  <div className={styles.moduleStat}>
                    <span className={styles.moduleStatLabel}>{m.stat2Label}</span>
                    <span className={`${styles.moduleStatValue} ${m.stat2Warn ? styles.moduleStatWarn : ''}`}>{m.stat2Value}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Card padding={false}>
            <div className={styles.tableInner}>
              <CardHeader
                title="Recent Orders"
                subtitle="Latest sales activity"
                actions={
                  <div className={styles.filterTabs}>
                    {[['all','All'],['pending','Pending'],['processing','Processing'],['completed','Completed']].map(([v,l]) => (
                      <button
                        key={v}
                        className={`${styles.filterTab} ${orderFilter === v ? styles.filterTabActive : ''}`}
                        onClick={() => setOrderFilter(v)}
                      >{l}</button>
                    ))}
                  </div>
                }
              />
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Order ID</th><th>Customer</th><th>Items</th>
                      <th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No orders</td></tr>
                    )}
                    {filteredOrders.map(o => {
                      const s = getStatus(o.status);
                      return (
                        <tr key={o.so_id}>
                          <td><strong className={styles.orderId}>{o.so_id}</strong></td>
                          <td>{o.customer_name}</td>
                          <td className={styles.mono}>{o.item_count}</td>
                          <td className={styles.mono} style={{ textAlign: 'right' }}>{formatCurrency(o.total_amount)}</td>
                          <td><Badge variant={s.variant}>{s.label}</Badge></td>
                          <td className={styles.dateCell}>{formatDate(o.order_date)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* ── Analytics ────────────────────────────────────────────── */}
      {subView === 'analytics' && (
        <>
          <div className={styles.statsGrid}>
            {liveKpis.map(stat => (
              <StatCard key={stat.id} stat={stat} icon={KPI_ICONS[stat.id]} />
            ))}
          </div>
          <div className={styles.chartsRow}>
            <Card className={styles.chartCard} padding={false}>
              <div className={styles.chartInner}>
                <CardHeader
                  title="Revenue Trends"
                  subtitle="Sales invoice grand totals"
                  actions={
                    <div className={styles.chartTabs}>
                      {[['7d','7 Days'],['30d','30 Days'],['90d','90 Days']].map(([v,l]) => (
                        <button key={v}
                          className={`${styles.chartTab} ${chartRange === v ? styles.chartTabActive : ''}`}
                          onClick={() => setChartRange(v)}
                        >{l}</button>
                      ))}
                    </div>
                  }
                />
                <div className={styles.chartContainer}><BarChart data={chartData} /></div>
              </div>
            </Card>
            <Card className={styles.activityCard} padding={false}>
              <div className={styles.chartInner}>
                <CardHeader title="Recent Activity" subtitle="System audit log" />
                <div className={styles.activityList}>
                  {activityFeed.length === 0 && (
                    <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>No activity yet</div>
                  )}
                  {activityFeed.map(item => (
                    <div key={item.id} className={styles.activityItem}>
                      <div className={styles.activityDot} style={{ '--dot-color': 'var(--blue)' }} />
                      <div className={styles.activityContent}>
                        <p className={styles.activityTitle}>{item.action}</p>
                        <p className={styles.activityMeta}>{item.module} · {item.user_name}</p>
                      </div>
                      <span className={styles.activityTime}>{timeAgo(item.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ── Available Stock ───────────────────────────────────────── */}
      {subView === 'stock' && (
        <>
          <div className={styles.stockSummary}>
            <div className={styles.stockStat}>
              <span className={styles.stockStatVal}>{dbStockItems.length}</span>
              <span className={styles.stockStatLbl}>Total Items</span>
            </div>
            <div className={styles.stockStat}>
              <span className={`${styles.stockStatVal} ${styles.stockOk}`}>{dbStockItems.filter(i => stockStatus(i) === 'normal').length}</span>
              <span className={styles.stockStatLbl}>Normal Stock</span>
            </div>
            <div className={styles.stockStat}>
              <span className={`${styles.stockStatVal} ${styles.stockWarn}`}>{dbStockItems.filter(i => stockStatus(i) === 'low').length}</span>
              <span className={styles.stockStatLbl}>Low Stock</span>
            </div>
            <div className={styles.stockStat}>
              <span className={`${styles.stockStatVal} ${styles.stockLow}`}>{dbStockItems.filter(i => stockStatus(i) === 'critical').length}</span>
              <span className={styles.stockStatLbl}>Critical</span>
            </div>
          </div>
          <Card padding={false}>
            <CardHeader title="Available Stock" subtitle="Current inventory levels across all warehouses" />
            <DataTable
              columns={STOCK_COLS}
              data={filteredStock}
              keyField="id"
              searchPlaceholder="Search items..."
              filterTabs={[
                { value: 'all',      label: 'All',       count: dbStockItems.length },
                { value: 'normal',   label: 'Normal',    count: dbStockItems.filter(i => stockStatus(i) === 'normal').length },
                { value: 'low',      label: 'Low Stock', count: dbStockItems.filter(i => stockStatus(i) === 'low').length },
                { value: 'critical', label: 'Critical',  count: dbStockItems.filter(i => stockStatus(i) === 'critical').length },
              ]}
              activeTab={stockTab}
              onTabChange={setStockTab}
            />
          </Card>
        </>
      )}

      {/* ── Sales Summary ─────────────────────────────────────────── */}
      {subView === 'sales-summary' && (
        <>
          <div className={styles.stockSummary}>
            <div className={styles.stockStat}>
              <span className={styles.stockStatVal}>{dbOrders.length.toLocaleString()}</span>
              <span className={styles.stockStatLbl}>Total Orders</span>
            </div>
            <div className={styles.stockStat}>
              <span className={`${styles.stockStatVal} ${styles.stockOk}`}>
                {formatCurrency(dbOrders.filter(o => o.status === 'completed').reduce((s, o) => s + (Number(o.total_amount) || 0), 0))}
              </span>
              <span className={styles.stockStatLbl}>Completed Sales</span>
            </div>
            <div className={styles.stockStat}>
              <span className={styles.stockStatVal}>{dbCustomers.length}</span>
              <span className={styles.stockStatLbl}>Customers</span>
            </div>
            <div className={styles.stockStat}>
              <span className={`${styles.stockStatVal} ${styles.stockOk}`}>
                {formatCurrency(dbOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0))}
              </span>
              <span className={styles.stockStatLbl}>Total Sales Value</span>
            </div>
          </div>
          <Card padding={false}>
            <CardHeader title="Sales Orders Summary" subtitle="All sales orders with amounts and status" />
            <DataTable columns={SO_SUMMARY_COLS} data={dbOrders} keyField="so_id" searchPlaceholder="Search orders..." />
          </Card>
        </>
      )}

      {/* ── Sales Tracking ────────────────────────────────────────── */}
      {subView === 'tracking' && (
        <Card padding={false}>
          <CardHeader title="Sales Order Pipeline" subtitle="Track orders through dispatch stages" />
          <div className={styles.pipelineWrap}>
            <TrackingPipeline orders={dbOrders} />
          </div>
        </Card>
      )}

      {/* ── Sales Tax ─────────────────────────────────────────────── */}
      {subView === 'sales-tax' && (
        <>
          <div className={styles.stockSummary}>
            <div className={styles.stockStat}>
              <span className={styles.stockStatVal}>{dbSalesInvoices.filter(i => i.status === 'posted').length.toLocaleString()}</span>
              <span className={styles.stockStatLbl}>Posted Invoices</span>
            </div>
            <div className={styles.stockStat}>
              <span className={`${styles.stockStatVal} ${styles.stockOk}`}>
                {formatCurrency(dbSalesInvoices.reduce((s, i) => s + Math.round(Number(i.subtotal) * 0.17), 0))}
              </span>
              <span className={styles.stockStatLbl}>Total GST (17%)</span>
            </div>
            <div className={styles.stockStat}>
              <span className={styles.stockStatVal}>{dbSalesInvoices.length.toLocaleString()}</span>
              <span className={styles.stockStatLbl}>Total Invoices</span>
            </div>
            <div className={styles.stockStat}>
              <span className={`${styles.stockStatVal} ${styles.stockOk}`}>
                {formatCurrency(totalRevenue)}
              </span>
              <span className={styles.stockStatLbl}>Grand Total</span>
            </div>
          </div>
          <Card padding={false}>
            <CardHeader title="Sales Tax Dashboard" subtitle="Invoice-wise GST summary (17%)" />
            <DataTable columns={TAX_COLS} data={dbSalesInvoices} keyField="sale_inv_id" searchPlaceholder="Search invoices..." />
          </Card>
        </>
      )}
    </div>
  );
}
