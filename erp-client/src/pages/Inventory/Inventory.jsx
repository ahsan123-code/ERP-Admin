import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Warehouse, Package, TriangleAlert, Plus, Trash2, Pencil } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import NewInwardModal from './NewInwardModal';
import SetReorderLevelModal from './SetReorderLevelModal';
import { inventoryDb, mastersDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useCatalogue } from '../../context/CatalogueContext';
import { useToast } from '../../components/shared/Toast';
import { formatNumber } from '../../utils/format';
import { getStatus, stockStatus } from '../../utils/statusConfig';
import styles from './Inventory.module.css';

const TABS = [
  { value: 'all', label: 'All Items' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low Stock' },
  { value: 'critical', label: 'Critical' },
];

// URL-driven page tabs — keeps the sidebar sub-links and the in-page tabs in sync.
const SEG_TO_TAB = {
  '': 'items', items: 'items', warehouse: 'warehouse', alerts: 'alerts',
};
const TAB_TO_SEG = { items: 'items', warehouse: 'warehouse', alerts: 'alerts' };

const PAGE_TABS = [
  { value: 'items',     label: 'Items & Stock',    icon: Package       },
  { value: 'warehouse', label: 'Warehouse Stock',  icon: Warehouse     },
  { value: 'alerts',    label: 'Low Stock Alerts', icon: TriangleAlert },
];

export default function Inventory() {
  const { companyId } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();
  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'items';
  const setPageTab = (t) => navigate(`/inventory/${TAB_TO_SEG[t] ?? t}`, { replace: true });

  const toast = useToast();
  const [tab, setTab] = useState('all');
  const [whFilter, setWhFilter] = useState('all');
  const [inwardOpen, setInwardOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [limitItem, setLimitItem] = useState(null);

  const { data: stockItems, refetch: refetchStock } = useDb(() => inventoryDb.getStockItems(companyId), [companyId]);

  // Derive the low-stock alert level from current stock vs each item's reorder limit.
  const items = useMemo(
    () => stockItems.map(i => ({ ...i, _status: stockStatus(i) })),
    [stockItems]
  );

  // Warehouse-wise rollup for the Warehouse Stock tab.
  const warehouseSummary = useMemo(() => {
    const map = new Map();
    items.forEach(i => {
      const wh = i.warehouse || 'Unassigned';
      const cur = map.get(wh) || { warehouse: wh, count: 0, totalStock: 0, low: 0 };
      cur.count += 1;
      cur.totalStock += Number(i.current_stock) || 0;
      if (i._status !== 'normal') cur.low += 1;
      map.set(wh, cur);
    });
    return [...map.values()].sort((a, b) => b.totalStock - a.totalStock);
  }, [items]);

  const whStock = whFilter === 'all' ? items : items.filter(i => (i.warehouse || 'Unassigned') === whFilter);

  const unitOf = (row) => row.unit === 'Kilogram' ? 'kg' : (row.unit || 'kg');

  const STOCK_COLS = [
    { key: 'item_code', label: 'Item Code', width: 130, render: v => <span className={styles.code}>{v}</span> },
    { key: 'item_name', label: 'Item Name', width: 220 },
    { key: 'gauge', label: 'Gauge', width: 90, render: v => v ? <span className={styles.gauge}>{v}</span> : <span className={styles.dim}>—</span> },
    { key: 'category', label: 'Category', width: 120 },
    {
      key: 'current_stock', label: 'Stock', width: 120, align: 'right',
      render: (v, row) => <span className={styles.mono}>{formatNumber(v)} {unitOf(row)}</span>
    },
    { key: 'warehouse', label: 'Warehouse', width: 140 },
    {
      key: '_status', label: 'Status', width: 100,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; }
    },
    {
      key: 'reorder_level', label: 'Alert Limit', width: 160, align: 'right', sortable: false,
      render: (v, row) => (
        <button
          type="button"
          className={`${styles.limitBtn} ${Number(v) > 0 ? styles.limitBtnSet : ''}`}
          onClick={(e) => { e.stopPropagation(); setLimitItem(row); }}
          title="Set the low-stock alert limit for this item"
        >
          {Number(v) > 0
            ? <><span className={styles.mono}>{formatNumber(v)} {unitOf(row)}</span> <Pencil size={12} strokeWidth={2} /></>
            : <><Plus size={13} strokeWidth={2.5} /> Set limit</>}
        </button>
      ),
    },
  ];
  const { data: warehouses } = useDb(() => mastersDb.getWarehouses());
  const { items: productCatalogue, addItem: addCatalogueItem, removeItem: removeCatalogueItem } = useCatalogue();

  const handleDeleteCatalogueItem = async (row) => {
    setDeletingId(row.id);
    const { error } = await removeCatalogueItem(row.id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message, 'Delete Failed');
    } else {
      toast.success(`"${row.name}" removed from catalogue.`);
    }
  };

  const PRODUCT_COLS = [
    { key: 'code', label: 'Item Code', width: 200, render: v => <span className={styles.code}>{v}</span> },
    { key: 'gauge', label: 'Gauge', width: 100, render: v => v ? <span className={styles.gauge}>{v}</span> : <span className={styles.dim}>—</span> },
    { key: 'name', label: 'Item Name', width: 440 },
    {
      key: '_actions', label: '', width: 48, sortable: false,
      render: (_, row) => (
        <button
          className={styles.rowDeleteBtn}
          disabled={deletingId === row.id}
          onClick={(e) => { e.stopPropagation(); handleDeleteCatalogueItem(row); }}
          title={`Remove "${row.name}"`}
        >
          {deletingId === row.id
            ? <span className={styles.rowDeleteSpinner}>…</span>
            : <Trash2 size={13} strokeWidth={2} />}
        </button>
      ),
    },
  ];

  const lowStockAlerts = items.filter(i => i._status === 'low' || i._status === 'critical');

  const tabCounts = {
    all: items.length,
    normal: items.filter(i => i._status === 'normal').length,
    low: items.filter(i => i._status === 'low').length,
    critical: items.filter(i => i._status === 'critical').length,
  };

  const data = tab === 'all' ? items : items.filter(i => i._status === tab);

  const stats = [
    { icon: Package, label: 'Product Catalogue', value: productCatalogue.length, color: 'blue' },
    { icon: TriangleAlert, label: 'Low Stock', value: lowStockAlerts.length, color: 'orange' },
    { icon: Warehouse, label: 'Warehouses', value: warehouses.length, color: 'purple' },
  ];

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Inventory"
        subtitle="Product catalogue, stock levels, batches, and warehouse locations"
        actions={pageTab === 'items'
          ? <Button icon={<Plus size={15} />} onClick={() => setInwardOpen(true)}>New Item</Button>
          : null}
      />

      <div className={styles.pageTabs}>
        {PAGE_TABS.map(t => (
          <button
            key={t.value}
            className={`${styles.pageTab} ${pageTab === t.value ? styles.pageTabActive : ''}`}
            onClick={() => setPageTab(t.value)}
          >
            <t.icon size={14} strokeWidth={1.75} />
            {t.label}
            {t.value === 'alerts' && lowStockAlerts.length > 0 && (
              <span className={styles.tabBadge}>{lowStockAlerts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Items & Stock ─────────────────────────────────────────────── */}
      {pageTab === 'items' && (
        <>
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

          <Card padding={false}>
            <CardHeader
              title="Product Catalogue"
              subtitle={`${productCatalogue.length} products`}
            />
            <DataTable
              columns={PRODUCT_COLS}
              data={productCatalogue}
              keyField="id"
              searchPlaceholder="Search products by code or name..."
            />
          </Card>

          <Card padding={false}>
            <CardHeader title="Stock Items" subtitle="Current stock levels — click “Set limit” on any row to set its low-stock alert" />
            <DataTable
              columns={STOCK_COLS}
              data={data}
              keyField="id"
              searchPlaceholder="Search items..."
              filterTabs={TABS.map(t => ({ ...t, count: tabCounts[t.value] }))}
              activeTab={tab}
              onTabChange={setTab}
            />
          </Card>
        </>
      )}

      {/* ── Warehouse Stock ───────────────────────────────────────────── */}
      {pageTab === 'warehouse' && (
        <>
          <div className={styles.summaryGrid}>
            {warehouseSummary.map((w) => (
              <div key={w.warehouse} className={styles.summaryCard}>
                <div className={`${styles.summaryIcon} ${styles.purple}`}>
                  <Warehouse size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <p className={styles.summaryLabel}>{w.warehouse}</p>
                  <p className={styles.summaryValue}>{formatNumber(w.totalStock)} <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>kg</span></p>
                  <p className={styles.summaryLabel} style={{ marginTop: 2 }}>{w.count} items{w.low > 0 ? ` · ${w.low} need attention` : ''}</p>
                </div>
              </div>
            ))}
          </div>

          <Card padding={false}>
            <CardHeader title="Warehouse Stock" subtitle="Stock levels grouped by warehouse" />
            <DataTable
              columns={STOCK_COLS}
              data={whStock}
              keyField="id"
              searchPlaceholder="Search items..."
              filterTabs={[
                { value: 'all', label: 'All Warehouses', count: items.length },
                ...warehouseSummary.map(w => ({ value: w.warehouse, label: w.warehouse, count: w.count })),
              ]}
              activeTab={whFilter}
              onTabChange={setWhFilter}
            />
          </Card>
        </>
      )}

      {/* ── Low Stock Alerts ──────────────────────────────────────────── */}
      {pageTab === 'alerts' && (
        <>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.orange}`}><TriangleAlert size={20} strokeWidth={1.75} /></div>
              <div>
                <p className={styles.summaryLabel}>Low Stock</p>
                <p className={styles.summaryValue}>{tabCounts.low}</p>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.orange}`}><TriangleAlert size={20} strokeWidth={1.75} /></div>
              <div>
                <p className={styles.summaryLabel}>Critical / Out of Stock</p>
                <p className={styles.summaryValue}>{tabCounts.critical}</p>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.blue}`}><Package size={20} strokeWidth={1.75} /></div>
              <div>
                <p className={styles.summaryLabel}>Items With a Limit Set</p>
                <p className={styles.summaryValue}>{items.filter(i => Number(i.reorder_level) > 0).length}</p>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader
              title="Low Stock Alerts"
              subtitle={lowStockAlerts.length > 0
                ? `${lowStockAlerts.length} items at or below their reorder limit`
                : 'No items below their reorder limit'}
            />
            {lowStockAlerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                Nothing to reorder right now. Set a reorder limit on the <strong>Items &amp; Stock</strong> tab to start tracking items here.
              </div>
            ) : (
              <div className={styles.alertList}>
                {lowStockAlerts.map(a => (
                  <div key={a.id} className={`${styles.alertRow} ${a._status === 'critical' ? styles.alertCritical : styles.alertLow}`}>
                    <TriangleAlert size={15} strokeWidth={1.75} />
                    <span className={styles.alertName}>{a.item_name}</span>
                    <span className={styles.alertStock}>
                      <span className={styles.mono}>{formatNumber(a.current_stock)} {unitOf(a)}</span> current
                      &nbsp;/&nbsp;
                      <span className={styles.mono}>{formatNumber(a.reorder_level)} {unitOf(a)}</span> reorder
                    </span>
                    <Badge variant={a._status === 'critical' ? 'danger' : 'warning'}>
                      {a._status === 'critical' ? 'Critical' : 'Low'}
                    </Badge>
                    <button
                      type="button"
                      className={styles.limitBtn}
                      onClick={() => setLimitItem(a)}
                      title="Adjust reorder limit"
                      style={{ marginLeft: 'auto' }}
                    >
                      <Pencil size={12} strokeWidth={2} /> Adjust
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <NewInwardModal
        open={inwardOpen}
        onClose={() => setInwardOpen(false)}
        onSave={addCatalogueItem}
      />

      <SetReorderLevelModal
        open={!!limitItem}
        item={limitItem}
        onClose={() => setLimitItem(null)}
        onSaved={refetchStock}
      />
    </div>
  );
}
