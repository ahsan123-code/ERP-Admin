import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, ShoppingCart, Users, ClipboardList, Package, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import NewPDNModal                   from './NewPDNModal';
import ApprovePRModal                from './ApprovePRModal';
import NewPurchaseOrderModal         from './NewPurchaseOrderModal';
import NewGatePassInwardModal        from './NewGatePassInwardModal';
import NewGrnModal                   from './NewGrnModal';
import NewPurchaseInvoiceModal       from './NewPurchaseInvoiceModal';
import NewVendorModal                from './NewVendorModal';
import PageHeader                    from '../../components/layout/PageHeader';
import Card, { CardHeader }          from '../../components/shared/Card';
import DataTable                     from '../../components/shared/DataTable';
import Badge                         from '../../components/ui/Badge';
import Button                        from '../../components/ui/Button';
import { procurementDb }             from '../../lib/db';
import { useDb, useScopedDb }        from '../../hooks/useDb';
import { useCompany }                from '../../context/CompanyContext';
import { useToast }                  from '../../components/shared/Toast';
import { formatDate, formatCurrency }from '../../utils/format';
import { getStatus }                 from '../../utils/statusConfig';
import styles                        from './Procurement.module.css';

const SEG_TO_TAB = {
  '': 'pdns', pdns: 'pdns', requisitions: 'requisitions', orders: 'orders',
  gatepass: 'gatepass', grns: 'grns', invoices: 'invoices', vendors: 'vendors',
};
export default function Procurement() {
  const location  = useLocation();
  const { companyId } = useCompany();
  const toast = useToast();

  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'pdns';

  // Modal open states
  const [pdnOpen,        setPdnOpen]        = useState(false);
  const [approvePrOpen,  setApprovePrOpen]  = useState(false);
  const [approvingPr,    setApprovingPr]    = useState(null);
  const [poOpen,         setPoOpen]         = useState(false);
  const [gpOpen,         setGpOpen]         = useState(false);
  const [grnOpen,        setGrnOpen]        = useState(false);
  const [pinvOpen,       setPinvOpen]       = useState(false);
  const [vendorOpen,     setVendorOpen]     = useState(false);
  const [editVendor,     setEditVendor]     = useState(null);

  // Delete / confirm states
  const [deletingId,    setDeletingId]    = useState(null);
  const [deletingVendorId, setDeletingVendorId] = useState(null);
  const [deletingBillId, setDeletingBillId] = useState(null);
  const [confirmingPoId, setConfirmingPoId] = useState(null);

  // PO filter tab
  const [poTab, setPoTab] = useState('all');

  // Data fetches
  const { data: vendors, loading: loadVendors, refetch: refetchVendors } = useDb(() => procurementDb.getVendors(companyId), [companyId]);
  // The pipeline listings are registers, so they take the archive cutoff. The document
  // pickers inside this page's modals call the same readers WITHOUT a scope, on purpose —
  // an unbilled 2016-17 GRN has to stay selectable whatever the toggle says.
  const { data: dbPOs, loading: loadPO }    = useScopedDb(s => procurementDb.getPurchaseOrders(companyId, s),    [companyId]);
  const { data: dbGrns, loading: loadGrn }  = useScopedDb(s => procurementDb.getGrns(companyId, s),              [companyId]);
  const { data: dbPdns, loading: loadPdn }  = useScopedDb(s => procurementDb.getPdns(companyId, s),              [companyId]);
  const { data: dbPrs, loading: loadPr }    = useScopedDb(s => procurementDb.getPurchaseRequisitions(s));
  const { data: dbGPs, loading: loadGp }    = useScopedDb(s => procurementDb.getGatePassesInward(companyId, s),  [companyId]);
  const { data: dbPinvs, loading: loadPinv } = useScopedDb(s => procurementDb.getPurchaseInvoices(companyId, s), [companyId]);

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

  // Requested item names for each PDN (and PR, via its linked PDN) so the pipeline
  // lists show what's being purchased instead of a repeated department name.
  const pdnIdKey = useMemo(
    () => [...new Set([...pdnList.map(p => p.pdn_id), ...prList.map(p => p.pdn_ref)].filter(Boolean))].join(','),
    [pdnList, prList]
  );
  const { data: pdnLineItems } = useDb(
    () => procurementDb.getPdnLineItemsBulk(pdnIdKey ? pdnIdKey.split(',') : []),
    [pdnIdKey]
  );
  const pdnItemsMap = useMemo(() => {
    const m = {};
    (pdnLineItems || []).forEach(li => { (m[li.pdn_id] ||= []).push(li.item_name); });
    return m;
  }, [pdnLineItems]);
  const renderItems = (names = []) => {
    if (!names.length) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    const extra = names.length - 2;
    return (
      <span title={names.join(', ')}>
        {names.slice(0, 2).join(', ')}{extra > 0 ? ` +${extra} more` : ''}
      </span>
    );
  };

  const handleDeletePdn = async (row) => {
    setDeletingId(row.id);

    // Walk the chain from local state: PDN → PR → PO → Gate Pass / GRN / Invoice
    const prIds   = prList.filter(p => p.pdn_ref === row.pdn_id).map(p => p.pr_id);
    const prSet   = new Set(prIds);
    const poIds   = poList.filter(p => prSet.has(p.pr_ref)).map(p => p.po_id);
    const poSet   = new Set(poIds);
    const gpIds   = gpList.filter(g => poSet.has(g.po_ref)).map(g => g.gp_id);
    const grnIds  = grnList.filter(g => poSet.has(g.po_ref)).map(g => g.grn_id);
    const grnSet  = new Set(grnIds);
    const billIds = pinvList.filter(b => poSet.has(b.po_ref) || grnSet.has(b.grn_ref)).map(b => b.bill_id);

    try {
      const { error } = await procurementDb.deletePdn(row.id, row.pdn_id, { prIds, poIds, gpIds, grnIds, billIds }, companyId);
      if (error) throw new Error(error.message);
      setPdnList(prev => prev.filter(p => p.id !== row.id));
      setPrList(prev  => prev.filter(p => !prSet.has(p.pr_id)));
      setPoList(prev  => prev.filter(p => !poSet.has(p.po_id)));
      setGpList(prev  => prev.filter(g => !poSet.has(g.po_ref)));
      setGrnList(prev => prev.filter(g => !poSet.has(g.po_ref)));
      setPinvList(prev => prev.filter(b => !poSet.has(b.po_ref) && !grnSet.has(b.grn_ref)));

      const extra = [prIds, poIds, gpIds, grnIds, billIds].reduce((n, a) => n + a.length, 0);
      toast.success(`PDN "${row.pdn_id}" deleted${extra ? ` with ${extra} linked record(s)` : ''}.`);
    } catch (err) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePrApproved = (updatedPr, newPo) => {
    setPrList(prev => prev.map(p => p.pr_id === updatedPr.pr_id ? updatedPr : p));
    if (newPo) setPoList(prev => [newPo, ...prev]);
  };

  const handleConfirmPo = async (row) => {
    setConfirmingPoId(row.id);
    try {
      const { error } = await procurementDb.updatePurchaseOrderStatus(row.po_id, 'confirmed');
      if (error) throw new Error(error.message);
      setPoList(prev => prev.map(p => p.id === row.id ? { ...p, status: 'confirmed' } : p));
      toast.success(`PO "${row.po_id}" confirmed by vendor.`);
    } catch (err) {
      toast.error(err.message, 'Confirm Failed');
    } finally {
      setConfirmingPoId(null);
    }
  };

  // A bill carries a posted double entry, so this reverses the ledger as well as
  // removing the record. Confirmed first for that reason — the same rule the account
  // history in Reports follows before deleting a voucher.
  const handleDeletePinv = async (row) => {
    if (!window.confirm(
      `Delete purchase invoice "${row.bill_id}" for ${formatCurrency(row.grand_total)}?\n\n` +
      `Its ledger entry will be reversed and the vendor's payable reduced by the same amount. This cannot be undone.`
    )) return;

    setDeletingBillId(row.id);
    try {
      const { error } = await procurementDb.deletePurchaseInvoice(row.id, row.bill_id, companyId);
      if (error) throw new Error(error.message);
      setPinvList(prev => prev.filter(b => b.id !== row.id));
      toast.success(`Purchase invoice "${row.bill_id}" deleted and its ledger entry reversed.`);
    } catch (err) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setDeletingBillId(null);
    }
  };

  const handleDeleteVendor = async (row) => {
    setDeletingVendorId(row.id);
    try {
      const { error } = await procurementDb.deleteVendor(row.id);
      if (error) throw new Error(error.message);
      toast.success(`Vendor "${row.name}" deleted.`);
      refetchVendors();
    } catch (err) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setDeletingVendorId(null);
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
    { key: '_items',     label: 'Items',      width: 240, sortable: false, render: (_, row) => renderItems(pdnItemsMap[row.pdn_id]) },
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
    { key: 'pr_id',      label: 'PR No.',     width: 120, render: v => <span className={styles.code}>{v}</span> },
    { key: 'pdn_ref',    label: 'PDN Ref',    width: 120, render: v => v ? <span className={styles.code}>{v}</span> : '—' },
    { key: '_items',     label: 'Items',      width: 220, sortable: false, render: (_, row) => renderItems(pdnItemsMap[row.pdn_ref]) },
    { key: 'date',       label: 'Date',       width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'item_count', label: 'Items',      width: 65,  align: 'right' },
    { key: 'status',     label: 'Status',     width: 120,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
    {
      key: '_approve', label: '', width: 150, sortable: false,
      render: (_, row) => row.status === 'submitted' ? (
        <button
          className={styles.approveBtn}
          onClick={(e) => { e.stopPropagation(); setApprovingPr(row); setApprovePrOpen(true); }}
        >
          <CheckCircle2 size={13} strokeWidth={2} />
          Approve
        </button>
      ) : null,
    },
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
    { key: 'status',  label: 'Status',  width: 130,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
    {
      key: '_confirm', label: '', width: 140, sortable: false,
      render: (_, row) => row.status === 'issued' ? (
        <button
          className={styles.confirmBtn}
          disabled={confirmingPoId === row.id}
          onClick={(e) => { e.stopPropagation(); handleConfirmPo(row); }}
        >
          {confirmingPoId === row.id
            ? <Loader2 size={13} className={styles.spin} />
            : <><CheckCircle2 size={13} strokeWidth={2} /> Confirm</>
          }
        </button>
      ) : null,
    },
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
    {
      key: '_del', label: '', width: 48, sortable: false,
      render: (_, row) => (
        <button
          className={styles.rowDeleteBtn}
          disabled={deletingBillId === row.id}
          onClick={(e) => { e.stopPropagation(); handleDeletePinv(row); }}
          title={`Delete "${row.bill_id}"`}
        >
          {deletingBillId === row.id ? <span className={styles.rowDeleteSpinner}>…</span> : <Trash2 size={13} strokeWidth={2} />}
        </button>
      ),
    },
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
    {
      key: '_del', label: '', width: 48, sortable: false,
      render: (_, row) => (
        <button
          className={styles.rowDeleteBtn}
          disabled={deletingVendorId === row.id}
          onClick={(e) => { e.stopPropagation(); handleDeleteVendor(row); }}
          title={`Delete "${row.name}"`}
        >
          {deletingVendorId === row.id ? <span className={styles.rowDeleteSpinner}>…</span> : <Trash2 size={13} strokeWidth={2} />}
        </button>
      ),
    },
  ];

  const poData = poTab === 'all' ? poList : poList.filter(p => {
    if (poTab === 'active') return ['issued', 'partially_received'].includes(p.status);
    return p.status === poTab;
  });

  const tabAction = {
    pdns:         <Button icon={<Plus size={15} />} onClick={() => setPdnOpen(true)}>New PDN</Button>,
    requisitions: null,
    orders:       <Button icon={<Plus size={15} />} onClick={() => setPoOpen(true)}>New Purchase Order</Button>,
    gatepass:     <Button icon={<Plus size={15} />} onClick={() => setGpOpen(true)}>New Gate Pass</Button>,
    grns:         <Button icon={<Plus size={15} />} onClick={() => setGrnOpen(true)}>New GRN</Button>,
    invoices:     <Button icon={<Plus size={15} />} onClick={() => setPinvOpen(true)}>New Purchase Invoice</Button>,
    vendors:      <Button icon={<Plus size={15} />} onClick={() => setVendorOpen(true)}>New Vendor</Button>,
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

      {pageTab === 'pdns' && (
        <Card padding={false}>
          <CardHeader title="Purchase Demand Notes" subtitle={`${pdnList.length} demand notes — internal material requests`} />
          <DataTable columns={PDN_COLS} data={pdnList} loading={loadPdn} keyField="pdn_id" searchPlaceholder="Search PDNs..." />
        </Card>
      )}

      {pageTab === 'requisitions' && (
        <Card padding={false}>
          <CardHeader title="Purchase Requisitions" subtitle={`${prList.length} requisitions submitted for approval`} />
          <DataTable columns={PR_COLS} data={prList} loading={loadPr} keyField="pr_id" searchPlaceholder="Search requisitions..." />
        </Card>
      )}

      {pageTab === 'orders' && (
        <Card padding={false}>
          <CardHeader title="Purchase Orders" subtitle={`${poList.length} POs issued to vendors`} />
          <DataTable
            columns={PO_COLS}
            data={poData}
            loading={loadPO}
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
          <DataTable columns={GP_COLS} data={gpList} loading={loadGp} keyField="gp_id" searchPlaceholder="Search gate passes..." />
        </Card>
      )}

      {pageTab === 'grns' && (
        <Card padding={false}>
          <CardHeader title="Goods Receipt Notes" subtitle={`${grnList.length} GRNs — goods received and posted`} />
          <DataTable columns={GRN_COLS} data={grnList} loading={loadGrn} keyField="grn_id" searchPlaceholder="Search GRNs..." />
        </Card>
      )}

      {pageTab === 'invoices' && (
        <Card padding={false}>
          <CardHeader title="Purchase Invoices" subtitle={`${pinvList.length} vendor bills recorded`} />
          <DataTable columns={PINV_COLS} data={pinvList} loading={loadPinv} keyField="bill_id" searchPlaceholder="Search purchase invoices..." />
        </Card>
      )}

      {pageTab === 'vendors' && (
        <Card padding={false}>
          <CardHeader title="Vendor Portal" subtitle={`${(vendors || []).length} registered suppliers and vendors — click a row to edit`} />
          <DataTable columns={VENDOR_COLS} data={vendors || []} loading={loadVendors} keyField="id" searchPlaceholder="Search vendors..." onRowClick={setEditVendor} />
        </Card>
      )}

      <NewPDNModal
        open={pdnOpen}
        onClose={() => setPdnOpen(false)}
        onSave={(pdn, pr) => {
          setPdnList(prev => [pdn, ...prev]);
          if (pr) setPrList(prev => [pr, ...prev]);
        }}
      />
      <ApprovePRModal
        open={approvePrOpen}
        pr={approvingPr}
        vendors={vendors || []}
        onClose={() => { setApprovePrOpen(false); setApprovingPr(null); }}
        onApproved={handlePrApproved}
      />
      <NewPurchaseOrderModal open={poOpen} onClose={() => setPoOpen(false)} onSave={(p) => setPoList(prev => [p, ...prev])} />
      <NewGatePassInwardModal open={gpOpen} onClose={() => setGpOpen(false)} onSave={(p) => setGpList(prev => [p, ...prev])} />
      <NewGrnModal
        open={grnOpen}
        onClose={() => setGrnOpen(false)}
        onSave={(grn, poRef) => {
          setGrnList(prev => [grn, ...prev]);
          if (poRef) setPoList(prev => prev.map(p => p.po_id === poRef ? { ...p, status: 'completed' } : p));
        }}
      />
      <NewPurchaseInvoiceModal open={pinvOpen} onClose={() => setPinvOpen(false)} onSave={(p) => setPinvList(prev => [p, ...prev])} />
      <NewVendorModal open={vendorOpen} onClose={() => setVendorOpen(false)} onSave={refetchVendors} />
      <NewVendorModal open={!!editVendor} vendor={editVendor} onClose={() => setEditVendor(null)} onSave={refetchVendors} />
    </div>
  );
}
