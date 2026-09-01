// Central DB query layer — all Supabase queries go here.
// Every function returns { data, error } from Supabase.
import { supabase } from './supabase';
import { isCreditNormal } from '../utils/accounts';

// Supabase caps one select at 1,000 rows, and PostgREST puts an .in() list in the query
// string where the gateway stops at roughly 8 KB. Both force long reads to be split.
// Splitting is unavoidable; awaiting each piece in turn is not, and that is what made the
// ledger slow — 61 chunks fetched one after another took 15.9s where eight in flight take
// 2.6s. Beyond about eight there is nothing left to win and the browser starts queueing.
const POOL = 8;

async function mapPool(items, fn, limit = POOL) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
    })
  );
  return out;
}

// Slice an id list by the size it will occupy in the URL rather than by a count, because
// the safe count depends on how long the ids are: 400 voucher_ids encode to 5.5 KB, but
// 400 so_ids reach 10.6 KB and the request never arrives. Budget leaves room for the rest
// of the query string.
const URL_BUDGET = 6000;
function sliceByLength(ids) {
  const out = [];
  let cur = [], len = 0;
  for (const id of ids) {
    const w = encodeURIComponent(String(id)).length + 1;
    if (cur.length && len + w > URL_BUDGET) { out.push(cur); cur = []; len = 0; }
    cur.push(id); len += w;
  }
  if (cur.length) out.push(cur);
  return out;
}

// One .in() query per slice, all in flight together, concatenated in order.
//
// Each slice is paged, because the 1,000-row ceiling applies per request and not per id:
// a slice of 430 voucher_ids can pull well over a thousand voucher_lines, and the reply
// is truncated at 1,000 with no error to say so. The old fixed CHUNK=150 only avoided
// this by being small enough to usually stay under — a voucher with many lines could
// have silently lost rows. `build` returns a fresh query each call so range() can move.
async function inChunks(ids, build) {
  const PAGE = 1000;
  const results = await mapPool(sliceByLength(ids), async (slice) => {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      // A tiebreak on the primary key, or paging is not deterministic: ordering by
      // line_no alone leaves hundreds of rows tied on line_no 1, and Postgres is free
      // to return ties in a different order per page, which both skips and repeats rows.
      const { data, error } = await build(slice).order('id').range(from, from + PAGE - 1);
      if (error) return { data: null, error };
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return { data: rows, error: null };
  });
  const all = [];
  for (const { data, error } of results) {
    if (error) return { data: null, error };
    if (data) all.push(...data);
  }
  return { data: all, error: null };
}

// ── HR ────────────────────────────────────────────────────────────────────

export const hrDb = {
  getEmployees: () =>
    supabase.from('employees').select('*').order('id', { ascending: false }),

  addEmployee: (emp) =>
    supabase.from('employees').insert([emp]).select().single(),

  updateEmployee: (employeeId, updates) =>
    supabase.from('employees').update(updates).eq('employee_id', employeeId).select().single(),

  deleteEmployee: (employeeId) =>
    supabase.from('employees').delete().eq('employee_id', employeeId),

  getAttendance: (date) => {
    let q = supabase.from('attendance').select('*').order('date', { ascending: false });
    if (date) q = q.eq('date', date);
    return q;
  },

  getLeaveRequests: () =>
    supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),

  getLeaveBalances: () =>
    supabase.from('leave_balances').select('*'),

  getPayrollRecords: (month, year) => {
    let q = supabase.from('payroll_records').select('*').order('section').order('employee_id');
    if (month) q = q.eq('month', month);
    if (year) q = q.eq('year', year);
    return q;
  },

  // late_rate/late_amount used to be missing from payroll_records, and this dropped them
  // from the update rather than failing — which meant an edited late rate silently never
  // saved. migrate-payroll-late-columns.js adds both, so the write goes through whole and
  // a genuine schema problem surfaces as an error instead of as lost data.
  updatePayroll: (payrollId, updates) =>
    supabase.from('payroll_records').update(updates).eq('payroll_id', payrollId).select().single(),

  // How many payroll rows already exist for a month/year (used to block duplicate generation).
  countPayrollForPeriod: (month, year) =>
    supabase.from('payroll_records').select('id', { count: 'exact', head: true }).eq('month', month).eq('year', year),

  addPayrollBatch: (records) =>
    supabase.from('payroll_records').insert(records).select(),

  markAttendance: (record) =>
    supabase.from('attendance').insert([record]).select().single(),

  getAttendanceForDate: (date) =>
    supabase.from('attendance').select('*').eq('date', date),

  getMonthlyAttendance: (year, month) => {
    const pad = n => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    return supabase.from('attendance')
      .select('*')
      .gte('date', `${year}-${pad(month)}-01`)
      .lte('date', `${year}-${pad(month)}-${pad(lastDay)}`)
      .order('date');
  },

  bulkUpsertAttendance: (records) =>
    supabase.from('attendance').upsert(records, { onConflict: 'employee_id,date' }),

  applyLeave: (record) =>
    supabase.from('leave_requests').insert([record]).select().single(),

  updateLeaveStatus: (leaveId, status) =>
    supabase.from('leave_requests').update({ status }).eq('leave_id', leaveId).select().single(),

  // Approved leave covering a given day. The daily sheet uses this to pre-select
  // 'leave' instead of defaulting the employee to 'present' -- payroll deducts a
  // day's pay for every 'absent' row, so an approved leave marked wrongly costs
  // the employee money.
  getApprovedLeaveForDate: (date) =>
    supabase.from('leave_requests').select('employee_id')
      .eq('status', 'approved').lte('from_date', date).gte('to_date', date),

  getLoans: () =>
    supabase.from('loans').select('*').order('employee_name'),

  addLoan: (loan) =>
    supabase.from('loans').insert([loan]).select().single(),

  // Records a loan or advance AND puts the money movement in the ledger.
  //
  // Handing an employee 30,000 from Jazz Cash has to show up as 30,000 less in Jazz Cash;
  // the loans table alone cannot do that. The pocket comes from the "Paid From" choice on
  // the modal, stored on the row as payment_account_code.
  //
  //   Dr  Loan to Employees   (the firm is owed it)
  //   Cr  the chosen pocket   (the cash actually left)
  //
  // Recovery is the mirror and happens when payroll is disbursed - see
  // DisbursePayrollModal, which credits this same control account by what it deducted.
  addLoanWithPosting: async ({ loan, companyId = 1, chartOfAccounts = [] }) => {
    const { data: created, error } = await supabase
      .from('loans').insert([loan]).select().single();
    if (error || !created) return { data: null, error };

    const amount = Math.abs(parseFloat(loan.loan_amount) || 0);
    const pocketCode = loan.payment_account_code;
    if (amount === 0 || !pocketCode) return { data: created, error: null, voucherId: null };

    const pocket = (chartOfAccounts || []).find(a => a.account_code === pocketCode)
      || await financeDb.ensureLedgerAccount({
        code: pocketCode, name: loan.payment_method || pocketCode,
        type: 'Asset', parent: pocketCode.slice(0, 9), companyId,
      });
    const control = await financeDb.ensureLedgerAccount({
      code: financeDb.EMPLOYEE_LOAN_CONTROL,
      name: 'Loan to Employees', type: 'Asset', parent: '11-01-007', companyId,
    });
    // Without both sides this would be a one-legged entry, the very bug it exists to
    // avoid. The loan row still stands; the caller is told the ledger part did not post.
    if (!pocket || !control) {
      return { data: created, error: null, voucherId: null, postingFailed: true };
    }

    const isAdvanceRow = loan.type === 'advance';
    const voucherId = (isAdvanceRow ? 'ADVP-' : 'LNP-') + String(Date.now()).slice(-6);
    const narration = `${isAdvanceRow ? 'Salary advance' : 'Loan'} to ${loan.employee_name || loan.employee_id} via ${loan.payment_method || 'selected account'}`;

    await financeDb.postJournalEntry({
      voucherId, voucherType: 'Payment',
      date: loan.disbursed_date, companyId,
      legs: [
        { account: control, debit: amount, credit: 0, narration },
        { account: pocket,  debit: 0, credit: amount, narration },
      ],
      narration,
      reference: loan.loan_id,
    });

    return { data: created, error: null, voucherId };
  },

  updateLoan: (loanId, updates) =>
    supabase.from('loans').update(updates).eq('loan_id', loanId).select().single(),
};

// ── FINANCE ───────────────────────────────────────────────────────────────

export const financeDb = {
  // Supabase caps a single response at 1000 rows regardless of .limit(), so the
  // full chart (≈1774 accounts) must be paged — otherwise higher account codes
  // (e.g. 12* expense accounts) are silently dropped from selectors.
  getChartOfAccounts: async (companyId = 1) => {
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('chart_of_accounts')
        .select('*')
        .eq('company_id', companyId)
        .order('account_code')
        .range(from, from + PAGE - 1);
      if (error) return { data: null, error };
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return { data: all, error: null };
  },

  addChartAccount: (account) =>
    supabase.from('chart_of_accounts').insert([account]).select().single(),

  // Where an opening balance is booked. Money never appears from nowhere: the amount a
  // new account starts with has to come off another account, and for a balance carried
  // onto the books the other side is the owner's Capital. Same account the old system
  // used (13-01-000-000000), created on demand if a branch lacks it.
  OPENING_BALANCE_CONTRA: '13-01-000-000000',

  // Where employee loans and advances sit in the ledger: the "Loan to Employees" control
  // account. Money lent to staff is still the firm's money, so it moves from a cash/bank
  // pocket into a receivable rather than becoming an expense.
  //
  // The control account is used rather than a per-employee sub-account under 11-01-007
  // because not one of the 20 current employees matches any of the 34 historical
  // "<name> (Loan)" accounts there - they belong to earlier staff. Matching on name would
  // be a guess, and per-employee balances are already tracked in the loans table.
  EMPLOYEE_LOAN_CONTROL: '11-01-007-000000',

  // Creates a chart account and, when it starts with a balance, posts that balance as a
  // real Journal voucher instead of writing a loose number onto the account row.
  //
  // The modal used to send `balance: <opening>` straight into the insert. Nothing was
  // credited, so the money had no source: the Trial Balance (which reads
  // chart_of_accounts.balance) showed it and stopped tallying, while the Ledger Report
  // (which reads voucher_lines) showed an empty account — the two reports disagreeing
  // about the same account, with no date or narration to explain either.
  //
  // The account is therefore always created flat, and the opening amount goes through
  // postJournalEntry, which writes both legs AND maintains the balances. Passing a
  // non-zero balance here as well would count it twice.
  // The bank group. An account created under it needs a bank_accounts row as well as a
  // ledger one — see ensureBankRowForLedgerAccount.
  BANK_GROUP: '11-05-001',

  // The other half of ensureBankLedgerAccount.
  //
  // Every screen that pays or receives money lists banks from bank_accounts, while the
  // chart of accounts is a separate table linked to it by account_code. Adding a "Bank
  // Account" from the chart wrote only the ledger row, so the account existed, could be
  // posted against by hand, and appeared nowhere in any bank dropdown — created, and
  // unusable, with nothing to say why.
  //
  // Idempotent on account_code, which is the link (never parse the BANK-<n> digits).
  ensureBankRowForLedgerAccount: async (chartAccount, companyId = 1) => {
    const code = chartAccount?.account_code;
    if (!code) return { data: null, error: new Error('Account has no code to link a bank row to.') };

    const { data: existing } = await supabase
      .from('bank_accounts').select('*')
      .eq('account_code', code).eq('company_id', companyId).maybeSingle();
    if (existing) return { data: existing, error: null };

    const { data, error } = await supabase.from('bank_accounts').insert([{
      // Mirrors the import's shape so a hand-added bank sorts and reads with the rest.
      account_id:    `BANK-C${companyId}-${code.split('-').pop()}`,
      account_code:  code,
      bank_name:     chartAccount.account_name,
      account_title: chartAccount.account_name,
      account_type:  'Current',
      balance:       0,
      status:        'active',
      company_id:    companyId,
    }]).select().single();
    return { data: data || null, error: error || null };
  },

  addChartAccountWithOpening: async ({ account, openingBalance = 0, date = null, companyId = 1 }) => {
    const { data: created, error } = await supabase
      .from('chart_of_accounts').insert([{ ...account, balance: 0 }]).select().single();
    if (error || !created) return { data: null, error };

    // A bank needs its bank_accounts row or it will not appear in a single payment,
    // receipt, cheque or transfer screen. Reported rather than thrown: the ledger account
    // is already created and correct, and the caller can say which half is missing.
    let bankRowFailed = null;
    if (String(created.account_code || '').startsWith(`${financeDb.BANK_GROUP}-`)) {
      const { error: bankErr } = await financeDb.ensureBankRowForLedgerAccount(created, companyId);
      if (bankErr) bankRowFailed = bankErr;
    }

    const amount = Math.abs(parseFloat(openingBalance) || 0);
    if (amount === 0) return { data: created, error: null, voucherId: null, bankRowFailed };

    const contra = await financeDb.ensureLedgerAccount({
      code: financeDb.OPENING_BALANCE_CONTRA,
      name: 'Capital', type: 'Equity', parent: '13-01', companyId,
    });
    // Without the other side this would repeat the very bug it replaces, so the account
    // stays at zero and the caller is told the opening balance did not post.
    if (!contra) {
      return { data: created, error: null, voucherId: null, openingFailed: true, bankRowFailed };
    }

    // Which way round depends on the new account's normal side: an asset or expense opens
    // in debit, an income, equity or liability account opens in credit. Same classifier
    // the Trial Balance and applyVoucherToBalances read, so all three agree.
    const opensOnCredit = isCreditNormal(created.account_code);
    const narration = `Opening balance — ${created.account_name}`;
    const legs = opensOnCredit
      ? [{ account: contra,  debit: amount, credit: 0 }, { account: created, debit: 0, credit: amount }]
      : [{ account: created, debit: amount, credit: 0 }, { account: contra,  debit: 0, credit: amount }];

    const voucherId = 'VCH-' + String(Date.now()).slice(-6);
    await financeDb.postJournalEntry({
      voucherId, voucherType: 'Journal',
      date: date || new Date().toISOString().slice(0, 10),
      companyId,
      legs: legs.map(l => ({ ...l, narration })),
      narration,
      reference: voucherId,
    });

    return { data: created, error: null, voucherId, bankRowFailed };
  },

  // How many transactions reference this account (by name on vouchers, by code on
  // voucher_lines). Used to block deleting an account that has posted history.
  getAccountUsage: async (account, companyId = 1) => {
    const [byName, byCode] = await Promise.all([
      supabase.from('vouchers').select('id', { count: 'exact', head: true })
        .eq('account_name', account.account_name).eq('company_id', companyId),
      supabase.from('voucher_lines').select('id', { count: 'exact', head: true })
        .eq('account_code', account.account_code),
    ]);
    return (byName.count || 0) + (byCode.count || 0);
  },

  deleteChartAccount: (id) =>
    supabase.from('chart_of_accounts').delete().eq('id', id),

  getVouchers: (companyId = 1) =>
    supabase.from('vouchers')
      .select('id, voucher_id, voucher_type, date, account_name, debit, credit, narration, reference, company_id')
      .eq('company_id', companyId)
      .order('date', { ascending: false })
      .limit(500),

  addVoucher: (v) =>
    supabase.from('vouchers').insert([v]).select().single(),

  // Posts a manual Journal Voucher: 2+ balanced lines (each its own account, narration,
  // and debit/credit). Caller must ensure total debit === total credit. All lines share
  // one voucher group id (VCH-xxxxxx) so they show together and delete together.
  // lines: [{ account, debit, credit, narration }]
  addJournalVoucher: async ({ date, companyId, lines, reference }) => {
    const voucherId = 'VCH-' + String(Date.now()).slice(-6);
    await financeDb.postJournalEntry({
      voucherId, voucherType: 'Journal', date, companyId,
      legs: lines.map(l => ({
        account: l.account, debit: l.debit, credit: l.credit, narration: l.narration,
      })),
      narration: lines[0]?.narration || 'Journal entry',
      reference: reference || voucherId,
    });
    return { voucherId };
  },

  deleteVoucher: (id) =>
    supabase.from('vouchers').delete().eq('id', id),

  // Loads every leg of a voucher group (e.g. "VCH-123456") for editing. Reads from
  // voucher_lines (which carry the real account_code, unlike the display name on the
  // vouchers row) and grabs the shared date/reference/type from the vouchers header.
  getVoucherGroup: async (groupId, companyId = 1) => {
    const [{ data: lines }, { data: header }] = await Promise.all([
      supabase.from('voucher_lines')
        .select('account_code, account_title, debit, credit, narration')
        .like('voucher_id', `${groupId}-%`)
        .order('voucher_id', { ascending: true }),
      supabase.from('vouchers')
        .select('date, reference, voucher_type')
        .like('voucher_id', `${groupId}-%`)
        .limit(1).maybeSingle(),
    ]);
    return { lines: lines || [], header: header || null };
  },

  // Edits a Journal voucher group in place: reverses the old legs' balance impact,
  // removes the old rows, then re-posts the new legs under the SAME group id so the
  // voucher number stays stable. Caller must pass a balanced set of lines.
  // lines: [{ account, debit, credit, narration }]
  updateJournalVoucher: async ({ groupId, date, companyId = 1, lines, reference }) => {
    // 1. Reverse every existing leg's balance impact (real account_code from voucher_lines).
    // Scoped to the company for the same reason deleteVoucherGroup is: a bare LIKE on
    // the id reaches every branch, and step 2 below deletes whatever this matched.
    const { data: oldLines } = await supabase
      .from('voucher_lines').select('account_code, debit, credit')
      .eq('company_id', companyId)
      .like('voucher_id', `${groupId}-%`);
    await Promise.all((oldLines || []).map(async (l) => {
      const { data: acct } = await supabase
        .from('chart_of_accounts').select('*')
        .eq('account_code', l.account_code).eq('company_id', companyId).maybeSingle();
      if (acct) await financeDb.applyVoucherToBalances(acct, -(l.debit || 0), -(l.credit || 0));
    }));
    // 2. Remove the old rows.
    await Promise.all([
      supabase.from('voucher_lines').delete().eq('company_id', companyId).like('voucher_id', `${groupId}-%`),
      supabase.from('vouchers').delete().eq('company_id', companyId).like('voucher_id', `${groupId}-%`),
    ]);
    // 3. Re-post the edited legs under the same group id.
    await financeDb.postJournalEntry({
      voucherId: groupId, voucherType: 'Journal', date, companyId,
      legs: lines.map(l => ({
        account: l.account, debit: l.debit, credit: l.credit, narration: l.narration,
      })),
      narration: lines[0]?.narration || 'Journal entry',
      reference: reference || groupId,
    });
    return { groupId };
  },

  // Deletes a whole multi-leg voucher (PV/RV/Contra) in one shot, given its group id
  // (e.g. "RV-123456" — the part before the "-1"/"-2" leg suffix). Reverses every leg's
  // balance by reading the legs back from voucher_lines (which carry the real account_code,
  // unlike the display name on the voucher row), then removes the legs. Also clears the
  // inter_bank_transfers summary if this group happens to be a transfer.
  // Every statement here is scoped to the company. It was not, and a LIKE on the id
  // alone reached across branches: with groupId "VCH" it matched all 49,511 GenX
  // vouchers in the database at once. The caller decides what a group is, but this is
  // the floor — no delete from this function can leave the company it was called for.
  deleteVoucherGroup: async (groupId, companyId = 1) => {
    const { data: lines } = await supabase
      .from('voucher_lines').select('account_code, debit, credit')
      .eq('company_id', companyId)
      .like('voucher_id', `${groupId}-%`);
    // Reverse every leg's balance in parallel (each leg is a distinct account).
    await Promise.all((lines || []).map(async (l) => {
      const { data: acct } = await supabase
        .from('chart_of_accounts').select('*')
        .eq('account_code', l.account_code).eq('company_id', companyId).maybeSingle();
      if (acct) await financeDb.applyVoucherToBalances(acct, -(l.debit || 0), -(l.credit || 0));
    }));
    // Then remove the rows (independent tables) together.
    await Promise.all([
      supabase.from('voucher_lines').delete().eq('company_id', companyId).like('voucher_id', `${groupId}-%`),
      supabase.from('inter_bank_transfers').delete().eq('ibt_id', groupId),
      supabase.from('vouchers').delete().eq('company_id', companyId).like('voucher_id', `${groupId}-%`),
    ]);
    return { error: null };
  },

  // Applies a voucher's debit/credit to the matching chart-of-accounts balance
  // (and the linked bank account's balance, if the account is a bank account).
  // Pass negative debit/credit to reverse a deleted voucher's effect.
  applyVoucherToBalances: async (account, debit, credit) => {
    if (!account) return;
    // Same classifier the Trial Balance reads, so the report cannot disagree with the
    // rule that maintains the balances it reports on.
    const delta = isCreditNormal(account.account_code) ? (credit - debit) : (debit - credit);
    await supabase.from('chart_of_accounts')
      .update({ balance: (account.balance || 0) + delta })
      .eq('account_id', account.account_id);

    // The bank's display copy of this balance, found by the stored link. It used to be
    // found by pulling the number out of the code and assuming BANK-<n> — which paired
    // Al-Falah's row with AL-HABIB's ledger, among others. It also matched on account_id
    // alone, with no company filter, so once both branches had banks the update could
    // land on the wrong shop entirely.
    if (account.account_code?.startsWith('11-05-001-')) {
      const { data: bank } = await supabase.from('bank_accounts')
        .select('id, balance')
        .eq('account_code', account.account_code)
        .eq('company_id', account.company_id)
        .maybeSingle();
      if (bank) {
        await supabase.from('bank_accounts')
          .update({ balance: (bank.balance || 0) + (debit - credit) })
          .eq('id', bank.id);
      }
    }
  },

  // Resolves a picked bank to the ledger account its postings belong on.
  //
  // The link is read from the bank row's own account_code. It used to be derived from the
  // digits in the id — BANK-37 was taken to mean chart code 11-05-001-000037 — but those
  // numbers came from the old system's bank numbering, which sits in the chart account
  // NAMES and had drifted away from the codes. Five of nine banks resolved to a different
  // bank's ledger, so a receipt banked into Al-Falah was recorded against AL-HABIB.
  //
  // `bankAccounts` is optional only so a caller without the list still gets the old
  // behaviour rather than nothing; every caller in the app passes it.
  bankCodeToAccount: (chartOfAccounts, bankAccountId, bankAccounts = null) => {
    const bank = (bankAccounts || []).find(b => b.account_id === bankAccountId);
    const code = bank?.account_code
      || (() => {
        const m = bankAccountId?.match(/^BANK-(\d+)$/);
        return m ? '11-05-001-' + m[1].padStart(6, '0') : null;
      })();
    if (!code) return null;
    return (chartOfAccounts || []).find(a => a.account_code === code) || null;
  },

  // Self-heal: every bank account needs a matching ledger (chart_of_accounts) row under
  // the bank group 11-05-001 so debits/credits have somewhere to post. If the seed data
  // is missing it, create it on demand and return it. Returns null only if the bank's
  // account_id isn't the expected BANK-<n> shape.
  ensureBankLedgerAccount: async (bank, companyId = 1) => {
    // Prefer the stored link; fall back to the id's digits only for a row that predates
    // the account_code column.
    const m = bank?.account_id?.match(/^BANK-(\d+)$/);
    const code = bank?.account_code || (m ? '11-05-001-' + m[1].padStart(6, '0') : null);
    if (!code) return null;
    const { data: existing } = await supabase
      .from('chart_of_accounts').select('*')
      .eq('account_code', code).eq('company_id', companyId).maybeSingle();
    if (existing) return existing;
    const { data: created, error } = await supabase.from('chart_of_accounts').insert([{
      account_id: `AUTO-${code}-C${companyId}`,
      account_code: code,
      account_name: bank.account_title || `${bank.bank_name} - ${bank.account_no}`,
      account_type: 'Asset',
      parent_code: '11-05-001',
      balance: bank.balance || 0,
      company_id: companyId,
    }]).select().single();
    if (error) return null;
    return created;
  },

  // Generic self-heal for any ledger account (cash pockets, AR/AP control accounts, etc.):
  // find by account_code+company, create it if missing, return the row.
  ensureLedgerAccount: async ({ code, name, type = 'Asset', parent = null, companyId = 1 }) => {
    const { data: existing } = await supabase
      .from('chart_of_accounts').select('*')
      .eq('account_code', code).eq('company_id', companyId).maybeSingle();
    if (existing) return existing;
    const { data: created } = await supabase.from('chart_of_accounts').insert([{
      account_id: `AUTO-${code}-C${companyId}`,
      account_code: code,
      account_name: name,
      account_type: type,
      parent_code: parent,
      balance: 0,
      company_id: companyId,
    }]).select().single();
    return created;
  },

  // A customer's side of a sale or a receipt belongs on that customer's OWN sub-ledger
  // account (11-01-003-*), not on the shared Accounts Receivable control account.
  // Both customer reports read the sub-ledgers — customer_ledger_entries selects
  // `account_code like '11-01-003-%'` and customer_ledger_balances aggregates the same —
  // so anything posted to the control account is invisible in the Customer Ledger and
  // absent from the customer's balance, however correct the totals look elsewhere.
  //
  // Resolves by customer row when the caller has one, otherwise by name (invoices carry
  // only customer_name). Returns `fallback` — the control account — when the customer has
  // no code of their own, so a brand-new customer never blocks a posting; run
  // server/backfill-customer-account-codes.js to give those customers a code.
  customerLedgerAccount: async ({ customer = null, customerName = null, companyId = 1, fallback = null }) => {
    let row = customer;
    if (!row?.account_code && customerName) {
      const { data } = await supabase
        .from('customers').select('name, account_code')
        .eq('company_id', companyId).eq('name', customerName)
        .not('account_code', 'is', null).limit(1);
      row = data?.[0] || null;
    }
    if (!row?.account_code) return fallback;
    // A handful of customers carry a code whose chart row was never imported; create it
    // on demand rather than silently dropping the entry into the control account.
    const account = await financeDb.ensureLedgerAccount({
      code: row.account_code,
      name: row.name || customerName || row.account_code,
      type: 'Asset',
      parent: '11-01-003',
      companyId,
    });
    return account || fallback;
  },

  // Posts a Payment (PV) or Receipt (RV) voucher as a balanced double entry.
  //   Receipt (money IN):  pockets DEBIT, parties CREDIT  (each party shown by name)
  //   Payment (money OUT): parties DEBIT, pockets CREDIT
  // One voucher can settle several parties at once (a customer paying against three
  // invoices, one cash withdrawal paying five vendors): each party gets its own leg.
  // Each party leg posts to a control account (AR for customers, AP for vendors) but is
  // *displayed* under the party's name so per-party reports match by account_name.
  //
  // The money side is a list too, because a payment run does not always come out of one
  // account: three vendors settled from the HBL account and two from Meezan is one
  // decision and one voucher, and forcing it into two vouchers made the screen slower to
  // use and the run harder to read back. Each pocket gets its own leg carrying its own
  // subtotal, so the entry balances however many accounts it spans.
  //
  // parties: [{ controlAccount, name, amount, narration? }, ...]
  // pockets: [{ account, amount }, ...]  — one per distinct cash/bank account
  addPaymentReceipt: async ({ type, date, pockets, parties, narration, companyId }) => {
    const isReceipt = type === 'Receipt';
    const voucherId = (isReceipt ? 'RV-' : 'PV-') + String(Date.now()).slice(-6);
    const total = parties.reduce((s, p) => s + p.amount, 0);
    const pocketTotal = pockets.reduce((s, p) => s + p.amount, 0);

    // A voucher whose two sides disagree is a corrupt ledger, not a validation message.
    // Rounding on the party side is the realistic way this goes wrong, so the guard is a
    // tolerance rather than an equality test.
    if (Math.abs(pocketTotal - total) > 0.005) {
      throw new Error(
        `Entry does not balance: parties total ${total.toFixed(2)}, accounts total ${pocketTotal.toFixed(2)}.`,
      );
    }

    const partyLegs = parties.map(p => ({
      account: p.controlAccount,
      debit:  isReceipt ? 0 : p.amount,
      credit: isReceipt ? p.amount : 0,
      displayName: p.name,
      narration: p.narration || null,
    }));
    const pocketLegs = pockets.map(p => ({
      account: p.account,
      debit:  isReceipt ? p.amount : 0,
      credit: isReceipt ? 0 : p.amount,
    }));

    // Cash side first on a receipt, last on a payment — keeps the ledger reading
    // debit-before-credit either way.
    const legs = isReceipt ? [...pocketLegs, ...partyLegs] : [...partyLegs, ...pocketLegs];

    const verb = isReceipt ? 'Received from' : 'Paid to';
    const summary = parties.length === 1
      ? `${verb} ${parties[0].name}`
      : `${verb} ${parties.length} parties`;

    await financeDb.postJournalEntry({
      voucherId, voucherType: type, date, companyId, legs,
      narration: narration || summary,
      // A single-party voucher keeps the party name as its reference (existing
      // behaviour); a multi-party one has no single party to name, so the legs group
      // under the voucher id instead.
      reference: parties.length === 1 ? parties[0].name : voucherId,
    });
    return { voucherId, total };
  },

  // Posts a multi-leg double-entry journal: writes each leg to `vouchers` (so it shows
  // up in the Vouchers ledger) and `voucher_lines` (so it's included in per-account
  // reports like Daily Cash), then applies the balance updates via applyVoucherToBalances.
  // `vouchers.voucher_id` has a UNIQUE constraint, so each leg gets its own
  // `${voucherId}-N` id (voucher_lines mirrors it so the daily_cash_summary join still
  // matches); `reference` ties the legs together for display/grouping.
  // legs: [{ account, debit, credit }, ...]
  // Each leg: { account, debit, credit, displayName? }. `displayName` overrides the name
  // shown on the voucher/ledger row (e.g. show the customer's name on the party leg even
  // though the balance posts to an Accounts-Receivable control account) — this is what
  // lets the Customer Balance report match receipts to a customer by account_name.
  postJournalEntry: async ({ voucherId, voucherType, date, companyId, legs, narration, reference }) => {
    // Build all rows up front, then fire the writes together instead of one-at-a-time.
    // Each leg targets a different account, so the balance updates don't conflict.
    const voucherRows = [];
    const lineRows = [];
    legs.forEach((leg, idx) => {
      const legVoucherId = `${voucherId}-${idx + 1}`;
      const shownName = leg.displayName || leg.account.account_name;
      const legNarration = leg.narration || narration;   // per-line narration if provided
      voucherRows.push({
        voucher_id: legVoucherId, voucher_type: voucherType, date,
        account_name: shownName, debit: leg.debit, credit: leg.credit,
        narration: legNarration, reference, company_id: companyId,
      });
      lineRows.push({
        voucher_id: legVoucherId, line_no: 1,
        account_code: leg.account.account_code, account_title: shownName,
        debit: leg.debit, credit: leg.credit, narration: legNarration, company_id: companyId,
      });
    });
    await Promise.all([
      supabase.from('vouchers').insert(voucherRows),
      supabase.from('voucher_lines').insert(lineRows),
      ...legs.map(leg => financeDb.applyVoucherToBalances(leg.account, leg.debit, leg.credit)),
    ]);
  },

  getBankAccounts: (companyId = 1) =>
    supabase.from('bank_accounts').select('*').eq('company_id', companyId),

  deleteBankAccount: (id) =>
    supabase.from('bank_accounts').delete().eq('id', id),

  getCashReceived: () =>
    supabase.from('cash_received').select('*').order('date', { ascending: false }),

  getReceiptVouchers: (companyId = 1) =>
    supabase.from('vouchers')
      .select('id, voucher_id, voucher_type, date, account_name, debit, credit, narration, reference, company_id')
      .in('voucher_type', ['Receipt', 'BankRec'])
      .eq('company_id', companyId)
      .order('date', { ascending: false }),

  addCashReceived: async (cr, { depositAccount, ledgerAccount, companyId }) => {
    const voucherId = 'CR-' + String(Date.now()).slice(-6);
    await financeDb.postJournalEntry({
      voucherId, voucherType: 'Receipt', date: cr.date, companyId,
      legs: [
        { account: depositAccount, debit: cr.amount, credit: 0 },
        { account: ledgerAccount, debit: 0, credit: cr.amount },
      ],
      narration: cr.narration || `Cash receipt from ${cr.party_name}`,
      reference: cr.cr_id,
    });
    return supabase.from('cash_received').insert([cr]).select().single();
  },

  getInterBankTransfers: () =>
    supabase.from('inter_bank_transfers').select('*').order('date', { ascending: false }),

  // Real inter-bank transfer = a Contra entry between two of the company's own banks.
  // To account is DEBITED (money in), From account is CREDITED (money out), equal amount.
  // We insert the summary row FIRST so a schema/constraint problem fails cleanly BEFORE
  // any balances move (no partial posts). The journal voucher id is the ibt_id itself,
  // so the entry can be reversed precisely on delete.
  addInterBankTransfer: async (ibt, { fromAccount, toAccount, companyId }) => {
    const { data, error } = await supabase.from('inter_bank_transfers').insert([ibt]).select().single();
    if (error) return { error };

    await financeDb.postJournalEntry({
      voucherId: ibt.ibt_id, voucherType: 'Contra', date: ibt.date, companyId,
      legs: [
        { account: toAccount, debit: ibt.amount, credit: 0 },
        { account: fromAccount, debit: 0, credit: ibt.amount },
      ],
      narration: ibt.narration || `Transfer: ${ibt.from_account} -> ${ibt.to_account}`,
      reference: ibt.ibt_id,
    });
    return { data };
  },

  // Reverses an inter-bank transfer: unwinds both banks' balances (read back from
  // voucher_lines so we don't depend on what was stored on the summary row), removes
  // the journal legs, then deletes the summary row.
  // Company-scoped like the other two. An ibtId carries its own number so the blast
  // radius was never the shop's whole ledger, but nothing should delete voucher rows
  // on an id pattern alone.
  deleteInterBankTransfer: async (ibtId, companyId = 1) => {
    const { data: lines } = await supabase
      .from('voucher_lines').select('account_code, debit, credit')
      .eq('company_id', companyId)
      .like('voucher_id', `${ibtId}-%`);
    await Promise.all((lines || []).map(async (l) => {
      const { data: acct } = await supabase
        .from('chart_of_accounts').select('*')
        .eq('account_code', l.account_code).eq('company_id', companyId).maybeSingle();
      if (acct) await financeDb.applyVoucherToBalances(acct, -(l.debit || 0), -(l.credit || 0));
    }));
    await Promise.all([
      supabase.from('voucher_lines').delete().eq('company_id', companyId).like('voucher_id', `${ibtId}-%`),
      supabase.from('vouchers').delete().eq('company_id', companyId).eq('reference', ibtId),
      supabase.from('inter_bank_transfers').delete().eq('ibt_id', ibtId),
    ]);
    return { error: null };
  },

  getPettyCash: () =>
    supabase.from('petty_cash').select('*').order('date', { ascending: false }),

  getPettyCashLines: (pcId) =>
    supabase.from('petty_cash_lines').select('*').eq('pc_id', pcId).order('line_no'),

  // Lines for a set of entries, so the list can show what each entry was charged to
  // without a query per row. Chunked like the other bulk readers to stay inside
  // Supabase's URL length limit.
  getPettyCashLinesBulk: async (pcIds = []) => {
    const ids = [...new Set((pcIds || []).filter(Boolean))];
    if (ids.length === 0) return { data: [], error: null };
    const CHUNK = 150;
    const all = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase
        .from('petty_cash_lines')
        .select('pc_id, line_no, expense_account_id, account_name, amount')
        .in('pc_id', ids.slice(i, i + CHUNK))
        .order('line_no');
      if (error) return { data: null, error };
      all.push(...(data || []));
    }
    return { data: all, error: null };
  },

  // One payment, split across one or more expense heads. `lines` is
  // [{ account, amount }] — the voucher debits each head for its own share and
  // credits the source once for the total, so the entry balances however many
  // heads it touches.
  //
  // The voucher is posted before the row is written, as it always was. A failure
  // there throws and no petty_cash row appears, which is the safe way round: an
  // entry that never reached the ledger is worse than one that was never recorded.
  addPettyCash: async (pc, { sourceAccount, lines, companyId }) => {
    const splits = (lines || []).filter(l => l.account && (parseFloat(l.amount) || 0) > 0);
    if (splits.length === 0) throw new Error('A petty cash entry needs at least one expense account with an amount.');

    // Trust the split, not the caller's total: the credit leg has to equal the sum of
    // the debits exactly or the voucher posts lopsided.
    const total = splits.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const voucherId = 'PC-' + String(Date.now()).slice(-6);
    await financeDb.postJournalEntry({
      voucherId, voucherType: 'Payment', date: pc.date, companyId,
      legs: [
        ...splits.map(l => ({ account: l.account, debit: parseFloat(l.amount) || 0, credit: 0 })),
        { account: sourceAccount, debit: 0, credit: total },
      ],
      narration: pc.description,
      reference: pc.pc_id,
    });

    const { data, error } = await supabase
      .from('petty_cash')
      .insert([{
        ...pc,
        amount: total,
        // Kept in step with the split's first head so anything still reading this
        // single column off the parent row reads one of the entry's real accounts.
        expense_account_id: splits[0].account.account_id,
      }])
      .select()
      .single();
    if (error) return { data, error };

    const { error: lineError } = await supabase.from('petty_cash_lines').insert(
      splits.map((l, i) => ({
        pc_id:              pc.pc_id,
        line_no:            i + 1,
        expense_account_id: l.account.account_id,
        account_name:       l.account.account_name,
        amount:             parseFloat(l.amount) || 0,
        company_id:         companyId,
      })),
    );
    return { data, error: null, lineError: lineError || null };
  },

  getDailyCash: (companyId = 1) =>
    supabase.from('daily_cash_summary').select('*').eq('company_id', companyId).order('date', { ascending: false }).limit(180),

  getChequeTracking: () =>
    supabase.from('cheque_tracking').select('*').order('due_date'),

  addCheque: (c) =>
    supabase.from('cheque_tracking').insert([{ ...c, status: 'pending' }]).select().single(),

  markChequeBounced: (id) =>
    supabase.from('cheque_tracking').update({ status: 'bounced' }).eq('id', id).select().single(),

  // Clearing a customer cheque (received, now deposited) debits the bank and credits
  // the customer's ledger account (reducing the receivable). Clearing a vendor cheque
  // (issued, now cashed) debits the vendor's ledger account (reducing the payable) and
  // credits the bank.
  clearCheque: async (cheque, { bankAccount, ledgerAccount, companyId }) => {
    const voucherId = 'CHQ-' + String(Date.now()).slice(-6);
    const narration = `Cheque ${cheque.cheque_no} cleared - ${cheque.party_name}`;
    const legs = cheque.party_type === 'Vendor'
      ? [
        { account: ledgerAccount, debit: cheque.amount, credit: 0 },
        { account: bankAccount, debit: 0, credit: cheque.amount },
      ]
      : [
        { account: bankAccount, debit: cheque.amount, credit: 0 },
        { account: ledgerAccount, debit: 0, credit: cheque.amount },
      ];
    await financeDb.postJournalEntry({ voucherId, voucherType: 'BankRec', date: cheque.due_date, companyId, legs, narration, reference: cheque.cheque_no });
    return supabase.from('cheque_tracking').update({ status: 'cleared' }).eq('id', cheque.id).select().single();
  },

  getAgingReport: (companyId = 1) =>
    supabase.from('aging_report_computed').select('*').eq('company_id', companyId).order('total', { ascending: false }),

  getPaymentReconciliation: () =>
    supabase.from('payment_reconciliation').select('*').order('payment_date', { ascending: false }),

  // Paged so the full account list (≈1800) survives Supabase's 1000-row cap —
  // otherwise accounts past the first 1000 (many banks included) go missing
  // from the ledger's account selector.
  getVoucherAccounts: async () => {
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('distinct_voucher_accounts')
        .select('account_name')
        .order('account_name')
        .range(from, from + PAGE - 1);
      if (error) return { data: null, error };
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return { data: all, error: null };
  },

  // Paged so busy accounts (e.g. CASH SALES has ~8,800 vouchers) return their
  // complete history — a single request would stop at 1000 rows and the running
  // balance would be wrong.
  // companyId is required: account names repeat across branches (both have a
  // "Cash in Hand"), so without it a ledger silently mixes Shop #41 and Shop #58.
  // Paging one-at-a-time meant nine of the ten requests for a 9,000-row account were
  // spent discovering there was more to come. Asking for the exact count alongside the
  // first page says up front how many remain, so they go out together: 4.7s to 1.5s.
  getVouchersByAccount: async (accountName, fromDate, toDate, companyId = 1) => {
    const PAGE = 1000;
    const page = (from, withCount) => {
      let q = supabase.from('vouchers')
        .select('id, voucher_id, voucher_type, date, narration, debit, credit, reference',
                withCount ? { count: 'exact' } : undefined)
        .eq('account_name', accountName)
        .eq('company_id', companyId)
        .order('date').order('id')
        .range(from, from + PAGE - 1);
      if (fromDate) q = q.gte('date', fromDate);
      if (toDate) q = q.lte('date', toDate);
      return q;
    };

    const { data: first, error, count } = await page(0, true);
    if (error) return { data: null, error };
    const all = [...(first || [])];
    if (count == null || count <= PAGE) return { data: all, error: null };

    const offsets = [];
    for (let from = PAGE; from < count; from += PAGE) offsets.push(from);
    const rest = await mapPool(offsets, (from) => page(from, false));
    for (const r of rest) {
      if (r.error) return { data: null, error: r.error };
      all.push(...(r.data || []));
    }
    return { data: all, error: null };
  },

  // Every movement against one customer's sub-ledger account — sales, receipts,
  // cheques, payments, journals, returns. The Customer Ledger was built from
  // sales_invoices alone and so could only ever show bills; this is what makes the
  // receipts and cheques visible, and the running balance correct.
  // Paged: a busy account runs to ~20,000 lines and a single request stops at 1,000.
  getCustomerLedgerEntries: async (accountCode, fromDate, toDate, companyId = 1) => {
    if (!accountCode) return { data: [], error: null };
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('customer_ledger_entries')
        .select('voucher_id, line_no, date, voucher_type, particulars, debit, credit')
        .eq('company_id', companyId)
        .eq('account_code', accountCode)
        .order('date').order('voucher_id').order('line_no')
        .range(from, from + PAGE - 1);
      if (fromDate) q = q.gte('date', fromDate);
      if (toDate)   q = q.lte('date', toDate);
      const { data, error } = await q;
      if (error) return { data: null, error };
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return { data: all, error: null };
  },

  // Every posting against a vendor, from their own sub-ledger account under Trade
  // Creditors. Reads vendor_ledger_entries (see server/migrate-vendor-ledger-entries-view).
  //
  // The report used to read the `vouchers` header and match on account_name. No imported
  // purchase voucher carries the vendor there — the header names the expense account
  // ("Good Purchase", "Labour Charges") — so a vendor's bills never appeared and the
  // running balance was built from payments alone.
  //
  // Selected by account_title: vendors has no account_code column, and the title is the
  // vendor name the report already picks from.
  // Paged, for the same reason the customer one is.
  getVendorLedgerEntries: async (vendorName, fromDate, toDate, companyId = 1) => {
    if (!vendorName) return { data: [], error: null };
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('vendor_ledger_entries')
        .select('voucher_id, line_no, date, voucher_type, particulars, reference, debit, credit')
        .eq('company_id', companyId)
        .eq('account_title', vendorName)
        .order('date').order('voucher_id').order('line_no')
        .range(from, from + PAGE - 1);
      if (fromDate) q = q.gte('date', fromDate);
      if (toDate)   q = q.lte('date', toDate);
      const { data, error } = await q;
      if (error) return { data: null, error };
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return { data: all, error: null };
  },

  // The vendor names that have ledger movement, for the report's picker. Reads the
  // pre-grouped vendor_ledger_vendors view — 278 rows rather than the 10,517 lines behind
  // them. De-duplicating in the browser instead meant fetching the whole ledger, and a
  // request stops at 1,000 rows however high a limit is asked for, so the picker silently
  // showed only the vendors falling in that first page.
  getVendorLedgerNames: async (companyId = 1) => {
    const { data, error } = await supabase.from('vendor_ledger_vendors')
      .select('account_title').eq('company_id', companyId);
    if (error) return { data: null, error };
    return { data: (data || []).map(r => r.account_title).filter(Boolean), error: null };
  },

  // Each customer's real position, summed from the ledger rather than inferred from
  // invoices. Reads the customer_ledger_balances view, which aggregates the
  // 11-01-003-* sub-ledger accounts in Postgres — summing the raw lines in the browser
  // meant 49 sequential requests and 48,521 rows for Shop #41, during which the report
  // displayed the stale invoice figure. Returns a { [account_code]: balance } map.
  getCustomerLedgerBalances: async (companyId = 1) => {
    const { data, error } = await supabase.from('customer_ledger_balances')
      .select('account_code, balance')
      .eq('company_id', companyId);
    if (error) return { data: null, error };
    const totals = {};
    (data || []).forEach(r => { totals[r.account_code] = parseFloat(r.balance) || 0; });
    return { data: totals, error: null };
  },

  // "Dasti" — money moved by hand, outside the customer and vendor ledgers. The parties
  // live under 11-01-006 "Loans and Other Receivables": committee and hawala holders,
  // contractors, staff lent cash personally. They are neither customers (11-01-003) nor
  // vendors (14-01-001), so the Customer and Vendor Balance reports cannot see them —
  // 31 live positions worth 16.0M receivable and 15.5M payable, with no report of their
  // own and no way to record a new one.
  DASTI_GROUP: '11-01-006',

  // Every dasti account that is a party, i.e. not the 11-01-006-000000 group header —
  // that row heads the group and is never somewhere money goes, the same reason the
  // cash header is left out of the "Paid From" list (see utils/paymentSources).
  dastiPartyAccounts: (chartOfAccounts = []) =>
    (chartOfAccounts || [])
      .filter(a => a.account_code?.startsWith(financeDb.DASTI_GROUP + '-')
                && !a.account_code.endsWith('-000000'))
      .sort((a, b) => (a.account_name || '').localeCompare(b.account_name || '')),

  // Each dasti party's position, summed from voucher_lines.
  //
  // Deliberately NOT read from chart_of_accounts.balance. That column disagrees with the
  // ledger for these accounts — it holds credit-minus-debit where an 11-* asset is
  // debit-normal, so Anjum Butt reads +5,800,000 (owed TO the shop) when the 41 lines
  // behind him say the shop owes HIM that amount. The lines are internally consistent
  // and their narrations agree with them ("cheque paid to…" debits, "cash received
  // from…" credits), so the ledger is the truth here. The Customer and Vendor balance
  // reports are ledger-derived for the same reason.
  //
  // Only ~1,400 lines across the whole group, so one paged read and a client-side
  // aggregate is enough — no Postgres view to migrate before the report works.
  //
  // balance is debit - credit, the normal side for an asset:
  //   > 0  the party owes the shop   (receivable — cash went out by hand)
  //   < 0  the shop owes the party   (payable — they are holding our money)
  getDastiBalances: async (companyId = 1) => {
    const PAGE = 1000;
    const lines = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('voucher_lines')
        .select('voucher_id, account_code, account_title, debit, credit')
        .eq('company_id', companyId)
        .like('account_code', `${financeDb.DASTI_GROUP}-%`)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) return { data: null, error };
      lines.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    // voucher_lines carries no date — it lives on the voucher header — so the headers
    // are fetched by id to date each party's last movement. Chunked because the id list
    // runs past what one .in() can carry.
    const voucherIds = [...new Set(lines.map(l => l.voucher_id).filter(Boolean))];
    const { data: headers, error: headerError } = voucherIds.length
      ? await inChunks(voucherIds, (slice) => supabase.from('vouchers')
          .select('voucher_id, date')
          .eq('company_id', companyId)
          .in('voucher_id', slice))
      : { data: [], error: null };
    if (headerError) return { data: null, error: headerError };
    const dateOf = new Map((headers || []).map(h => [h.voucher_id, h.date]));

    const byAccount = new Map();
    lines.forEach(l => {
      const row = byAccount.get(l.account_code) || {
        account_code: l.account_code, account_title: l.account_title,
        paid_out: 0, received: 0, txn_count: 0, last_txn_date: null,
      };
      row.paid_out += parseFloat(l.debit)  || 0;
      row.received += parseFloat(l.credit) || 0;
      row.txn_count += 1;
      const date = dateOf.get(l.voucher_id);
      if (date && (!row.last_txn_date || date > row.last_txn_date)) row.last_txn_date = date;
      byAccount.set(l.account_code, row);
    });

    return {
      data: [...byAccount.values()].map(r => ({ ...r, balance: r.paid_out - r.received })),
      error: null,
    };
  },

  // Parties that trade in both directions — we sell to them and buy from them. Returns
  // one row per linked party with the receivable and payable sides kept separate, plus
  // the net for information. The two sides are NOT merged in the ledger: a receivable is
  // an asset and a payable a liability, and offsetting them would understate both.
  // Keyed by party_id, and also by lower-cased name so the customer and vendor reports
  // can flag a row without carrying the id around. See server/migrate-party-links.js.
  getPartyPositions: async (companyId = 1) => {
    const { data, error } = await supabase.from('party_positions')
      .select('party_id, name, receivable, payable, net_position, txn_count')
      .eq('company_id', companyId);
    if (error) return { data: null, error };
    const rows = (data || []).map(r => ({
      party_id:     r.party_id,
      name:         r.name,
      receivable:   parseFloat(r.receivable)   || 0,
      payable:      parseFloat(r.payable)      || 0,
      net_position: parseFloat(r.net_position) || 0,
      txn_count:    Number(r.txn_count)        || 0,
    }));
    const byId = {}, byName = {};
    rows.forEach(r => {
      byId[r.party_id] = r;
      byName[(r.name || '').trim().toLowerCase()] = r;
    });
    return { data: { rows, byId, byName }, error: null };
  },

  // The real free-text remark for a set of vouchers. vouchers.narration is a
  // placeholder from the source system — the literal word "Remarks" on most sales
  // vouchers, a voucher-type label on the rest — while the note the user actually
  // typed sits on the line records. Returns one row per line so the caller can pick
  // the line matching the account being viewed.
  getVoucherLineNarrations: async (voucherIds = [], companyId = 1) => {
    const ids = [...new Set((voucherIds || []).filter(Boolean))];
    if (ids.length === 0) return { data: [], error: null };
    return inChunks(ids, (slice) => supabase.from('voucher_lines')
      .select('voucher_id, line_no, account_code, account_title, narration, debit, credit')
      .eq('company_id', companyId)
      .in('voucher_id', slice)
      .order('line_no'));
  },
};

// ── INVENTORY ─────────────────────────────────────────────────────────────

export const inventoryDb = {
  getStockItems: (companyId = 1) =>
    supabase.from('stock_items')
      .select('id, item_code, item_name, category, gauge, current_stock, reorder_level, warehouse, batch_no, status, unit, company_id')
      .eq('company_id', companyId)
      .order('item_code'),

  updateStockItem: (id, updates) =>
    supabase.from('stock_items').update(updates).eq('id', id).select().single(),

  // Receive GRN line items into stock: add the received quantity to each item's
  // current stock and place it in the given warehouse (one warehouse per item).
  // Creates the stock row if the item isn't tracked yet. Matched by item code.
  receiveIntoStock: async (lineItems = [], warehouse = null, companyId = 1) => {
    const today = new Date().toISOString().slice(0, 10);
    let updated = 0;
    for (const it of lineItems) {
      const code = it.product_code || it.item_code;
      const qty  = Number(it.received_qty) || 0;
      if (!code || qty <= 0) continue;

      const { data: existing, error: findErr } = await supabase
        .from('stock_items').select('id, current_stock')
        .eq('item_code', code).maybeSingle();
      if (findErr) return { data: null, error: findErr };

      if (existing) {
        const update = { current_stock: (Number(existing.current_stock) || 0) + qty, last_updated: today };
        if (warehouse) update.warehouse = warehouse;
        const { error } = await supabase.from('stock_items').update(update).eq('id', existing.id);
        if (error) return { data: null, error };
      } else {
        const { error } = await supabase.from('stock_items').insert([{
          item_code: code,
          item_name: it.product_name || it.item_name || code,
          current_stock: qty,
          reorder_level: 0,
          warehouse: warehouse || null,
          unit: it.unit || null,
          status: 'normal',
          company_id: companyId,
          last_updated: today,
        }]);
        if (error) return { data: null, error };
      }
      updated += 1;
    }
    return { data: { updated }, error: null };
  },

  getBatches: () =>
    supabase.from('batches').select('*').order('received_date', { ascending: false }),

  getInwardRecords: () =>
    supabase.from('inward_records')
      .select('id, item_type, item_name, gauge, size, weight, rate, length, description, quantity_received, warehouse, batch_no, received_date, received_by, status')
      .order('received_date', { ascending: false }),

  addInwardRecord: (record) =>
    supabase.from('inward_records').insert([record]).select().single(),

  // Custom item types — per-company, user-managed
  getCustomItemTypes: (companyId) =>
    supabase.from('custom_item_types')
      .select('id, name, company_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true }),

  addCustomItemType: (companyId, name) =>
    supabase.from('custom_item_types')
      .insert([{ company_id: companyId, name }])
      .select()
      .single(),

  deleteCustomItemType: (id) =>
    supabase.from('custom_item_types').delete().eq('id', id),
};

// ── SALES ─────────────────────────────────────────────────────────────────

export const salesDb = {
  // Scoped to the selected branch, like every other list in the app. Without the
  // filter both shops saw one merged pool of customers, so switching branch
  // changed the orders and invoices on screen but not the customers they were for.
  getCustomers: (companyId = 1) =>
    supabase.from('customers')
      // account_code links the customer to their sub-ledger account, which is where
      // the Customer Current Balance report reads the real position from. Leaving it
      // out of this list silently falls the report back to invoice totals.
      // party_id is set where this customer is also a vendor, so the balance report can
      // flag the row instead of the same person reading as two unrelated accounts.
      .select('id, customer_id, name, cnic, ntn, region, status, contact, address, credit_limit, outstanding_balance, opening_balance, opening_balance_date, account_code, party_id')
      .eq('company_id', companyId)
      .order('id', { ascending: false }),

  searchCustomers: (query, companyId = 1) =>
    supabase.from('customers')
      .select('id, customer_id, name, cnic, ntn, region, status, contact, credit_limit, outstanding_balance')
      .eq('company_id', companyId)
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(10),

  getCustomerInvoices: (customerName) =>
    supabase.from('invoices')
      .select('invoice_id, invoice_date, invoice_type, subtotal, tax_amount, total_value, fbr_status, fiscal_invoice_number')
      .ilike('customer_name', customerName)
      .order('invoice_date', { ascending: false })
      .limit(50),

  getCustomerOrders: (customerId) =>
    supabase.from('sales_orders')
      .select('so_id, order_date, delivery_date, total_amount, item_count, status')
      .eq('customer_id', customerId)
      .order('order_date', { ascending: false })
      .limit(50),

  getCustomerPayments: (customerName) =>
    supabase.from('vouchers')
      .select('id, voucher_id, voucher_type, date, narration, debit, credit, reference')
      .ilike('account_name', `%${customerName}%`)
      .order('date', { ascending: false })
      .limit(50),

  // Every customer needs a sub-ledger account of their own (11-01-003-*): it is what the
  // Customer Ledger and Customer Balance reports read. A customer without one has their
  // sales fall back to the shared Accounts Receivable control account, where neither
  // report can find them. The imported customers arrived with a code; one created here is
  // given the next free number in the range, and the matching chart row is created with it.
  nextCustomerAccountCode: async (companyId = 1) => {
    const { data } = await supabase
      .from('chart_of_accounts').select('account_code')
      .eq('company_id', companyId).like('account_code', '11-01-003-%')
      .order('account_code', { ascending: false }).limit(1);
    const last = parseInt(String(data?.[0]?.account_code || '').slice(-6), 10) || 0;
    return `11-01-003-${String(last + 1).padStart(6, '0')}`;
  },

  addCustomer: async (c) => {
    if (c.account_code) return supabase.from('customers').insert([c]).select().single();
    const companyId = c.company_id ?? 1;
    const account_code = await salesDb.nextCustomerAccountCode(companyId);
    await financeDb.ensureLedgerAccount({
      code: account_code, name: c.name, type: 'Asset', parent: '11-01-003', companyId,
    });
    return supabase.from('customers').insert([{ ...c, account_code }]).select().single();
  },

  // Posts a customer's brought-forward balance as a real double entry:
  //   Customer sub-ledger    DEBIT   amount   (shown under the customer's name)
  //   Opening Balance Equity CREDIT  amount
  //
  // Storing the figure on the customer row alone would leave it invisible to the
  // ledger, the trial balance and the income statement, and it would be silently
  // dropped the moment the customer's first invoice was raised. Posting it makes
  // it behave like every other balance in the system.
  //
  // A negative amount means the customer is in credit (paid in advance), so the
  // legs swap.
  postCustomerOpeningBalance: async ({ customerName, amount, date, companyId }) => {
    const value = parseFloat(amount) || 0;
    if (value === 0) return { voucherId: null };

    const [arAccount, equityAccount] = await Promise.all([
      financeDb.ensureLedgerAccount({
        code: '11-03-001-000001', name: 'Accounts Receivable',
        type: 'Asset', parent: '11-03-001', companyId,
      }),
      // Four-segment code so it can't collide with the three-segment codes the
      // New Account screen generates under the same 13-01 equity group.
      financeDb.ensureLedgerAccount({
        code: '13-01-001-000001', name: 'Opening Balance Equity',
        type: 'Equity', parent: '13-01-001', companyId,
      }),
    ]);
    if (!arAccount || !equityAccount) {
      throw new Error('Could not resolve the ledger accounts for the opening balance.');
    }

    // The customer's own sub-ledger, so the brought-forward figure is the first line of
    // their ledger rather than an invisible entry on the control account.
    const customerAccount = await financeDb.customerLedgerAccount({
      customerName, companyId, fallback: arAccount,
    });

    const magnitude = Math.abs(value);
    const voucherId = 'OB-' + String(Date.now()).slice(-6);
    await financeDb.postJournalEntry({
      voucherId,
      voucherType: 'Opening',
      date,
      companyId,
      legs: value > 0
        ? [
          { account: customerAccount, debit: magnitude, credit: 0, displayName: customerName },
          { account: equityAccount, debit: 0, credit: magnitude },
        ]
        : [
          { account: equityAccount,   debit: magnitude, credit: 0 },
          { account: customerAccount, debit: 0, credit: magnitude, displayName: customerName },
        ],
      narration: `Opening balance — ${customerName}`,
      reference: customerName,
    });
    return { voucherId };
  },

  deleteCustomer: (id) =>
    supabase.from('customers').delete().eq('id', id),

  getSalesOrders: (companyId = 1) =>
    supabase.from('sales_orders')
      .select('id, so_id, customer_name, customer_id, order_date, delivery_date, total_amount, item_count, status, company_id')
      .eq('company_id', companyId)
      .order('order_date', { ascending: false }),

  addSalesOrder: (so) =>
    supabase.from('sales_orders').insert([so]).select().single(),

  deleteSalesOrder: async (id, soId) => {
    await Promise.all([
      supabase.from('order_confirmations').delete().eq('so_ref', soId),
      supabase.from('work_orders').delete().eq('so_ref', soId),
      supabase.from('delivery_notes').delete().eq('so_ref', soId),
      supabase.from('gate_passes').delete().eq('so_ref', soId),
      supabase.from('sales_invoices').delete().eq('so_ref', soId),
    ]);
    return supabase.from('sales_orders').delete().eq('id', id);
  },

  updateSalesOrderStatus: (id, status) =>
    supabase.from('sales_orders').update({ status }).eq('id', id).select().single(),

  getDeliveryNotes: (companyId = 1) =>
    supabase.from('delivery_notes').select('*').eq('company_id', companyId).order('delivery_date', { ascending: false }),

  addDeliveryNote: (dn) =>
    supabase.from('delivery_notes').insert([dn]).select().single(),

  getOrderConfirmations: () =>
    supabase.from('order_confirmations').select('*').order('confirm_date', { ascending: false }),

  addOrderConfirmation: (oc) =>
    supabase.from('order_confirmations').insert([oc]).select().single(),

  getWorkOrders: () =>
    supabase.from('work_orders').select('*').order('work_order_date', { ascending: false }),

  addWorkOrder: (wo) =>
    supabase.from('work_orders').insert([wo]).select().single(),

  updateWorkOrderStatus: (id, status) =>
    supabase.from('work_orders').update({ status }).eq('id', id).select().single(),

  getGatePasses: (companyId = 1) =>
    supabase.from('gate_passes').select('*').eq('company_id', companyId).order('date', { ascending: false }),

  addGatePass: (gp) =>
    supabase.from('gate_passes').insert([gp]).select().single(),

  getSalesInvoices: (companyId = 1) =>
    supabase.from('sales_invoices')
      .select('*')
      .eq('company_id', companyId)
      .order('date', { ascending: false }),

  // Maps sales-invoice ids to the order they were raised from — the hop a ledger row makes
  // on its way to its item detail.
  //
  // Fetched by id rather than by listing every invoice. sales_invoices holds 19,217 rows
  // and an unpaged select is capped at 1,000 by Supabase, so the full list reached back
  // only to Jul-2025: every ledger row older than that found no invoice, and its Item and
  // Gauge/Size/Weight columns came out empty. Asking for the ids actually referenced
  // returns all of them however old they are, and moves less data doing it.
  getSalesOrderRefs: async (invoiceIds = []) => {
    const ids = [...new Set((invoiceIds || []).filter(Boolean))];
    if (ids.length === 0) return { data: [], error: null };
    return inChunks(ids, (slice) => supabase.from('sales_invoices')
      .select('sale_inv_id, so_ref')
      .in('sale_inv_id', slice));
  },

  // Sold-item detail for a set of sales orders (so_line_items.so_id == invoice.so_ref).
  // item_name carries the size (e.g. 'GI,2.50MM X 48"'); unit_price is the rate.
  // Chunked to stay within Supabase's URL length limit when a customer has many orders.
  getSoLineItems: async (soRefs = []) => {
    const refs = [...new Set((soRefs || []).filter(Boolean))];
    if (refs.length === 0) return { data: [], error: null };
    return inChunks(refs, (slice) => supabase.from('so_line_items')
      .select('so_id, line_no, item_name, unit, gauge, size, quantity, unit_price, total_price, coils_rolls, no_of_sheets')
      .in('so_id', slice));
  },

  // The parts of a printed sale bill that the invoice row does not itself carry: the
  // customer's address for the Bill To box, and the PO number agreed at order
  // confirmation. Both are looked up on demand rather than joined into the invoice list —
  // that list is 19,000 rows and only ever one of them is printed at a time.
  //
  // Neither lookup is essential to the document, so a failure returns what it has and the
  // corresponding line prints blank instead of the print failing outright.
  getInvoicePrintContext: async ({ customerName, soRef, companyId = 1 }) => {
    const [cust, conf] = await Promise.all([
      customerName
        ? supabase.from('customers').select('address').eq('name', customerName)
            .eq('company_id', companyId).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      soRef
        ? supabase.from('order_confirmations').select('po_no, confirm_date')
            .eq('so_ref', soRef).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      customerAddress: cust?.data?.address || '',
      poNo: conf?.data?.po_no || '',
      poDate: conf?.data?.confirm_date || '',
    };
  },

  // Sold-item detail for a new order. `company_id` must be set explicitly on every row:
  // the column defaults to 1 in the DB, so an omitted branch silently files the line
  // under Shop #41 and it disappears from the branch that actually raised the order.
  addSoLineItems: (items) =>
    supabase.from('so_line_items').insert(items).select(),

  addSalesInvoice: (inv) =>
    supabase.from('sales_invoices').insert([inv]).select().single(),

  // Correcting a bill after it was raised. Keyed on the integer id rather than
  // sale_inv_id to match deleteSalesInvoice, and deliberately narrow in practice:
  // the only field the UI edits this way is manual_bill_no, the number off the
  // physical bill book, which is often not to hand at the moment of dispatch.
  updateSalesInvoice: (id, updates) =>
    supabase.from('sales_invoices').update(updates).eq('id', id).select().single(),

  // What a dispatched invoice actually billed. Copied from the order's
  // so_line_items at dispatch so the invoice keeps the sold detail even if the
  // order is later edited, and so a multi-item order no longer collapses into a
  // bare subtotal on the invoice.
  addSalesInvoiceItems: (items) =>
    supabase.from('sales_invoice_items').insert(items).select(),

  getSalesInvoiceItems: (saleInvId) =>
    supabase.from('sales_invoice_items')
      .select('*').eq('sale_inv_id', saleInvId).order('line_no'),

  // What a sales voucher says in the ledger's Narration column.
  //
  // The Book # belongs in it. It is the number written in the physical bill book and it
  // is what the office quotes when checking a bill against the ledger, but it lived only
  // on sales_invoices — the ledger reads vouchers/voucher_lines, so it could never
  // appear there however carefully it was entered.
  //
  // Shared with updateSalesInvoiceVoucherNarration so a Book # filled in after dispatch
  // rewrites the line to exactly what posting it up front would have written.
  salesVoucherNarration: (invoice) => {
    const base = `Sales invoice ${invoice.sale_inv_id} — ${invoice.customer_name}`;
    const book = String(invoice.manual_bill_no ?? '').trim();
    return book ? `${base} (Book # ${book})` : base;
  },

  // Rewrites the narration on an already-posted sales voucher.
  //
  // The Book # is usually not to hand at dispatch and is filled in afterwards from the
  // Invoicing list. That wrote to sales_invoices alone, so the bill printed its Book #
  // while the ledger — posted at dispatch, when the field was still blank — never showed
  // it. Both the voucher rows and their lines are rewritten: the ledger prefers the line
  // narration and falls back to the voucher's, and the customer ledger view coalesces the
  // two, so leaving either behind leaves the old text on screen.
  updateSalesInvoiceVoucherNarration: async ({ saleInvId, narration, companyId = 1 }) => {
    const [{ error: vErr }, { error: lErr }] = await Promise.all([
      supabase.from('vouchers').update({ narration })
        .eq('reference', saleInvId).eq('company_id', companyId),
      // postJournalEntry gives each leg its own `${voucherId}-N` id and no reference of
      // its own, so the legs are found by that prefix.
      supabase.from('voucher_lines').update({ narration })
        .like('voucher_id', `${saleInvId}-%`).eq('company_id', companyId),
    ]);
    return { error: vErr || lErr || null };
  },

  // Posts a sales invoice to the ledger as a balanced double entry:
  //   Accounts Receivable  DEBIT   grand_total   (shown under the customer's name)
  //   Goods Sales          CREDIT  subtotal
  //   <charge> (Income)    CREDIT  each non-zero charge
  //
  // Without this a dispatched invoice only ever touched the sales tables, so nothing
  // reached `vouchers`/`voucher_lines` and no account balance moved — the invoice looked
  // "posted" while the ledger and the customer's balance stayed empty.
  //
  // The account codes below are the real ones already in the chart of accounts. Any that
  // a branch is missing get created on demand by ensureLedgerAccount, which is what makes
  // this work in a branch whose chart was never fully imported.
  postSalesInvoiceVoucher: async ({ invoice, companyId }) => {
    const grandTotal = parseFloat(invoice.grand_total) || 0;
    const subtotal   = parseFloat(invoice.subtotal) || 0;
    if (grandTotal <= 0) return { voucherId: null };

    const CHARGE_ACCOUNTS = [
      { field: 'freight',           code: '10-02-002-000001', name: 'Freight Charges (Income)' },
      { field: 'loading_unloading', code: '10-02-002-000002', name: 'Loading Unloading Charges (Income)' },
      { field: 'packing',           code: '10-02-002-000003', name: 'Packing Charges' },
      { field: 'toll_tax',          code: '10-02-002-000004', name: 'Toll Tax Charges (Income)' },
      { field: 'other_charges',     code: '10-02-002-000005', name: 'Other Charges (Income)' },
      { field: 'slitting',          code: '10-02-002-000006', name: 'Slitting Charges (Income)' },
      { field: 'cutting',           code: '10-02-002-000007', name: 'Cutting Charges (Income)' },
      { field: 'labour',            code: '10-02-002-000008', name: 'Labour Charges (Income)' },
      { field: 'bending',           code: '10-02-002-000009', name: 'Bending & Chanelling Charges (Income)' },
    ];

    // Output sales tax is money collected for the revenue authority, not earnings, so it
    // credits the tax creditor rather than an income account.
    const gstAmount = parseFloat(invoice.gst_amount) || 0;

    const creditParts = [
      { code: '10-01-001-000001', name: 'Goods Sales', parent: '10-01-001', amount: subtotal },
      ...CHARGE_ACCOUNTS
        .map(c => ({ ...c, parent: '10-02-002', amount: parseFloat(invoice[c.field]) || 0 }))
        .filter(c => c.amount > 0),
      ...(gstAmount > 0
        ? [{ code: '14-01-003-000001', name: 'Taxes', parent: '14-01-003', type: 'Liability', amount: gstAmount }]
        : []),
    ];

    // Anything in grand_total that the named parts don't account for (an ad-hoc charge,
    // a rounding difference) goes to Other Charges so the entry always balances rather
    // than silently posting lopsided.
    const namedTotal = creditParts.reduce((s, p) => s + p.amount, 0);
    const remainder  = grandTotal - namedTotal;
    if (Math.abs(remainder) > 0.005) {
      creditParts.push({ code: '10-02-002-000005', name: 'Other Charges (Income)', parent: '10-02-002', amount: remainder });
    }

    const [arAccount, ...creditAccounts] = await Promise.all([
      financeDb.ensureLedgerAccount({ code: '11-03-001-000001', name: 'Accounts Receivable', type: 'Asset', parent: '11-03-001', companyId }),
      ...creditParts.map(p => financeDb.ensureLedgerAccount({ code: p.code, name: p.name, type: p.type || 'Income', parent: p.parent, companyId })),
    ]);
    if (!arAccount || creditAccounts.some(a => !a)) {
      throw new Error('Could not resolve the ledger accounts for this invoice.');
    }

    // The debit belongs on the customer's own sub-ledger account, which is what the
    // Customer Ledger and Customer Balance reports read; arAccount is only the fallback
    // for a customer who has no code yet.
    const customerAccount = await financeDb.customerLedgerAccount({
      customerName: invoice.customer_name, companyId, fallback: arAccount,
    });

    const voucherId = invoice.sale_inv_id;
    await financeDb.postJournalEntry({
      voucherId,
      voucherType: 'Sales',
      date: invoice.date,
      companyId,
      legs: [
        { account: customerAccount, debit: grandTotal, credit: 0, displayName: invoice.customer_name },
        ...creditAccounts.map((account, i) => ({ account, debit: 0, credit: creditParts[i].amount })),
      ],
      narration: salesDb.salesVoucherNarration(invoice),
      reference: voucherId,
    });
    return { voucherId };
  },

  getSalesReturns: (companyId = 1) =>
    supabase.from('sales_returns').select('*').eq('company_id', companyId).order('return_date', { ascending: false }),

  deleteSalesInvoice: (id) =>
    supabase.from('sales_invoices').delete().eq('id', id),
};

// ── PROCUREMENT ───────────────────────────────────────────────────────────

export const procurementDb = {
  getVendors: (companyId = 1) =>
    supabase.from('vendors').select('*').eq('company_id', companyId).order('name'),

  // Vendor purchases / payments / outstanding payable, derived from the ledger
  // (voucher_lines). See server/migrate-vendor-balances.js.
  getVendorBalances: (companyId = 1) =>
    supabase.from('vendor_balances')
      .select('*')
      .eq('company_id', companyId)
      .order('total_purchases', { ascending: false }),

  addVendor: (v) =>
    supabase.from('vendors').insert([v]).select().single(),

  updateVendor: (id, updates) =>
    supabase.from('vendors').update(updates).eq('id', id).select().single(),

  deleteVendor: (id) =>
    supabase.from('vendors').delete().eq('id', id),

  getPdns: (companyId = 1) =>
    supabase.from('pdns').select('*').eq('company_id', companyId).order('pdn_date', { ascending: false }),

  addPdn: (pdn) =>
    supabase.from('pdns').insert([pdn]).select().single(),

  addPdnLineItems: (lineItems) =>
    supabase.from('pdn_line_items').insert(lineItems).select(),

  getPdnLineItems: (pdnId) =>
    supabase.from('pdn_line_items').select('*').eq('pdn_id', pdnId).order('id'),

  // Line items for many PDNs at once (chunked to stay under URL limits) — used to
  // show the requested item names against each PDN/PR row in the pipeline lists.
  getPdnLineItemsBulk: async (pdnIds = []) => {
    const ids = [...new Set((pdnIds || []).filter(Boolean))];
    if (ids.length === 0) return { data: [], error: null };
    const CHUNK = 150;
    const all = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase.from('pdn_line_items')
        .select('pdn_id, item_name, quantity, unit')
        .in('pdn_id', ids.slice(i, i + CHUNK));
      if (error) return { data: null, error };
      if (data) all.push(...data);
    }
    return { data: all, error: null };
  },

  // Full downstream cascade: PDN → PR → PO → Gate Pass → GRN → Purchase Invoice.
  // Caller passes the linked IDs it already holds in local state (most reliable);
  // we still run pdn_ref/po_ref sweeps as a safety net for anything created elsewhere.
  deletePdn: async (id, pdnId, refs = {}) => {
    const { prIds = [], poIds = [], gpIds = [], grnIds = [], billIds = [] } = refs;

    // No DB foreign keys force an order here, so fire every child delete at once.
    const ops = [
      supabase.from('purchase_requisitions').delete().eq('pdn_ref', pdnId),
      supabase.from('pdn_line_items').delete().eq('pdn_id', pdnId),
    ];
    if (billIds.length) ops.push(supabase.from('purchase_invoices').delete().in('bill_id', billIds));
    if (grnIds.length) {
      ops.push(supabase.from('grn_line_items').delete().in('grn_id', grnIds));
      ops.push(supabase.from('grns').delete().in('grn_id', grnIds));
    }
    if (gpIds.length) ops.push(supabase.from('gate_passes_inward').delete().in('gp_id', gpIds));
    if (poIds.length) {
      ops.push(supabase.from('purchase_invoices').delete().in('po_ref', poIds));
      ops.push(supabase.from('grns').delete().in('po_ref', poIds));
      ops.push(supabase.from('gate_passes_inward').delete().in('po_ref', poIds));
      ops.push(supabase.from('po_line_items').delete().in('po_id', poIds));
      ops.push(supabase.from('purchase_orders').delete().in('po_id', poIds));
    }
    if (prIds.length) {
      ops.push(supabase.from('purchase_orders').delete().in('pr_ref', prIds));
      ops.push(supabase.from('pr_line_items').delete().in('pr_id', prIds));
      ops.push(supabase.from('purchase_requisitions').delete().in('pr_id', prIds));
    }
    await Promise.all(ops);

    // Finally remove the PDN header itself.
    const { error } = await supabase.from('pdns').delete().eq('id', id);
    return { error };
  },

  updatePurchaseRequisitionStatus: (prId, status) =>
    supabase.from('purchase_requisitions').update({ status }).eq('pr_id', prId),

  updatePurchaseOrderStatus: (poId, status) =>
    supabase.from('purchase_orders').update({ status }).eq('po_id', poId),

  getPurchaseRequisitions: () =>
    supabase.from('purchase_requisitions').select('*').order('date', { ascending: false }),

  addPurchaseRequisition: (pr) =>
    supabase.from('purchase_requisitions').insert([pr]).select().single(),

  addPrLineItems: (items) =>
    supabase.from('pr_line_items').insert(items).select(),

  // Paged so all 2,512 orders survive Supabase's 1,000-row cap. Unpaged, the list stopped
  // at the newest 1,000 — which reached back only to 2018, so the purchase-bill picker
  // could offer 122 of the 310 orders still open, and the Procurement listing showed a
  // truncated history without saying so.
  getPurchaseOrders: async (companyId = 1) => {
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('purchase_orders')
        .select('id, po_id, vendor_name, po_date, delivery_due_date, item_count, total_amount, status, company_id, pr_ref')
        .eq('company_id', companyId)
        .order('po_date', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) return { data: null, error };
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return { data: all, error: null };
  },

  addPurchaseOrder: (po) =>
    supabase.from('purchase_orders').insert([po]).select().single(),

  addPoLineItems: (items) =>
    supabase.from('po_line_items').insert(items).select(),

  getPoLineItems: (poId) =>
    supabase.from('po_line_items')
      .select('*').eq('po_id', poId).order('line_no'),

  getGatePassesInward: (companyId = 1) =>
    supabase.from('gate_passes_inward').select('*').eq('company_id', companyId).order('gate_date', { ascending: false }),

  addGatePassInward: (gp) =>
    supabase.from('gate_passes_inward').insert([gp]).select().single(),

  // Paged for the same reason as getPurchaseOrders: 15 of the 20 goods receipts still
  // waiting to be billed are from 2016-17, so the newest 1,000 rows contained only 5 of
  // them and the bill screen's GRN picker looked almost empty.
  getGrns: async (companyId = 1) => {
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('grns')
        .select('*')
        .eq('company_id', companyId)
        .order('received_date', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) return { data: null, error };
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return { data: all, error: null };
  },

  addGrn: (grn) =>
    supabase.from('grns').insert([grn]).select().single(),

  addGrnLineItems: (items) =>
    supabase.from('grn_line_items').insert(items).select(),

  getGrnLineItems: (grnId) =>
    supabase.from('grn_line_items')
      .select('*').eq('grn_id', grnId).order('line_no'),

  getPurchaseInvoices: (companyId = 1) =>
    supabase.from('purchase_invoices').select('*').eq('company_id', companyId).order('bill_date', { ascending: false }),

  addPurchaseInvoice: (pinv) =>
    supabase.from('purchase_invoices').insert([pinv]).select().single(),

  addPurchaseInvoiceItems: (items) =>
    supabase.from('purchase_invoice_items').insert(items).select(),

  // Posts a vendor bill to the ledger as a balanced double entry — the mirror of
  // postSalesInvoiceVoucher on the sales side:
  //   Purchases         DEBIT   items_total
  //   Sales Tax (ST)    DEBIT   tax_amount     (input tax, only when charged)
  //   Accounts Payable  CREDIT  grand_total    (shown under the vendor's name)
  //
  // Without this a recorded bill only ever touched `purchase_invoices`, so nothing
  // reached `vouchers`/`voucher_lines`. The vendor ledger showed payments going out
  // with no record of the purchases they were paying for, and every vendor balance
  // drifted further negative with each payment.
  //
  // The account codes below are the real ones already in the chart of accounts.
  postPurchaseInvoiceVoucher: async ({ invoice, companyId }) => {
    const grandTotal = parseFloat(invoice.grand_total) || 0;
    const itemsTotal = parseFloat(invoice.items_total) || 0;
    const taxAmount  = parseFloat(invoice.tax_amount)  || 0;
    if (grandTotal <= 0) return { voucherId: null };

    const debitParts = [
      { code: '12-01-001-000000', name: 'Purchases',     parent: '12-01-001', amount: itemsTotal },
      { code: '12-06-003-000001', name: 'Sales Tax (ST)', parent: '12-06-003', amount: taxAmount },
    ].filter(p => p.amount > 0);

    // Anything in grand_total the named parts don't account for (an ad-hoc charge,
    // a rounding difference) goes to Charges On Purchase so the entry always
    // balances rather than silently posting lopsided.
    const namedTotal = debitParts.reduce((s, p) => s + p.amount, 0);
    const remainder  = grandTotal - namedTotal;
    if (Math.abs(remainder) > 0.005) {
      debitParts.push({ code: '12-01-030-000000', name: 'Charges On Purchase', parent: '12-01-030', amount: remainder });
    }

    // 14-01-001-000000 "Trade Creditors" is the control account that heads the 206
    // per-vendor accounts under 14-01-001-*, so it is the AP analogue of
    // 11-03-001-000001 on the receivable side. Do NOT use 14-01-001-000001 — that
    // is a real supplier (BASHIR PIPE INDUSTRY), and posting every vendor's bills
    // there would corrupt that one supplier's balance.
    const [apAccount, ...debitAccounts] = await Promise.all([
      financeDb.ensureLedgerAccount({ code: '14-01-001-000000', name: 'Trade Creditors', type: 'Liability', parent: '14-01-001', companyId }),
      ...debitParts.map(p => financeDb.ensureLedgerAccount({ code: p.code, name: p.name, type: 'Expense', parent: p.parent, companyId })),
    ]);
    if (!apAccount || debitAccounts.some(a => !a)) {
      throw new Error('Could not resolve the ledger accounts for this bill.');
    }

    const voucherId = invoice.bill_id;
    await financeDb.postJournalEntry({
      voucherId,
      voucherType: 'Purchase',
      date: invoice.bill_date,
      companyId,
      legs: [
        ...debitAccounts.map((account, i) => ({ account, debit: debitParts[i].amount, credit: 0 })),
        { account: apAccount, debit: 0, credit: grandTotal, displayName: invoice.vendor_name },
      ],
      narration: `Purchase invoice ${voucherId} — ${invoice.vendor_name}`,
      reference: voucherId,
    });
    return { voucherId };
  },

  getPurchaseInvoiceItems: (billId) =>
    supabase.from('purchase_invoice_items')
      .select('*').eq('bill_id', billId).order('line_no'),

  // Billed items for a set of bills, so the vendor ledger can show what each
  // Purchase voucher was actually for. Chunked to stay within Supabase's URL
  // length limit when a vendor has many bills.
  getPurchaseInvoiceItemsBulk: async (billIds = []) => {
    const ids = [...new Set((billIds || []).filter(Boolean))];
    if (ids.length === 0) return { data: [], error: null };
    const CHUNK = 150;
    const all = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase.from('purchase_invoice_items')
        .select('bill_id, line_no, item_name, unit, gauge, size, quantity, unit_price, total_price')
        .in('bill_id', ids.slice(i, i + CHUNK));
      if (error) return { data: null, error };
      if (data) all.push(...data);
    }
    return { data: all, error: null };
  },

  // Received goods for a set of GRNs — what the imported purchase history has instead of
  // bill items. An imported PI voucher carries no bill reference at all; it names its GRN
  // inside the line narration ("Vendor Charged,GRN:GRN-26-05-0001,PO:PO-26-05-0001"), and
  // that GRN is the only route from an old purchase voucher to what was actually bought.
  //
  // grn_line_items stores the id with the prefix doubled ("GRN-GRN-26-05-0001") while the
  // narration writes it once, so both spellings are queried.
  getGrnLineItemsBulk: async (grnIds = [], companyId = 1) => {
    const ids = [...new Set((grnIds || []).filter(Boolean))];
    if (ids.length === 0) return { data: [], error: null };
    const both = ids.flatMap(id => (id.startsWith('GRN-GRN-') ? [id] : [id, `GRN-${id}`]));
    const CHUNK = 150;
    const all = [];
    for (let i = 0; i < both.length; i += CHUNK) {
      const { data, error } = await supabase.from('grn_line_items')
        .select('grn_id, line_no, item_name, unit, gauge, size, quantity, unit_price, total_price')
        .eq('company_id', companyId)
        .in('grn_id', both.slice(i, i + CHUNK));
      if (error) return { data: null, error };
      if (data) all.push(...data);
    }
    return { data: all, error: null };
  },

  getPurchaseReturns: () =>
    supabase.from('purchase_returns').select('*').order('return_date', { ascending: false }),

  getVendorInvoiceMatching: () =>
    supabase.from('vendor_invoice_matching').select('*'),
};

// ── PRODUCTION ────────────────────────────────────────────────────────────

export const productionDb = {
  getBoms: () =>
    supabase.from('boms').select('*').order('bom_id'),

  getBomLineItems: (bomId) =>
    supabase.from('bom_line_items').select('*').eq('bom_id', bomId),

  getProductionSchedules: () =>
    supabase.from('production_schedules').select('*').order('planned_date', { ascending: false }),

  getWorkOrders: () =>
    supabase.from('production_work_orders').select('*').order('start_date', { ascending: false }),

  addWorkOrder: (wo) =>
    supabase.from('production_work_orders').insert([wo]).select().single(),

  getFinishedGoods: () =>
    supabase.from('finished_goods').select('*').order('production_date', { ascending: false }),
};

// ── INVOICING / FBR ───────────────────────────────────────────────────────

export const invoicingDb = {
  getInvoices: () =>
    supabase.from('invoices').select('*').order('invoice_date', { ascending: false }),

  addInvoice: (inv) =>
    supabase.from('invoices').insert([inv]).select().single(),

  // Itemised detail for an FBR invoice. These rows are what gets sent to AJK-IRD
  // as the Items array — without them the server falls back to a single synthetic
  // "Steel Products" line, which is not what was actually sold.
  addInvoiceItems: (items) =>
    supabase.from('invoice_items').insert(items).select(),

  getInvoiceItems: (invoiceId) =>
    supabase.from('invoice_items')
      .select('*').eq('invoice_id', invoiceId).order('line_no'),

  updateInvoiceFbrStatus: (invoiceId, status, submittedAt, fiscalInvoiceNumber = null) =>
    supabase.from('invoices').update({
      fbr_status: status,
      fbr_submitted_at: submittedAt,
      ...(fiscalInvoiceNumber ? { fiscal_invoice_number: fiscalInvoiceNumber } : {}),
    }).eq('invoice_id', invoiceId),

  getSaleReturnInvoices: () =>
    supabase.from('sale_return_invoices').select('*').order('date', { ascending: false }),

  getFbrLog: () =>
    supabase.from('fbr_submission_log').select('*').order('attempted_at', { ascending: false }),

  deleteFbrInvoice: (invoiceId) =>
    supabase.from('invoices').delete().eq('invoice_id', invoiceId),
};

// ── MASTERS ───────────────────────────────────────────────────────────────

export const mastersDb = {
  getCompany: () =>
    supabase.from('companies').select('*').eq('id', 1).single(),

  getDepartments: () =>
    supabase.from('departments').select('*').order('name'),

  getWarehouses: () =>
    supabase.from('warehouses').select('*').order('name'),

  getUnits: () =>
    supabase.from('units').select('*').order('label'),

  getProductCatalogue: () =>
    supabase.from('product_catalogue').select('*').order('code'),

  getCustomCatalogueItems: () =>
    supabase.from('product_catalogue').select('*').like('code', 'CUSTOM-%').order('id', { ascending: false }),

  addProductCatalogueItem: (item) =>
    supabase.from('product_catalogue').insert([item]).select().single(),

  deleteProductCatalogueItem: (id) =>
    supabase.from('product_catalogue').delete().eq('id', id),

  getFiscalYears: () =>
    supabase.from('fiscal_years').select('*').order('start_date', { ascending: false }),

  // A year is named for the July it starts in, so the label and the end date follow from
  // the start and are derived here rather than typed by an admin.
  addFiscalYear: (startYear) =>
    supabase.from('fiscal_years').insert([{
      label: `F-${startYear}-${startYear + 1}`,
      start_date: `${startYear}-07-01`,
      end_date: `${startYear + 1}-06-30`,
      is_active: false,
    }]).select().single(),

  // Exactly one year carries the active flag: it is what a fresh browser opens on, before
  // anyone has made a choice of their own.
  setActiveFiscalYear: async (id) => {
    const { error: clearErr } = await supabase
      .from('fiscal_years').update({ is_active: false }).neq('id', id);
    if (clearErr) return { data: null, error: clearErr };
    return supabase.from('fiscal_years').update({ is_active: true }).eq('id', id).select().single();
  },

  deleteFiscalYear: (id) =>
    supabase.from('fiscal_years').delete().eq('id', id),

  // Employee sections — the places staff are posted to, and what the salary sheet groups
  // and tabs by. Editable from Settings so opening a new shop does not need a deploy.
  // Ordered by sort_order, which is the order the salary sheet lays its blocks out in —
  // the office reads it by standing (shop, workshop, mosque, house), not alphabetically.
  // `name` breaks a tie so the list can never come back in an unstable order.
  getEmployeeSections: () =>
    supabase.from('employee_sections').select('*').order('sort_order', { nullsFirst: false }).order('name'),

  // New sections land at the end, where Settings can move them up.
  addEmployeeSection: async (name) => {
    const { data: last } = await supabase
      .from('employee_sections').select('sort_order')
      .order('sort_order', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const sort_order = (last?.sort_order || 0) + 1;
    return supabase.from('employee_sections').insert([{ name, sort_order }]).select().single();
  },


  deleteEmployeeSection: (id) =>
    supabase.from('employee_sections').delete().eq('id', id),

  // Removing a section must not orphan the staff standing in it — they would drop into the
  // sheet's "Admins" block. Counted before the delete so the UI can refuse with a reason.
  countEmployeesInSection: (name) =>
    supabase.from('employees').select('employee_id', { count: 'exact', head: true }).eq('section', name),

  // The single admin_profile row. `maybeSingle` so a database that has not had the table
  // seeded yet returns null instead of erroring the whole Settings page.
  getAdminProfile: () =>
    supabase.from('admin_profile').select('*').eq('id', 1).maybeSingle(),

  updateAdminProfile: (patch) =>
    supabase.from('admin_profile')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 1).select().single(),
};

// ── AUDIT LOG ─────────────────────────────────────────────────────────────

export const auditDb = {
  getLog: (limit = 20) =>
    supabase.from('audit_log').select('*').order('timestamp', { ascending: false }).limit(limit),

  addEntry: (action, module, userName = 'Admin') =>
    supabase.from('audit_log').insert([{ action, module, user_name: userName }]),
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────

export const dashboardDb = {
  getEmployeeCount: () =>
    supabase.from('employees').select('id').eq('status', 'active'),

  getRecentActivity: () =>
    supabase.from('audit_log')
      .select('id, action, module, user_name, timestamp')
      .order('timestamp', { ascending: false })
      .limit(8),
};
