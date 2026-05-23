import { useState } from 'react';
import { Warehouse, Package, TriangleAlert, Plus, Box } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import NewInwardModal from './NewInwardModal';
import { inventoryDb, mastersDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { formatDate, formatNumber } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import styles from './Inventory.module.css';

const TABS = [
  { value: 'all',      label: 'All Items'  },
  { value: 'normal',   label: 'Normal'     },
  { value: 'low',      label: 'Low Stock'  },
  { value: 'critical', label: 'Critical'   },
];

const STOCK_COLS = [
  { key: 'item_code',     label: 'Item Code',  width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'item_name',     label: 'Item Name',  width: 220 },
  { key: 'gauge',         label: 'Gauge',      width: 90,  render: v => v ? <span className={styles.gauge}>{v}</span> : <span className={styles.dim}>—</span> },
  { key: 'category',      label: 'Category',   width: 120 },
  { key: 'current_stock', label: 'Stock',      width: 120, align: 'right',
    render: (v, row) => <span className={styles.mono}>{formatNumber(v)} {row.unit === 'Kilogram' ? 'kg' : (row.unit || '')}</span> },
  { key: 'warehouse',     label: 'Warehouse',  width: 150 },
  { key: 'batch_no',      label: 'Batch',      width: 100, render: v => <span className={styles.code}>{v}</span> },
  { key: 'status',        label: 'Status',     width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const PRODUCT_COLS = [
  { key: 'code',  label: 'Item Code', width: 200, render: v => <span className={styles.code}>{v}</span> },
  { key: 'gauge', label: 'Gauge',     width: 100, render: v => v ? <span className={styles.gauge}>{v}</span> : <span className={styles.dim}>—</span> },
  { key: 'name',  label: 'Item Name', width: 500 },
];

export default function Inventory() {
  const { companyId } = useCompany();
  const [tab, setTab] = useState('all');
  const [inwardOpen, setInwardOpen] = useState(false);

  const { data: stockItems }      = useDb(() => inventoryDb.getStockItems(companyId), [companyId]);
  const { data: warehouses }      = useDb(() => mastersDb.getWarehouses());
  const { data: productCatalogue } = useDb(() => mastersDb.getProductCatalogue());

  const lowStockAlerts = stockItems.filter(i => i.status === 'low' || i.status === 'critical');

  const tabCounts = {
    all:      stockItems.length,
    normal:   stockItems.filter(i => i.status === 'normal').length,
    low:      stockItems.filter(i => i.status === 'low').length,
    critical: stockItems.filter(i => i.status === 'critical').length,
  };

  const data = tab === 'all' ? stockItems : stockItems.filter(i => i.status === tab);

  const stats = [
    { icon: Package,       label: 'Product Catalogue', value: productCatalogue.length, color: 'blue'   },
    { icon: TriangleAlert, label: 'Low Stock',          value: lowStockAlerts.length,  color: 'orange' },
    { icon: Warehouse,     label: 'Warehouses',         value: warehouses.length,      color: 'purple' },
  ];

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Inventory"
        subtitle="Product catalogue, stock levels, batches, and warehouse locations"
        actions={<Button icon={<Plus size={15} />} onClick={() => setInwardOpen(true)}>New Inward</Button>}
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

      <Card padding={false}>
        <CardHeader
          title="Product Catalogue"
          subtitle={`${productCatalogue.length} products — imported from GenX ERP`}
        />
        <DataTable
          columns={PRODUCT_COLS}
          data={productCatalogue}
          keyField="id"
          searchPlaceholder="Search products by code or name..."
        />
      </Card>

      <Card padding={false}>
        <CardHeader title="Stock Items" subtitle="Current stock levels across warehouses" />
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

      {lowStockAlerts.length > 0 && (
        <Card>
          <CardHeader title="Low Stock Alerts" subtitle={`${lowStockAlerts.length} items below reorder level`} />
          <div className={styles.alertList}>
            {lowStockAlerts.map(a => (
              <div key={a.id} className={`${styles.alertRow} ${a.status === 'critical' ? styles.alertCritical : styles.alertLow}`}>
                <TriangleAlert size={15} strokeWidth={1.75} />
                <span className={styles.alertName}>{a.item_name}</span>
                <span className={styles.alertStock}>
                  <span className={styles.mono}>{formatNumber(a.current_stock)} {a.unit || 'kg'}</span> current
                  &nbsp;/&nbsp;
                  <span className={styles.mono}>{formatNumber(a.reorder_level)} {a.unit || 'kg'}</span> reorder
                </span>
                <Badge variant={a.status === 'critical' ? 'danger' : 'warning'}>
                  {a.status === 'critical' ? 'Critical' : 'Low'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <NewInwardModal open={inwardOpen} onClose={() => setInwardOpen(false)} onSave={() => {}} />
    </div>
  );
}
