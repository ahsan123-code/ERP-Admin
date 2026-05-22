import { useState, useEffect } from 'react';
import { Plus, Factory, CheckCircle, Calendar } from 'lucide-react';
import NewWorkOrderModal from './NewWorkOrderModal';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { productionDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { formatDate, formatNumber } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import styles from './Production.module.css';

const WO_COLS = [
  { key: 'work_order_id',          label: 'Work Order', width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'product',                label: 'Product',    width: 200 },
  { key: 'quantity',               label: 'Qty (kg)',   width: 100, align: 'right', render: v => <span className={styles.mono}>{formatNumber(v)}</span> },
  { key: 'start_date',             label: 'Start',      width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'end_date',               label: 'End',        width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'raw_materials_allocated', label: 'Materials',  width: 110,
    render: v => <Badge variant={v ? 'success' : 'warning'}>{v ? 'Allocated' : 'Pending'}</Badge> },
  { key: 'qc_passed',              label: 'QC',         width: 100,
    render: v => <Badge variant={v ? 'success' : 'info'}>{v ? 'Passed' : 'Pending'}</Badge> },
  { key: 'status',                 label: 'Status',     width: 130,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const BOM_COLS = [
  { key: 'bom_id',          label: 'BOM ID',     width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'finished_product',label: 'Product',    width: 220 },
  { key: 'output_qty',      label: 'Output Qty', width: 110, align: 'right',
    render: (v, row) => <span className={styles.mono}>{formatNumber(v)} {row.output_unit}</span> },
  { key: 'status',          label: 'Status',     width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const FG_COLS = [
  { key: 'work_order_ref',  label: 'Work Order', width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'product',         label: 'Product',    width: 200 },
  { key: 'quantity',        label: 'Qty (kg)',   width: 110, align: 'right',
    render: v => <span className={styles.mono}>{formatNumber(v)}</span> },
  { key: 'production_date', label: 'Date',       width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'warehouse',       label: 'Warehouse',  width: 160 },
  { key: 'qc_status',       label: 'QC',         width: 110,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const statDefs = [
  { icon: Factory,     label: 'Active Work Orders',   color: 'orange' },
  { icon: CheckCircle, label: 'Completed This Month', color: 'green'  },
  { icon: Calendar,    label: 'Scheduled',            color: 'blue'   },
];

export default function Production() {
  const [woOpen, setWoOpen] = useState(false);

  const { data: boms }                = useDb(() => productionDb.getBoms());
  const { data: dbWorkOrders }        = useDb(() => productionDb.getWorkOrders());
  const { data: finishedGoods }       = useDb(() => productionDb.getFinishedGoods());
  const { data: productionSchedules } = useDb(() => productionDb.getProductionSchedules());

  const [workOrderList, setWorkOrderList] = useState([]);
  useEffect(() => { setWorkOrderList(dbWorkOrders); }, [dbWorkOrders]);

  const handleSave = (wo) => setWorkOrderList(prev => [wo, ...prev]);

  const statValues = [
    workOrderList.filter(w => w.status === 'in_progress').length,
    workOrderList.filter(w => w.status === 'completed').length,
    productionSchedules.filter(s => s.status === 'scheduled').length,
  ];

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Production"
        subtitle="Bill of materials, work orders, and finished goods"
        actions={<Button icon={<Plus size={15} />} onClick={() => setWoOpen(true)}>New Work Order</Button>}
      />

      <div className={styles.summaryGrid}>
        {statDefs.map((s, i) => (
          <div key={s.label} className={styles.summaryCard}>
            <div className={`${styles.summaryIcon} ${styles[s.color]}`}>
              <s.icon size={20} strokeWidth={1.75} />
            </div>
            <div>
              <p className={styles.summaryLabel}>{s.label}</p>
              <p className={styles.summaryValue}>{statValues[i]}</p>
            </div>
          </div>
        ))}
      </div>

      <Card padding={false}>
        <CardHeader title="Work Orders" subtitle="Active and completed production runs" />
        <DataTable columns={WO_COLS} data={workOrderList} keyField="work_order_id" searchPlaceholder="Search work orders..." />
      </Card>

      <Card padding={false}>
        <CardHeader title="Bill of Materials" subtitle={`${boms.length} material requirement definitions`} />
        <DataTable columns={BOM_COLS} data={boms} keyField="bom_id" searchPlaceholder="Search BOM..." />
      </Card>

      <Card padding={false}>
        <CardHeader title="Finished Goods" subtitle={`${finishedGoods.length} completed production batches`} />
        <DataTable columns={FG_COLS} data={finishedGoods} keyField="id" searchPlaceholder="Search finished goods..." />
      </Card>

      <NewWorkOrderModal open={woOpen} onClose={() => setWoOpen(false)} onSave={handleSave} />
    </div>
  );
}
