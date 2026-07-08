import { useState, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, Scale, TrendingDown, TrendingUp, BarChart3,
  Printer, Users, Globe, Package, FileText, BadgeCheck, Truck, Landmark,
  ClipboardList, CalendarDays, Store, BookUser,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { financeDb, salesDb, procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useCustomers } from '../../context/CustomerContext';
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
  'cust-balance': 'cust-balance', 'day-book': 'day-book', 'vendor-balance': 'vendor-balance',
  'vendor-ledger': 'vendor-ledger',
};
const TAB_TO_SEG = {
  ledger: 'ledger', trial: 'trial', receivables: 'receivables',
  payables: 'payables', income: 'income',
  'customer-ledger': 'customer-ledger', region: 'region',
  'sold-items': 'sold-items', 'invoice-summary': 'invoice-summary',
  gst: 'gst', challan: 'challan', 'bank-recon': 'bank-recon',
  'cust-balance': 'cust-balance', 'day-book': 'day-book', 'vendor-balance': 'vendor-balance',
  'vendor-ledger': 'vendor-ledger',
};

const PAGE_TABS = [
  { value: 'ledger',          label: 'Ledger',              icon: BookOpen    },
  { value: 'trial',           label: 'Trial Balance',       icon: Scale       },
  { value: 'receivables',     label: 'Receivables',         icon: TrendingUp  },
  { value: 'payables',        label: 'Payables',            icon: TrendingDown},
  { value: 'income',          label: 'Income Statement',    icon: BarChart3   },
  { value: 'customer-ledger', label: 'Customer Ledger',     icon: Users       },
  { value: 'vendor-ledger',   label: 'Vendor Ledger',       icon: BookUser    },
  { value: 'region',          label: 'Region Wise Sales',   icon: Globe       },
  { value: 'sold-items',      label: 'Sold Items',          icon: Package     },
  { value: 'invoice-summary', label: 'Invoice Summary',     icon: FileText    },
  { value: 'gst',             label: 'Order Wise GST',      icon: BadgeCheck  },
  { value: 'challan',         label: 'Delivery Challan',    icon: Truck         },
  { value: 'bank-recon',      label: 'Bank Reconciliation', icon: Landmark      },
  { value: 'cust-balance',    label: 'Customer Balance',    icon: ClipboardList  },
  { value: 'vendor-balance',  label: 'Vendor Balance',      icon: Store          },
  { value: 'day-book',        label: 'Daily Day Book',      icon: CalendarDays   },
];

/* ── Account Ledger ─────────────────────────────────────────────────── */
function LedgerReport() {
  const printRef = useRef();
  const { data: rawAccounts } = useDb(() => financeDb.getVoucherAccounts());
  const accountList = useMemo(() => [...new Set((rawAccounts || []).map(r => r.account_name).filter(Boolean))].sort(), [rawAccounts]);

  // Default to ALL dates (historical data spans many years) — the user can narrow if needed.
  const [account,  setAccount] = useState('');
  const [fromDate, setFrom]    = useState('');
  const [toDate,   setTo]      = useState('');

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
          <SearchableSelect
            placeholder={`Search account (${accountList.length})…`}
            emptyText="No matching accounts"
            value={account}
            onChange={setAccount}
            options={accountList.map(name => ({ value: name, label: name }))}
          />
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

  // Pull the sold-item detail (item name + size + rate) for this customer's orders.
  const soRefs = useMemo(() => invs.map(i => i.so_ref).filter(Boolean), [invs]);
  const soRefsKey = soRefs.join(',');
  const { data: lineItems } = useDb(() => salesDb.getSoLineItems(soRefs), [soRefsKey]);

  // Group line items by their SO ref so each invoice can show what was sold.
  const itemsByRef = useMemo(() => {
    const map = {};
    (lineItems || []).forEach(li => {
      (map[li.so_id] ||= []).push(li);
    });
    return map;
  }, [lineItems]);

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
          <thead><tr><th>Date</th><th>Invoice No.</th><th>Item / Size</th><th className={styles.right}>Rate</th><th className={styles.right}>Subtotal</th><th className={styles.right}>Charges</th><th className={styles.right}>Grand Total</th><th>Status</th><th className={styles.right}>AG-DAYS</th></tr></thead>
          <tbody>
            {invs.length === 0
              ? <tr><td colSpan={9} style={{ textAlign:'center', padding:'20px', color:'#666' }}>No invoices found</td></tr>
              : invs.map(inv => {
                const days = agDays(inv.date);
                const dayVariant = days > 60 ? 'error' : days > 30 ? 'warning' : 'neutral';
                const s = getStatus(inv.status);
                const items = itemsByRef[inv.so_ref] || [];
                return (
                  <tr key={inv.sale_inv_id}>
                    <td className={styles.code}>{formatDate(inv.date)}</td>
                    <td className={styles.code}>{inv.sale_inv_id}</td>
                    <td>
                      {items.length === 0
                        ? <span className={styles.nil}>—</span>
                        : items.map((li, idx) => (
                          <div key={idx} style={{ fontSize: 12, lineHeight: 1.5 }}>
                            {li.item_name || '—'}
                            {li.quantity > 0 && (
                              <span style={{ color: 'var(--text-tertiary)' }}> · {li.quantity} {li.unit || ''}</span>
                            )}
                          </div>
                        ))}
                    </td>
                    <td className={styles.right}>
                      {items.length === 0
                        ? <span className={styles.nil}>—</span>
                        : items.map((li, idx) => (
                          <div key={idx} className={styles.mono} style={{ fontSize: 12, lineHeight: 1.5 }}>
                            {li.unit_price > 0 ? formatCurrency(li.unit_price) : '—'}
                          </div>
                        ))}
                    </td>
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
                <td colSpan={6}><strong>Total</strong></td>
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

/* ── Customer Current Balance ────────────────────────────────────────── */
function CustomerCurrentBalance({ customers, salesInvoices, receiptVouchers }) {
  const [search, setSearch] = useState('');

  const report = useMemo(() => {
    if (!customers) return [];
    return customers.map(c => {
      const cName = (c.name || '').toLowerCase();

      // All invoices for this customer
      const custInvs = (salesInvoices || []).filter(
        inv => (inv.customer_name || '').toLowerCase() === cName
      );
      const lastInv = custInvs[0];
      const totalInvoiced = custInvs.reduce((s, inv) => s + (parseFloat(inv.grand_total) || 0), 0);

      // All receipt vouchers matching this customer
      const custPay = (receiptVouchers || []).filter(v =>
        (v.account_name || '').toLowerCase().includes(cName) ||
        (v.narration    || '').toLowerCase().includes(cName)
      );
      const lastPay = custPay[0];
      const totalPaid = custPay.reduce((s, v) => s + (parseFloat(v.credit) || 0), 0);

      // Derived balance: total invoiced minus total paid
      const derivedBalance = totalInvoiced - totalPaid;
      // Fall back to outstanding_balance if no invoice data exists
      const balance = totalInvoiced > 0 ? derivedBalance : (parseFloat(c.outstanding_balance) || 0);

      return {
        customer_id:          c.customer_id,
        name:                 c.name,
        contact:              c.contact,
        balance,
        total_invoiced:       totalInvoiced,
        total_paid:           totalPaid,
        last_payment_date:    lastPay?.date        || null,
        last_payment_amount:  lastPay ? (parseFloat(lastPay.credit) || 0) : 0,
        last_invoice_id:      lastInv?.sale_inv_id || null,
        last_invoice_date:    lastInv?.date        || null,
        last_invoice_amount:  parseFloat(lastInv?.grand_total) || 0,
      };
    }).filter(r => r.balance !== 0 || r.last_invoice_id);
  }, [customers, salesInvoices, receiptVouchers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return report;
    return report.filter(r =>
      (r.name    || '').toLowerCase().includes(q) ||
      (r.contact || '').toLowerCase().includes(q)
    );
  }, [report, search]);

  const drRows    = filtered.filter(r => r.balance >= 0).sort((a, b) => b.balance - a.balance);
  const crRows    = filtered.filter(r => r.balance  < 0).sort((a, b) => a.balance - b.balance);
  const totalDr   = drRows.reduce((s, r) => s + r.balance, 0);
  const totalCr   = crRows.reduce((s, r) => s + Math.abs(r.balance), 0);
  const netBalance= totalDr - totalCr;

  const renderRow = (r, i) => (
    <tr key={r.customer_id || r.name}>
      <td className={styles.code}>{i + 1}</td>
      <td>
        <strong>{r.name}</strong>
        {r.contact && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.contact}</div>}
      </td>
      <td className={`${styles.right} ${styles.mono}`} style={{ color: r.balance >= 0 ? 'var(--blue)' : 'var(--red)', fontWeight: 700 }}>
        {r.balance >= 0
          ? `${formatCurrency(r.balance)} Dr`
          : `${formatCurrency(Math.abs(r.balance))} Cr`}
      </td>
      <td className={`${styles.code} ${styles.right}`}>
        {r.last_payment_date ? formatDate(r.last_payment_date) : <span className={styles.nil}>—</span>}
      </td>
      <td className={`${styles.right} ${styles.mono}`}>
        {r.last_payment_amount > 0 ? formatCurrency(r.last_payment_amount) : <span className={styles.nil}>—</span>}
      </td>
      <td className={styles.code}>
        {r.last_invoice_id || <span className={styles.nil}>—</span>}
      </td>
      <td className={`${styles.code} ${styles.right}`}>
        {r.last_invoice_date ? formatDate(r.last_invoice_date) : <span className={styles.nil}>—</span>}
      </td>
      <td className={`${styles.right} ${styles.mono}`}>
        {r.last_invoice_amount > 0 ? formatCurrency(r.last_invoice_amount) : <span className={styles.nil}>—</span>}
      </td>
    </tr>
  );

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1150,height=820');
    const allRows = [...drRows, ...crRows];
    const tableRows = allRows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.name}</strong>${r.contact ? `<br><small style="color:#888">${r.contact}</small>` : ''}</td>
        <td class="right" style="color:${r.balance >= 0 ? '#1a5276' : '#922b21'};font-weight:700;font-family:monospace">
          ${r.balance >= 0 ? formatCurrency(r.balance) + ' Dr' : formatCurrency(Math.abs(r.balance)) + ' Cr'}
        </td>
        <td class="center">${r.last_payment_date ? formatDate(r.last_payment_date) : '—'}</td>
        <td class="right mono">${r.last_payment_amount > 0 ? formatCurrency(r.last_payment_amount) : '—'}</td>
        <td class="center mono">${r.last_invoice_id || '—'}</td>
        <td class="center">${r.last_invoice_date ? formatDate(r.last_invoice_date) : '—'}</td>
        <td class="right mono">${r.last_invoice_amount > 0 ? formatCurrency(r.last_invoice_amount) : '—'}</td>
      </tr>`).join('');

    win.document.write(`<!DOCTYPE html><html><head><title>Customer Current Balance</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff}
      .wrap{max-width:1060px;margin:0 auto;padding:24px}
      .hdr{text-align:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:14px}
      .co-name{font-size:20px;font-weight:700}
      .co-meta{font-size:10px;color:#555;margin-top:4px}
      .rpt-title{font-size:14px;font-weight:700;text-transform:uppercase;margin-top:6px;letter-spacing:1px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      thead th{background:#1a1a1a;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 8px;text-align:left}
      th.right,td.right{text-align:right} th.center,td.center{text-align:center}
      tbody td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}
      tbody tr:nth-child(even){background:#fafafa}
      .mono{font-family:monospace}
      .totals{display:flex;justify-content:flex-end;margin-top:14px}
      .tbox{min-width:300px}
      .trow{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:12px}
      .trow.net{font-weight:700;font-size:14px;border-top:2px solid #000;border-bottom:none;padding-top:8px;margin-top:4px}
      .footer{margin-top:20px;font-size:10px;color:#666;border-top:1px solid #ddd;padding-top:10px}
      small{font-size:10px;color:#666}
    </style></head><body><div class="wrap">
    <div class="hdr">
      <div class="co-name">${COMPANY.name}</div>
      <div class="co-meta">${COMPANY.address} | NTN: ${COMPANY.ntn}</div>
      <div class="rpt-title">Customer Current Balance Report</div>
      <div class="co-meta">As of ${formatDate(new Date().toISOString())} — ${allRows.length} customers</div>
    </div>
    <table>
      <thead><tr>
        <th>Sr#</th><th>Customer</th><th class="right">Current Balance</th>
        <th class="center">Last Pmt Date</th><th class="right">Last Pmt Amt</th>
        <th class="center">Invoice #</th><th class="center">Invoice Date</th><th class="right">Invoice Amt</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="totals">
      <div class="tbox">
        <div class="trow"><span>Total Debit (Receivable)</span><span class="mono" style="color:#1a5276">${formatCurrency(totalDr)}</span></div>
        <div class="trow"><span>Total Credit (Advance)</span><span class="mono" style="color:#922b21">${formatCurrency(totalCr)}</span></div>
        <div class="trow net"><span>Net Receivable</span><span class="mono">${formatCurrency(netBalance)}</span></div>
      </div>
    </div>
    <div class="footer">Printed on ${new Date().toLocaleString('en-PK')} — ${COMPANY.name} ERP</div>
    </div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const tblHead = (
    <thead>
      <tr>
        <th style={{ width: 50 }}>Sr#</th>
        <th>Customer</th>
        <th className={styles.right} style={{ width: 170 }}>Current Balance</th>
        <th className={styles.right} style={{ width: 130 }}>Last Pmt Date</th>
        <th className={styles.right} style={{ width: 140 }}>Last Pmt Amt</th>
        <th style={{ width: 120 }}>Invoice No.</th>
        <th className={styles.right} style={{ width: 110 }}>Invoice Date</th>
        <th className={styles.right} style={{ width: 140 }}>Invoice Amt</th>
      </tr>
    </thead>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div className={styles.filterRow}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Search Customer</label>
          <input
            className={styles.select}
            placeholder="Type name or contact..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 260 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <span className={styles.mono} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {filtered.length} customers &nbsp;|&nbsp; Net Receivable:&nbsp;
            <strong style={{ color: netBalance > 0 ? 'var(--blue)' : 'var(--red)' }}>
              {formatCurrency(netBalance)} {netBalance >= 0 ? 'Dr' : 'Cr'}
            </strong>
          </span>
          <Button variant="secondary" icon={<Printer size={14} strokeWidth={1.75} />} size="sm" onClick={handlePrint}>
            Print Report
          </Button>
        </div>
      </div>

      {drRows.length > 0 && (
        <div>
          <div className={styles.sectionHeading} style={{ marginBottom: 6 }}>
            Debit Balances (Receivable) — {drRows.length} customers
          </div>
          <div className={styles.reportTable}>
            <table className={styles.tbl}>
              {tblHead}
              <tbody>
                {drRows.map((r, i) => renderRow(r, i))}
                <tr className={styles.totalRow}>
                  <td colSpan={2}><strong>Total Debit</strong></td>
                  <td className={`${styles.right} ${styles.mono}`} style={{ color: 'var(--blue)', fontWeight: 700 }}>
                    {formatCurrency(totalDr)} Dr
                  </td>
                  <td colSpan={5}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {crRows.length > 0 && (
        <div>
          <div className={styles.sectionHeading} style={{ marginBottom: 6 }}>
            Credit Balances (Advance Received) — {crRows.length} customers
          </div>
          <div className={styles.reportTable}>
            <table className={styles.tbl}>
              {tblHead}
              <tbody>
                {crRows.map((r, i) => renderRow(r, i))}
                <tr className={styles.totalRow}>
                  <td colSpan={2}><strong>Total Credit</strong></td>
                  <td className={`${styles.right} ${styles.mono}`} style={{ color: 'var(--red)', fontWeight: 700 }}>
                    {formatCurrency(totalCr)} Cr
                  </td>
                  <td colSpan={5}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
          No customer balance data found{search ? ` for "${search}"` : ''}.
        </div>
      )}
    </div>
  );
}

/* ── Daily Day Book ──────────────────────────────────────────────────── */
function DailyDayBook({ vouchers }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const dayVouchers = useMemo(() =>
    (vouchers || []).filter(v => v.date === date)
  , [vouchers, date]);

  const totalDr = dayVouchers.reduce((s, v) => s + (parseFloat(v.debit)  || 0), 0);
  const totalCr = dayVouchers.reduce((s, v) => s + (parseFloat(v.credit) || 0), 0);

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1000,height=750');
    win.document.write(`<!DOCTYPE html><html><head><title>Daily Day Book — ${date}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:24px}
      h2{text-align:center;font-size:16px;margin-bottom:2px}
      .sub{text-align:center;font-size:12px;color:#555;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th{background:#1a1a2e;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
      td{padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11.5px}
      .mono{font-family:monospace}.right{text-align:right}
      .dr{color:#1a5276}.cr{color:#145a32}
      tfoot td{font-weight:700;border-top:2px solid #333;background:#f9f9f9}
    </style></head><body>
    <h2>${COMPANY.name}</h2>
    <div class="sub">Daily Day Book — ${date}</div>
    <table>
      <thead><tr><th>#</th><th>Voucher ID</th><th>Type</th><th>Account</th><th>Narration</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead>
      <tbody>${dayVouchers.map((v, i) => `<tr>
        <td>${i + 1}</td>
        <td class="mono">${v.voucher_id || '—'}</td>
        <td>${v.voucher_type || '—'}</td>
        <td>${v.account_name || '—'}</td>
        <td>${v.narration || '—'}</td>
        <td class="right mono dr">${v.debit  > 0 ? formatCurrency(v.debit)  : '—'}</td>
        <td class="right mono cr">${v.credit > 0 ? formatCurrency(v.credit) : '—'}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5" class="right">Totals</td>
        <td class="right mono dr">${formatCurrency(totalDr)}</td>
        <td class="right mono cr">${formatCurrency(totalCr)}</td>
      </tr></tfoot>
    </table></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '6px 12px', fontSize: 13 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dayVouchers.length} entries</span>
        <Button variant="secondary" icon={<Printer size={14} />} onClick={handlePrint} style={{ marginLeft: 'auto' }}>Print</Button>
      </div>
      {dayVouchers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>No vouchers found for {date}.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              {['#','Voucher ID','Type','Account','Narration','Debit','Credit'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Debit' || h === 'Credit' ? 'right' : 'left', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayVouchers.map((v, i) => (
              <tr key={v.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '7px 12px', color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v.voucher_id || '—'}</td>
                <td style={{ padding: '7px 12px' }}>{v.voucher_type || '—'}</td>
                <td style={{ padding: '7px 12px', fontWeight: 500 }}>{v.account_name || '—'}</td>
                <td style={{ padding: '7px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{v.narration || '—'}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>{v.debit  > 0 ? formatCurrency(v.debit)  : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{v.credit > 0 ? formatCurrency(v.credit) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--bg-tertiary)', fontWeight: 700 }}>
              <td colSpan={5} style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>Totals</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>{formatCurrency(totalDr)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{formatCurrency(totalCr)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

/* ── Vendor Current Balance ───────────────────────────────────────────── */
function VendorCurrentBalance({ vendors, purchaseInvoices }) {
  const [search, setSearch] = useState('');

  const report = useMemo(() => {
    return (vendors || []).map(v => {
      const vName = (v.name || '').toLowerCase();
      const vInvs = (purchaseInvoices || []).filter(
        inv => (inv.vendor_name || '').toLowerCase() === vName
      );
      const unpaid = vInvs.filter(inv => inv.status === 'unpaid' || inv.status === 'partial');
      const balance = unpaid.reduce((s, inv) => s + (parseFloat(inv.grand_total) || 0), 0);
      const lastInv = vInvs[0];
      return {
        id: v.id, name: v.name, contact: v.contact, category: v.category,
        balance, last_bill_id: lastInv?.bill_id || null,
        last_bill_date: lastInv?.bill_date || null,
        last_bill_amount: parseFloat(lastInv?.grand_total) || 0,
      };
    }).filter(r => r.balance > 0 || r.last_bill_id);
  }, [vendors, purchaseInvoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return report;
    return report.filter(r => (r.name || '').toLowerCase().includes(q));
  }, [report, search]);

  const totalPayable = filtered.reduce((s, r) => s + r.balance, 0);

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1000,height=750');
    win.document.write(`<!DOCTYPE html><html><head><title>Vendor Current Balance</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:24px}
      h2{text-align:center;font-size:16px;margin-bottom:2px}.sub{text-align:center;color:#555;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}th{background:#1a1a2e;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
      td{padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11.5px}.right{text-align:right}.mono{font-family:monospace}
      tfoot td{font-weight:700;border-top:2px solid #333;background:#f9f9f9}
    </style></head><body>
    <h2>${COMPANY.name}</h2><div class="sub">Vendor Current Balance</div>
    <table><thead><tr><th>#</th><th>Vendor</th><th>Category</th><th>Balance (Payable)</th><th>Last Bill</th><th>Bill Date</th><th class="right">Bill Amount</th></tr></thead>
    <tbody>${filtered.map((r, i) => `<tr>
      <td>${i + 1}</td><td><strong>${r.name}</strong></td><td>${r.category || '—'}</td>
      <td class="mono" style="color:#922b21;font-weight:700">${formatCurrency(r.balance)}</td>
      <td class="mono">${r.last_bill_id || '—'}</td><td>${r.last_bill_date ? formatDate(r.last_bill_date) : '—'}</td>
      <td class="right mono">${r.last_bill_amount > 0 ? formatCurrency(r.last_bill_amount) : '—'}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3" class="right">Total Payable</td><td class="mono" style="color:#922b21">${formatCurrency(totalPayable)}</td><td colspan="3"></td></tr></tfoot>
    </table></body></html>`);
    win.document.close(); setTimeout(() => win.print(), 400);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor..."
          style={{ flex: 1, maxWidth: 280, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '7px 12px', fontSize: 13 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} vendors · Total payable: <strong style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalPayable)}</strong></span>
        <Button variant="secondary" icon={<Printer size={14} />} onClick={handlePrint} style={{ marginLeft: 'auto' }}>Print</Button>
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>No vendor balances found{search ? ` for "${search}"` : ''}.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              {['#','Vendor','Category','Balance (Payable)','Last Bill','Bill Date','Bill Amount'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'right' === h ? 'right' : 'left', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '7px 12px', color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                <td style={{ padding: '7px 12px', fontWeight: 500 }}>{r.name}</td>
                <td style={{ padding: '7px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{r.category || '—'}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 700 }}>{formatCurrency(r.balance)}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.last_bill_id || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td style={{ padding: '7px 12px', fontSize: 12 }}>{r.last_bill_date ? formatDate(r.last_bill_date) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.last_bill_amount > 0 ? formatCurrency(r.last_bill_amount) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--bg-tertiary)', fontWeight: 700 }}>
              <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>Total Payable</td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{formatCurrency(totalPayable)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

/* ── Vendor Ledger ──────────────────────────────────────────────────── */
function VendorLedger({ vendors }) {
  const { data: rawAccounts } = useDb(() => financeDb.getVoucherAccounts());

  // Only offer vendors that actually have ledger activity (name matches a voucher account).
  const vendorList = useMemo(() => {
    const ledgerNames = new Set((rawAccounts || []).map(r => r.account_name).filter(Boolean));
    const names = (vendors || []).map(v => v.name).filter(Boolean);
    return [...new Set(names.filter(n => ledgerNames.has(n)))].sort();
  }, [rawAccounts, vendors]);

  const [vendor,   setVendor] = useState('');
  const [fromDate, setFrom]   = useState('');
  const [toDate,   setTo]     = useState('');

  const { data: rawVouchers } = useDb(
    () => vendor ? financeDb.getVouchersByAccount(vendor, fromDate, toDate) : Promise.resolve({ data: [], error: null }),
    [vendor, fromDate, toDate]
  );

  const entries = useMemo(() => {
    let running = 0;
    const out = [];
    for (const v of (rawVouchers || [])) {
      running += (parseFloat(v.debit) || 0) - (parseFloat(v.credit) || 0);
      out.push({ ...v, balance: running });
    }
    return out;
  }, [rawVouchers]);

  const totalDr  = entries.reduce((s, e) => s + (parseFloat(e.debit)  || 0), 0);
  const totalCr  = entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  const closeBal = entries[entries.length - 1]?.balance ?? 0;

  const handlePrint = () => {
    if (!vendor) return;
    const rows = entries.map(e => `
      <tr>
        <td>${formatDate((e.date || '').slice(0, 10))}</td>
        <td>${e.voucher_id || '—'}</td>
        <td>${e.voucher_type || '—'}</td>
        <td>${e.narration || '—'}</td>
        <td class="right">${e.debit  > 0 ? formatCurrency(e.debit)  : '—'}</td>
        <td class="right">${e.credit > 0 ? formatCurrency(e.credit) : '—'}</td>
        <td class="right">${formatCurrency(Math.abs(e.balance))} ${e.balance >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>`).join('');
    const win = window.open('', '_blank', 'width=900,height=720');
    win.document.write(`<!DOCTYPE html><html><head><title>Vendor Ledger — ${vendor}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;padding:24px;color:#000}
      .hdr{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px}.co{font-size:18px;font-weight:700}
      .sub{font-size:11px;color:#555;margin-top:3px}.ttl{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:10px 0}
      .meta{font-size:11px;color:#444;margin-bottom:12px}table{width:100%;border-collapse:collapse}
      th{background:#1a1a1a;color:#fff;padding:6px 10px;font-size:10px;text-align:left}th.right{text-align:right}
      td{padding:5px 10px;font-size:11px;border-bottom:1px solid #eee}td.right{text-align:right;font-family:monospace}
      tfoot td{font-weight:700;border-top:2px solid #333;background:#f9f9f9}
      .footer{text-align:center;margin-top:20px;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:10px}
      </style></head><body>
      <div class="hdr"><div class="co">${COMPANY.name}</div><div class="sub">${COMPANY.address} | NTN: ${COMPANY.ntn}</div></div>
      <div class="ttl">Vendor Ledger</div>
      <div class="meta">Vendor: <strong>${vendor}</strong> &nbsp;|&nbsp; Period: ${fromDate ? formatDate(fromDate) : 'Start'} — ${toDate ? formatDate(toDate) : 'To date'}</div>
      <table>
        <thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Narration</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Balance</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#666">No entries for selected period</td></tr>'}</tbody>
        <tfoot><tr><td colspan="4" class="right">Totals</td>
          <td class="right">${formatCurrency(totalDr)}</td>
          <td class="right">${formatCurrency(totalCr)}</td>
          <td class="right">${formatCurrency(Math.abs(closeBal))} ${closeBal >= 0 ? 'Dr' : 'Cr'}</td>
        </tr></tfoot>
      </table>
      <p class="footer">Closing Balance: ${formatCurrency(Math.abs(closeBal))} ${closeBal >= 0 ? 'Dr' : 'Cr'} | Printed: ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</p>
      </body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className={styles.ledgerWrap}>
      <div className={styles.filterRow}>
        <div className={styles.filterGroup} style={{ flex: 2 }}>
          <label className={styles.filterLabel}>Vendor</label>
          <SearchableSelect
            placeholder={`Search vendor (${vendorList.length})…`}
            emptyText="No matching vendors"
            value={vendor}
            onChange={setVendor}
            options={vendorList.map(name => ({ value: name, label: name }))}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input className={styles.dateInput} type="date" value={fromDate} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>To</label>
          <input className={styles.dateInput} type="date" value={toDate} onChange={e => setTo(e.target.value)} />
        </div>
        <Button variant="primary" icon={<Printer size={14} />} onClick={handlePrint} disabled={!vendor}>
          Print Ledger
        </Button>
      </div>

      {!vendor ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
          Select a vendor to view its ledger
        </div>
      ) : (
        <div>
          <table className={styles.tbl}>
            <thead>
              <tr>
                <th>Date</th><th>Voucher</th><th>Type</th><th>Narration</th>
                <th className={styles.right}>Debit</th>
                <th className={styles.right}>Credit</th>
                <th className={styles.right}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0
                ? <tr><td colSpan={7} style={{ textAlign:'center', padding:'20px', color:'var(--text-secondary)' }}>No entries for selected period</td></tr>
                : entries.map((e, i) => (
                  <tr key={e.id ?? i}>
                    <td className={styles.date}>{formatDate((e.date || '').slice(0, 10))}</td>
                    <td className={styles.code}>{e.voucher_id || '—'}</td>
                    <td className={styles.type}>{e.voucher_type || '—'}</td>
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
              <span>Total Debit: <strong>{formatCurrency(totalDr)}</strong></span>
              <span>Total Credit: <strong>{formatCurrency(totalCr)}</strong></span>
              <span>Closing: <strong>{formatCurrency(Math.abs(closeBal))} {closeBal >= 0 ? 'Dr' : 'Cr'}</strong></span>
              <span>Entries: <strong>{entries.length}</strong></span>
            </div>
          )}
        </div>
      )}
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
  const { data: chartOfAccounts }      = useDb(() => financeDb.getChartOfAccounts(companyId), [companyId]);
  const { data: bankAccounts }         = useDb(() => financeDb.getBankAccounts(companyId), [companyId]);
  const { data: agingReport }          = useDb(() => financeDb.getAgingReport());
  const { data: paymentReconciliation }= useDb(() => financeDb.getPaymentReconciliation());
  const { data: receiptVouchers }      = useDb(() => financeDb.getReceiptVouchers(companyId), [companyId]);
  const { data: allVouchers }          = useDb(() => financeDb.getVouchers(companyId), [companyId]);
  const { data: vendors }              = useDb(() => procurementDb.getVendors());
  const { data: purchaseInvoices }     = useDb(() => procurementDb.getPurchaseInvoices(companyId), [companyId]);
  const { customers }                  = useCustomers();
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
      {pageTab === 'vendor-ledger' && (
        <Card padding={false}>
          <CardHeader title="Vendor Ledger" subtitle="Vendor-wise transaction history with running balance" />
          <div className={styles.cardBody}><VendorLedger vendors={vendors} /></div>
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
      {pageTab === 'cust-balance' && (
        <Card padding={false}>
          <CardHeader
            title="Customer Current Balance"
            subtitle="Outstanding balances, last payment, and latest invoice per customer"
          />
          <div className={styles.cardBody}>
            <CustomerCurrentBalance
              customers={customers}
              salesInvoices={salesInvoices}
              receiptVouchers={receiptVouchers}
            />
          </div>
        </Card>
      )}
      {pageTab === 'vendor-balance' && (
        <Card padding={false}>
          <CardHeader title="Vendor Current Balance" subtitle="Outstanding payables per vendor from unpaid purchase invoices" />
          <div className={styles.cardBody}>
            <VendorCurrentBalance vendors={vendors} purchaseInvoices={purchaseInvoices} />
          </div>
        </Card>
      )}
      {pageTab === 'day-book' && (
        <Card padding={false}>
          <CardHeader title="Daily Day Book" subtitle="All voucher entries for a selected date" />
          <div className={styles.cardBody}>
            <DailyDayBook vouchers={allVouchers} />
          </div>
        </Card>
      )}
    </div>
  );
}
