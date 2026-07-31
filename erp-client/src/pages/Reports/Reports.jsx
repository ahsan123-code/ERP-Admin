import { useState, useRef, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, Scale, TrendingDown, TrendingUp, BarChart3,
  FileDown, Eye, Users, Globe, Package, FileText, BadgeCheck, Truck, Landmark,
  ClipboardList, CalendarDays, Store, BookUser, Trash2,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { financeDb, salesDb, procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../components/shared/Toast';
import { useCustomers } from '../../context/CustomerContext';
import { formatDate, formatCurrency, itemLabel } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import { downloadWordDoc, esc, companyHeader, documentFooter } from '../../utils/wordExport';
import { useWordPreview } from '../../hooks/useWordPreview';
import styles from './Reports.module.css';

const TODAY = new Date();
const agDays = (dateStr) => Math.floor((TODAY - new Date(dateStr)) / 86400000);

const COMPANY = { name: 'Allied Steel Center', address: 'Shop No. 41, Steel Sheet Market, Lahore', ntn: '9207491-5' };

// Shared look for every exported report. Borders are set per-cell rather than via
// border-collapse shorthands because Word ignores the latter.
const REPORT_CSS = `
  .rpt { width: 100%; font-size: 10px; }
  .rpt th { background:#1a1a1a; color:#fff; padding:6px 9px; font-size:9px;
            text-align:left; border:1px solid #1a1a1a; }
  .rpt th.right  { text-align:right; }
  .rpt th.center { text-align:center; }
  .rpt td { padding:5px 9px; font-size:10px; border:1px solid #ddd; vertical-align:top; }
  .rpt td.right  { text-align:right; font-family:'Courier New',monospace; }
  .rpt td.center { text-align:center; }
  .rpt tfoot td  { font-weight:700; border-top:2px solid #333; background:#f9f9f9; }
  .rpt-meta { font-size:10px; color:#444; margin-bottom:10px; }
`;

// Wraps a report table in the standard letterhead + footer, returning the document
// spec. Both the Preview and the Download button build from this one function, so
// what the preview shows is always what the .doc contains.
// `landscape` is for the wide multi-column reports that would otherwise be cut off.
function buildReportDoc({ filename, title, meta = '', table, landscape = false, note = null }) {
  return {
    filename,
    title,
    landscape,
    css: REPORT_CSS,
    body: `
      ${companyHeader(COMPANY, { title })}
      ${meta ? `<div class="rpt-meta">${meta}</div>` : ''}
      ${table}
      ${documentFooter(note, COMPANY)}`,
  };
}

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
function LedgerReport({ chartOfAccounts = [], companyId = 1 }) {
  const printRef = useRef();
  const toast = useToast();
  const { data: rawAccounts } = useDb(() => financeDb.getVoucherAccounts());
  // Merge the full chart of accounts (so every account is selectable — even one you just
  // posted your first entry to, which wouldn't yet appear in the voucher-account view) with
  // historical voucher party-names (legacy accounts that may not exist in the chart anymore).
  const accountList = useMemo(() => {
    const fromChart    = (chartOfAccounts || []).map(a => a.account_name).filter(Boolean);
    const fromVouchers = (rawAccounts     || []).map(r => r.account_name).filter(Boolean);
    return [...new Set([...fromChart, ...fromVouchers])].sort((a, b) => a.localeCompare(b));
  }, [rawAccounts, chartOfAccounts]);

  // Default to ALL dates (historical data spans many years) — the user can narrow if needed.
  const [account,  setAccount] = useState('');
  const [fromDate, setFrom]    = useState('');
  const [toDate,   setTo]      = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const { data: rawVouchers, refetch: refetchVouchers } = useDb(
    () => account
      ? financeDb.getVouchersByAccount(account, fromDate, toDate, companyId)
      : Promise.resolve({ data: [], error: null }),
    [account, fromDate, toDate, companyId]
  );

  // Real remarks live on the voucher lines; vouchers.narration is a placeholder from
  // the source system ("Remarks", "Journal Voucher", …).
  const voucherIds = useMemo(
    () => (rawVouchers || []).map(v => v.voucher_id).filter(Boolean), [rawVouchers]);
  const voucherIdKey = voucherIds.join(',');
  const { data: lineNotes } = useDb(
    () => financeDb.getVoucherLineNarrations(voucherIds, companyId),
    [voucherIdKey, companyId]);

  // Prefer the line booked against the account being viewed; fall back to any line
  // that carries a note, since one-sided legacy vouchers often only annotate the
  // opposite leg. Placeholder header values are never shown.
  const narrationByVoucher = useMemo(() => {
    const PLACEHOLDER = /^(remarks|journal voucher|cash (paid|receipt) voucher|bank cheques reconciliation|posted from purchase invoice)$/i;
    const map = {};
    (lineNotes || []).forEach(l => {
      if (!l.narration) return;
      const mine = (l.account_title || '').toLowerCase() === (account || '').toLowerCase();
      const cur = map[l.voucher_id];
      if (!cur || (mine && !cur.mine)) map[l.voucher_id] = { text: l.narration, mine };
    });
    return { map, isPlaceholder: (s) => !s || PLACEHOLDER.test(String(s).trim()) };
  }, [lineNotes, account]);

  // Item detail for vouchers the app raised, which carry a reference to the document
  // they posted from. Imported history has no such link, so those rows show "—".
  const soRefs = useMemo(() => {
    const refs = (rawVouchers || [])
      .filter(v => v.reference && /^INV-/.test(v.reference))
      .map(v => v.reference);
    return [...new Set(refs)];
  }, [rawVouchers]);
  const soRefKey = soRefs.join(',');
  const { data: invoicesForRefs } = useDb(
    () => soRefs.length
      ? salesDb.getSalesInvoices(companyId)
      : Promise.resolve({ data: [], error: null }),
    [soRefKey, companyId]);

  const orderRefByInvoice = useMemo(() => {
    const m = {};
    (invoicesForRefs || []).forEach(i => { if (i.sale_inv_id) m[i.sale_inv_id] = i.so_ref; });
    return m;
  }, [invoicesForRefs]);

  const neededSoRefs = useMemo(
    () => [...new Set(soRefs.map(r => orderRefByInvoice[r]).filter(Boolean))],
    [soRefs, orderRefByInvoice]);
  const neededKey = neededSoRefs.join(',');
  const { data: ledgerLineItems } = useDb(
    () => salesDb.getSoLineItems(neededSoRefs), [neededKey]);

  const itemsForVoucher = useMemo(() => {
    const bySo = {};
    (ledgerLineItems || []).forEach(li => { (bySo[li.so_id] ||= []).push(li); });
    return (v) => {
      const so = v.reference ? orderRefByInvoice[v.reference] : null;
      return so ? (bySo[so] || []) : [];
    };
  }, [ledgerLineItems, orderRefByInvoice]);

  // What the Narration column shows: the real remark when there is one, else nothing
  // rather than the source system's placeholder text.
  const narrationFor = (v) => {
    const line = narrationByVoucher.map[v.voucher_id]?.text;
    if (line && !narrationByVoucher.isPlaceholder(line)) return line;
    if (!narrationByVoucher.isPlaceholder(v.narration)) return v.narration;
    return '';
  };
  const specFor = (li) => [li.size, li.gauge].filter(Boolean).join(' · ');

  // Delete a transaction straight from the account history — mirrors the Finance
  // Vouchers tab: grouped legs reverse together, standalone rows reverse their
  // own balance impact. Confirmed first, since this is a reporting screen.
  const handleDelete = async (row) => {
    if (!window.confirm(`Delete voucher "${row.voucher_id}" from the ledger? This cannot be undone.`)) return;
    setDeletingId(row.id);
    try {
      const isGrouped = /-\d+$/.test(row.voucher_id || '');
      if (isGrouped) {
        const groupId = row.voucher_id.replace(/-\d+$/, '');
        const { error } = await financeDb.deleteVoucherGroup(groupId, companyId);
        if (error) throw new Error(error.message);
        toast.success(`Voucher ${groupId} reversed and deleted (all legs).`);
      } else {
        const { error } = await financeDb.deleteVoucher(row.id);
        if (error) throw new Error(error.message);
        const acct = chartOfAccounts.find(a => a.account_name === row.account_name);
        if (acct) await financeDb.applyVoucherToBalances(acct, -(row.debit || 0), -(row.credit || 0));
        toast.success(`Voucher ${row.voucher_id} deleted.`);
      }
      refetchVouchers();
    } catch (err) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setDeletingId(null);
    }
  };

  const entries = useMemo(() => {
    let running = 0;
    return (rawVouchers || []).map(v => {
      running += (parseFloat(v.debit) || 0) - (parseFloat(v.credit) || 0);
      return { ...v, balance: running };
    });
  }, [rawVouchers]);

  const openBal  = entries[0]?.balance ?? 0;
  const closeBal = entries[entries.length - 1]?.balance ?? 0;

  const { showPreview, previewNode } = useWordPreview();
  const handlePreview  = () => { const d = buildDoc(); if (d) showPreview(d); };
  const handleDownload = () => { const d = buildDoc(); if (d) downloadWordDoc(d); };

  const buildDoc = () => {
    if (!account) return;
    const rows = entries.map(e => {
      const items = itemsForVoucher(e);
      const join = (fn) => items.length ? items.map(fn).join('<br>') : '—';
      return `
      <tr>
        <td>${formatDate((e.date || '').slice(0, 10))}</td>
        <td>${esc(narrationFor(e)) || '—'}</td>
        <td>${join(li => `${esc(itemLabel(li.item_name))}${li.quantity > 0 ? ` · ${esc(li.quantity)} ${esc(li.unit || '')}` : ''}`)}</td>
        <td>${join(li => esc(specFor(li)) || '—')}</td>
        <td class="right">${join(li => li.unit_price > 0 ? formatCurrency(li.unit_price) : '—')}</td>
        <td class="right">${e.debit  > 0 ? formatCurrency(e.debit)  : '—'}</td>
        <td class="right">${e.credit > 0 ? formatCurrency(e.credit) : '—'}</td>
        <td class="right">${formatCurrency(Math.abs(e.balance))} ${e.balance >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>`;
    }).join('');

    return buildReportDoc({
      filename: `Ledger ${account}`,
      title: 'Account Ledger',
      landscape: true,
      meta: `Account: <strong>${esc(account)}</strong> &nbsp;|&nbsp; Period: ${formatDate(fromDate)} — ${formatDate(toDate)}`,
      note: `Opening: ${formatCurrency(Math.abs(openBal))}  |  Closing: ${formatCurrency(Math.abs(closeBal))}`,
      table: `<table class="rpt">
        <thead><tr><th width="70">Date</th><th>Narration</th><th width="130">Item</th>
          <th width="90">Size / Gauge</th><th class="right" width="80">Rate</th>
          <th class="right" width="95">Debit</th>
          <th class="right" width="95">Credit</th><th class="right" width="110">Balance</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="center" style="padding:18px;color:#666">No entries for selected period</td></tr>'}</tbody>
      </table>`,
    });
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
        <Button variant="secondary" icon={<Eye size={14} />} onClick={handlePreview} disabled={!account}>
          Preview
        </Button>
        <Button variant="primary" icon={<FileDown size={14} />} onClick={handleDownload} disabled={!account}>
          Download Word
        </Button>
        {previewNode}
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
                <th>Item</th><th>Size / Gauge</th>
                <th className={styles.right}>Rate</th>
                <th className={styles.right}>Debit</th>
                <th className={styles.right}>Credit</th>
                <th className={styles.right}>Balance</th>
                <th style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0
                ? <tr><td colSpan={10} style={{ textAlign:'center', padding:'20px', color:'var(--text-secondary)' }}>No entries for selected period</td></tr>
                : entries.map((e, i) => {
                  const items = itemsForVoucher(e);
                  const note = narrationFor(e);
                  return (
                  <tr key={e.id ?? i}>
                    <td className={styles.date}>{formatDate((e.date || '').slice(0, 10))}</td>
                    <td className={styles.code}>{e.voucher_id || '—'}</td>
                    <td>{note || <span className={styles.nil}>—</span>}</td>
                    <td>
                      {items.length === 0
                        ? <span className={styles.nil}>—</span>
                        : items.map((li, idx) => (
                          <div key={idx} style={{ fontSize: 12, lineHeight: 1.5 }}>
                            {itemLabel(li.item_name)}
                            {li.quantity > 0 && (
                              <span style={{ color: 'var(--text-tertiary)' }}> · {li.quantity} {li.unit || ''}</span>
                            )}
                          </div>
                        ))}
                    </td>
                    <td>
                      {items.length === 0
                        ? <span className={styles.nil}>—</span>
                        : items.map((li, idx) => (
                          <div key={idx} className={styles.mono} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                            {specFor(li) || <span className={styles.nil}>—</span>}
                          </div>
                        ))}
                    </td>
                    <td className={styles.right}>
                      {items.length === 0
                        ? <span className={styles.nil}>—</span>
                        : items.map((li, idx) => (
                          <div key={idx} className={styles.mono} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                            {li.unit_price > 0 ? formatCurrency(li.unit_price) : '—'}
                          </div>
                        ))}
                    </td>
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
                    <td className={styles.right}>
                      <button
                        className={styles.rowDeleteBtn}
                        disabled={deletingId === e.id}
                        onClick={() => handleDelete(e)}
                        title={`Delete voucher "${e.voucher_id}"`}
                      >
                        {deletingId === e.id
                          ? <span className={styles.rowDeleteSpinner}>…</span>
                          : <Trash2 size={13} strokeWidth={2} />}
                      </button>
                    </td>
                  </tr>
                  );
                })}
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
function CustomerLedger({ salesInvoices, customers = [] }) {
  // Every registered customer, not only those who already have an invoice. A newly
  // added customer — especially one carried over with an opening balance — has no
  // invoices yet, and building this list from invoices alone made them unselectable
  // so their balance was impossible to view.
  const customerNames = useMemo(() => {
    const names = new Set(salesInvoices.map(i => i.customer_name).filter(Boolean));
    (customers || []).forEach(c => { if (c.name) names.add(c.name); });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [salesInvoices, customers]);

  const [customer, setCustomer] = useState('');
  const [fromDate, setFrom] = useState('');
  const [toDate,   setTo]   = useState('');

  // Default to the first customer once data has loaded.
  useEffect(() => {
    setCustomer(c => c || customerNames[0] || '');
  }, [customerNames]);

  const inRange = (dateStr) => {
    const d = (dateStr || '').slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  };

  const invs = useMemo(() => salesInvoices.filter(i => {
    if (i.customer_name !== customer) return false;
    return inRange(i.date);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [salesInvoices, customer, fromDate, toDate]);

  // Brought-forward balance, shown as the first row so the ledger opens from the
  // customer's real starting position rather than from zero.
  const openingRow = useMemo(() => {
    const c = (customers || []).find(x => x.name === customer);
    const amount = parseFloat(c?.opening_balance) || 0;
    if (amount === 0) return null;
    if (c.opening_balance_date && !inRange(c.opening_balance_date)) return null;
    return { amount, date: c.opening_balance_date };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, customer, fromDate, toDate]);

  const openingAmount = openingRow?.amount || 0;

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

  const grandTotal = openingAmount + invs.reduce((s, i) => s + (i.grand_total || 0), 0);

  const { showPreview, previewNode } = useWordPreview();
  const handlePreview  = () => { const d = buildDoc(); if (d) showPreview(d); };
  const handleDownload = () => { const d = buildDoc(); if (d) downloadWordDoc(d); };

  const buildDoc = () => {
    if (!customer) return;
    const openingHtml = openingRow
      ? `<tr>
          <td>${openingRow.date ? formatDate(openingRow.date) : '—'}</td>
          <td><strong>Opening Balance</strong></td>
          <td>Brought forward</td>
          <td>—</td>
          <td class="right">—</td>
          <td class="right">—</td>
          <td class="right">—</td>
          <td class="right">${formatCurrency(openingRow.amount)}</td>
          <td>—</td>
        </tr>`
      : '';
    const rows = openingHtml + invs.map(inv => {
      const items = itemsByRef[inv.so_ref] || [];
      const itemText = items.length
        ? items.map(li => `${esc(itemLabel(li.item_name))}${li.quantity > 0 ? ` · ${esc(li.quantity)} ${esc(li.unit || '')}` : ''}`).join('<br>')
        : '—';
      const specText = items.length
        ? items.map(li => [li.size, li.gauge].filter(Boolean).join(' · ') || '—').join('<br>')
        : '—';
      const rateText = items.length
        ? items.map(li => li.unit_price > 0 ? formatCurrency(li.unit_price) : '—').join('<br>')
        : '—';
      return `<tr>
        <td>${formatDate(inv.date)}</td>
        <td>${inv.sale_inv_id || '—'}</td>
        <td>${itemText}</td>
        <td>${specText}</td>
        <td class="right">${rateText}</td>
        <td class="right">${formatCurrency(inv.subtotal)}</td>
        <td class="right">${formatCurrency(inv.total_charges || 0)}</td>
        <td class="right">${formatCurrency(inv.grand_total)}</td>
        <td>${getStatus(inv.status).label}</td>
      </tr>`;
    }).join('');
    return buildReportDoc({
      filename: `Customer Sales Ledger ${customer}`,
      title: 'Customer Sales Ledger',
      landscape: true,
      meta: `Customer: <strong>${esc(customer)}</strong> &nbsp;|&nbsp; Period: ${fromDate ? formatDate(fromDate) : 'Start'} — ${toDate ? formatDate(toDate) : 'To date'}`,
      table: `<table class="rpt">
        <thead><tr><th width="70">Date</th><th width="90">Invoice No.</th><th>Item</th>
          <th width="100">Size / Gauge</th><th class="right" width="80">Rate</th>
          <th class="right" width="90">Subtotal</th><th class="right" width="80">Charges</th>
          <th class="right" width="95">Grand Total</th><th width="70">Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="center" style="padding:18px;color:#666">No invoices for selected period</td></tr>'}</tbody>
        <tfoot><tr><td colspan="7" class="right">Total</td>
          <td class="right">${formatCurrency(grandTotal)}</td><td></td></tr></tfoot>
      </table>`,
    });
  };

  return (
    <div className={styles.ledgerWrap}>
      <div className={styles.filterRow}>
        <div className={styles.filterGroup} style={{ flex: 2 }}>
          <label className={styles.filterLabel}>Customer</label>
          <SearchableSelect
            placeholder={`Search customer (${customerNames.length})…`}
            emptyText="No matching customers"
            value={customer}
            onChange={setCustomer}
            options={customerNames.map(name => ({ value: name, label: name }))}
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
        <Button variant="secondary" icon={<Eye size={14} />} onClick={handlePreview} disabled={!customer}>
          Preview
        </Button>
        <Button variant="primary" icon={<FileDown size={14} />} onClick={handleDownload} disabled={!customer}>
          Download Word
        </Button>
        {previewNode}
      </div>
      <div className={styles.reportTable}>
        <table className={styles.tbl}>
          <thead><tr><th>Date</th><th>Invoice No.</th><th>Item</th><th>Size / Gauge</th><th className={styles.right}>Rate</th><th className={styles.right}>Subtotal</th><th className={styles.right}>Charges</th><th className={styles.right}>Grand Total</th><th>Status</th><th className={styles.right}>AG-DAYS</th></tr></thead>
          <tbody>
            {openingRow && (
              <tr>
                <td className={styles.code}>{openingRow.date ? formatDate(openingRow.date) : '—'}</td>
                <td><strong>Opening Balance</strong></td>
                <td><span style={{ color: 'var(--text-tertiary)' }}>Brought forward</span></td>
                <td><span className={styles.nil}>—</span></td>
                <td className={styles.right}><span className={styles.nil}>—</span></td>
                <td className={styles.right}><span className={styles.nil}>—</span></td>
                <td className={styles.right}><span className={styles.nil}>—</span></td>
                <td className={styles.right}><span className={`${styles.mono} ${styles.total}`}>{formatCurrency(openingRow.amount)}</span></td>
                <td><Badge variant="neutral">Opening</Badge></td>
                <td className={styles.right}><span className={styles.nil}>—</span></td>
              </tr>
            )}
            {invs.length === 0 && !openingRow
              ? <tr><td colSpan={10} style={{ textAlign:'center', padding:'20px', color:'#666' }}>No invoices found</td></tr>
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
                            {itemLabel(li.item_name)}
                            {li.quantity > 0 && (
                              <span style={{ color: 'var(--text-tertiary)' }}> · {li.quantity} {li.unit || ''}</span>
                            )}
                          </div>
                        ))}
                    </td>
                    <td>
                      {/* Gauge and size as their own column. Older rows kept both
                          baked into item_name, so they read as "—" here rather
                          than being parsed back out of free text. */}
                      {items.length === 0
                        ? <span className={styles.nil}>—</span>
                        : items.map((li, idx) => (
                          <div key={idx} className={styles.mono} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                            {[li.size, li.gauge].filter(Boolean).join(' · ') || <span className={styles.nil}>—</span>}
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
            {(invs.length > 0 || openingRow) && (
              <tr className={styles.totalRow}>
                <td colSpan={7}><strong>{openingRow ? 'Total (incl. opening)' : 'Total'}</strong></td>
                <td className={styles.right}><strong className={styles.mono}>{formatCurrency(grandTotal)}</strong></td>
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
function CustomerCurrentBalance({ customers, salesInvoices, receiptVouchers, companyId = 1 }) {
  const [search, setSearch] = useState('');

  // A customer's real position comes from the ledger, not from invoices. Shop #58's
  // sales were never recorded as invoices at all, and Shop #41's invoice-derived figure
  // ignores the voucher history where most movement sits, so both branches were wrong.
  const { data: ledgerBalances, loading: balancesLoading } = useDb(
    () => financeDb.getCustomerLedgerBalances(companyId), [companyId]);

  const report = useMemo(() => {
    if (!customers || balancesLoading) return [];
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

      // Brought-forward balance for a customer carried over from the old system.
      const opening = parseFloat(c.opening_balance) || 0;

      // Derived balance: what they were brought in owing, plus everything invoiced
      // since, less everything paid. The opening figure has to be *added* here —
      // treating it as a fallback would make it vanish the moment the customer's
      // first invoice was raised.
      const derivedBalance = opening + totalInvoiced - totalPaid;

      // Prefer the ledger: the customer's own sub-ledger account carries every posting
      // ever made against them. Only when a customer has no ledger account (never
      // posted to) do we fall back to the invoice-derived figure, and then to the
      // stored outstanding_balance.
      const ledger = c.account_code ? ledgerBalances?.[c.account_code] : undefined;
      const hasLedger = typeof ledger === 'number';
      const balance = hasLedger
        ? ledger
        : (totalInvoiced > 0 ? derivedBalance : (parseFloat(c.outstanding_balance) || 0));

      return {
        customer_id:          c.customer_id,
        name:                 c.name,
        contact:              c.contact,
        balance,
        opening_balance:      opening,
        total_invoiced:       totalInvoiced,
        total_paid:           totalPaid,
        last_payment_date:    lastPay?.date        || null,
        last_payment_amount:  lastPay ? (parseFloat(lastPay.credit) || 0) : 0,
        last_invoice_id:      lastInv?.sale_inv_id || null,
        last_invoice_date:    lastInv?.date        || null,
        last_invoice_amount:  parseFloat(lastInv?.grand_total) || 0,
      };
    }).filter(r => r.balance !== 0 || r.last_invoice_id);
  }, [customers, salesInvoices, receiptVouchers, ledgerBalances, balancesLoading]);

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

  const { showPreview, previewNode } = useWordPreview();
  const handlePreview  = () => { const d = buildDoc(); if (d) showPreview(d); };
  const handleDownload = () => { const d = buildDoc(); if (d) downloadWordDoc(d); };

  const buildDoc = () => {
    const allRows = [...drRows, ...crRows];
    const tableRows = allRows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${esc(r.name)}</strong>${r.contact ? `<br><span style="font-size:9px;color:#888">${esc(r.contact)}</span>` : ''}</td>
        <td class="right" style="color:${r.balance >= 0 ? '#1a5276' : '#922b21'};font-weight:700">
          ${r.balance >= 0 ? formatCurrency(r.balance) + ' Dr' : formatCurrency(Math.abs(r.balance)) + ' Cr'}
        </td>
        <td class="center">${r.last_payment_date ? formatDate(r.last_payment_date) : '—'}</td>
        <td class="right">${r.last_payment_amount > 0 ? formatCurrency(r.last_payment_amount) : '—'}</td>
        <td class="center">${esc(r.last_invoice_id || '—')}</td>
        <td class="center">${r.last_invoice_date ? formatDate(r.last_invoice_date) : '—'}</td>
        <td class="right">${r.last_invoice_amount > 0 ? formatCurrency(r.last_invoice_amount) : '—'}</td>
      </tr>`).join('');

    const totalsTable = `
      <table width="320" align="right" style="margin-top:12px">
        <tr><td style="padding:4px 0;font-size:11px;border-bottom:1px solid #eee">Total Debit (Receivable)</td>
            <td class="right" style="padding:4px 0;font-size:11px;border-bottom:1px solid #eee;color:#1a5276">${formatCurrency(totalDr)}</td></tr>
        <tr><td style="padding:4px 0;font-size:11px;border-bottom:1px solid #eee">Total Credit (Advance)</td>
            <td class="right" style="padding:4px 0;font-size:11px;border-bottom:1px solid #eee;color:#922b21">${formatCurrency(totalCr)}</td></tr>
        <tr><td style="padding-top:7px;font-size:13px;font-weight:700;border-top:2px solid #000">Net Receivable</td>
            <td class="right" style="padding-top:7px;font-size:13px;font-weight:700;border-top:2px solid #000">${formatCurrency(netBalance)}</td></tr>
      </table>
      <div style="clear:both"></div>`;

    return buildReportDoc({
      filename: 'Customer Current Balance',
      title: 'Customer Current Balance Report',
      landscape: true,
      meta: `As of ${formatDate(new Date().toISOString())} &nbsp;|&nbsp; ${allRows.length} customers`,
      table: `<table class="rpt">
          <thead><tr>
            <th width="34">Sr#</th><th>Customer</th><th class="right" width="120">Current Balance</th>
            <th class="center" width="80">Last Pmt Date</th><th class="right" width="90">Last Pmt Amt</th>
            <th class="center" width="85">Invoice #</th><th class="center" width="80">Invoice Date</th>
            <th class="right" width="90">Invoice Amt</th>
          </tr></thead>
          <tbody>${tableRows || '<tr><td colspan="8" class="center" style="padding:18px;color:#666">No customers to report</td></tr>'}</tbody>
        </table>${totalsTable}`,
    });
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
            {balancesLoading
              ? 'Loading balances…'
              : <>
                  {filtered.length} customers &nbsp;|&nbsp; Net Receivable:&nbsp;
                  <strong style={{ color: netBalance > 0 ? 'var(--blue)' : 'var(--red)' }}>
                    {formatCurrency(netBalance)} {netBalance >= 0 ? 'Dr' : 'Cr'}
                  </strong>
                </>}
          </span>
          <Button variant="secondary" icon={<Eye size={14} strokeWidth={1.75} />} size="sm" onClick={handlePreview} disabled={balancesLoading}>
            Preview
          </Button>
          <Button variant="primary" icon={<FileDown size={14} strokeWidth={1.75} />} size="sm" onClick={handleDownload} disabled={balancesLoading}>
            Download Word
          </Button>
          {previewNode}
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

  const { showPreview, previewNode } = useWordPreview();
  const handlePreview  = () => { const d = buildDoc(); if (d) showPreview(d); };
  const handleDownload = () => { const d = buildDoc(); if (d) downloadWordDoc(d); };

  const buildDoc = () => {
    const rows = dayVouchers.map((v, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(v.voucher_id || '—')}</td>
        <td>${esc(v.voucher_type || '—')}</td>
        <td>${esc(v.account_name || '—')}</td>
        <td>${esc(v.narration || '—')}</td>
        <td class="right" style="color:#1a5276">${v.debit  > 0 ? formatCurrency(v.debit)  : '—'}</td>
        <td class="right" style="color:#145a32">${v.credit > 0 ? formatCurrency(v.credit) : '—'}</td>
      </tr>`).join('');

    return buildReportDoc({
      filename: `Daily Day Book ${date}`,
      title: 'Daily Day Book',
      landscape: true,
      meta: `Date: <strong>${esc(date)}</strong> &nbsp;|&nbsp; ${dayVouchers.length} entries`,
      table: `<table class="rpt">
        <thead><tr><th width="30">#</th><th width="100">Voucher ID</th><th width="80">Type</th>
          <th width="150">Account</th><th>Narration</th>
          <th class="right" width="100">Debit</th><th class="right" width="100">Credit</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="center" style="padding:18px;color:#666">No vouchers found for ${esc(date)}</td></tr>`}</tbody>
        <tfoot><tr><td colspan="5" class="right">Totals</td>
          <td class="right" style="color:#1a5276">${formatCurrency(totalDr)}</td>
          <td class="right" style="color:#145a32">${formatCurrency(totalCr)}</td></tr></tfoot>
      </table>`,
    });
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '6px 12px', fontSize: 13 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dayVouchers.length} entries</span>
        <Button variant="secondary" icon={<Eye size={14} />} onClick={handlePreview} style={{ marginLeft: 'auto' }}>Preview</Button>
        <Button variant="primary" icon={<FileDown size={14} />} onClick={handleDownload}>Download Word</Button>
        {previewNode}
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
function VendorCurrentBalance({ vendorBalances }) {
  const [search, setSearch] = useState('');

  // Ledger-derived: purchases credit the vendor (payable up), payments debit it.
  // A positive balance is a payable (we owe the vendor); negative is an advance.
  const report = useMemo(() => {
    return (vendorBalances || []).map(v => ({
      id:              v.vendor_id,
      name:            v.vendor_name,
      contact:         v.contact,
      category:        v.category,
      purchases:       parseFloat(v.total_purchases) || 0,
      paid:            parseFloat(v.total_paid) || 0,
      balance:         parseFloat(v.balance_payable) || 0,
      last_txn_date:   v.last_txn_date || null,
      txn_count:       Number(v.txn_count) || 0,
    })).filter(r => r.txn_count > 0 || r.balance !== 0);
  }, [vendorBalances]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return report;
    return report.filter(r => (r.name || '').toLowerCase().includes(q));
  }, [report, search]);

  const totalPurchases = filtered.reduce((s, r) => s + r.purchases, 0);
  const totalPaid      = filtered.reduce((s, r) => s + r.paid, 0);
  const totalPayable   = filtered.reduce((s, r) => s + r.balance, 0);

  const balLabel = (b) => b >= 0
    ? `${formatCurrency(b)} Payable`
    : `${formatCurrency(Math.abs(b))} Advance`;

  const { showPreview, previewNode } = useWordPreview();
  const handlePreview  = () => { const d = buildDoc(); if (d) showPreview(d); };
  const handleDownload = () => { const d = buildDoc(); if (d) downloadWordDoc(d); };

  const buildDoc = () => {
    const rows = filtered.map((r, i) => `
      <tr>
        <td>${i + 1}</td><td><strong>${esc(r.name)}</strong></td><td>${esc(r.category || '—')}</td>
        <td class="right">${formatCurrency(r.purchases)}</td>
        <td class="right">${formatCurrency(r.paid)}</td>
        <td class="right" style="color:${r.balance >= 0 ? '#922b21' : '#1e7d34'};font-weight:700">${balLabel(r.balance)}</td>
        <td>${r.last_txn_date ? formatDate(r.last_txn_date) : '—'}</td>
      </tr>`).join('');

    return buildReportDoc({
      filename: 'Vendor Current Balance',
      title: 'Vendor Current Balance',
      meta: `${filtered.length} vendors &nbsp;|&nbsp; Purchases: <strong>${formatCurrency(totalPurchases)}</strong> &nbsp;|&nbsp; Payable: <strong>${formatCurrency(totalPayable)}</strong>`,
      table: `<table class="rpt">
        <thead><tr><th width="30">#</th><th>Vendor</th><th width="100">Category</th>
          <th class="right" width="105">Total Purchases</th><th class="right" width="95">Total Paid</th>
          <th class="right" width="105">Balance</th><th width="80">Last Txn</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="center" style="padding:18px;color:#666">No vendor balances found</td></tr>'}</tbody>
        <tfoot><tr><td colspan="3" class="right">Totals</td>
          <td class="right">${formatCurrency(totalPurchases)}</td>
          <td class="right">${formatCurrency(totalPaid)}</td>
          <td class="right" style="color:#922b21">${balLabel(totalPayable)}</td>
          <td></td></tr></tfoot>
      </table>`,
    });
  };

  const thRight = { padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' };
  const thLeft  = { ...thRight, textAlign: 'left' };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor..."
          style={{ flex: 1, maxWidth: 280, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '7px 12px', fontSize: 13 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} vendors · Purchases: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalPurchases)}</strong> · Payable: <strong style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalPayable)}</strong></span>
        <Button variant="secondary" icon={<Eye size={14} />} onClick={handlePreview} style={{ marginLeft: 'auto' }}>Preview</Button>
        <Button variant="primary" icon={<FileDown size={14} />} onClick={handleDownload}>Download Word</Button>
        {previewNode}
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>No vendor balances found{search ? ` for "${search}"` : ''}.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              <th style={thLeft}>#</th>
              <th style={thLeft}>Vendor</th>
              <th style={thLeft}>Category</th>
              <th style={thRight}>Total Purchases</th>
              <th style={thRight}>Total Paid</th>
              <th style={thRight}>Balance</th>
              <th style={thLeft}>Last Txn</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '7px 12px', color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                <td style={{ padding: '7px 12px', fontWeight: 500 }}>{r.name}</td>
                <td style={{ padding: '7px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{r.category || '—'}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.purchases > 0 ? formatCurrency(r.purchases) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.paid > 0 ? formatCurrency(r.paid) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.balance >= 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{balLabel(r.balance)}</td>
                <td style={{ padding: '7px 12px', fontSize: 12 }}>{r.last_txn_date ? formatDate(r.last_txn_date) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--bg-tertiary)', fontWeight: 700 }}>
              <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>Totals</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{formatCurrency(totalPurchases)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{formatCurrency(totalPaid)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{balLabel(totalPayable)}</td>
              <td />
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

  // What each bill on this ledger was actually for. Purchase vouchers are posted
  // with the bill id as their voucher_id, so that is what joins them back to
  // purchase_invoice_items. Payments and other voucher types have no items and
  // simply read as "—".
  const billIds = useMemo(
    () => entries.filter(e => e.voucher_type === 'Purchase').map(e => e.reference || e.voucher_id),
    [entries]
  );
  const billIdsKey = billIds.join(',');
  const { data: billItems } = useDb(
    () => procurementDb.getPurchaseInvoiceItemsBulk(billIds),
    [billIdsKey]
  );
  const itemsByBill = useMemo(() => {
    const map = {};
    (billItems || []).forEach(li => { (map[li.bill_id] ||= []).push(li); });
    return map;
  }, [billItems]);

  const lineSpec = (li) => [li.size, li.gauge].filter(Boolean).join(' · ');
  const itemsFor = (e) => (e.voucher_type === 'Purchase'
    ? itemsByBill[e.reference || e.voucher_id] || []
    : []);

  const totalDr  = entries.reduce((s, e) => s + (parseFloat(e.debit)  || 0), 0);
  const totalCr  = entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  const closeBal = entries[entries.length - 1]?.balance ?? 0;

  const { showPreview, previewNode } = useWordPreview();
  const handlePreview  = () => { const d = buildDoc(); if (d) showPreview(d); };
  const handleDownload = () => { const d = buildDoc(); if (d) downloadWordDoc(d); };

  const buildDoc = () => {
    if (!vendor) return;
    const rows = entries.map(e => {
      const items = itemsFor(e);
      const itemText = items.length
        ? items.map(li => `${esc(li.item_name || '—')}${li.quantity > 0 ? ` · ${esc(li.quantity)} ${esc(li.unit || '')}` : ''}`).join('<br>')
        : '—';
      const specText = items.length
        ? items.map(li => esc(lineSpec(li)) || '—').join('<br>')
        : '—';
      return `
      <tr>
        <td>${formatDate((e.date || '').slice(0, 10))}</td>
        <td>${esc(e.voucher_id || '—')}</td>
        <td>${esc(e.voucher_type || '—')}</td>
        <td>${esc(e.narration || '—')}</td>
        <td>${itemText}</td>
        <td>${specText}</td>
        <td class="right">${e.debit  > 0 ? formatCurrency(e.debit)  : '—'}</td>
        <td class="right">${e.credit > 0 ? formatCurrency(e.credit) : '—'}</td>
        <td class="right">${formatCurrency(Math.abs(e.balance))} ${e.balance >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>`;
    }).join('');

    return buildReportDoc({
      filename: `Vendor Ledger ${vendor}`,
      title: 'Vendor Ledger',
      landscape: true,
      meta: `Vendor: <strong>${esc(vendor)}</strong> &nbsp;|&nbsp; Period: ${fromDate ? formatDate(fromDate) : 'Start'} — ${toDate ? formatDate(toDate) : 'To date'}`,
      note: `Closing Balance: ${formatCurrency(Math.abs(closeBal))} ${closeBal >= 0 ? 'Dr' : 'Cr'}`,
      table: `<table class="rpt">
        <thead><tr><th width="65">Date</th><th width="85">Voucher</th><th width="60">Type</th>
          <th>Narration</th><th width="130">Item</th><th width="90">Size / Gauge</th>
          <th class="right" width="85">Debit</th><th class="right" width="85">Credit</th>
          <th class="right" width="100">Balance</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="center" style="padding:18px;color:#666">No entries for selected period</td></tr>'}</tbody>
        <tfoot><tr><td colspan="6" class="right">Totals</td>
          <td class="right">${formatCurrency(totalDr)}</td>
          <td class="right">${formatCurrency(totalCr)}</td>
          <td class="right">${formatCurrency(Math.abs(closeBal))} ${closeBal >= 0 ? 'Dr' : 'Cr'}</td>
        </tr></tfoot>
      </table>`,
    });
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
        <Button variant="secondary" icon={<Eye size={14} />} onClick={handlePreview} disabled={!vendor}>
          Preview
        </Button>
        <Button variant="primary" icon={<FileDown size={14} />} onClick={handleDownload} disabled={!vendor}>
          Download Word
        </Button>
        {previewNode}
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
                <th>Item</th><th>Size / Gauge</th>
                <th className={styles.right}>Debit</th>
                <th className={styles.right}>Credit</th>
                <th className={styles.right}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0
                ? <tr><td colSpan={9} style={{ textAlign:'center', padding:'20px', color:'var(--text-secondary)' }}>No entries for selected period</td></tr>
                : entries.map((e, i) => {
                  const items = itemsFor(e);
                  return (
                  <tr key={e.id ?? i}>
                    <td className={styles.date}>{formatDate((e.date || '').slice(0, 10))}</td>
                    <td className={styles.code}>{e.voucher_id || '—'}</td>
                    <td className={styles.type}>{e.voucher_type || '—'}</td>
                    <td>{e.narration || '—'}</td>
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
                    <td>
                      {items.length === 0
                        ? <span className={styles.nil}>—</span>
                        : items.map((li, idx) => (
                          <div key={idx} className={styles.mono} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                            {lineSpec(li) || <span className={styles.nil}>—</span>}
                          </div>
                        ))}
                    </td>
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
                  );
                })}
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
  const { data: vendors }              = useDb(() => procurementDb.getVendors(companyId), [companyId]);
  const { data: vendorBalances }       = useDb(() => procurementDb.getVendorBalances(companyId), [companyId]);
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
          <div className={styles.cardBody}><LedgerReport chartOfAccounts={chartOfAccounts} companyId={companyId} /></div>
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
          <div className={styles.cardBody}><CustomerLedger salesInvoices={salesInvoices} customers={customers} /></div>
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
              companyId={companyId}
            />
          </div>
        </Card>
      )}
      {pageTab === 'vendor-balance' && (
        <Card padding={false}>
          <CardHeader title="Vendor Current Balance" subtitle="Total purchases, payments, and outstanding payable per vendor (from the ledger)" />
          <div className={styles.cardBody}>
            <VendorCurrentBalance vendorBalances={vendorBalances} />
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
