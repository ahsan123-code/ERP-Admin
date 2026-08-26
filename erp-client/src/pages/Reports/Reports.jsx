import { useState, useRef, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FileDown, Eye, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/shared/Skeleton';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { financeDb, salesDb, procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../components/shared/Toast';
import { useCustomers } from '../../context/CustomerContext';
import { formatDate, formatDateNumeric, formatCurrency, formatAmount,
  itemMaterial, itemGauge, itemSize, itemWeight } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import { accountGroupLabel, splitBalance } from '../../utils/accounts';
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

// The ledgers print a step larger than the summary reports — they are read row by row on
// paper, where 10px is a squint. Passed as the `css` prop so it lands after REPORT_CSS and
// wins on equal specificity; only the three ledger documents opt in.
// The meta line carries the two things a reader checks first — whose ledger this is
// and what period it covers — so it prints larger than the rest of the meta text,
// with the name itself (the <strong>) a shade larger again. Document-only: the
// on-screen table never renders .rpt-meta.
const LEDGER_DOC_CSS = `
  .rpt { font-size:11.5px; }
  .rpt th { font-size:10px; padding:7px 9px; }
  .rpt td { font-size:11.5px; padding:6px 9px; }
  .rpt-meta { font-size:14px; margin-bottom:12px; }
  .rpt-meta strong { font-size:15.5px; }
`;

// Wraps a report table in the standard letterhead + footer, returning the document
// spec. Both the Preview and the Download button build from this one function, so
// what the preview shows is always what the .doc contains.
// `landscape` is for the wide multi-column reports that would otherwise be cut off.
function buildReportDoc({ filename, title, meta = '', table, landscape = false, note = null, css = '' }) {
  return {
    filename,
    title,
    landscape,
    css: REPORT_CSS + css,
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
// Legacy sales vouchers carry their invoice number inside the narration:
//   "Sales-28-Sep-2020-0157-L-…"  ->  INV-SA-20-09-0157
// That is the only reliable link from a ledger line back to its invoice, and so to
// its items — it resolves 94.8% of sales vouchers, where matching on customer + date
// + amount managed 11%. Rows that do not resolve simply show no item detail.
const MONTHS = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
                 jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };

function invoiceIdFromNarration(narration) {
  const m = /^Sales-(\d{2})-([A-Za-z]{3})-(\d{4})-(\d{4})-/.exec(String(narration || ''));
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  return month ? `INV-SA-${m[3].slice(2)}-${month}-${m[4]}` : null;
}

// A machine-written narration buries one useful reference in a long string the rest of the
// row already accounts for — the date has its own column, the items have theirs. Three
// shapes exist and all reduce to that reference:
//
//   sale, imported     : "Sales-21-Aug-2020-0127-L-21-Aug-2020-0003- Bill#40-4"          -> "Bill#40-4"
//   purchase, imported : "Purchases Charged,GRN:GRN-20-12-0012,PO:DM-20-12-0012-Bill#83-2" -> "Bill#83-2"
//   either, in-app     : "Sales invoice INV-844969 — Tahir Sb"                            -> "INV-844969"
//                        "Purchase invoice PBILL-58635 — ABDUL RAHMAN (T)(Khi)"           -> "PBILL-58635"
//
// Of 18,808 imported sales lines, 18,477 carry a bill number (15,944 labelled "Bill#", the
// rest a bare "-94-4" from before the label existed); the 331 with none fall back to the
// invoice serial. Of 1,737 purchase lines, 1,519 carry one; the 216 without are 2017 rows
// that name only their documents, so those fall back to the GRN — still the reference a
// reader would look up. Anything else is a hand-typed remark and is the only record of
// what happened, so it is left exactly as written.
//
// Display only: invoiceIdFromNarration above, and the GRN the Vendor Ledger parses to find
// what was bought, both still read the raw text.
const IMPORTED_SALE = /^Sales-\d{2}-[A-Za-z]{3}-\d{4}-(\d{4})-[A-Za-z]-\d{2}-[A-Za-z]{3}-\d{4}-\d{4}(.*)$/;
// A document raised in the app names itself the same way on both sides; the vendor or
// customer that follows is already the ledger you are looking at.
const IN_APP_DOC    = /^(?:Sales|Purchase) invoice\s+(\S+)/i;
const PURCHASE_DOC  = /^[^,]*,\s*GRN:\s*([A-Za-z0-9-]+)\s*,\s*PO:/i;

// Stray backticks and trailing separators are import noise, present on a few dozen rows.
// Everything after "Bill#" is otherwise kept verbatim — a handful read "Bill#3136 (1)-9"
// and the parenthetical is part of how the bill was written.
const billNo = (text) => {
  const m = /Bill#\s*(.+)$/i.exec(text);
  const no = m ? m[1].replace(/`/g, '').replace(/[-\s]+$/, '').trim() : '';
  return no || null;
};

function shortParticulars(text) {
  const s = String(text ?? '').trim();

  const inApp = IN_APP_DOC.exec(s);
  if (inApp) return inApp[1];

  const purchase = PURCHASE_DOC.exec(s);
  if (purchase) return billNo(s) ? `Bill#${billNo(s)}` : purchase[1];

  const m = IMPORTED_SALE.exec(s);
  if (!m) return s;

  const tail = (m[2] || '').replace(/`/g, '').replace(/[-\s]+$/, '').trim();
  const bill = billNo(tail) || /^-\s*(\d+[-/]\d+)$/.exec(tail)?.[1];
  return bill ? `Bill#${bill}` : `Inv ${m[1]}`;
}

// One voucher can sell several items, so the Item / Gauge / Size / Weight columns each
// stack a line per item and read across as rows. Shared by all three ledgers rather than
// repeating the same block twelve times.
function ItemLines({ items, render, mono = true, align }) {
  if (!items?.length) return <span className={styles.nil}>—</span>;
  return items.map((li, idx) => (
    <div key={idx}
         className={mono ? styles.mono : undefined}
         style={{ fontSize: 11.5, lineHeight: 1.5, textAlign: align }}>
      {render(li) || <span className={styles.nil}>—</span>}
    </div>
  ));
}

// About what a printed ledger page holds, and small enough that an account with
// thousands of entries lays out instantly.
const LEDGER_PAGE_SIZE = 100;

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
  // Default to ALL dates (historical data spans many years) — the user can narrow if needed.
  const [account,  setAccount] = useState('');
  const [fromDate, setFrom]    = useState('');
  const [toDate,   setTo]      = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [page, setPage] = useState(1);

  const { data: rawVouchers, refetch: refetchVouchers, settled: vouchersSettled } = useDb(
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
  const { data: lineNotes, settled: notesSettled } = useDb(
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

  // Item detail comes from the sales order behind the voucher, and a voucher names its
  // invoice one of two ways: the app writes an INV- reference, while imported history has
  // no reference at all and instead carries the invoice inside its line narration
  // ("Sales-21-Aug-2020-0127-…"). Reading both is what gives the 18,801 imported sales
  // rows their items — going by reference alone left every one of them blank.
  const invoiceOf = (v) =>
    (v.reference && /^INV-/.test(v.reference) ? v.reference : null)
    ?? invoiceIdFromNarration(narrationByVoucher.map[v.voucher_id]?.text)
    ?? invoiceIdFromNarration(v.narration);

  const invoiceIds = useMemo(
    () => [...new Set((rawVouchers || []).map(invoiceOf).filter(Boolean))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawVouchers, narrationByVoucher]);
  const invoiceIdKey = invoiceIds.join(',');
  const { data: invoicesForRefs, settled: refsSettled } = useDb(
    () => salesDb.getSalesOrderRefs(invoiceIds), [invoiceIdKey]);

  const orderRefByInvoice = useMemo(() => {
    const m = {};
    (invoicesForRefs || []).forEach(i => { if (i.sale_inv_id) m[i.sale_inv_id] = i.so_ref; });
    return m;
  }, [invoicesForRefs]);

  const neededSoRefs = useMemo(
    () => [...new Set(invoiceIds.map(r => orderRefByInvoice[r]).filter(Boolean))],
    [invoiceIds, orderRefByInvoice]);
  const neededKey = neededSoRefs.join(',');
  const { data: ledgerLineItems, settled: itemsSettled } = useDb(
    () => salesDb.getSoLineItems(neededSoRefs), [neededKey]);

  // The ledger fills from a chain of four queries: the vouchers, the line narrations
  // behind them, the invoices those name, and finally the order lines that carry
  // Item/Gauge/Size/Weight/Rate. Gating on the first alone left rows on screen with
  // those columns blank, and showed "No entries for selected period" for an account
  // still fetching.
  //
  // Gating on all four loading flags was worse: each link's deps only change once the
  // link before it lands, and its effect runs after that render commits, so every hand
  // over painted one frame with all four flags false. The skeleton fell away and came
  // back five times per account. `settled` compares the deps the data was fetched for
  // against the deps being asked for now, so the gap reads as still-loading.
  const loading = !(vouchersSettled && notesSettled && refsSettled && itemsSettled);

  const itemsForVoucher = useMemo(() => {
    const bySo = {};
    (ledgerLineItems || []).forEach(li => { (bySo[li.so_id] ||= []).push(li); });
    return (v) => {
      const inv = invoiceOf(v);
      const so = inv ? orderRefByInvoice[inv] : null;
      return so ? (bySo[so] || []) : [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerLineItems, orderRefByInvoice, narrationByVoucher]);

  // What the Narration column shows: the real remark when there is one, else nothing
  // rather than the source system's placeholder text.
  const narrationFor = (v) => {
    const line = narrationByVoucher.map[v.voucher_id]?.text;
    if (line && !narrationByVoucher.isPlaceholder(line)) return line;
    if (!narrationByVoucher.isPlaceholder(v.narration)) return v.narration;
    return '';
  };

  // Delete a transaction straight from the account history — mirrors the Finance
  // Vouchers tab: grouped legs reverse together, standalone rows reverse their
  // own balance impact. Confirmed first, since this is a reporting screen.
  const handleDelete = async (row) => {
    if (!window.confirm(`Delete voucher "${row.voucher_id}" from the ledger? This cannot be undone.`)) return;
    setDeletingId(row.id);
    try {
      // A group is an app-created voucher split across legs — PV-511140-1, PV-511140-2.
      // The test used to be /-\d+$/, which every GenX id also passes: VCH-12345 became
      // group "VCH" and C3-VCH-12345 became "C3-VCH", and the LIKE in deleteVoucherGroup
      // then matched the whole shop's ledger. That is how Shop #58 lost 7,606 vouchers
      // and 24,898 lines to a single click. Requiring the leg to follow a number of its
      // own admits every app id (CHQ/INV/PBILL/PC/PV/RV-N-N) and no GenX id.
      const isGrouped = /^[A-Za-z]+-\d+-\d+$/.test(row.voucher_id || '');
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

  // Only the rendering is paged. Every row already carries the balance running from the
  // first entry, so a slice shows the same figure it would on one long page, and the
  // footer, the opening and closing balances and the Word export all still read the whole
  // set. An account with 9,000 vouchers was laying out about 108,000 table cells at once.
  const pageCount = Math.max(1, Math.ceil(entries.length / LEDGER_PAGE_SIZE));
  const safePage  = Math.min(page, pageCount);
  const visible   = entries.slice((safePage - 1) * LEDGER_PAGE_SIZE, safePage * LEDGER_PAGE_SIZE);

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
        <td>${formatDateNumeric((e.date || '').slice(0, 10))}</td>
        <td>${esc(shortParticulars(narrationFor(e))) || '—'}</td>
        <td>${join(li => esc(itemMaterial(li)) || '—')}</td>
        <td>${join(li => esc(itemGauge(li))  || '—')}</td>
        <td class="right">${join(li => esc(itemWeight(li)) || '—')}</td>
        <td class="right">${join(li => li.unit_price > 0 ? formatAmount(li.unit_price) : '—')}</td>
        <td class="right">${e.debit  > 0 ? formatAmount(e.debit)  : '—'}</td>
        <td class="right">${e.credit > 0 ? formatAmount(e.credit) : '—'}</td>
        <td class="right">${formatAmount(Math.abs(e.balance))} ${e.balance >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>`;
    }).join('');

    return buildReportDoc({
      filename: `Ledger ${account}`,
      title: 'Account Ledger',
      landscape: true,
      css: LEDGER_DOC_CSS,
      meta: `Account: <strong>${esc(account)}</strong> &nbsp;|&nbsp; Period: ${formatDateNumeric(fromDate)} — ${formatDateNumeric(toDate)}`,
      note: `Opening: ${formatAmount(Math.abs(openBal))}  |  Closing: ${formatAmount(Math.abs(closeBal))}`,
      table: `<table class="rpt">
        <thead><tr><th width="70">Date</th><th>Narration</th><th width="96">Item</th>
          <th width="58">Gauge</th><th class="right" width="66">Weight</th>
          <th class="right" width="72">Rate</th>
          <th class="right" width="92">Debit</th>
          <th class="right" width="92">Credit</th><th class="right" width="106">Balance</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="center" style="padding:18px;color:#666">No entries for selected period</td></tr>'}</tbody>
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
            onChange={(v) => { setAccount(v); setPage(1); }}
            options={accountList.map(name => ({ value: name, label: name }))}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input className={styles.dateInput} type="date" value={fromDate} onChange={e => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>To</label>
          <input className={styles.dateInput} type="date" value={toDate} onChange={e => { setTo(e.target.value); setPage(1); }} />
        </div>
        <Button variant="secondary" icon={<Eye size={14} />} onClick={handlePreview} disabled={!account || loading}>
          Preview
        </Button>
        <Button variant="primary" icon={<FileDown size={14} />} onClick={handleDownload} disabled={!account || loading}>
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
                <th>Item</th><th>Gauge</th><th>Size</th>
                <th className={styles.right}>Weight</th>
                <th className={styles.right}>Rate</th>
                <th className={styles.right}>Debit</th>
                <th className={styles.right}>Credit</th>
                <th className={styles.right}>Balance</th>
                <th style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={`sk${i}`}>
                      {Array.from({ length: 12 }, (_, c) => (
                        <td key={c}><Skeleton width={['70%','55%','85%','60%','45%','40%','50%','50%','65%','65%','75%','40%'][c]} /></td>
                      ))}
                    </tr>
                  ))
                : entries.length === 0
                ? <tr><td colSpan={12} style={{ textAlign:'center', padding:'20px', color:'var(--text-secondary)' }}>No entries for selected period</td></tr>
                : visible.map((e, i) => {
                  const items = itemsForVoucher(e);
                  const note = narrationFor(e);
                  return (
                  <tr key={e.id ?? i}>
                    <td className={styles.date}>{formatDateNumeric((e.date || '').slice(0, 10))}</td>
                    <td className={styles.code}>{e.voucher_id || '—'}</td>
                    <td title={note || undefined}>
                      {shortParticulars(note) || <span className={styles.nil}>—</span>}
                    </td>
                    <td><ItemLines items={items} render={itemMaterial} mono={false} /></td>
                    <td><ItemLines items={items} render={itemGauge} /></td>
                    <td><ItemLines items={items} render={itemSize} /></td>
                    <td className={styles.right}><ItemLines items={items} render={itemWeight} align="right" /></td>
                    <td className={styles.right}>
                      <ItemLines items={items} align="right"
                        render={li => (li.unit_price > 0 ? formatAmount(li.unit_price) : '')} />
                    </td>
                    <td className={styles.right}>
                      {parseFloat(e.debit) > 0 ? <span className={styles.mono}>{formatAmount(e.debit)}</span> : <span className={styles.nil}>—</span>}
                    </td>
                    <td className={styles.right}>
                      {parseFloat(e.credit) > 0 ? <span className={styles.mono}>{formatAmount(e.credit)}</span> : <span className={styles.nil}>—</span>}
                    </td>
                    <td className={styles.right}>
                      <span className={styles.mono}>{formatAmount(Math.abs(e.balance))}</span>
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
          {pageCount > 1 && (
            <div className={styles.ledgerPager}>
              <span className={styles.pageInfo}>
                Showing {((safePage - 1) * LEDGER_PAGE_SIZE) + 1}–{Math.min(safePage * LEDGER_PAGE_SIZE, entries.length)} of {entries.length}
              </span>
              <div className={styles.pageButtons}>
                <button className={styles.pageBtn} disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                <span className={styles.pageNum}>{safePage} / {pageCount}</span>
                <button className={styles.pageBtn} disabled={safePage >= pageCount}
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))} aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
          {entries.length > 0 && (
            <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 0', gap:24, fontSize:12, color:'var(--text-secondary)' }}>
              <span>Opening: <strong>{formatAmount(Math.abs(openBal))}</strong></span>
              <span>Closing: <strong>{formatAmount(Math.abs(closeBal))}</strong></span>
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
  // A trial balance lists what the accounts hold. An account with no balance holds
  // nothing, and 1,606 of company 1's 1,801 accounts are in that state — the chart
  // carries the full code structure whether or not a branch ever posts to a given head,
  // so the report was thousands of empty rows with the ~195 real ones scattered through
  // them. They stay reachable behind the toggle rather than being dropped outright.
  const [showEmpty, setShowEmpty] = useState(false);

  const rows = useMemo(() => (chartOfAccounts || []).map(a => ({
    key:     a.account_id ?? a.id,
    code:    a.account_code,
    name:    a.account_name,
    type:    accountGroupLabel(a.account_code, a.account_type),
    balance: Number(a.balance) || 0,
    ...splitBalance(a.account_code, a.balance),
  })), [chartOfAccounts]);

  const emptyCount = rows.filter(r => r.balance === 0).length;
  const visible    = showEmpty ? rows : rows.filter(r => r.balance !== 0);

  // Totalled from the rows on screen, so the figures at the bottom are the figures
  // above them. They were previously summed from a different filter than the table
  // rendered, which is why the total read 691,400 Dr against 1,801 printed rows.
  const totalDr = visible.reduce((s, r) => s + r.debit, 0);
  const totalCr = visible.reduce((s, r) => s + r.credit, 0);
  const diff    = totalDr - totalCr;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 0 12px', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={e => setShowEmpty(e.target.checked)}
            style={{ width: 15, height: 15, cursor: 'pointer' }}
          />
          Show accounts with no balance ({emptyCount})
        </label>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {visible.length} of {rows.length} accounts
        </span>
      </div>

      <div className={styles.reportTable}>
        <table className={styles.tbl}>
          <thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th className={styles.right}>Debit (Dr)</th><th className={styles.right}>Credit (Cr)</th></tr></thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                No accounts carry a balance.
              </td></tr>
            ) : visible.map(r => (
              <tr key={r.key}>
                <td className={styles.code}>{r.code}</td>
                <td>{r.name}</td>
                <td className={styles.type}>{r.type}</td>
                <td className={styles.right}>{r.debit  ? <span className={styles.mono}>{formatCurrency(r.debit)}</span>  : <span className={styles.nil}>—</span>}</td>
                <td className={styles.right}>{r.credit ? <span className={styles.mono}>{formatCurrency(r.credit)}</span> : <span className={styles.nil}>—</span>}</td>
              </tr>
            ))}
            <tr className={styles.totalRow}>
              <td colSpan={3}><strong>Total</strong></td>
              <td className={styles.right}><strong className={styles.mono}>{formatCurrency(totalDr)}</strong></td>
              <td className={styles.right}><strong className={styles.mono}>{formatCurrency(totalCr)}</strong></td>
            </tr>
            {/* A trial balance that does not balance is the one thing this report exists
                to reveal, so the gap is stated rather than left for the reader to subtract. */}
            {Math.abs(diff) > 0.005 && (
              <tr className={styles.totalRow}>
                <td colSpan={3}>
                  <strong style={{ color: 'var(--red)' }}>Out of balance</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                    debits and credits do not agree — the stored balances need review
                  </span>
                </td>
                <td className={styles.right} colSpan={2}>
                  <strong className={styles.mono} style={{ color: 'var(--red)' }}>{formatCurrency(Math.abs(diff))}</strong>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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

/* ── Customer Ledger ────────────────────────────────────────────────── */

// Sales add to what a customer owes; receipts and cheques reduce it. Colouring the
// type makes a column of 20,000 rows scannable without reading every word.
const TYPE_TONE = {
  SA: 'info', SR: 'warning', CRV: 'success', BRV: 'success',
  CPV: 'error', BPV: 'error', BR: 'neutral', JV: 'neutral', PI: 'neutral', PR: 'neutral',
};
const TYPE_LABEL = {
  SA: 'Sale', SR: 'Sale Return', CRV: 'Receipt', BRV: 'Bank Receipt',
  CPV: 'Payment', BPV: 'Bank Payment', BR: 'Bank', JV: 'Journal',
  PI: 'Purchase', PR: 'Purch. Return',
};

function CustomerLedger({ salesInvoices, customers = [], companyId = 1 }) {
  // Every registered customer, not only those who already have an invoice — one
  // carried over with an opening balance has none yet, and building the list from
  // invoices alone made them unselectable.
  const customerNames = useMemo(() => {
    const names = new Set((salesInvoices || []).map(i => i.customer_name).filter(Boolean));
    (customers || []).forEach(c => { if (c.name) names.add(c.name); });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [salesInvoices, customers]);

  const [customer, setCustomer] = useState('');
  const [fromDate, setFrom] = useState('');
  const [toDate,   setTo]   = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setCustomer(c => c || customerNames[0] || ''); }, [customerNames]);

  const custRow = useMemo(
    () => (customers || []).find(c => c.name === customer) || null,
    [customers, customer]);
  const accountCode = custRow?.account_code || null;

  // Deliberately unfiltered: the opening balance is the sum of everything before
  // `fromDate`, so the rows preceding the period have to be in hand. Filtering in
  // the query would hide them and the brought-forward figure would silently read
  // zero, taking every running balance below it with it.
  const { data: allEntries, loading } = useDb(
    () => financeDb.getCustomerLedgerEntries(accountCode, null, null, companyId),
    [accountCode, companyId]);

  const inPeriod = (d) => {
    const day = (d || '').slice(0, 10);
    if (fromDate && day < fromDate) return false;
    if (toDate   && day > toDate)   return false;
    return true;
  };

  const entries = useMemo(
    () => (allEntries || []).filter(e => inPeriod(e.date)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEntries, fromDate, toDate]);

  // Invoice -> order, so a resolved ledger line can reach its line items. Looked up by the
  // ids this customer's rows actually name: the `salesInvoices` prop is a plain list and
  // stops at Supabase's 1,000-row cap, which covered barely a year of the 19,217 invoices
  // and left every older row without item detail.
  const invoiceIds = useMemo(
    () => [...new Set((entries || []).map(e => invoiceIdFromNarration(e.particulars)).filter(Boolean))],
    [entries]);
  const invoiceIdKey = invoiceIds.join(',');
  const { data: invoiceRefs } = useDb(
    () => salesDb.getSalesOrderRefs(invoiceIds), [invoiceIdKey]);

  const soRefByInvoice = useMemo(() => {
    const m = {};
    (invoiceRefs || []).forEach(i => { if (i.sale_inv_id) m[i.sale_inv_id] = i.so_ref; });
    return m;
  }, [invoiceRefs]);

  const neededSoRefs = useMemo(() => {
    const refs = new Set();
    (entries || []).forEach(e => {
      const inv = invoiceIdFromNarration(e.particulars);
      const so = inv ? soRefByInvoice[inv] : null;
      if (so) refs.add(so);
    });
    return [...refs];
  }, [entries, soRefByInvoice]);
  const soKey = neededSoRefs.join(',');

  const { data: lineItems } = useDb(() => salesDb.getSoLineItems(neededSoRefs), [soKey]);

  const itemsBySo = useMemo(() => {
    const m = {};
    (lineItems || []).forEach(li => { (m[li.so_id] ||= []).push(li); });
    return m;
  }, [lineItems]);

  // Brought forward = the sum of the ledger before `fromDate`.
  //
  // customers.opening_balance is deliberately NOT added on top. An opening balance is
  // posted as a real "Opening" voucher against the customer's own sub-ledger account, so
  // it already arrives as one of the entries below; adding the stored field as well would
  // count it twice. (It is zero for all 959 customers today — the field is written
  // alongside the voucher, never instead of it.)
  const opening = useMemo(() => {
    if (!fromDate) return 0;
    return (allEntries || []).reduce((sum, e) => (
      (e.date || '').slice(0, 10) < fromDate
        ? sum + (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0)
        : sum
    ), 0);
  }, [allEntries, fromDate]);

  // One pass: attach items, carry the running balance.
  // Reduced rather than mapped over a mutable counter: the running total is derived
  // from the row before it, so it stays a pure function of `entries`.
  const rows = useMemo(() => (entries || []).reduce((acc, e) => {
    const debit  = parseFloat(e.debit)  || 0;
    const credit = parseFloat(e.credit) || 0;
    const prev   = acc.length ? acc[acc.length - 1].balance : opening;
    const invId  = invoiceIdFromNarration(e.particulars);
    const so     = invId ? soRefByInvoice[invId] : null;
    acc.push({
      ...e, debit, credit,
      balance: prev + debit - credit,
      invoiceId: invId,
      items: so ? (itemsBySo[so] || []) : [],
    });
    return acc;
  }, []), [entries, itemsBySo, soRefByInvoice, opening]);

  // Paged for rendering only. The balance on each row was carried from the brought
  // forward figure when `rows` was built, so a slice reads the same as one long page,
  // and the totals below still sum the whole period.
  const pageCount = Math.max(1, Math.ceil(rows.length / LEDGER_PAGE_SIZE));
  const safePage  = Math.min(page, pageCount);
  const visible   = rows.slice((safePage - 1) * LEDGER_PAGE_SIZE, safePage * LEDGER_PAGE_SIZE);

  const totalDr = rows.reduce((s, r) => s + r.debit, 0);
  const totalCr = rows.reduce((s, r) => s + r.credit, 0);
  const closing = rows.length ? rows[rows.length - 1].balance : opening;

  const drCr = (v) => `${formatAmount(Math.abs(v))} ${v >= 0 ? 'Dr' : 'Cr'}`;

  const { showPreview, previewNode } = useWordPreview();
  const handlePreview  = () => { const d = buildDoc(); if (d) showPreview(d); };
  const handleDownload = () => { const d = buildDoc(); if (d) downloadWordDoc(d); };

  const buildDoc = () => {
    if (!customer) return;

    // Date carries its age underneath and the voucher carries its type, the way the
    // client's own ledger does.
    // Only when there is genuinely a balance carried into the period. With no
    // From date, and no stored opening balance, the row could only ever read zero.
    const openingRow = opening === 0 ? '' : `
      <tr class="open">
        <td>${fromDate ? formatDateNumeric(fromDate) : '—'}</td>
        <td>—</td>
        <td><strong>Opening Balance</strong><div class="sub">Brought forward</div></td>
        <td>—</td><td>—</td><td class="right">—</td><td class="right">—</td>
        <td class="right">—</td><td class="right">—</td>
        <td class="right"><strong>${drCr(opening)}</strong></td>
      </tr>`;

    const body = rows.map(r => {
      const join = (fn) => r.items.length ? r.items.map(fn).join('<br>') : '—';
      const age = agDays(r.date);
      return `
      <tr>
        <td>${formatDateNumeric((r.date || '').slice(0, 10))}<div class="sub">${age}d</div></td>
        <td class="mono">${esc(r.voucher_id || '—')}<div class="sub">${esc(TYPE_LABEL[r.voucher_type] || r.voucher_type || '')}</div></td>
        <td>${esc(shortParticulars(r.particulars)) || '—'}</td>
        <td>${join(li => esc(itemMaterial(li)) || '—')}</td>
        <td>${join(li => esc(itemGauge(li))  || '—')}</td>
        <td class="right">${join(li => esc(itemWeight(li)) || '—')}</td>
        <td class="right">${join(li => li.unit_price > 0 ? formatAmount(li.unit_price) : '—')}</td>
        <td class="right">${r.debit  > 0 ? formatAmount(r.debit)  : '—'}</td>
        <td class="right">${r.credit > 0 ? formatAmount(r.credit) : '—'}</td>
        <td class="right">${drCr(r.balance)}</td>
      </tr>`;
    }).join('');

    return buildReportDoc({
      filename: `Customer Ledger ${customer}`,
      title: 'Customer Ledger',
      landscape: true,
      meta: `Customer: <strong>${esc(customer)}</strong>`
          + (accountCode ? ` &nbsp;|&nbsp; Account: <strong>${esc(accountCode)}</strong>` : '')
          + ` &nbsp;|&nbsp; Period: ${fromDate ? formatDateNumeric(fromDate) : 'Start'} — ${toDate ? formatDateNumeric(toDate) : 'To date'}`,
      note: `Closing Balance: ${drCr(closing)}`,
      css: LEDGER_DOC_CSS + `
        .rpt td .sub { font-size: 9.5px; color: #888; }
        .rpt tr.open td { background: #f4f6fb; }
        .rpt tfoot td { background: #f4f6fb; }
      `,
      table: `<table class="rpt">
        <thead><tr>
          <th width="62">Date</th><th width="88">Voucher</th><th>Particulars</th>
          <th width="94">Item</th><th width="56">Gauge</th>
          <th class="right" width="64">Weight</th>
          <th class="right" width="58">Rate</th>
          <th class="right" width="82">Debit</th>
          <th class="right" width="82">Credit</th>
          <th class="right" width="100">Balance</th>
        </tr></thead>
        <tbody>${openingRow}${body || '<tr><td colspan="10" class="center" style="padding:18px;color:#666">No transactions for selected period</td></tr>'}</tbody>
        <tfoot><tr>
          <td colspan="7" class="right"><strong>Totals</strong></td>
          <td class="right"><strong>${formatAmount(totalDr)}</strong></td>
          <td class="right"><strong>${formatAmount(totalCr)}</strong></td>
          <td class="right"><strong>${drCr(closing)}</strong></td>
        </tr></tfoot>
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
            onChange={(v) => { setCustomer(v); setPage(1); }}
            options={customerNames.map(name => ({ value: name, label: name }))}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input className={styles.dateInput} type="date" value={fromDate} onChange={e => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>To</label>
          <input className={styles.dateInput} type="date" value={toDate} onChange={e => { setTo(e.target.value); setPage(1); }} />
        </div>
        <Button variant="secondary" icon={<Eye size={14} />} onClick={handlePreview} disabled={!customer || loading}>
          Preview
        </Button>
        <Button variant="primary" icon={<FileDown size={14} />} onClick={handleDownload} disabled={!customer || loading}>
          Download Word
        </Button>
        {previewNode}
      </div>

      {accountCode === null && customer && !loading && (
        <div style={{ padding: '10px 14px', margin: '0 0 12px', fontSize: 12.5,
                      background: 'var(--orange-muted)', border: '1px solid var(--orange-border)',
                      borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)' }}>
          <strong>{customer}</strong> has no ledger account linked, so only its opening
          balance can be shown. Run <code>backfill-customer-account-codes.js</code> to link it.
        </div>
      )}

      <div className={styles.reportTable}>
        <table className={styles.tbl}>
          <thead>
            <tr>
              <th style={{ width: 92 }}>Date</th>
              <th style={{ width: 120 }}>Voucher</th>
              <th>Particulars</th>
              <th style={{ width: 130 }}>Item</th>
              <th style={{ width: 78 }}>Gauge</th>
              <th style={{ width: 60 }}>Size</th>
              <th className={styles.right} style={{ width: 92 }}>Weight</th>
              <th className={styles.right} style={{ width: 84 }}>Rate</th>
              <th className={styles.right} style={{ width: 110 }}>Debit</th>
              <th className={styles.right} style={{ width: 110 }}>Credit</th>
              <th className={styles.right} style={{ width: 140 }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk${i}`}>
                  {Array.from({ length: 11 }, (_, c) => (
                    <td key={c}><Skeleton width={['70%','55%','85%','60%','45%','40%','50%','50%','65%','65%','75%'][c]} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {opening !== 0 && safePage === 1 && (
                  <tr className={styles.totalRow}>
                    <td className={styles.date}>{fromDate ? formatDateNumeric(fromDate) : '—'}</td>
                    <td><span className={styles.nil}>—</span></td>
                    <td><strong>Opening Balance</strong></td>
                    <td colSpan={5}><span className={styles.nil}>Brought forward</span></td>
                    <td className={styles.right}><span className={styles.nil}>—</span></td>
                    <td className={styles.right}><span className={styles.nil}>—</span></td>
                    <td className={styles.right}><span className={`${styles.mono} ${styles.total}`}>{drCr(opening)}</span></td>
                  </tr>
                )}

                {rows.length === 0
                  ? <tr><td colSpan={11} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>No transactions for selected period</td></tr>
                  : visible.map((r, i) => {
                    const age = agDays(r.date);
                    const ageTone = age > 60 ? 'error' : age > 30 ? 'warning' : 'neutral';
                    return (
                      <tr key={`${r.voucher_id}-${r.line_no}-${i}`}>
                        <td className={styles.date}>
                          {formatDateNumeric((r.date || '').slice(0, 10))}
                          <div><Badge variant={ageTone}>{age}d</Badge></div>
                        </td>
                        <td className={styles.code}>
                          {r.voucher_id || '—'}
                          <div><Badge variant={TYPE_TONE[r.voucher_type] || 'neutral'}>
                            {TYPE_LABEL[r.voucher_type] || r.voucher_type || '—'}
                          </Badge></div>
                        </td>
                        <td style={{ fontSize: 12.5 }} title={r.particulars || undefined}>
                          {shortParticulars(r.particulars) || <span className={styles.nil}>—</span>}
                        </td>
                        <td><ItemLines items={r.items} render={itemMaterial} mono={false} /></td>
                        <td><ItemLines items={r.items} render={itemGauge} /></td>
                        <td><ItemLines items={r.items} render={itemSize} /></td>
                        <td className={styles.right}><ItemLines items={r.items} render={itemWeight} align="right" /></td>
                        <td className={styles.right}>
                          <ItemLines items={r.items} align="right"
                            render={li => (li.unit_price > 0 ? formatAmount(li.unit_price) : '')} />
                        </td>
                        <td className={styles.right}>
                          {r.debit > 0 ? <span className={styles.mono}>{formatAmount(r.debit)}</span> : <span className={styles.nil}>—</span>}
                        </td>
                        <td className={styles.right}>
                          {r.credit > 0 ? <span className={styles.mono}>{formatAmount(r.credit)}</span> : <span className={styles.nil}>—</span>}
                        </td>
                        <td className={styles.right}>
                          <span className={`${styles.mono} ${styles.total}`}>{formatAmount(Math.abs(r.balance))}</span>
                          <span style={{ fontSize: 10, marginLeft: 4, color: r.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {r.balance >= 0 ? 'Dr' : 'Cr'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                {rows.length > 0 && (
                  <tr className={styles.totalRow}>
                    <td colSpan={8} className={styles.right}><strong>Totals</strong></td>
                    <td className={styles.right}><strong className={styles.mono}>{formatAmount(totalDr)}</strong></td>
                    <td className={styles.right}><strong className={styles.mono}>{formatAmount(totalCr)}</strong></td>
                    <td className={styles.right}><strong className={styles.mono}>{drCr(closing)}</strong></td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
          {pageCount > 1 && (
            <div className={styles.ledgerPager}>
              <span className={styles.pageInfo}>
                Showing {((safePage - 1) * LEDGER_PAGE_SIZE) + 1}–{Math.min(safePage * LEDGER_PAGE_SIZE, rows.length)} of {rows.length}
              </span>
              <div className={styles.pageButtons}>
                <button className={styles.pageBtn} disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                <span className={styles.pageNum}>{safePage} / {pageCount}</span>
                <button className={styles.pageBtn} disabled={safePage >= pageCount}
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))} aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
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
function VendorLedger({ vendors, companyId = 1 }) {
  const { data: rawAccounts } = useDb(() => financeDb.getVoucherAccounts());
  const { data: ledgerVendors } = useDb(() => financeDb.getVendorLedgerNames(companyId), [companyId]);

  // Two sources, unioned, because neither is complete on its own:
  //   * the creditors sub-ledger — 278 names, and the only place purchases appear;
  //   * vendors named on a voucher header — 217, of which 58 have no creditor line at all
  //     (their postings sit on other accounts) and would otherwise vanish from the picker.
  const vendorList = useMemo(() => {
    const names = new Set(ledgerVendors || []);
    const headerNames = new Set((rawAccounts || []).map(r => r.account_name).filter(Boolean));
    (vendors || []).forEach(v => { if (v.name && headerNames.has(v.name)) names.add(v.name); });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [ledgerVendors, rawAccounts, vendors]);

  const [vendor,   setVendor] = useState('');
  const [fromDate, setFrom]   = useState('');
  const [toDate,   setTo]     = useState('');
  const [page, setPage] = useState(1);

  // Ledger first. A vendor with no creditor line still has voucher-header activity worth
  // showing, so those fall back to the header query rather than reading as an empty ledger.
  const { data: rawVouchers } = useDb(
    async () => {
      if (!vendor) return { data: [], error: null };
      const res = await financeDb.getVendorLedgerEntries(vendor, fromDate, toDate, companyId);
      if (res.error || (res.data && res.data.length)) return res;
      const fallback = await financeDb.getVouchersByAccount(vendor, fromDate, toDate, companyId);
      return {
        data: (fallback.data || []).map(v => ({ ...v, particulars: v.narration })),
        error: fallback.error,
      };
    },
    [vendor, fromDate, toDate, companyId]
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

  // What each purchase on this ledger was actually for, reached two different ways.
  //
  // A bill raised in the app posts under its own bill id, which joins straight to
  // purchase_invoice_items. The 2,470 imported PI vouchers have no bill and no reference —
  // they name their goods-receipt note in the line narration instead:
  //
  //   "Vendor Charged,GRN:GRN-26-05-0001,PO:PO-26-05-0001-Bill#57-2"
  //
  // 2,401 of them (97.2%) name a GRN, and every one of those GRNs has lines. Going by bill
  // alone is why this column was empty for the whole of the imported history.
  // The reference, never the voucher id: every leg of a posting carries its own suffixed
  // id ("PBILL-58635-3") and only the reference holds the plain bill id the items are
  // filed under.
  const billOf = (e) => e.reference || String(e.voucher_id || '').replace(/-\d+$/, '');
  const billIds = useMemo(
    () => entries.filter(e => e.voucher_type === 'Purchase').map(billOf).filter(Boolean),
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

  // The vendor's own line is the one that names the GRN, and the ledger view already
  // returns it as `particulars` — no second round-trip needed.
  const grnByVoucher = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      const m = /GRN:\s*([A-Za-z0-9-]+)/.exec(e.particulars || '');
      if (m && !map[e.voucher_id]) map[e.voucher_id] = m[1];
    });
    return map;
  }, [entries]);

  const grnIds = useMemo(() => [...new Set(Object.values(grnByVoucher))], [grnByVoucher]);
  const grnKey = grnIds.join(',');
  const { data: grnItems } = useDb(
    () => procurementDb.getGrnLineItemsBulk(grnIds), [grnKey]);

  const itemsByGrn = useMemo(() => {
    const map = {};
    // Stored ids carry a doubled prefix; key on the bare form so the lookup matches the
    // narration either way.
    (grnItems || []).forEach(li => {
      const id = String(li.grn_id || '').replace(/^GRN-(?=GRN-)/, '');
      (map[id] ||= []).push(li);
    });
    return map;
  }, [grnItems]);

  const itemsFor = (e) => {
    if (e.voucher_type === 'Purchase') return itemsByBill[billOf(e)] || [];
    if (e.voucher_type === 'PI') return itemsByGrn[grnByVoucher[e.voucher_id]] || [];
    return [];
  };

  const totalDr  = entries.reduce((s, e) => s + (parseFloat(e.debit)  || 0), 0);
  const totalCr  = entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  const closeBal = entries[entries.length - 1]?.balance ?? 0;

  // Paged for rendering only — the running balance is already on each row, and the
  // totals underneath still read the whole set.
  const pageCount = Math.max(1, Math.ceil(entries.length / LEDGER_PAGE_SIZE));
  const safePage  = Math.min(page, pageCount);
  const visible   = entries.slice((safePage - 1) * LEDGER_PAGE_SIZE, safePage * LEDGER_PAGE_SIZE);

  const { showPreview, previewNode } = useWordPreview();
  const handlePreview  = () => { const d = buildDoc(); if (d) showPreview(d); };
  const handleDownload = () => { const d = buildDoc(); if (d) downloadWordDoc(d); };

  const buildDoc = () => {
    if (!vendor) return;
    const rows = entries.map(e => {
      const items = itemsFor(e);
      const join = (fn) => items.length ? items.map(fn).join('<br>') : '—';
      return `
      <tr>
        <td>${formatDateNumeric((e.date || '').slice(0, 10))}</td>
        <td>${esc(e.voucher_id || '—')}</td>
        <td>${esc(e.voucher_type || '—')}</td>
        <td>${esc(shortParticulars(e.particulars)) || '—'}</td>
        <td>${join(li => esc(itemMaterial(li)) || '—')}</td>
        <td>${join(li => esc(itemGauge(li))  || '—')}</td>
        <td class="right">${join(li => esc(itemWeight(li)) || '—')}</td>
        <td class="right">${e.debit  > 0 ? formatAmount(e.debit)  : '—'}</td>
        <td class="right">${e.credit > 0 ? formatAmount(e.credit) : '—'}</td>
        <td class="right">${formatAmount(Math.abs(e.balance))} ${e.balance >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>`;
    }).join('');

    return buildReportDoc({
      filename: `Vendor Ledger ${vendor}`,
      title: 'Vendor Ledger',
      landscape: true,
      css: LEDGER_DOC_CSS,
      meta: `Vendor: <strong>${esc(vendor)}</strong> &nbsp;|&nbsp; Period: ${fromDate ? formatDateNumeric(fromDate) : 'Start'} — ${toDate ? formatDateNumeric(toDate) : 'To date'}`,
      note: `Closing Balance: ${formatAmount(Math.abs(closeBal))} ${closeBal >= 0 ? 'Dr' : 'Cr'}`,
      table: `<table class="rpt">
        <thead><tr><th width="65">Date</th><th width="85">Voucher</th><th width="60">Type</th>
          <th>Narration</th><th width="96">Item</th><th width="56">Gauge</th>
          <th class="right" width="64">Weight</th>
          <th class="right" width="82">Debit</th><th class="right" width="82">Credit</th>
          <th class="right" width="98">Balance</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10" class="center" style="padding:18px;color:#666">No entries for selected period</td></tr>'}</tbody>
        <tfoot><tr><td colspan="7" class="right">Totals</td>
          <td class="right">${formatAmount(totalDr)}</td>
          <td class="right">${formatAmount(totalCr)}</td>
          <td class="right">${formatAmount(Math.abs(closeBal))} ${closeBal >= 0 ? 'Dr' : 'Cr'}</td>
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
            onChange={(v) => { setVendor(v); setPage(1); }}
            options={vendorList.map(name => ({ value: name, label: name }))}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input className={styles.dateInput} type="date" value={fromDate} onChange={e => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>To</label>
          <input className={styles.dateInput} type="date" value={toDate} onChange={e => { setTo(e.target.value); setPage(1); }} />
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
                <th>Item</th><th>Gauge</th><th>Size</th>
                <th className={styles.right}>Weight</th>
                <th className={styles.right}>Debit</th>
                <th className={styles.right}>Credit</th>
                <th className={styles.right}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0
                ? <tr><td colSpan={11} style={{ textAlign:'center', padding:'20px', color:'var(--text-secondary)' }}>No entries for selected period</td></tr>
                : visible.map((e, i) => {
                  const items = itemsFor(e);
                  return (
                  <tr key={e.id ?? i}>
                    <td className={styles.date}>{formatDateNumeric((e.date || '').slice(0, 10))}</td>
                    <td className={styles.code}>{e.voucher_id || '—'}</td>
                    <td className={styles.type}>{e.voucher_type || '—'}</td>
                    <td title={e.particulars || undefined}>
                      {shortParticulars(e.particulars) || <span className={styles.nil}>—</span>}
                    </td>
                    <td><ItemLines items={items} render={itemMaterial} mono={false} /></td>
                    <td><ItemLines items={items} render={itemGauge} /></td>
                    <td><ItemLines items={items} render={itemSize} /></td>
                    <td className={styles.right}><ItemLines items={items} render={itemWeight} align="right" /></td>
                    <td className={styles.right}>
                      {parseFloat(e.debit) > 0 ? <span className={styles.mono}>{formatAmount(e.debit)}</span> : <span className={styles.nil}>—</span>}
                    </td>
                    <td className={styles.right}>
                      {parseFloat(e.credit) > 0 ? <span className={styles.mono}>{formatAmount(e.credit)}</span> : <span className={styles.nil}>—</span>}
                    </td>
                    <td className={styles.right}>
                      <span className={styles.mono}>{formatAmount(Math.abs(e.balance))}</span>
                      <span style={{ fontSize: 10, marginLeft: 4, color: e.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {e.balance >= 0 ? 'Dr' : 'Cr'}
                      </span>
                    </td>
                  </tr>
                  );
                })}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div className={styles.ledgerPager}>
              <span className={styles.pageInfo}>
                Showing {((safePage - 1) * LEDGER_PAGE_SIZE) + 1}–{Math.min(safePage * LEDGER_PAGE_SIZE, entries.length)} of {entries.length}
              </span>
              <div className={styles.pageButtons}>
                <button className={styles.pageBtn} disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                <span className={styles.pageNum}>{safePage} / {pageCount}</span>
                <button className={styles.pageBtn} disabled={safePage >= pageCount}
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))} aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
          {entries.length > 0 && (
            <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 0', gap:24, fontSize:12, color:'var(--text-secondary)' }}>
              <span>Total Debit: <strong>{formatAmount(totalDr)}</strong></span>
              <span>Total Credit: <strong>{formatAmount(totalCr)}</strong></span>
              <span>Closing: <strong>{formatAmount(Math.abs(closeBal))} {closeBal >= 0 ? 'Dr' : 'Cr'}</strong></span>
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
  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'ledger';

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


      {pageTab === 'ledger' && (
        <Card padding={false}>
          <CardHeader title="Account Ledger" subtitle="Party-wise transaction history with running balance" />
          <div className={styles.cardBody}><LedgerReport chartOfAccounts={chartOfAccounts} companyId={companyId} /></div>
        </Card>
      )}
      {pageTab === 'trial' && (
        <Card padding={false}>
          <CardHeader
            title="Trial Balance"
            subtitle={`${chartOfAccounts.filter(a => (Number(a.balance) || 0) !== 0).length} accounts carrying a balance, of ${chartOfAccounts.length} in the chart`}
          />
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
          <div className={styles.cardBody}><CustomerLedger salesInvoices={salesInvoices} customers={customers} companyId={companyId} /></div>
        </Card>
      )}
      {pageTab === 'vendor-ledger' && (
        <Card padding={false}>
          <CardHeader title="Vendor Ledger" subtitle="Vendor-wise transaction history with running balance" />
          <div className={styles.cardBody}><VendorLedger vendors={vendors} companyId={companyId} /></div>
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
