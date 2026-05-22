import { useState, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, Scale, TrendingDown, TrendingUp, BarChart3,
  Printer, Users, Globe, Package, FileText, BadgeCheck, Truck, Landmark,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { financeDb, salesDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { formatDate, formatCurrency } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import styles from './Reports.module.css';

const TODAY = new Date();
const agDays = (dateStr) => Math.floor((TODAY - new Date(dateStr)) / 86400000);

const COMPANY = { name: 'Allied Steel Center', address: 'Shop No. 41, Steel Sheet Market, Lahore', ntn: '9207491-5' };

const SEG_TO_TAB = {
  '': 'ledger', ledger: 'ledger', trial: 'trial',
  receivables: 'receivables', payables: 'payables', income: 'income',
  'customer-ledger': 'customer-ledger', region: 'region',
  'sold-items': 'sold-items', 'invoice-summary': 'invoice-summary',
  gst: 'gst', challan: 'challan', 'bank-recon': 'bank-recon',
};
const TAB_TO_SEG = {
  ledger: 'ledger', trial: 'trial', receivables: 'receivables',
  payables: 'payables', income: 'income',
  'customer-ledger': 'customer-ledger', region: 'region',
  'sold-items': 'sold-items', 'invoice-summary': 'invoice-summary',
  gst: 'gst', challan: 'challan', 'bank-recon': 'bank-recon',
};

const PAGE_TABS = [
  { value: 'ledger',          label: 'Ledger',              icon: BookOpen    },
  { value: 'trial',           label: 'Trial Balance',       icon: Scale       },
  { value: 'receivables',     label: 'Receivables',         icon: TrendingUp  },
  { value: 'payables',        label: 'Payables',            icon: TrendingDown},
  { value: 'income',          label: 'Income Statement',    icon: BarChart3   },
  { value: 'customer-ledger', label: 'Customer Ledger',     icon: Users       },
  { value: 'region',          label: 'Region Wise Sales',   icon: Globe       },
  { value: 'sold-items',      label: 'Sold Items',          icon: Package     },
  { value: 'invoice-summary', label: 'Invoice Summary',     icon: FileText    },
  { value: 'gst',             label: 'Order Wise GST',      icon: BadgeCheck  },
  { value: 'challan',         label: 'Delivery Challan',    icon: Truck       },
  { value: 'bank-recon',      label: 'Bank Reconciliation', icon: Landmark    },
];

/* ── Account Ledger ─────────────────────────────────────────────────── */
function LedgerReport() {
  const printRef = useRef();
  const { data: rawAccounts } = useDb(() => financeDb.getVoucherAccounts());
  const accountList = useMemo(() => [...new Set((rawAccounts || []).map(r => r.account_name).filter(Boolean))].sort(), [rawAccounts]);
  const _now = new Date();
  // Default to current fiscal year (Jul–Jun)
  const _fyStart = _now.getMonth() >= 6
    ? `${_now.getFullYear()}-07-01`
    : `${_now.getFullYear() - 1}-07-01`;
  const _fyEnd = _now.getMonth() >= 6
    ? `${_now.getFullYear() + 1}-06-30`
    : `${_now.getFullYear()}-06-30`;

  const [account,  setAccount] = useState('');
  const [fromDate, setFrom]    = useState(_fyStart);
  const [toDate,   setTo]      = useState(_fyEnd);

  const { data: rawVouchers } = useDb(
    () => account ? financeDb.getVouchersByAccount(account, fromDate, toDate) : Promise.resolve({ data: [], error: null }),
    [account, fromDate, toDate]
  );

  const entries = useMemo(() => {
    let running = 0;
    return (rawVouchers || []).map(v => {
      running += (parseFloat(v.debit) || 0) - (parseFloat(v.credit) || 0);
      return { ...v, balance: running };
    });
  }, [rawVouchers]);

  const openBal  = entries[0]?.balance ?? 0;
  const closeBal = entries[entries.length - 1]?.balance ?? 0;

  const handlePrint = () => {
    if (!account) return;
    const rows = entries.map((e, i) => `
      <tr>
        <td>${formatDate((e.date || '').slice(0, 10))}</td>
        <td>${e.narration || '—'}</td>
        <td class="right">${e.debit  > 0 ? formatCurrency(e.debit)  : '—'}</td>
        <td class="right">${e.credit > 0 ? formatCurrency(e.credit) : '—'}</td>
        <td class="right">${formatCurrency(Math.abs(e.balance))} ${e.balance >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>`).join('');
    const win = window.open('', '_blank', 'width=800,height=700');
    win.document.write(`<!DOCTYPE html><html><head><title>Ledger — ${account}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;padding:24px;color:#000}
      .hdr{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px}.co{font-size:18px;font-weight:700}
      .sub{font-size:11px;color:#555;margin-top:3px}.ttl{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:10px 0}
      .meta{font-size:11px;color:#444;margin-bottom:12px}table{width:100%;border-collapse:collapse}
      th{background:#1a1a1a;color:#fff;padding:6px 10px;font-size:10px;text-align:left}th.right{text-align:right}
      td{padding:5px 10px;font-size:11px;border-bottom:1px solid #eee}td.right{text-align:right;font-family:monospace}
      .footer{text-align:center;margin-top:20px;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:10px}
      </style></head><body>
      <div class="hdr"><div class="co">${COMPANY.name}</div><div class="sub">${COMPANY.address} | NTN: ${COMPANY.ntn}</div></div>
      <div class="ttl">Account Ledger</div>
      <div class="meta">Account: <strong>${account}</strong> &nbsp;|&nbsp; Period: ${formatDate(fromDate)} — ${formatDate(toDate)}</div>
      <table>
        <thead><tr><th>Date</th><th>Narration</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Balance</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#666">No entries for selected period</td></tr>'}</tbody>
      </table>
      <p class="footer">Opening: ${formatCurrency(Math.abs(openBal))} | Closing: ${formatCurrency(Math.abs(closeBal))} | Printed: ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</p>
      </body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className={styles.ledgerWrap}>
      <div className={styles.filterRow}>
        <div className={styles.filterGroup} style={{ flex: 2 }}>
          <label className={styles.filterLabel}>Account</label>
          <select className={styles.select} value={account} onChange={e => setAccount(e.target.value)}>
            <option value="">— Select account ({accountList.length}) —</option>
            {accountList.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input className={styles.dateInput} type="date" value={fromDate} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>To</label>
          <input className={styles.dateInput} type="date" value={toDate} onChange={e => setTo(e.target.value)} />
        </div>
        <Button variant="primary" icon={<Printer size={14} />} onClick={handlePrint} disabled={!account}>
          Print Ledger
        </Button>
      </div>

      {!account ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
          Select an account to view its ledger
        </div>
      ) : (
        <div ref={printRef}>
          <table className={styles.tbl}>
            <thead>
              <tr>
                <th>Date</th><th>Voucher</th><th>Narration</th>
                <th className={styles.right}>Debit</th>
                <th className={styles.right}>Credit</th>
                <th className={styles.right}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0
                ? <tr><td colSpan={6} style={{ textAlign:'center', padding:'20px', color:'var(--text-secondary)' }}>No entries for selected period</td></tr>
                : entries.map((e, i) => (
                  <tr key={e.id ?? i}>
                    <td className={styles.date}>{formatDate((e.date || '').slice(0, 10))}</td>
                    <td className={styles.code}>{e.voucher_id || '—'}</td>
                    <td>{e.narration || '—'}</td>
                    <td className={styles.right}>
                      {parseFloat(e.debit) > 0 ? <span className={styles.mono}>{formatCurrency(e.debit)}</span> : <span className={styles.nil}>—</span>}
                    </td>
                    <td className={styles.right}>
                      {parseFloat(e.credit) > 0 ? <span className={styles.mono}>{formatCurrency(e.credit)}</span> : <span className={styles.nil}>—</span>}
                    </td>
                    <td className={styles.right}>
                      <span className={styles.mono}>{formatCurrency(Math.abs(e.balance))}</span>
                      <span style={{ fontSize: 10, marginLeft: 4, color: e.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {e.balance >= 0 ? 'Dr' : 'Cr'}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {entries.length > 0 && (
            <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 0', gap:24, fontSize:12, color:'var(--text-secondary)' }}>
              <span>Opening: <strong>{formatCurrency(Math.abs(openBal))}</strong></span>
              <span>Closing: <strong>{formatCurrency(Math.abs(closeBal))}</strong></span>
              <span>Entries: <strong>{entries.length}</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Trial Balance ──────────────────────────────────────────────────── */
function TrialBalance({ chartOfAccounts }) {
  const debitAccts  = chartOfAccounts.filter(a => ['Asset', 'Expense'].includes(a.account_type));
  const creditAccts = chartOfAccounts.filter(a => ['Liability', 'Equity', 'Revenue', 'Capital', 'Income'].includes(a.account_type));
  const totalDr = debitAccts.reduce((s, a) => s + (a.balance || 0), 0);
  const totalCr = creditAccts.reduce((s, a) => s + (a.balance || 0), 0);

  return (
    <div className={styles.reportTable}>
      <table className={styles.tbl}>
        <thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th className={styles.right}>Debit (Dr)</th><th className={styles.right}>Credit (Cr)</th></tr></thead>
        <tbody>
          {chartOfAccounts.map(a => {
            const isDr = ['Asset', 'Expense'].includes(a.account_type);
            return (
              <tr key={a.account_id ?? a.id}>
                <td className={styles.code}>{a.account_code}</td>
                <td>{a.account_name}</td>
                <td className={styles.type}>{a.account_type}</td>
                <td className={styles.right}>{isDr  ? <span className={styles.mono}>{formatCurrency(a.balance)}</span> : <span className={styles.nil}>—</span>}</td>
                <td className={styles.right}>{!isDr ? <span className={styles.mono}>{formatCurrency(a.balance)}</span> : <span className={styles.nil}>—</span>}</td>
              </tr>
            );
          })}
          <tr className={styles.totalRow}>
            <td colSpan={3}><strong>Total</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(totalDr)}</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(totalCr)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── Aging Table ────────────────────────────────────────────────────── */
function AgingTable({ agingReport, type }) {
  const rows = agingReport.filter(a => a.party_type === type);
  const tot  = rows.reduce((a, r) => ({
    current: a.current + (r.current_amount || 0),
    days30:  a.days30  + (r.days_30 || 0),
    over90:  a.over90  + (r.over_90 || 0),
    total:   a.total   + (r.total || 0),
  }), { current:0, days30:0, over90:0, total:0 });

  return (
    <div className={styles.reportTable}>
      <table className={styles.tbl}>
        <thead><tr><th>Party</th><th className={styles.right}>Current</th><th className={styles.right}>1–30 Days</th><th className={styles.right}>90+ Days</th><th className={styles.right}>Total</th></tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={5} style={{ textAlign:'center', padding:'20px', color:'#666' }}>No data</td></tr>
            : rows.map(r => (
              <tr key={r.party_name}>
                <td>{r.party_name}</td>
                <td className={styles.right}><span className={styles.mono}>{formatCurrency(r.current_amount)}</span></td>
                <td className={styles.right}><span className={styles.mono}>{formatCurrency(r.days_30)}</span></td>
                <td className={styles.right}><span className={`${styles.mono} ${r.over_90>0?styles.overdue:''}`}>{formatCurrency(r.over_90)}</span></td>
                <td className={styles.right}><span className={`${styles.mono} ${styles.total}`}>{formatCurrency(r.total)}</span></td>
              </tr>
            ))}
          <tr className={styles.totalRow}>
            <td><strong>Total</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(tot.current)}</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(tot.days30)}</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(tot.over90)}</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(tot.total)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── Income Statement ───────────────────────────────────────────────── */
function IncomeStatement({ chartOfAccounts }) {
  const revenue  = chartOfAccounts.filter(a => ['Revenue','Income'].includes(a.account_type)).reduce((s, a) => s + (a.balance||0), 0);
  const expenses = chartOfAccounts.filter(a => a.account_type === 'Expense').reduce((s, a) => s + (a.balance||0), 0);
  const net = revenue - expenses;

  return (
    <div className={styles.plWrap}>
      <div className={styles.plTitle}>Income Statement</div>
      <div className={styles.plSection}>
        <div className={`${styles.plRow} ${styles.plHead}`}><span>Revenue</span><span className={styles.mono}>{formatCurrency(revenue)}</span></div>
        <div className={styles.plRow}><span>Cost of Goods Sold</span><span className={`${styles.mono} ${styles.neg}`}>({formatCurrency(0)})</span></div>
        <div className={`${styles.plRow} ${styles.plSub}`}><span>Gross Profit</span><span className={`${styles.mono} ${styles.pos}`}>{formatCurrency(revenue)}</span></div>
      </div>
      <div className={styles.plSection}>
        <div className={styles.plRow}><span>Operating Expenses</span><span className={`${styles.mono} ${styles.neg}`}>({formatCurrency(expenses)})</span></div>
      </div>
      <div className={`${styles.plRow} ${styles.plNet}`}>
        <span>Net Profit / (Loss)</span>
        <span className={`${styles.mono} ${net >= 0 ? styles.pos : styles.neg}`}>
          {net >= 0 ? formatCurrency(net) : `(${formatCurrency(Math.abs(net))})`}
        </span>
      </div>
    </div>
  );
}

/* ── Customer Sales Ledger ──────────────────────────────────────────── */
function CustomerLedger({ salesInvoices }) {
  const customerNames = [...new Set(salesInvoices.map(i => i.customer_name).filter(Boolean))];
  const [customer, setCustomer] = useState(customerNames[0] ?? '');
  const invs = salesInvoices.filter(i => i.customer_name === customer);

  return (
    <div className={styles.ledgerWrap}>
      <div className={styles.filterRow}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Customer</label>
          <select className={styles.select} value={customer} onChange={e => setCustomer(e.target.value)}>
            {customerNames.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className={styles.reportTable}>
        <table className={styles.tbl}>
          <thead><tr><th>Date</th><th>Invoice No.</th><th>SO Ref</th><th className={styles.right}>Subtotal</th><th className={styles.right}>Charges</th><th className={styles.right}>Grand Total</th><th>Status</th><th className={styles.right}>AG-DAYS</th></tr></thead>
          <tbody>
            {invs.length === 0
              ? <tr><td colSpan={8} style={{ textAlign:'center', padding:'20px', color:'#666' }}>No invoices found</td></tr>
              : invs.map(inv => {
                const days = agDays(inv.date);
                const dayVariant = days > 60 ? 'error' : days > 30 ? 'warning' : 'neutral';
                const s = getStatus(inv.status);
                return (
                  <tr key={inv.sale_inv_id}>
                    <td className={styles.code}>{formatDate(inv.date)}</td>
                    <td className={styles.code}>{inv.sale_inv_id}</td>
                    <td className={styles.code}>{inv.so_ref}</td>
                    <td className={styles.right}><span className={styles.mono}>{formatCurrency(inv.subtotal)}</span></td>
                    <td className={styles.right}><span className={styles.mono}>{formatCurrency(inv.total_charges || 0)}</span></td>
                    <td className={styles.right}><span className={`${styles.mono} ${styles.total}`}>{formatCurrency(inv.grand_total)}</span></td>
                    <td><Badge variant={s.variant}>{s.label}</Badge></td>
                    <td className={styles.right}><Badge variant={dayVariant}>{days}d</Badge></td>
                  </tr>
                );
              })}
            {invs.length > 0 && (
              <tr className={styles.totalRow}>
                <td colSpan={5}><strong>Total</strong></td>
                <td className={styles.right}><strong className={styles.mono}>{formatCurrency(invs.reduce((s, i) => s + (i.grand_total||0), 0))}</strong></td>
                <td colSpan={2}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Region Wise Sales ──────────────────────────────────────────────── */
function RegionWiseSales({ customers, salesOrders }) {
  const regions = [...new Set(customers.map(c => c.region).filter(Boolean))];
  const rows = regions.map(region => {
    const regionCustomers = customers.filter(c => c.region === region);
    const custIds = regionCustomers.map(c => c.customer_id);
    const regionOrders = salesOrders.filter(o => custIds.includes(o.customer_id));
    const totalSales = regionOrders.reduce((s, o) => s + (o.total_amount||0), 0);
    const completedSales = regionOrders.filter(o => o.status === 'completed').reduce((s, o) => s + (o.total_amount||0), 0);
    return { region, customerCount: regionCustomers.length, orderCount: regionOrders.length, totalSales, completedSales };
  });

  return (
    <div className={styles.reportTable}>
      <table className={styles.tbl}>
        <thead><tr><th>Region</th><th className={styles.right}>Customers</th><th className={styles.right}>Orders</th><th className={styles.right}>Total Sales</th><th className={styles.right}>Completed</th></tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={5} style={{ textAlign:'center', padding:'20px', color:'#666' }}>No data</td></tr>
            : rows.map(r => (
              <tr key={r.region}>
                <td><strong>{r.region}</strong></td>
                <td className={styles.right}><span className={styles.mono}>{r.customerCount}</span></td>
                <td className={styles.right}><span className={styles.mono}>{r.orderCount}</span></td>
                <td className={styles.right}><span className={styles.mono}>{formatCurrency(r.totalSales)}</span></td>
                <td className={styles.right}><span className={`${styles.mono} ${styles.pos}`}>{formatCurrency(r.completedSales)}</span></td>
              </tr>
            ))}
          <tr className={styles.totalRow}>
            <td><strong>Total</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{rows.reduce((s, r) => s + r.customerCount, 0)}</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{rows.reduce((s, r) => s + r.orderCount, 0)}</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(rows.reduce((s, r) => s + r.totalSales, 0))}</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(rows.reduce((s, r) => s + r.completedSales, 0))}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── Invoice Summary ────────────────────────────────────────────────── */
function InvoiceSummary({ salesInvoices }) {
  return (
    <div className={styles.reportTable}>
      <table className={styles.tbl}>
        <thead><tr><th>Invoice No.</th><th>Customer</th><th>Date</th><th className={styles.right}>Subtotal</th><th className={styles.right}>Freight</th><th className={styles.right}>L/U</th><th className={styles.right}>Packing</th><th className={styles.right}>Toll</th><th className={styles.right}>Slitting</th><th className={styles.right}>Grand Total</th><th>Status</th></tr></thead>
        <tbody>
          {salesInvoices.length === 0
            ? <tr><td colSpan={11} style={{ textAlign:'center', padding:'20px', color:'#666' }}>No invoices</td></tr>
            : salesInvoices.map(inv => {
              const s = getStatus(inv.status);
              return (
                <tr key={inv.sale_inv_id}>
                  <td className={styles.code}>{inv.sale_inv_id}</td>
                  <td>{inv.customer_name}</td>
                  <td className={styles.code}>{formatDate(inv.date)}</td>
                  <td className={styles.right}><span className={styles.mono}>{formatCurrency(inv.subtotal)}</span></td>
                  <td className={styles.right}><span className={styles.mono}>{formatCurrency(inv.freight)}</span></td>
                  <td className={styles.right}><span className={styles.mono}>{formatCurrency(inv.loading_unloading)}</span></td>
                  <td className={styles.right}><span className={styles.mono}>{formatCurrency(inv.packing)}</span></td>
                  <td className={styles.right}><span className={styles.mono}>{formatCurrency(inv.toll_tax)}</span></td>
                  <td className={styles.right}><span className={styles.mono}>{inv.slitting > 0 ? formatCurrency(inv.slitting) : '—'}</span></td>
                  <td className={styles.right}><span className={`${styles.mono} ${styles.total}`}>{formatCurrency(inv.grand_total)}</span></td>
                  <td><Badge variant={s.variant}>{s.label}</Badge></td>
                </tr>
              );
            })}
          <tr className={styles.totalRow}>
            <td colSpan={3}><strong>Total</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(salesInvoices.reduce((s, i) => s + (i.subtotal||0), 0))}</strong></td>
            <td colSpan={5}></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(salesInvoices.reduce((s, i) => s + (i.grand_total||0), 0))}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── Order Wise GST ─────────────────────────────────────────────────── */
function OrderWiseGST({ salesInvoices, orderConfirmations }) {
  const ocMap = Object.fromEntries(orderConfirmations.map(o => [o.so_ref, o]));
  const rows = salesInvoices.map(inv => {
    const oc = ocMap[inv.so_ref];
    const gstApplied = oc?.gst_applied ?? false;
    const gstAmt = gstApplied ? Math.round((inv.subtotal||0) * 0.17) : 0;
    return { ...inv, gstApplied, gstAmt, poNo: oc?.po_no ?? '—' };
  });
  const totalGST = rows.reduce((s, r) => s + r.gstAmt, 0);

  return (
    <div className={styles.reportTable}>
      <table className={styles.tbl}>
        <thead><tr><th>Invoice No.</th><th>Customer</th><th>PO No.</th><th>Date</th><th>GST Applied</th><th className={styles.right}>Subtotal</th><th className={styles.right}>GST (17%)</th><th className={styles.right}>Grand Total</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.sale_inv_id}>
              <td className={styles.code}>{r.sale_inv_id}</td>
              <td>{r.customer_name}</td>
              <td className={styles.code}>{r.poNo}</td>
              <td className={styles.code}>{formatDate(r.date)}</td>
              <td><Badge variant={r.gstApplied ? 'success' : 'neutral'}>{r.gstApplied ? 'Yes' : 'No'}</Badge></td>
              <td className={styles.right}><span className={styles.mono}>{formatCurrency(r.subtotal)}</span></td>
              <td className={styles.right}>{r.gstAmt > 0 ? <span className={`${styles.mono} ${styles.overdue}`}>{formatCurrency(r.gstAmt)}</span> : <span className={styles.nil}>—</span>}</td>
              <td className={styles.right}><span className={`${styles.mono} ${styles.total}`}>{formatCurrency(r.grand_total)}</span></td>
            </tr>
          ))}
          <tr className={styles.totalRow}>
            <td colSpan={6}><strong>Total GST</strong></td>
            <td className={styles.right}><strong className={`${styles.mono} ${styles.overdue}`}>{formatCurrency(totalGST)}</strong></td>
            <td className={styles.right}><strong className={styles.mono}>{formatCurrency(salesInvoices.reduce((s, i) => s + (i.grand_total||0), 0))}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── Delivery Challan ───────────────────────────────────────────────── */
function DeliveryChallan({ deliveryNotes }) {
  return (
    <div className={styles.reportTable}>
      <table className={styles.tbl}>
        <thead><tr><th>DN No.</th><th>SO Ref</th><th>Customer</th><th>Delivery Date</th><th>Dispatched By</th><th>Vehicle No.</th><th>Status</th></tr></thead>
        <tbody>
          {deliveryNotes.length === 0
            ? <tr><td colSpan={7} style={{ textAlign:'center', padding:'20px', color:'#666' }}>No deliveries</td></tr>
            : deliveryNotes.map(dn => {
              const s = getStatus(dn.status);
              return (
                <tr key={dn.delivery_id}>
                  <td className={styles.code}>{dn.delivery_id}</td>
                  <td className={styles.code}>{dn.so_ref}</td>
                  <td>{dn.customer_name}</td>
                  <td className={styles.code}>{formatDate(dn.delivery_date)}</td>
                  <td>{dn.dispatched_by}</td>
                  <td className={styles.mono}>{dn.vehicle_no}</td>
                  <td><Badge variant={s.variant}>{s.label}</Badge></td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Bank Reconciliation ────────────────────────────────────────────── */
function BankReconciliation({ bankAccounts, paymentReconciliation }) {
  const totalInvoiced = paymentReconciliation.reduce((s, r) => s + (r.invoice_amount||0), 0);
  const totalPaid     = paymentReconciliation.reduce((s, r) => s + (r.paid_amount||0), 0);

  return (
    <div className={styles.ledgerWrap}>
      <div className={styles.reconSummary}>
        {bankAccounts.map(b => (
          <div key={b.account_id} className={styles.reconBank}>
            <span className={styles.reconBankName}>{b.bank_name}</span>
            <span className={styles.reconBankBal}>{formatCurrency(b.balance)}</span>
            <span className={styles.reconBankBranch}>{b.branch_name}</span>
          </div>
        ))}
      </div>
      <div className={styles.reportTable}>
        <table className={styles.tbl}>
          <thead><tr><th>Reconcile ID</th><th>Invoice Ref</th><th>Customer</th><th className={styles.right}>Invoice Amount</th><th className={styles.right}>Paid Amount</th><th className={styles.right}>Difference</th><th>Payment Date</th><th>Status</th></tr></thead>
          <tbody>
            {paymentReconciliation.length === 0
              ? <tr><td colSpan={8} style={{ textAlign:'center', padding:'20px', color:'#666' }}>No reconciliation data</td></tr>
              : paymentReconciliation.map(r => {
                const diff = (r.invoice_amount||0) - (r.paid_amount||0);
                const s = getStatus(r.status);
                return (
                  <tr key={r.reconcile_id}>
                    <td className={styles.code}>{r.reconcile_id}</td>
                    <td className={styles.code}>{r.invoice_ref}</td>
                    <td>{r.customer_name}</td>
                    <td className={styles.right}><span className={styles.mono}>{formatCurrency(r.invoice_amount)}</span></td>
                    <td className={styles.right}><span className={`${styles.mono} ${styles.pos}`}>{formatCurrency(r.paid_amount)}</span></td>
                    <td className={styles.right}><span className={`${styles.mono} ${diff > 0 ? styles.overdue : styles.pos}`}>{diff > 0 ? formatCurrency(diff) : '—'}</span></td>
                    <td className={styles.code}>{r.payment_date ? formatDate(r.payment_date) : <span className={styles.nil}>Pending</span>}</td>
                    <td><Badge variant={s.variant}>{s.label}</Badge></td>
                  </tr>
                );
              })}
            <tr className={styles.totalRow}>
              <td colSpan={3}><strong>Total</strong></td>
              <td className={styles.right}><strong className={styles.mono}>{formatCurrency(totalInvoiced)}</strong></td>
              <td className={styles.right}><strong className={`${styles.mono} ${styles.pos}`}>{formatCurrency(totalPaid)}</strong></td>
              <td className={styles.right}><strong className={`${styles.mono} ${styles.overdue}`}>{formatCurrency(totalInvoiced - totalPaid)}</strong></td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
export default function Reports() {
  const location = useLocation();
  const navigate  = useNavigate();
  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'ledger';
  const setPageTab = (tab) => navigate(`/reports/${TAB_TO_SEG[tab] ?? tab}`, { replace: true });

  const { companyId } = useCompany();
  const { data: chartOfAccounts }      = useDb(() => financeDb.getChartOfAccounts());
  const { data: bankAccounts }         = useDb(() => financeDb.getBankAccounts());
  const { data: agingReport }          = useDb(() => financeDb.getAgingReport());
  const { data: paymentReconciliation }= useDb(() => financeDb.getPaymentReconciliation());
  const { data: customers }            = useDb(() => salesDb.getCustomers());
  const { data: salesOrders }          = useDb(() => salesDb.getSalesOrders(companyId),   [companyId]);
  const { data: salesInvoices }        = useDb(() => salesDb.getSalesInvoices(companyId), [companyId]);
  const { data: orderConfirmations }   = useDb(() => salesDb.getOrderConfirmations());
  const { data: deliveryNotes }        = useDb(() => salesDb.getDeliveryNotes(companyId), [companyId]);

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader title="Reports" subtitle="Ledger, aging, sales, GST, and financial statements" />

      <div className={styles.pageTabs}>
        {PAGE_TABS.map(t => (
          <button
            key={t.value}
            className={`${styles.pageTab} ${pageTab === t.value ? styles.pageTabActive : ''}`}
            onClick={() => setPageTab(t.value)}
          >
            <t.icon size={15} strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
      </div>

      {pageTab === 'ledger' && (
        <Card padding={false}>
          <CardHeader title="Account Ledger" subtitle="Party-wise transaction history with running balance" />
          <div className={styles.cardBody}><LedgerReport /></div>
        </Card>
      )}
      {pageTab === 'trial' && (
        <Card padding={false}>
          <CardHeader title="Trial Balance" subtitle={`${chartOfAccounts.length} accounts`} />
          <div className={styles.cardBody}><TrialBalance chartOfAccounts={chartOfAccounts} /></div>
        </Card>
      )}
      {pageTab === 'receivables' && (
        <Card padding={false}>
          <CardHeader title="Accounts Receivable — Aging" subtitle="Outstanding customer balances by age" />
          <div className={styles.cardBody}><AgingTable agingReport={agingReport} type="Customer" /></div>
        </Card>
      )}
      {pageTab === 'payables' && (
        <Card padding={false}>
          <CardHeader title="Accounts Payable — Aging" subtitle="Outstanding vendor balances by age" />
          <div className={styles.cardBody}><AgingTable agingReport={agingReport} type="Vendor" /></div>
        </Card>
      )}
      {pageTab === 'income' && (
        <Card padding={false}>
          <CardHeader title="Income Statement" subtitle="Profit and loss derived from chart of accounts" />
          <div className={styles.cardBody}><IncomeStatement chartOfAccounts={chartOfAccounts} /></div>
        </Card>
      )}
      {pageTab === 'customer-ledger' && (
        <Card padding={false}>
          <CardHeader title="Customer Sales Ledger" subtitle="Customer-wise invoice history with AG-DAYS aging" />
          <div className={styles.cardBody}><CustomerLedger salesInvoices={salesInvoices} /></div>
        </Card>
      )}
      {pageTab === 'region' && (
        <Card padding={false}>
          <CardHeader title="Region Wise Sales" subtitle="Sales aggregated by customer region" />
          <div className={styles.cardBody}><RegionWiseSales customers={customers} salesOrders={salesOrders} /></div>
        </Card>
      )}
      {pageTab === 'sold-items' && (
        <Card padding={false}>
          <CardHeader title="Sold Item Detail" subtitle="Invoice-level breakdown" />
          <div className={styles.cardBody}><InvoiceSummary salesInvoices={salesInvoices} /></div>
        </Card>
      )}
      {pageTab === 'invoice-summary' && (
        <Card padding={false}>
          <CardHeader title="Sale Invoice Summary" subtitle="Invoice-wise surcharge breakdown" />
          <div className={styles.cardBody}><InvoiceSummary salesInvoices={salesInvoices} /></div>
        </Card>
      )}
      {pageTab === 'gst' && (
        <Card padding={false}>
          <CardHeader title="Order Wise GST" subtitle="GST (17%) applied per sales invoice" />
          <div className={styles.cardBody}><OrderWiseGST salesInvoices={salesInvoices} orderConfirmations={orderConfirmations} /></div>
        </Card>
      )}
      {pageTab === 'challan' && (
        <Card padding={false}>
          <CardHeader title="Delivery Challan" subtitle="Delivery note records with vehicle and driver details" />
          <div className={styles.cardBody}><DeliveryChallan deliveryNotes={deliveryNotes} /></div>
        </Card>
      )}
      {pageTab === 'bank-recon' && (
        <Card padding={false}>
          <CardHeader title="Bank Reconciliation" subtitle="Invoice vs payment matching across bank accounts" />
          <div className={styles.cardBody}><BankReconciliation bankAccounts={bankAccounts} paymentReconciliation={paymentReconciliation} /></div>
        </Card>
      )}
    </div>
  );
}
