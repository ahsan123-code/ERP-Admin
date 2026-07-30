import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeCheck, AlertCircle, RefreshCw, ReceiptText, Plus,
  CloudUpload, Wifi, WifiOff, RotateCcw, FileText, Trash2, FileDown, Eye,
} from 'lucide-react';
import { buildSalesInvoiceDoc } from '../../utils/salesInvoiceDoc';
import { downloadWordDoc } from '../../utils/wordExport';
import { useWordPreview } from '../../hooks/useWordPreview';
import NewInvoiceModal from './NewInvoiceModal';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { invoicingDb, salesDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../components/shared/Toast';
import { formatDate, formatDateTime, formatCurrency } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import { checkFbrServiceStatus, submitInvoice } from '../../services/fbrApi';
import styles from './Invoicing.module.css';

const SEG_TO_TAB = { '': 'invoices', list: 'invoices', invoices: 'invoices', fbr: 'fbr', 'sale-return': 'returns' };
const TAB_TO_SEG = { invoices: 'list', fbr: 'fbr', returns: 'sale-return' };

const PAGE_TABS = [
  { value: 'invoices', label: 'Sales Invoices', icon: ReceiptText },
  { value: 'fbr', label: 'FBR Queue', icon: CloudUpload },
  { value: 'returns', label: 'Sale Returns', icon: RotateCcw },
];

const CRN_COLS = [
  { key: 'crn_id', label: 'Credit Note No.', width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'sr_ref', label: 'Return Ref.', width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer', width: 200 },
  { key: 'date', label: 'Date', width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'reason', label: 'Reason', width: 200 },
  {
    key: 'tax_amount', label: 'Tax', width: 120, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span>
  },
  {
    key: 'total_amount', label: 'Total', width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.totalVal}`}>{formatCurrency(v)}</span>
  },
  {
    key: 'status', label: 'Status', width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; }
  },
];

const RETRY_COLS = [
  { key: 'invoice_id', label: 'Invoice No.', width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer', width: 200 },
  {
    key: 'total_value', label: 'Total', width: 150, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span>
  },
  {
    key: 'fbr_retry_count', label: 'Retries', width: 80, align: 'center',
    render: v => <span className={`${styles.mono} ${styles.retryCount}`}>{v}</span>
  },
  {
    key: 'fbr_status', label: 'Status', width: 280,
    render: v => <span className={styles.failReason}>{v}</span>
  },
  {
    key: 'fbr_submitted_at', label: 'Last Attempt', width: 170,
    render: v => <span className={styles.date}>{formatDateTime(v)}</span>
  },
];

export default function Invoicing() {
  const location = useLocation();
  const navigate = useNavigate();
  const { companyId } = useCompany();
  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'invoices';
  const setPageTab = (tab) => navigate(`/invoicing/${TAB_TO_SEG[tab] ?? tab}`, { replace: true });

  const [invOpen, setInvOpen] = useState(false);
  const [serviceStatus, setServiceStatus] = useState(null);
  const [submitting, setSubmitting] = useState({});
  const [submitResults, setSubmitResults] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [deletingSalesId, setDeletingSalesId] = useState(null);
  const [deletingFbrId, setDeletingFbrId] = useState(null);
  const [busyDocId, setBusyDocId] = useState(null);
  const toast = useToast();
  const { showPreview, previewNode } = useWordPreview();

  const { data: salesInvoices } =
    useDb(() => salesDb.getSalesInvoices(companyId), [companyId]);

  const { data: dbFbrInvoices } = useDb(() => invoicingDb.getInvoices());
  const { data: saleReturnInvoices } = useDb(() => invoicingDb.getSaleReturnInvoices());

  const [salesInvoiceList, setSalesInvoiceList] = useState([]);
  const [fbrInvoiceList, setFbrInvoiceList] = useState([]);

  useEffect(() => { setSalesInvoiceList(salesInvoices || []); }, [salesInvoices]);
  useEffect(() => { setFbrInvoiceList(dbFbrInvoices || []); }, [dbFbrInvoices]);

  const handleDeleteSalesInvoice = async (row) => {
    setDeletingSalesId(row.id);
    try {
      const { error } = await salesDb.deleteSalesInvoice(row.id);
      if (error) throw new Error(error.message);
      setSalesInvoiceList(prev => prev.filter(i => i.id !== row.id));
      toast.success(`Invoice ${row.sale_inv_id} deleted.`);
    } catch (err) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setDeletingSalesId(null);
    }
  };

  // Fetches the invoice's itemised lines (from the linked sales order) so the
  // downloaded document shows the complete item list.
  const fetchInvoiceItems = async (row) => {
    if (!row.so_ref) return [];
    const { data, error } = await salesDb.getSoLineItems([row.so_ref]);
    if (error) throw new Error(error.message);
    return data || [];
  };

  // Line items are fetched on demand, so both actions share one loader and differ
  // only in what they do with the finished document spec.
  const withInvoiceDoc = async (row, action, failTitle) => {
    setBusyDocId(row.id);
    try {
      const items = await fetchInvoiceItems(row);
      action(buildSalesInvoiceDoc(row, items));
    } catch (err) {
      toast.error(err.message, failTitle);
    } finally {
      setBusyDocId(null);
    }
  };

  const handlePreviewDoc  = (row) => withInvoiceDoc(row, showPreview, 'Preview Failed');
  const handleDownloadDoc = (row) => withInvoiceDoc(row, downloadWordDoc, 'Download Failed');

  const handleDeleteFbrInvoice = async (row) => {
    setDeletingFbrId(row.invoice_id);
    try {
      const { error } = await invoicingDb.deleteFbrInvoice(row.invoice_id);
      if (error) throw new Error(error.message);
      setFbrInvoiceList(prev => prev.filter(i => i.invoice_id !== row.invoice_id));
      toast.success(`Invoice ${row.invoice_id} deleted.`);
    } catch (err) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setDeletingFbrId(null);
    }
  };

  const totalSales = salesInvoiceList.length;
  const postedCount = salesInvoiceList.filter(i => i.status === 'posted').length;
  const fbrSynced = fbrInvoiceList.filter(i => i.fbr_status === 'synced').length;
  const fbrFailed = fbrInvoiceList.filter(i => i.fbr_status === 'failed').length;
  const fbrQueue = fbrInvoiceList.filter(i => i.fbr_status === 'failed');

  const displayedSales = statusFilter === 'all'
    ? salesInvoiceList
    : salesInvoiceList.filter(i => i.status === statusFilter);

  const checkService = useCallback(async () => {
    setServiceStatus('checking');
    try {
      const res = await checkFbrServiceStatus();
      setServiceStatus(res.online ? 'online' : 'offline');
    } catch {
      setServiceStatus('offline');
    }
  }, []);

  useEffect(() => { checkService(); }, [checkService]);

  const handleFbrSubmit = async (invoice) => {
    setSubmitting(p => ({ ...p, [invoice.invoice_id]: true }));
    setSubmitResults(p => ({ ...p, [invoice.invoice_id]: null }));
    try {
      // Send what was actually invoiced. Passing an empty array makes the server
      // fall back to one synthetic "Steel Products" line, which is wrong for any
      // multi-item invoice and gets the whole bill a single PCT code.
      // totalPrice must be tax-inclusive — the payload builder backs the sale
      // value out of it using the line's own rate.
      const { data: items } = await invoicingDb.getInvoiceItems(invoice.invoice_id);
      const lineItems = (items || []).map(it => ({
        itemCode:   it.item_code,
        itemName:   it.item_name,
        category:   it.category || 'Steel',
        quantity:   parseFloat(it.quantity) || 0,
        totalPrice: parseFloat(it.total_price) || 0,
        taxRate:    parseFloat(it.tax_rate) || 0,
        discount:   0,
      }));

      const result = await submitInvoice(invoice, lineItems, { invoiceType: 1, paymentMode: 1 });
      setSubmitResults(p => ({ ...p, [invoice.invoice_id]: result }));
      if (result.success) {
        setFbrInvoiceList(prev => prev.map(inv =>
          inv.invoice_id === invoice.invoice_id
            ? { ...inv, fbr_status: 'synced', fbr_submitted_at: result.submittedAt, fiscal_invoice_number: result.fiscalInvoiceNumber }
            : inv
        ));
        invoicingDb.updateInvoiceFbrStatus(invoice.invoice_id, 'synced', result.submittedAt, result.fiscalInvoiceNumber)
          .then(({ error }) => { if (error) console.error('FBR status persist failed:', error.message); });
      } else {
        setFbrInvoiceList(prev => prev.map(inv =>
          inv.invoice_id === invoice.invoice_id
            ? { ...inv, fbr_status: 'failed', fbr_retry_count: (inv.fbr_retry_count || 0) + 1 }
            : inv
        ));
        invoicingDb.updateInvoiceFbrStatus(invoice.invoice_id, 'failed', new Date().toISOString())
          .then(({ error }) => { if (error) console.error('FBR status persist failed:', error.message); });
      }
    } catch (err) {
      setSubmitResults(p => ({ ...p, [invoice.invoice_id]: { success: false, error: err.message } }));
    } finally {
      setSubmitting(p => ({ ...p, [invoice.invoice_id]: false }));
    }
  };

  const SALES_INV_COLS = [
    {
      key: 'sale_inv_id', label: 'Invoice No.', width: 130,
      render: v => <span className={styles.code}>{v}</span>
    },
    { key: 'customer_name', label: 'Customer', width: 200 },
    {
      key: 'date', label: 'Date', width: 110,
      render: v => <span className={styles.date}>{formatDate(v)}</span>
    },
    {
      key: 'so_ref', label: 'SO Ref', width: 110,
      render: v => v ? <span className={styles.code}>{v}</span> : '—'
    },
    {
      key: 'subtotal', label: 'Subtotal', width: 130, align: 'right',
      render: v => <span className={styles.mono}>{formatCurrency(v)}</span>
    },
    {
      key: 'grand_total', label: 'Grand Total', width: 140, align: 'right',
      render: v => <span className={`${styles.mono} ${styles.totalVal}`}>{formatCurrency(v)}</span>
    },
    {
      key: 'status', label: 'Status', width: 110,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; }
    },
    {
      key: '_print', label: '', width: 210,
      render: (_, row) => (
        <div className={styles.docActions}>
          <Button
            size="sm"
            variant="secondary"
            icon={<Eye size={14} strokeWidth={1.75} />}
            onClick={() => handlePreviewDoc(row)}
            disabled={busyDocId === row.id}
          >
            Preview
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<FileDown size={14} strokeWidth={1.75} />}
            onClick={() => handleDownloadDoc(row)}
            disabled={busyDocId === row.id}
          >
            {busyDocId === row.id ? 'Preparing…' : 'Word'}
          </Button>
        </div>
      ),
    },
    {
      key: '_del', label: '', width: 44, sortable: false,
      render: (_, row) => (
        <button
          className={styles.rowDeleteBtn}
          disabled={deletingSalesId === row.id}
          onClick={e => { e.stopPropagation(); handleDeleteSalesInvoice(row); }}
          title={`Delete invoice ${row.sale_inv_id}`}
        >
          {deletingSalesId === row.id
            ? <span className={styles.rowDeleteSpinner}>…</span>
            : <Trash2 size={13} strokeWidth={2} />}
        </button>
      ),
    },
  ];

  const FBR_COLS = [
    { key: 'invoice_id', label: 'Invoice No.', width: 120, render: v => <span className={styles.code}>{v}</span> },
    { key: 'customer_name', label: 'Customer', width: 190 },
    { key: 'invoice_date', label: 'Date', width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    {
      key: 'tax_amount', label: 'Tax', width: 120, align: 'right',
      render: v => <span className={styles.mono}>{formatCurrency(v)}</span>
    },
    {
      key: 'total_value', label: 'Total', width: 130, align: 'right',
      render: v => <span className={`${styles.mono} ${styles.totalVal}`}>{formatCurrency(v)}</span>
    },
    {
      key: 'fbr_status', label: 'FBR Status', width: 110,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; }
    },
    {
      key: '_action', label: '', width: 180,
      render: (_, row) => {
        const res = submitResults[row.invoice_id];
        const busy = submitting[row.invoice_id];
        return (
          <div className={styles.actionCell}>
            {row.fbr_status !== 'synced' && (
              <Button
                size="sm"
                variant={row.fbr_status === 'failed' ? 'danger' : 'primary'}
                icon={<CloudUpload size={14} strokeWidth={1.75} />}
                onClick={() => handleFbrSubmit(row)}
                disabled={busy}
              >
                {busy ? 'Submitting…' : row.fbr_status === 'failed' ? 'Retry' : 'Submit'}
              </Button>
            )}
            {res && !res.success && (
              <span className={styles.submitError} title={res.error || res.response}>Failed</span>
            )}
            {res && res.success && (
              <span className={styles.submitOk} title={res.fiscalInvoiceNumber}>Synced</span>
            )}
          </div>
        );
      },
    },
    {
      key: '_del', label: '', width: 44, sortable: false,
      render: (_, row) => (
        <button
          className={styles.rowDeleteBtn}
          disabled={deletingFbrId === row.invoice_id}
          onClick={e => { e.stopPropagation(); handleDeleteFbrInvoice(row); }}
          title={`Delete invoice ${row.invoice_id}`}
        >
          {deletingFbrId === row.invoice_id
            ? <span className={styles.rowDeleteSpinner}>…</span>
            : <Trash2 size={13} strokeWidth={2} />}
        </button>
      ),
    },
  ];

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Invoicing"
        subtitle="Sales invoices, FBR e-invoicing queue, and customer returns"
        actions={
          <Button icon={<Plus size={15} />} onClick={() => setInvOpen(true)}>
            New FBR Invoice
          </Button>
        }
      />

      <div className={styles.summaryGrid}>
        {[
          { icon: FileText, label: 'Sales Invoices', value: totalSales, color: 'blue' },
          { icon: ReceiptText, label: 'Posted', value: postedCount, color: 'green' },
          { icon: BadgeCheck, label: 'FBR Synced', value: fbrSynced, color: 'purple' },
          { icon: AlertCircle, label: 'FBR Failed', value: fbrFailed, color: 'red' },
        ].map((s) => (
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
            <t.icon size={15} strokeWidth={1.75} />
            {t.label}
            {t.value === 'fbr' && fbrFailed > 0 && (
              <span className={styles.pageTabBadge}>{fbrFailed}</span>
            )}
          </button>
        ))}
      </div>

      {pageTab === 'invoices' && (
        <Card padding={false}>
          <CardHeader
            title="Sales Invoices"
            subtitle="All invoices generated from dispatched sales orders"
          />
          <DataTable
            columns={SALES_INV_COLS}
            data={displayedSales}
            keyField="sale_inv_id"
            searchPlaceholder="Search by customer or invoice no..."
            filterTabs={[
              { value: 'all', label: 'All', count: totalSales },
              { value: 'posted', label: 'Posted', count: postedCount },
            ]}
            activeTab={statusFilter}
            onTabChange={setStatusFilter}
          />
        </Card>
      )}

      {pageTab === 'fbr' && (
        <>
          <div className={`${styles.serviceBar} ${styles[`service_${serviceStatus}`]}`}>
            <span className={styles.serviceIcon}>
              {serviceStatus === 'online'
                ? <Wifi size={16} strokeWidth={1.75} />
                : serviceStatus === 'offline'
                  ? <WifiOff size={16} strokeWidth={1.75} />
                  : <RefreshCw size={16} strokeWidth={1.75} className={styles.spin} />}
            </span>
            <span className={styles.serviceText}>
              {serviceStatus === 'checking' && 'Checking AJK-IRD fiscal service…'}
              {serviceStatus === 'online' && 'AJK-IRD local fiscal service is online'}
              {serviceStatus === 'offline' && 'AJK-IRD local fiscal service is offline — using cloud fallback'}
              {serviceStatus === null && 'AJK-IRD fiscal service status unknown'}
            </span>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={13} strokeWidth={1.75} />} onClick={checkService}>
              Recheck
            </Button>
          </div>
          <Card padding={false}>
            <CardHeader
              title="FBR Invoice Queue"
              subtitle="Standalone FBR e-invoices — create via New FBR Invoice"
            />
            <DataTable columns={FBR_COLS} data={fbrInvoiceList} keyField="invoice_id" searchPlaceholder="Search invoices..." />
          </Card>
          {fbrQueue.length > 0 && (
            <Card padding={false}>
              <CardHeader
                title="Retry Queue"
                subtitle={`${fbrQueue.length} invoice(s) failed FBR submission`}
                actions={<Button variant="secondary" icon={<RefreshCw size={13} strokeWidth={1.75} />} size="sm">Retry All</Button>}
              />
              <DataTable columns={RETRY_COLS} data={fbrQueue} keyField="invoice_id" searchable={false} />
            </Card>
          )}
        </>
      )}

      {pageTab === 'returns' && (
        <Card padding={false}>
          <CardHeader title="Sale Return Invoices" subtitle="Credit notes issued for customer returns" />
          <DataTable columns={CRN_COLS} data={saleReturnInvoices} keyField="crn_id" searchPlaceholder="Search credit notes..." />
        </Card>
      )}

      <NewInvoiceModal open={invOpen} onClose={() => setInvOpen(false)} onSave={(inv) => setFbrInvoiceList(prev => [inv, ...prev])} />
      {previewNode}
    </div>
  );
}
