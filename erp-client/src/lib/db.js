// Central DB query layer — all Supabase queries go here.
// Every function returns { data, error } from Supabase.
import { supabase } from './supabase';

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

  // Resilient update: if the late_rate/late_amount columns haven't been added yet
  // (optional migration), retry without them. The late deduction still persists via
  // total_deductions + net_salary, which always exist.
  updatePayroll: async (payrollId, updates) => {
    let res = await supabase.from('payroll_records').update(updates).eq('payroll_id', payrollId).select().single();
    if (res.error && /late_rate|late_amount/i.test(res.error.message || '')) {
      const { late_rate, late_amount, ...rest } = updates;
      res = await supabase.from('payroll_records').update(rest).eq('payroll_id', payrollId).select().single();
    }
    return res;
  },

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

  getLoans: () =>
    supabase.from('loans').select('*').order('employee_name'),

  addLoan: (loan) =>
    supabase.from('loans').insert([loan]).select().single(),

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
    const { data: oldLines } = await supabase
      .from('voucher_lines').select('account_code, debit, credit')
      .like('voucher_id', `${groupId}-%`);
    await Promise.all((oldLines || []).map(async (l) => {
      const { data: acct } = await supabase
        .from('chart_of_accounts').select('*')
        .eq('account_code', l.account_code).eq('company_id', companyId).maybeSingle();
      if (acct) await financeDb.applyVoucherToBalances(acct, -(l.debit || 0), -(l.credit || 0));
    }));
    // 2. Remove the old rows.
    await Promise.all([
      supabase.from('voucher_lines').delete().like('voucher_id', `${groupId}-%`),
      supabase.from('vouchers').delete().like('voucher_id', `${groupId}-%`),
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
  deleteVoucherGroup: async (groupId, companyId = 1) => {
    const { data: lines } = await supabase
      .from('voucher_lines').select('account_code, debit, credit')
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
      supabase.from('voucher_lines').delete().like('voucher_id', `${groupId}-%`),
      supabase.from('inter_bank_transfers').delete().eq('ibt_id', groupId),
      supabase.from('vouchers').delete().like('voucher_id', `${groupId}-%`),
    ]);
    return { error: null };
  },

  // Applies a voucher's debit/credit to the matching chart-of-accounts balance
  // (and the linked bank account's balance, if the account is a bank account).
  // Pass negative debit/credit to reverse a deleted voucher's effect.
  applyVoucherToBalances: async (account, debit, credit) => {
    if (!account) return;
    const prefix = account.account_code?.slice(0, 2);
    const isCreditNormal = ['10', '13', '14'].includes(prefix); // Income, Owner Equity, Liability
    const delta = isCreditNormal ? (credit - debit) : (debit - credit);
    await supabase.from('chart_of_accounts')
      .update({ balance: (account.balance || 0) + delta })
      .eq('account_id', account.account_id);

    const bankMatch = account.account_code?.match(/^11-05-001-0*(\d+)$/);
    if (bankMatch) {
      const bankAccountId = `BANK-${bankMatch[1]}`;
      const { data: bank } = await supabase.from('bank_accounts').select('balance').eq('account_id', bankAccountId).single();
      if (bank) {
        await supabase.from('bank_accounts')
          .update({ balance: (bank.balance || 0) + (debit - credit) })
          .eq('account_id', bankAccountId);
      }
    }
  },

  // Maps a bank_accounts.account_id (e.g. "BANK-37") to its linked chart_of_accounts row
  // (account_code "11-05-001-000037") — inverse of the regex in applyVoucherToBalances.
  bankCodeToAccount: (chartOfAccounts, bankAccountId) => {
    const m = bankAccountId?.match(/^BANK-(\d+)$/);
    if (!m) return null;
    const code = '11-05-001-' + m[1].padStart(6, '0');
    return chartOfAccounts.find(a => a.account_code === code) || null;
  },

  // Self-heal: every bank account needs a matching ledger (chart_of_accounts) row under
  // the bank group 11-05-001 so debits/credits have somewhere to post. If the seed data
  // is missing it, create it on demand and return it. Returns null only if the bank's
  // account_id isn't the expected BANK-<n> shape.
  ensureBankLedgerAccount: async (bank, companyId = 1) => {
    const m = bank?.account_id?.match(/^BANK-(\d+)$/);
    if (!m) return null;
    const code = '11-05-001-' + m[1].padStart(6, '0');
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
  //   Receipt (money IN):  pocket DEBIT, parties CREDIT  (each party shown by name)
  //   Payment (money OUT): parties DEBIT, pocket CREDIT
  // One voucher can settle several parties at once (a customer paying against three
  // invoices, one cash withdrawal paying five vendors): each party gets its own leg, and
  // the single cash/bank leg carries their total so the entry still balances.
  // Each party leg posts to a control account (AR for customers, AP for vendors) but is
  // *displayed* under the party's name so per-party reports match by account_name.
  // parties: [{ controlAccount, name, amount, narration? }, ...]
  addPaymentReceipt: async ({ type, date, pocketAccount, parties, narration, companyId }) => {
    const isReceipt = type === 'Receipt';
    const voucherId = (isReceipt ? 'RV-' : 'PV-') + String(Date.now()).slice(-6);
    const total = parties.reduce((s, p) => s + p.amount, 0);

    const partyLegs = parties.map(p => ({
      account: p.controlAccount,
      debit:  isReceipt ? 0 : p.amount,
      credit: isReceipt ? p.amount : 0,
      displayName: p.name,
      narration: p.narration || null,
    }));
    const pocketLeg = {
      account: pocketAccount,
      debit:  isReceipt ? total : 0,
      credit: isReceipt ? 0 : total,
    };

    // Cash side first on a receipt, last on a payment — keeps the ledger reading
    // debit-before-credit either way.
    const legs = isReceipt ? [pocketLeg, ...partyLegs] : [...partyLegs, pocketLeg];

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
  deleteInterBankTransfer: async (ibtId, companyId = 1) => {
    const { data: lines } = await supabase
      .from('voucher_lines').select('account_code, debit, credit')
      .like('voucher_id', `${ibtId}-%`);
    await Promise.all((lines || []).map(async (l) => {
      const { data: acct } = await supabase
        .from('chart_of_accounts').select('*')
        .eq('account_code', l.account_code).eq('company_id', companyId).maybeSingle();
      if (acct) await financeDb.applyVoucherToBalances(acct, -(l.debit || 0), -(l.credit || 0));
    }));
    await Promise.all([
      supabase.from('voucher_lines').delete().like('voucher_id', `${ibtId}-%`),
      supabase.from('vouchers').delete().eq('reference', ibtId),
      supabase.from('inter_bank_transfers').delete().eq('ibt_id', ibtId),
    ]);
    return { error: null };
  },

  getPettyCash: () =>
    supabase.from('petty_cash').select('*').order('date', { ascending: false }),

  addPettyCash: async (pc, { sourceAccount, expenseAccount, companyId }) => {
    const voucherId = 'PC-' + String(Date.now()).slice(-6);
    await financeDb.postJournalEntry({
      voucherId, voucherType: 'Payment', date: pc.date, companyId,
      legs: [
        { account: expenseAccount, debit: pc.amount, credit: 0 },
        { account: sourceAccount, debit: 0, credit: pc.amount },
      ],
      narration: pc.description,
      reference: pc.pc_id,
    });
    return supabase.from('petty_cash').insert([pc]).select().single();
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
  getVouchersByAccount: async (accountName, fromDate, toDate, companyId = 1) => {
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('vouchers')
        .select('id, voucher_id, voucher_type, date, narration, debit, credit, reference')
        .eq('account_name', accountName)
        .eq('company_id', companyId)
        .order('date').order('id')
        .range(from, from + PAGE - 1);
      if (fromDate) q = q.gte('date', fromDate);
      if (toDate) q = q.lte('date', toDate);
      const { data, error } = await q;
      if (error) return { data: null, error };
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
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

  // The real free-text remark for a set of vouchers. vouchers.narration is a
  // placeholder from the source system — the literal word "Remarks" on most sales
  // vouchers, a voucher-type label on the rest — while the note the user actually
  // typed sits on the line records. Returns one row per line so the caller can pick
  // the line matching the account being viewed.
  getVoucherLineNarrations: async (voucherIds = [], companyId = 1) => {
    const ids = [...new Set((voucherIds || []).filter(Boolean))];
    if (ids.length === 0) return { data: [], error: null };
    const CHUNK = 150;
    const all = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase.from('voucher_lines')
        .select('voucher_id, line_no, account_code, account_title, narration, debit, credit')
        .eq('company_id', companyId)
        .in('voucher_id', ids.slice(i, i + CHUNK))
        .order('line_no');
      if (error) return { data: null, error };
      if (data) all.push(...data);
    }
    return { data: all, error: null };
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
      .select('id, customer_id, name, cnic, ntn, region, status, contact, address, credit_limit, outstanding_balance, opening_balance, opening_balance_date, account_code')
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
    const CHUNK = 150;
    const all = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase.from('sales_invoices')
        .select('sale_inv_id, so_ref')
        .in('sale_inv_id', ids.slice(i, i + CHUNK));
      if (error) return { data: null, error };
      if (data) all.push(...data);
    }
    return { data: all, error: null };
  },

  // Sold-item detail for a set of sales orders (so_line_items.so_id == invoice.so_ref).
  // item_name carries the size (e.g. 'GI,2.50MM X 48"'); unit_price is the rate.
  // Chunked to stay within Supabase's URL length limit when a customer has many orders.
  getSoLineItems: async (soRefs = []) => {
    const refs = [...new Set((soRefs || []).filter(Boolean))];
    if (refs.length === 0) return { data: [], error: null };
    const CHUNK = 150;
    const all = [];
    for (let i = 0; i < refs.length; i += CHUNK) {
      const { data, error } = await supabase.from('so_line_items')
        .select('so_id, line_no, item_name, unit, gauge, size, quantity, unit_price, total_price')
        .in('so_id', refs.slice(i, i + CHUNK));
      if (error) return { data: null, error };
      if (data) all.push(...data);
    }
    return { data: all, error: null };
  },

  // Sold-item detail for a new order. `company_id` must be set explicitly on every row:
  // the column defaults to 1 in the DB, so an omitted branch silently files the line
  // under Shop #41 and it disappears from the branch that actually raised the order.
  addSoLineItems: (items) =>
    supabase.from('so_line_items').insert(items).select(),

  addSalesInvoice: (inv) =>
    supabase.from('sales_invoices').insert([inv]).select().single(),

  // What a dispatched invoice actually billed. Copied from the order's
  // so_line_items at dispatch so the invoice keeps the sold detail even if the
  // order is later edited, and so a multi-item order no longer collapses into a
  // bare subtotal on the invoice.
  addSalesInvoiceItems: (items) =>
    supabase.from('sales_invoice_items').insert(items).select(),

  getSalesInvoiceItems: (saleInvId) =>
    supabase.from('sales_invoice_items')
      .select('*').eq('sale_inv_id', saleInvId).order('line_no'),

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
      { field: 'slitting',          code: '10-02-002-000006', name: 'Slitting Charges (Income)' },
    ];

    const creditParts = [
      { code: '10-01-001-000001', name: 'Goods Sales', parent: '10-01-001', amount: subtotal },
      ...CHARGE_ACCOUNTS
        .map(c => ({ ...c, parent: '10-02-002', amount: parseFloat(invoice[c.field]) || 0 }))
        .filter(c => c.amount > 0),
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
      ...creditParts.map(p => financeDb.ensureLedgerAccount({ code: p.code, name: p.name, type: 'Income', parent: p.parent, companyId })),
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
      narration: `Sales invoice ${voucherId} — ${invoice.customer_name}`,
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
