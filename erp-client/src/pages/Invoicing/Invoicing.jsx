import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeCheck, AlertCircle, RefreshCw, ReceiptText, Plus,
  CloudUpload, Wifi, WifiOff, Printer, RotateCcw, FileText, Trash2, Download,
} from 'lucide-react';
import { downloadSalesInvoicePdf } from '../../utils/salesInvoicePdf';
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

const COMPANY = {
  name: 'Allied Steel Center',
  address: 'Shop No. 41, Steel Sheet Market, Lahore',
  ntn: '9207491-5',
  strn: '3277876323039',
};

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

function printSalesInvoice(inv, lineItems = [], preOpened = null) {
  const win = preOpened || window.open('', '_blank', 'width=900,height=720');
  if (!win) return;
  const itemRows = lineItems.map((it, i) => {
    const amount = it.total_price ?? (it.quantity * it.unit_price);
    return `<tr>
      <td class="right">${i + 1}</td>
      <td>${it.item_name || ''}</td>
      <td class="right">${it.quantity != null ? Number(it.quantity).toLocaleString('en-PK') : ''}</td>
      <td>${it.unit || ''}</td>
      <td class="right mono">${formatCurrency(it.unit_price)}</td>
      <td class="right mono"><strong>${formatCurrency(amount)}</strong></td>
    </tr>`;
  }).join('');
  const itemsSection = lineItems.length > 0
    ? `<table class="items">
        <thead><tr>
          <th class="right">#</th><th>Item Description</th><th class="right">Qty</th>
          <th>Unit</th><th class="right">Unit Price</th><th class="right">Amount</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>`
    : `<div class="no-items"><em>Itemised line items not available for this invoice.</em></div>`;
  const charges = [
    inv.freight > 0 ? `<div class="charge-row"><span>Freight</span><span>${formatCurrency(inv.freight)}</span></div>` : '',
    inv.loading_unloading > 0 ? `<div class="charge-row"><span>Loading / Unloading</span><span>${formatCurrency(inv.loading_unloading)}</span></div>` : '',
    inv.packing > 0 ? `<div class="charge-row"><span>Packing</span><span>${formatCurrency(inv.packing)}</span></div>` : '',
    inv.toll_tax > 0 ? `<div class="charge-row"><span>Toll Tax</span><span>${formatCurrency(inv.toll_tax)}</span></div>` : '',
    inv.slitting > 0 ? `<div class="charge-row"><span>Slitting</span><span>${formatCurrency(inv.slitting)}</span></div>` : '',
  ].filter(Boolean).join('');

  win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${inv.sale_inv_id}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:Arial,sans-serif; font-size:12px; color:#000; background:#fff; }
    .wrap { max-width:820px; margin:0 auto; padding:28px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:14px; margin-bottom:14px; }
    .co-name { font-size:20px; font-weight:700; }
    .co-meta { font-size:11px; color:#444; margin-top:4px; line-height:1.7; }
    .inv-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    .inv-title h2 { font-size:16px; font-weight:700; text-transform:uppercase; letter-spacing:1px; }
    .inv-meta { font-size:11px; text-align:right; line-height:1.8; }
    .section-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:14px; }
    .section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#666; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px; }
    .field-row { display:flex; gap:6px; margin-bottom:4px; font-size:11px; }
    .field-lbl { color:#666; min-width:75px; }
    .field-val { font-weight:600; }
    .totals-box { margin-left:auto; min-width:280px; margin-top:14px; }
    .total-row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #eee; font-size:12px; }
    .total-row.grand { font-size:14px; font-weight:700; border-top:2px solid #000; border-bottom:none; padding-top:8px; margin-top:4px; }
    .charge-row { display:flex; justify-content:space-between; padding:3px 0; font-size:11px; color:#555; border-bottom:1px solid #f0f0f0; }
    .mono { font-family:monospace; }
    table.items { width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11px; }
    table.items thead th { background:#1a1a1a; color:#fff; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; padding:6px 8px; text-align:left; }
    table.items thead th.right { text-align:right; }
    table.items tbody td { padding:5px 8px; border-bottom:1px solid #eee; }
    table.items tbody td.right { text-align:right; }
    table.items tbody tr:nth-child(even) { background:#fafafa; }
    .no-items { padding:12px 14px; background:#fff8f0; border:1px solid #f0c080; border-radius:4px; margin-bottom:14px; font-size:11px; color:#cc6600; text-align:center; }
    .footer { margin-top:20px; border-top:1px solid #ddd; padding-top:14px; font-size:10px; color:#666; line-height:1.7; }
    .status-badge { display:inline-block; padding:2px 10px; border-radius:3px; font-size:10px; font-weight:700; text-transform:uppercase; background:#e8f5e9; color:#1b5e20; border:1px solid #a5d6a7; }
  </style></head><body><div class="wrap">
    <div class="header">
      <div>
        <div class="co-name">${COMPANY.name}</div>
        <div class="co-meta">${COMPANY.address}<br>NTN: ${COMPANY.ntn} &nbsp;|&nbsp; STRN: ${COMPANY.strn}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:700;">SALES INVOICE</div>
        <div class="status-badge">${(inv.status || 'posted').toUpperCase()}</div>
      </div>
    </div>
    <div class="inv-title">
      <div>
        <div class="section-title">Invoice No.</div>
        <div style="font-size:18px;font-weight:700;font-family:monospace;">${inv.sale_inv_id}</div>
      </div>
      <div class="inv-meta">
        <div><span style="color:#666">Date: </span><strong>${formatDate(inv.date)}</strong></div>
        ${inv.so_ref ? `<div><span style="color:#666">SO Ref: </span><strong>${inv.so_ref}</strong></div>` : ''}
        ${inv.dn_ref ? `<div><span style="color:#666">DN Ref: </span><strong>${inv.dn_ref}</strong></div>` : ''}
      </div>
    </div>
    <div class="section-grid">
      <div>
        <div class="section-title">Bill To</div>
        <div class="field-row"><span class="field-lbl">Customer:</span><span class="field-val">${inv.customer_name || '—'}</span></div>
      </div>
      <div>
        <div class="section-title">Amount Summary</div>
        <div class="field-row"><span class="field-lbl">Subtotal:</span><span class="field-val mono">${formatCurrency(inv.subtotal || 0)}</span></div>
        <div class="field-row"><span class="field-lbl">Extra Charges:</span><span class="field-val mono">${formatCurrency(inv.total_charges || 0)}</span></div>
      </div>
    </div>
    ${itemsSection}
    ${charges ? `<div style="margin-bottom:14px;padding:10px 14px;background:#f8f8f8;border:1px solid #eee;border-radius:4px;"><div class="section-title">Additional Charges</div>${charges}</div>` : ''}
    <div style="display:flex;justify-content:flex-end;">
      <div class="totals-box">
        <div class="total-row"><span style="color:#444">Subtotal</span><span class="mono">${formatCurrency(inv.subtotal || 0)}</span></div>
        ${inv.total_charges > 0 ? `<div class="total-row"><span style="color:#444">Additional Charges</span><span class="mono">${formatCurrency(inv.total_charges || 0)}</span></div>` : ''}
        <div class="total-row grand"><span>Grand Total</span><span class="mono">${formatCurrency(inv.grand_total || 0)}</span></div>
      </div>
    </div>
    <div class="footer">
      <div>This is a computer generated document and does not require a physical signature.</div>
      <div>NTN: ${COMPANY.ntn} &nbsp;|&nbsp; STRN: ${COMPANY.strn}</div>
    </div>
  </div></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

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

  // Fetches the invoice's itemised lines (from the linked sales order) so both the
  // printable bill and the downloadable PDF show the complete item list.
  const fetchInvoiceItems = async (row) => {
    if (!row.so_ref) return [];
    const { data, error } = await salesDb.getSoLineItems([row.so_ref]);
    if (error) throw new Error(error.message);
    return data || [];
  };

  const handlePrintInvoice = async (row) => {
    // Open the print window synchronously (inside the click) to avoid pop-up blocking,
    // show a placeholder, then fill it once the line items load.
    const win = window.open('', '_blank', 'width=900,height=720');
    if (win) win.document.write('<p style="font-family:Arial;padding:24px;color:#555">Preparing invoice…</p>');
    try {
      const items = await fetchInvoiceItems(row);
      printSalesInvoice(row, items, win);
    } catch (err) {
      if (win) win.close();
      toast.error(err.message, 'Print Failed');
    }
  };

  const handleDownloadPdf = async (row) => {
    setBusyDocId(row.id);
    try {
      const items = await fetchInvoiceItems(row);
      downloadSalesInvoicePdf(row, items);
    } catch (err) {
      toast.error(err.message, 'Download Failed');
    } finally {
      setBusyDocId(null);
    }
  };

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
      const result = await submitInvoice(invoice, [], { invoiceType: 1, paymentMode: 1 });
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
            icon={<Printer size={14} strokeWidth={1.75} />}
            onClick={() => handlePrintInvoice(row)}
          >
            Print
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} strokeWidth={1.75} />}
            onClick={() => handleDownloadPdf(row)}
            disabled={busyDocId === row.id}
          >
            {busyDocId === row.id ? 'PDF…' : 'PDF'}
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
    </div>
  );
}
