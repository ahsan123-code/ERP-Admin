import { useState, useEffect } from 'react';
import { Plus, ShoppingCart, Users, ClipboardList, Package, Trash2 } from 'lucide-react';
import NewPDNModal from './NewPDNModal';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../components/shared/Toast';
import { formatDate, formatCurrency } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import styles from './Procurement.module.css';

const PO_COLS = [
  { key: 'po_id',            label: 'PO No.',  width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'vendor_name',      label: 'Vendor',  width: 220 },
  { key: 'po_date',          label: 'Date',    width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'delivery_due_date',label: 'Due',     width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'item_count',       label: 'Items',   width: 65,  align: 'right' },
  { key: 'total_amount',     label: 'Amount',  width: 140, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'status',           label: 'Status',  width: 130,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const VENDOR_COLS = [
  { key: 'id',       label: 'ID',       width: 90,
    render: v => <span className={styles.code}>{`V-${String(v).padStart(3, '0')}`}</span> },
  { key: 'name',     label: 'Vendor',   width: 220 },
  { key: 'ntn',      label: 'NTN',      width: 130, render: v => <span className={styles.mono}>{v}</span> },
  { key: 'contact',  label: 'Contact',  width: 140, render: v => <span className={styles.mono}>{v}</span> },
  { key: 'category', label: 'Category', width: 140 },
  { key: 'status',   label: 'Status',   width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

export default function Procurement() {
  const { companyId } = useCompany();
  const toast = useToast();
  const [poTab, setPoTab] = useState('all');
  const [pdnOpen, setPdnOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const { data: vendors }        = useDb(() => procurementDb.getVendors());
  const { data: purchaseOrders } = useDb(() => procurementDb.getPurchaseOrders(companyId), [companyId]);
  const { data: grns }           = useDb(() => procurementDb.getGrns(companyId),           [companyId]);
  const { data: dbPdns }         = useDb(() => procurementDb.getPdns(companyId),            [companyId]);

  const [pdnList, setPdnList] = useState([]);
  useEffect(() => { setPdnList(dbPdns); }, [dbPdns]);

  const handleSave = (pdn) => setPdnList(prev => [pdn, ...prev]);

  const handleDeletePdn = async (row) => {
    setDeletingId(row.id);
    try {
      const { error } = await procurementDb.deletePdn(row.id, row.pdn_id);
      if (error) throw new Error(error.message);
      setPdnList(prev => prev.filter(p => p.id !== row.id));
      toast.success(`PDN "${row.pdn_id}" deleted.`);
    } catch (err) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setDeletingId(null);
    }
  };

  const PDN_COLS = [
    { key: 'pdn_id',     label: 'PDN No.',    width: 120, render: v => <span className={styles.code}>{v}</span> },
    { key: 'department', label: 'Department', width: 180 },
    { key: 'pdn_date',   label: 'Date',       width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'priority',   label: 'Priority',   width: 90,
      render: v => <Badge variant={v === 'High' ? 'danger' : v === 'Medium' ? 'warning' : 'info'}>{v}</Badge> },
    { key: 'item_count', label: 'Items',      width: 70,  align: 'right' },
    { key: 'status',     label: 'Status',     width: 130,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
    {
      key: '_actions', label: '', width: 48, sortable: false,
      render: (_, row) => (
        <button
          className={styles.rowDeleteBtn}
          disabled={deletingId === row.id}
          onClick={(e) => { e.stopPropagation(); handleDeletePdn(row); }}
          title={`Delete "${row.pdn_id}"`}
        >
          {deletingId === row.id
            ? <span className={styles.rowDeleteSpinner}>…</span>
            : <Trash2 size={13} strokeWidth={2} />}
        </button>
      ),
    },
  ];

  const activePOs     = purchaseOrders.filter(p => ['issued', 'partially_received'].includes(p.status)).length;
  const pendingPDNs   = pdnList.filter(p => p.status === 'submitted').length;
  const activeVendors = vendors.filter(v => v.status === 'active').length;
  const pendingGRNs   = grns.filter(g => g.status === 'pending').length;

  const poData = poTab === 'all' ? purchaseOrders : purchaseOrders.filter(p => {
    if (poTab === 'active') return ['issued', 'partially_received'].includes(p.status);
    return p.status === poTab;
  });

  const stats = [
    { icon: ShoppingCart,  label: 'Active POs',    value: activePOs,    color: 'blue'   },
    { icon: ClipboardList, label: 'Pending PDNs',  value: pendingPDNs,  color: 'orange' },
    { icon: Users,         label: 'Active Vendors',value: activeVendors, color: 'green' },
    { icon: Package,       label: 'Pending GRNs',  value: pendingGRNs,  color: 'purple' },
  ];

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Procurement"
        subtitle="Purchase demand notes, orders, GRNs, and vendor management"
        actions={<Button icon={<Plus size={15} />} onClick={() => setPdnOpen(true)}>New PDN</Button>}
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
        <CardHeader title="Purchase Demand Notes" subtitle="Internal material requests" />
        <DataTable columns={PDN_COLS} data={pdnList} keyField="pdn_id" searchPlaceholder="Search PDNs..." />
      </Card>

      <Card padding={false}>
        <CardHeader title="Purchase Orders" subtitle={`${purchaseOrders.length} POs across vendors`} />
        <DataTable
          columns={PO_COLS}
          data={poData}
          keyField="po_id"
          searchPlaceholder="Search POs..."
          filterTabs={[
            { value: 'all',       label: 'All',       count: purchaseOrders.length },
            { value: 'active',    label: 'Active',    count: activePOs             },
            { value: 'completed', label: 'Completed', count: purchaseOrders.filter(p => p.status === 'completed').length },
          ]}
          activeTab={poTab}
          onTabChange={setPoTab}
        />
      </Card>

      <Card padding={false}>
        <CardHeader title="Vendor Portal" subtitle={`${vendors.length} registered suppliers and vendors`} />
        <DataTable columns={VENDOR_COLS} data={vendors} keyField="id" searchPlaceholder="Search vendors..." />
      </Card>

      <NewPDNModal open={pdnOpen} onClose={() => setPdnOpen(false)} onSave={handleSave} />
    </div>
  );
}
