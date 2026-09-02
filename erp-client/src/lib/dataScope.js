// The archive cutoff: which years the everyday screens show, and which have been set
// aside in Manage Data.
//
// Shop #41's books open on 2016-06-30 and run to today — 49,862 vouchers, of which
// 15,295 predate the cutoff. Carrying all of it on every list screen is what prompted
// this: the owner wants the recent years by default and the older ones kept, reachable,
// and exportable rather than deleted.
//
// ── The rule this module exists to enforce ────────────────────────────────────────────
// The cutoff decides what is LISTED. It never decides what is COMPUTED.
//
// Every balance in the app keeps reading all ten years: the seven ledger views, the
// stored chart_of_accounts.balance that Trial Balance and the Finance cards read, and
// the three ledger reports with their own date pickers and their own brought-forward
// arithmetic. Filtering those would silently zero an opening balance and take every
// running balance below it — a bug this codebase has already had once and fixed, see the
// comment on CustomerLedger in pages/Reports/Reports.jsx.
//
// So no total moves when the cutoff is applied. That is the whole design, and it is why
// this needs no snapshot table, no view migrations and no year-end close.
//
// ── Why scope is passed in rather than read from here ─────────────────────────────────
// applyScope takes the scope as an argument and does nothing when handed null. It is NOT
// a module-level setting the query layer reads on its own, because the same db.js reader
// serves both kinds of caller: salesDb.getSalesInvoices is the Sales register AND the
// Dashboard's Total Revenue AND three reports; procurementDb.getGrns is the Procurement
// list AND the picker that bills an old GRN. An ambient setting would scope all of them
// together, shrinking totals and emptying pickers.
//
// Passing it in means the default is unscoped. A reader added later, or a call site
// nobody converts, keeps seeing everything — the safe direction to fail in.

// First day that stays visible, per company. This is the start of fiscal year
// F-2019-2020: the books run July-June, so cutting here splits no year, and everything
// from calendar 2020 onward is kept whole.
//
// Shop #58 is null on purpose, not 0 or a date in the past. Its books begin 2023-08-17,
// so it has nothing to archive, and null makes every call below a no-op for it without a
// single company check anywhere else in the app.
export const ARCHIVE_CUTOFF = {
  1: '2019-06-30',   // Allied Steel Center (Shop #41)
  2: null,           // Shop #58 — opens 2023-08-17, nothing older exists
};

export const cutoffFor = (companyId) => ARCHIVE_CUTOFF[companyId] ?? null;

export const hasArchive = (companyId) => Boolean(cutoffFor(companyId));

// Which column carries the document date, per table. Every table names it differently —
// that is the schema as it was imported, not a choice — so the mapping is explicit.
// A table absent from here cannot be scoped, which is the intended way to opt out.
export const DATE_COLUMN = {
  vouchers:              'date',
  sales_invoices:        'date',
  sales_orders:          'order_date',
  delivery_notes:        'delivery_date',
  sales_returns:         'return_date',
  gate_passes:           'date',
  order_confirmations:   'confirm_date',
  work_orders:           'work_order_date',
  purchase_orders:       'po_date',
  purchase_requisitions: 'date',
  pdns:                  'pdn_date',
  grns:                  'received_date',
  gate_passes_inward:    'gate_date',
  purchase_invoices:     'bill_date',
  invoices:              'invoice_date',
  sale_return_invoices:  'date',
  petty_cash:            'date',
  cash_received:         'date',
  inter_bank_transfers:  'date',
  cheque_tracking:       'due_date',
};

// The three ways a screen can look at the books.
export const SCOPE_RECENT  = 'recent';    // from the cutoff onward — the default
export const SCOPE_ALL     = 'all';       // everything, the pre-cutoff years included
export const SCOPE_ARCHIVE = 'archive';   // only what is before the cutoff (Manage Data)

// The only place in the app that writes a date filter for the archive.
//
// `gte` and `lt` against the same cutoff are exact complements, so 'recent' and 'archive'
// together cover every row once and no row twice — the cutoff is the first VISIBLE day,
// not the last archived one, so no off-by-one adjustment belongs here.
export function applyScope(query, table, scope) {
  if (!scope || scope.mode === SCOPE_ALL) return query;

  const cutoff = cutoffFor(scope.companyId);
  if (!cutoff) return query;                 // company with no archive: nothing to do

  const column = DATE_COLUMN[table];
  if (!column) return query;                 // table not scopeable: leave it alone

  return scope.mode === SCOPE_ARCHIVE
    ? query.lt(column, cutoff)
    : query.gte(column, cutoff);
}
