import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, ShoppingCart, Users, ClipboardList, Package, Trash2,
  FileText, ReceiptText, ArrowDownToLine,
} from 'lucide-react';
import NewPDNModal                   from './NewPDNModal';
import NewPurchaseRequisitionModal   from './NewPurchaseRequisitionModal';
import NewPurchaseOrderModal         from './NewPurchaseOrderModal';
import NewGatePassInwardModal        from './NewGatePassInwardModal';
import NewGrnModal                   from './NewGrnModal';
import NewPurchaseInvoiceModal       from './NewPurchaseInvoiceModal';
import PageHeader                    from '../../components/layout/PageHeader';
import Card, { CardHeader }          from '../../components/shared/Card';
import DataTable                     from '../../components/shared/DataTable';
import Badge                         from '../../components/ui/Badge';
import Button                        from '../../components/ui/Button';
import { procurementDb }             from '../../lib/db';
import { useDb }                     from '../../hooks/useDb';
import { useCompany }                from '../../context/CompanyContext';
import { useToast }                  from '../../components/shared/Toast';
import { formatDate, formatCurrency }from '../../utils/format';
import { getStatus }                 from '../../utils/statusConfig';
import styles                        from './Procurement.module.css';

const SEG_TO_TAB = {
  '': 'pdns', pdns: 'pdns', requisitions: 'requisitions', orders: 'orders',
  gatepass: 'gatepass', grns: 'grns', invoices: 'invoices', vendors: 'vendors',
};
const TAB_TO_SEG = {
  pdns: 'pdns', requisitions: 'requisitions', orders: 'orders',
  gatepass: 'gatepass', grns: 'grns', invoices: 'invoices', vendors: 'vendors',
};

const PAGE_TABS = [
  { value: 'pdns',         label: 'Demand Notes',      icon: ClipboardList  },
  { value: 'requisitions', label: 'Requisitions',      icon: FileText       },
  { value: 'orders',       label: 'Purchase Orders',   icon: ShoppingCart   },
  { value: 'gatepass',     label: 'Gate Pass Inward',  icon: ArrowDownToLine},
  { value: 'grns',         label: 'GRNs',              icon: Package        },
  { value: 'invoices',     label: 'Purchase Invoices', icon: ReceiptText    },
  { value: 'vendors',      label: 'Vendors',           icon: Users          },
];

export default function Procurement() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { companyId } = useCompany();
  const toast = useToast();

  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'pdns';
  const setPageTab = (tab) => navigate(`/procurement/${TAB_TO_SEG[tab] ?? tab}`, { replace: true });

  // Modal open states
  const [pdnOpen,   setPdnOpen]   = useState(false);
  const [prOpen,    setPrOpen]    = useState(false);
  const [poOpen,    setPoOpen]    = useState(false);
  const [gpOpen,    setGpOpen]    = useState(false);
  const [grnOpen,   setGrnOpen]   = useState(false);
  const [pinvOpen,  setPinvOpen]  = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState(null);

  // PO filter tab
  const [poTab, setPoTab] = useState('all');

  // Data fetches
  const { data: vendors }          = useDb(() => procurementDb.getVendors());
  const { data: dbPOs }            = useDb(() => procurementDb.getPurchaseOrders(companyId),       [companyId]);
  const { data: dbGrns }           = useDb(() => procurementDb.getGrns(companyId),                [companyId]);
  const { data: dbPdns }           = useDb(() => procurementDb.getPdns(companyId),                [companyId]);
  const { data: dbPrs }            = useDb(() => procurementDb.getPurchaseRequisitions());
  const { data: dbGPs }            = useDb(() => procurementDb.getGatePassesInward(companyId),    [companyId]);
  const { data: dbPinvs }          = useDb(() => procurementDb.getPurchaseInvoices(companyId),    [companyId]);

  // Local lists (so new items appear immediately)
  const [pdnList,  setPdnList]  = useState([]);
  const [prList,   setPrList]   = useState([]);
  const [poList,   setPoList]   = useState([]);
  const [gpList,   setGpList]   = useState([]);
  const [grnList,  setGrnList]  = useState([]);
  const [pinvList, setPinvList] = useState([]);

  useEffect(() => { setPdnList(dbPdns  || []); }, [dbPdns]);
  useEffect(() => { setPrList(dbPrs    || []); }, [dbPrs]);
  useEffect(() => { setPoList(dbPOs    || []); }, [dbPOs]);
  useEffect(() => { setGpList(dbGPs    || []); }, [dbGPs]);
  useEffect(() => { setGrnList(dbGrns  || []); }, [dbGrns]);
  useEffect(() => { setPinvList(dbPinvs|| []); }, [dbPinvs]);

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

  // Stats
  const activePOs      = poList.filter(p => ['issued', 'partially_received'].includes(p.status)).length;
  const pendingPDNs    = pdnList.filter(p => p.status === 'submitted').length;
  const activeVendors  = (vendors || []).filter(v => v.status === 'active').length;
  const pendingGRNs    = grnList.filter(g => g.status === 'pending').length;

  const stats = [
    { icon: ShoppingCart,  label: 'Active POs',     value: activePOs,    color: 'blue'   },
    { icon: ClipboardList, label: 'Pending PDNs',   value: pendingPDNs,  color: 'orange' },
    { icon: Users,         label: 'Active Vendors', value: activeVendors, color: 'green' },
    { icon: Package,       label: 'Pending GRNs',   value: pendingGRNs,  color: 'purple' },
  ];

  // Column definitions
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
          {deletingId === row.id ? <span className={styles.rowDeleteSpinner}>…</span> : <Trash2 size={13} strokeWidth={2} />}
        </button>
      ),
    },
  ];

  const PR_COLS = [
    { key: 'pr_id',        label: 'PR No.',     width: 120, render: v => <span className={styles.code}>{v}</span> },
    { key: 'department',   label: 'Department', width: 170 },
    { key: 'date',         label: 'Date',       width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'priority',     label: 'Priority',   width: 90,
      render: v => <Badge variant={v === 'High' ? 'danger' : v === 'Medium' ? 'warning' : 'info'}>{v ?? '—'}</Badge> },
    { key: 'requested_by', label: 'Requested By', width: 160 },
    { key: 'item_count',   label: 'Items',      width: 65, align: 'right' },
    { key: 'pdn_ref',      label: 'PDN Ref',    width: 110, render: v => v ? <span className={styles.code}>{v}</span> : '—' },
    { key: 'status',       label: 'Status',     width: 120,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  ];

  const PO_COLS = [
    { key: 'po_id',            label: 'PO No.',  width: 110, render: v => <span className={styles.code}>{v}</span> },
    { key: 'vendor_name',      label: 'Vendor',  width: 200 },
    { key: 'po_date',          label: 'Date',    width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'delivery_due_date',label: 'Due',     width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'pr_ref',           label: 'PR Ref',  width: 110, render: v => v ? <span className={styles.code}>{v}</span> : '—' },
    { key: 'item_count',       label: 'Items',   width: 65,  align: 'right' },
    { key: 'total_amount',     label: 'Amount',  width: 130, align: 'right',
      render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
    { key: 'status',           label: 'Status',  width: 130,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  ];

  const GP_COLS = [
    { key: 'gp_id',       label: 'GP No.',     width: 110, render: v => <span className={styles.code}>{v}</span> },
    { key: 'gate_date',   label: 'Date',       width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'po_ref',      label: 'PO Ref',     width: 110, render: v => v ? <span className={styles.code}>{v}</span> : '—' },
    { key: 'vendor_name', label: 'Vendor',     width: 190 },
    { key: 'vehicle_no',  label: 'Vehicle No.', width: 120, render: v => <span className={styles.mono}>{v}</span> },
    { key: 'driver_name', label: 'Driver',     width: 150 },
    { key: 'received_by', label: 'Received By', width: 130 },
    { key: 'status',      label: 'Status',     width: 100,
      render: v => { const s = getStatus(v || 'open'); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  ];

  const GRN_COLS = [
    { key: 'grn_id',       label: 'GRN No.',   width: 120, render: v => <span className={styles.code}>{v}</span> },
    { key: 'vendor_name',  label: 'Vendor',    width: 200 },
    { key: 'received_date',label: 'Date',      width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'po_ref',       label: 'PO Ref',    width: 110, render: v => v ? <span className={styles.code}>{v}</span> : '—' },
    { key: 'gp_ref',       label: 'GP Ref',    width: 110, render: v => v ? <span className={styles.code}>{v}</span> : '—' },
    { key: 'item_count',   label: 'Items',     width: 65,  align: 'right' },
    { key: 'total_value',  label: 'Value',     width: 130, align: 'right',
      render: v => v > 0 ? <span className={styles.mono}>{formatCurrency(v)}</span> : '—' },
    { key: 'warehouse',    label: 'Warehouse', width: 120 },
    { key: 'status',       label: 'Status',    width: 100,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  ];

  const PINV_COLS = [
    { key: 'bill_id',     label: 'Bill ID',    width: 120, render: v => <span className={styles.code}>{v}</span> },
    { key: 'bill_no',     label: 'Vendor Bill', width: 130, render: v => v ? <span className={styles.mono}>{v}</span> : '—' },
    { key: 'vendor_name', label: 'Vendor',     width: 200 },
    { key: 'bill_date',   label: 'Bill Date',  width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'due_date',    label: 'Due',        width: 110, render: v => v ? <span className={styles.date}>{formatDate(v)}</span> : '—' },
    { key: 'po_ref',      label: 'PO Ref',     width: 110, render: v => v ? <span className={styles.code}>{v}</span> : '—' },
    { key: 'grand_total', label: 'Amount',     width: 130, align: 'right',
      render: v => <span className={`${styles.mono} ${styles.totalVal}`}>{formatCurrency(v)}</span> },
    { key: 'status',      label: 'Status',     width: 110,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  ];

  const VENDOR_COLS = [
    { key: 'id',       label: 'ID',       width: 90,
      render: v => <span className={styles.code}>{`V-${String(v).padStart(3, '0')}`}</span> },
    { key: 'name',     label: 'Vendor',   width: 220 },
    { key: 'ntn',      label: 'NTN',      width: 130, render: v => <span className={styles.mono}>{v || '—'}</span> },
    { key: 'contact',  label: 'Contact',  width: 140, render: v => <span className={styles.mono}>{v || '—'}</span> },
    { key: 'category', label: 'Category', width: 140 },
    { key: 'status',   label: 'Status',   width: 100,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  ];

  const poData = poTab === 'all' ? poList : poList.filter(p => {
    if (poTab === 'active') return ['issued', 'partially_received'].includes(p.status);
    return p.status === poTab;
  });

  const tabAction = {
    pdns:         <Button icon={<Plus size={15} />} onClick={() => setPdnOpen(true)}>New PDN</Button>,
    requisitions: <Button icon={<Plus size={15} />} onClick={() => setPrOpen(true)}>New Requisition</Button>,
    orders:       <Button icon={<Plus size={15} />} onClick={() => setPoOpen(true)}>New Purchase Order</Button>,
    gatepass:     <Button icon={<Plus size={15} />} onClick={() => setGpOpen(true)}>New Gate Pass</Button>,
    grns:         <Button icon={<Plus size={15} />} onClick={() => setGrnOpen(true)}>New GRN</Button>,
    invoices:     <Button icon={<Plus size={15} />} onClick={() => setPinvOpen(true)}>New Purchase Invoice</Button>,
    vendors:      null,
  };

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Procurement"
        subtitle="Full purchase cycle: PDN → Requisition → PO → Gate Pass → GRN → Invoice"
        actions={tabAction[pageTab]}
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
          </button>
        ))}
      </div>

      {pageTab === 'pdns' && (
        <Card padding={false}>
          <CardHeader title="Purchase Demand Notes" subtitle={`${pdnList.length} demand notes — internal material requests`} />
          <DataTable columns={PDN_COLS} data={pdnList} keyField="pdn_id" searchPlaceholder="Search PDNs..." />
        </Card>
      )}

      {pageTab === 'requisitions' && (
        <Card padding={false}>
          <CardHeader title="Purchase Requisitions" subtitle={`${prList.length} requisitions submitted for approval`} />
          <DataTable columns={PR_COLS} data={prList} keyField="pr_id" searchPlaceholder="Search requisitions..." />
        </Card>
      )}

      {pageTab === 'orders' && (
        <Card padding={false}>
          <CardHeader title="Purchase Orders" subtitle={`${poList.length} POs issued to vendors`} />
          <DataTable
            columns={PO_COLS}
            data={poData}
            keyField="po_id"
            searchPlaceholder="Search purchase orders..."
            filterTabs={[
              { value: 'all',       label: 'All',       count: poList.length },
              { value: 'active',    label: 'Active',    count: activePOs     },
              { value: 'completed', label: 'Completed', count: poList.filter(p => p.status === 'completed').length },
            ]}
            activeTab={poTab}
            onTabChange={setPoTab}
          />
        </Card>
      )}

      {pageTab === 'gatepass' && (
        <Card padding={false}>
          <CardHeader title="Gate Pass Inward" subtitle={`${gpList.length} inward gate passes — goods entry records`} />
          <DataTable columns={GP_COLS} data={gpList} keyField="gp_id" searchPlaceholder="Search gate passes..." />
        </Card>
      )}

      {pageTab === 'grns' && (
        <Card padding={false}>
          <CardHeader title="Goods Receipt Notes" subtitle={`${grnList.length} GRNs — goods received and posted`} />
          <DataTable columns={GRN_COLS} data={grnList} keyField="grn_id" searchPlaceholder="Search GRNs..." />
        </Card>
      )}

      {pageTab === 'invoices' && (
        <Card padding={false}>
          <CardHeader title="Purchase Invoices" subtitle={`${pinvList.length} vendor bills recorded`} />
          <DataTable columns={PINV_COLS} data={pinvList} keyField="bill_id" searchPlaceholder="Search purchase invoices..." />
        </Card>
      )}

      {pageTab === 'vendors' && (
        <Card padding={false}>
          <CardHeader title="Vendor Portal" subtitle={`${(vendors || []).length} registered suppliers and vendors`} />
          <DataTable columns={VENDOR_COLS} data={vendors || []} keyField="id" searchPlaceholder="Search vendors..." />
        </Card>
      )}

      <NewPDNModal open={pdnOpen} onClose={() => setPdnOpen(false)} onSave={(p) => setPdnList(prev => [p, ...prev])} />
      <NewPurchaseRequisitionModal open={prOpen} onClose={() => setPrOpen(false)} onSave={(p) => setPrList(prev => [p, ...prev])} />
      <NewPurchaseOrderModal open={poOpen} onClose={() => setPoOpen(false)} onSave={(p) => setPoList(prev => [p, ...prev])} />
      <NewGatePassInwardModal open={gpOpen} onClose={() => setGpOpen(false)} onSave={(p) => setGpList(prev => [p, ...prev])} />
      <NewGrnModal open={grnOpen} onClose={() => setGrnOpen(false)} onSave={(p) => setGrnList(prev => [p, ...prev])} />
      <NewPurchaseInvoiceModal open={pinvOpen} onClose={() => setPinvOpen(false)} onSave={(p) => setPinvList(prev => [p, ...prev])} />
    </div>
  );
}
