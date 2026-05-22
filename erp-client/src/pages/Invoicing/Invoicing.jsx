import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BadgeCheck, AlertCircle, RefreshCw, ReceiptText, Plus, CloudUpload, Wifi, WifiOff, Printer, RotateCcw } from 'lucide-react';
import NewInvoiceModal from './NewInvoiceModal';
import InvoicePrintModal from './InvoicePrintModal';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { invoicingDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { formatDate, formatDateTime, formatCurrency } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import { checkFbrServiceStatus, submitInvoice } from '../../services/fbrApi';
import styles from './Invoicing.module.css';

const SEG_TO_TAB = { '': 'invoices', list: 'invoices', invoices: 'invoices', fbr: 'fbr', 'sale-return': 'returns' };
const TAB_TO_SEG = { invoices: 'list', fbr: 'fbr', returns: 'sale-return' };

const PAGE_TABS = [
  { value: 'invoices', label: 'Invoices',           icon: ReceiptText },
  { value: 'fbr',      label: 'FBR Queue',          icon: CloudUpload },
  { value: 'returns',  label: 'Sale Return Invoice', icon: RotateCcw  },
];

const buildCols = (submitting, submitResults, handleSubmit, onPrint) => [
  { key: 'invoice_id',    label: 'Invoice No.', width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',    width: 190 },
  { key: 'invoice_date',  label: 'Date',        width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'tax_amount',    label: 'Tax',         width: 120, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'total_value',   label: 'Total',       width: 130, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.totalVal}`}>{formatCurrency(v)}</span> },
  { key: 'fbr_status',    label: 'FBR Status',  width: 110,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  {
    key: '_action', label: '', width: 180,
    render: (_, row) => {
      const res  = submitResults[row.invoice_id];
      const busy = submitting[row.invoice_id];
      return (
        <div className={styles.actionCell}>
          {row.fbr_status !== 'synced' && (
            <Button
              size="sm"
              variant={row.fbr_status === 'failed' ? 'danger' : 'primary'}
              icon={<CloudUpload size={14} strokeWidth={1.75} />}
              onClick={() => handleSubmit(row)}
              disabled={busy}
            >
              {busy ? 'Submitting…' : row.fbr_status === 'failed' ? 'Retry' : 'Submit'}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon={<Printer size={14} strokeWidth={1.75} />}
            onClick={() => onPrint(row)}
          >
            Print
          </Button>
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
];

const RETRY_COLS = [
  { key: 'invoice_id',    label: 'Invoice No.',    width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name', label: 'Customer',       width: 200 },
  { key: 'total_value',   label: 'Total',          width: 150, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'fbr_retry_count', label: 'Retries',      width: 80, align: 'center',
    render: v => <span className={`${styles.mono} ${styles.retryCount}`}>{v}</span> },
  { key: 'fbr_status',    label: 'Status',         width: 280,
    render: v => <span className={styles.failReason}>{v}</span> },
  { key: 'fbr_submitted_at',label: 'Last Attempt', width: 170,
    render: v => <span className={styles.date}>{formatDateTime(v)}</span> },
];

const CRN_COLS = [
  { key: 'crn_id',       label: 'Credit Note No.', width: 130, render: v => <span className={styles.code}>{v}</span> },
  { key: 'sr_ref',       label: 'Return Ref.',     width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'customer_name',label: 'Customer',        width: 200 },
  { key: 'date',         label: 'Date',            width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'reason',       label: 'Reason',          width: 200 },
  { key: 'tax_amount',   label: 'Tax',             width: 120, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'total_amount', label: 'Total',           width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.totalVal}`}>{formatCurrency(v)}</span> },
  { key: 'status',       label: 'Status',          width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

export default function Invoicing() {
  const location = useLocation();
  const navigate  = useNavigate();
  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'invoices';
  const setPageTab = (tab) => navigate(`/invoicing/${TAB_TO_SEG[tab] ?? tab}`, { replace: true });

  const [tab, setTab] = useState('all');
  const [invOpen, setInvOpen] = useState(false);
  const [serviceStatus, setServiceStatus] = useState(null);
  const [submitting, setSubmitting] = useState({});
  const [submitResults, setSubmitResults] = useState({});
  const [printInvoice, setPrintInvoice] = useState(null);

  const { data: dbInvoices }          = useDb(() => invoicingDb.getInvoices());
  const { data: saleReturnInvoices }  = useDb(() => invoicingDb.getSaleReturnInvoices());

  const [invoiceList, setInvoiceList] = useState([]);
  useEffect(() => { setInvoiceList(dbInvoices); }, [dbInvoices]);

  const handleSave = (inv) => setInvoiceList(prev => [inv, ...prev]);

  const synced  = invoiceList.filter(i => i.fbr_status === 'synced').length;
  const pending = invoiceList.filter(i => i.fbr_status === 'pending').length;
  const failed  = invoiceList.filter(i => i.fbr_status === 'failed').length;
  const fbrQueue = invoiceList.filter(i => i.fbr_status === 'failed');

  const data = tab === 'all' ? invoiceList : invoiceList.filter(i => i.fbr_status === tab);

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

  const handleSubmit = async (invoice) => {
    setSubmitting(p => ({ ...p, [invoice.invoice_id]: true }));
    setSubmitResults(p => ({ ...p, [invoice.invoice_id]: null }));
    try {
      const result = await submitInvoice(invoice, [], { invoiceType: 1, paymentMode: 1 });
      setSubmitResults(p => ({ ...p, [invoice.invoice_id]: result }));
      if (result.success) {
        setInvoiceList(prev => prev.map(inv =>
          inv.invoice_id === invoice.invoice_id
            ? { ...inv, fbr_status: 'synced', fbr_submitted_at: result.submittedAt, fiscal_invoice_number: result.fiscalInvoiceNumber }
            : inv
        ));
        invoicingDb.updateInvoiceFbrStatus(invoice.invoice_id, 'synced', result.submittedAt, result.fiscalInvoiceNumber)
          .then(({ error }) => { if (error) console.error('FBR status persist failed:', error.message); });
      } else {
        setInvoiceList(prev => prev.map(inv =>
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

  const handlePrint = (inv) => {
    const latest = invoiceList.find(i => i.invoice_id === inv.invoice_id) || inv;
    setPrintInvoice(latest);
  };

  const INV_COLS = buildCols(submitting, submitResults, handleSubmit, handlePrint);

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Invoicing"
        subtitle="AJK-IRD e-invoicing, tax calculation, and submission status"
        actions={<Button icon={<Plus size={15} />} onClick={() => setInvOpen(true)}>New Invoice</Button>}
      />

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
          {serviceStatus === 'online'   && 'AJK-IRD local fiscal service is online'}
          {serviceStatus === 'offline'  && 'AJK-IRD local fiscal service is offline — submissions will use cloud fallback'}
          {serviceStatus === null       && 'AJK-IRD fiscal service status unknown'}
        </span>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={13} strokeWidth={1.75} />} onClick={checkService}>
          Recheck
        </Button>
      </div>

      <div className={styles.summaryGrid}>
        {[
          { icon: ReceiptText, label: 'Total Invoices', value: invoiceList.length, color: 'blue'   },
          { icon: BadgeCheck,  label: 'FBR Synced',     value: synced,             color: 'green'  },
          { icon: RefreshCw,   label: 'Pending',        value: pending,            color: 'orange' },
          { icon: AlertCircle, label: 'Failed',         value: failed,             color: 'red'    },
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
            {t.value === 'fbr' && failed > 0 && (
              <span className={styles.pageTabBadge}>{failed}</span>
            )}
          </button>
        ))}
      </div>

      {pageTab === 'invoices' && (
        <Card padding={false}>
          <CardHeader title="Invoices" subtitle="All sales invoices with FBR submission status" />
          <DataTable
            columns={INV_COLS}
            data={data}
            keyField="invoice_id"
            searchPlaceholder="Search invoices..."
            filterTabs={[
              { value: 'all',     label: 'All',     count: invoiceList.length },
              { value: 'synced',  label: 'Synced',  count: synced             },
              { value: 'pending', label: 'Pending', count: pending            },
              { value: 'failed',  label: 'Failed',  count: failed             },
            ]}
            activeTab={tab}
            onTabChange={setTab}
          />
        </Card>
      )}

      {pageTab === 'fbr' && (
        <Card padding={false}>
          <CardHeader
            title="FBR Retry Queue"
            subtitle={`${fbrQueue.length} invoice(s) awaiting resubmission`}
            actions={<Button variant="secondary" icon={<RefreshCw size={13} strokeWidth={1.75} />} size="sm">Retry All</Button>}
          />
          <DataTable columns={RETRY_COLS} data={fbrQueue} keyField="invoice_id" searchable={false} />
        </Card>
      )}

      {pageTab === 'returns' && (
        <Card padding={false}>
          <CardHeader title="Sale Return Invoices" subtitle="Credit notes issued for customer returns" />
          <DataTable columns={CRN_COLS} data={saleReturnInvoices} keyField="crn_id" searchPlaceholder="Search credit notes..." />
        </Card>
      )}

      <NewInvoiceModal open={invOpen} onClose={() => setInvOpen(false)} onSave={handleSave} />
      {printInvoice && (
        <InvoicePrintModal invoice={printInvoice} onClose={() => setPrintInvoice(null)} />
      )}
    </div>
  );
}
