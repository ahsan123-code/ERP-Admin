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

  updatePayroll: (payrollId, updates) =>
    supabase.from('payroll_records').update(updates).eq('payroll_id', payrollId).select().single(),

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
  getChartOfAccounts: (companyId = 1) =>
    supabase.from('chart_of_accounts').select('*').eq('company_id', companyId).order('account_code').limit(2000),

  getVouchers: (companyId = 1) =>
    supabase.from('vouchers')
      .select('id, voucher_id, voucher_type, date, account_name, debit, credit, narration, reference, company_id')
      .eq('company_id', companyId)
      .order('date', { ascending: false })
      .limit(500),

  addVoucher: (v) =>
    supabase.from('vouchers').insert([v]).select().single(),

  deleteVoucher: (id) =>
    supabase.from('vouchers').delete().eq('id', id),

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

  // Posts a multi-leg double-entry journal: writes each leg to `vouchers` (so it shows
  // up in the Vouchers ledger) and `voucher_lines` (so it's included in per-account
  // reports like Daily Cash), then applies the balance updates via applyVoucherToBalances.
  // `vouchers.voucher_id` has a UNIQUE constraint, so each leg gets its own
  // `${voucherId}-N` id (voucher_lines mirrors it so the daily_cash_summary join still
  // matches); `reference` ties the legs together for display/grouping.
  // legs: [{ account, debit, credit }, ...]
  postJournalEntry: async ({ voucherId, voucherType, date, companyId, legs, narration, reference }) => {
    let i = 1;
    for (const leg of legs) {
      const legVoucherId = `${voucherId}-${i++}`;
      await supabase.from('vouchers').insert([{
        voucher_id: legVoucherId, voucher_type: voucherType, date,
        account_name: leg.account.account_name, debit: leg.debit, credit: leg.credit,
        narration, reference, company_id: companyId,
      }]);
      await supabase.from('voucher_lines').insert([{
        voucher_id: legVoucherId, line_no: 1,
        account_code: leg.account.account_code, account_title: leg.account.account_name,
        debit: leg.debit, credit: leg.credit, narration, company_id: companyId,
      }]);
      await financeDb.applyVoucherToBalances(leg.account, leg.debit, leg.credit);
    }
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
        { account: ledgerAccount,  debit: 0,         credit: cr.amount },
      ],
      narration: cr.narration || `Cash receipt from ${cr.party_name}`,
      reference: cr.cr_id,
    });
    return supabase.from('cash_received').insert([cr]).select().single();
  },

  getInterBankTransfers: () =>
    supabase.from('inter_bank_transfers').select('*').order('date', { ascending: false }),

  addInterBankTransfer: async (ibt, { fromAccount, toAccount, companyId }) => {
    const voucherId = 'IBT-' + String(Date.now()).slice(-6);
    await financeDb.postJournalEntry({
      voucherId, voucherType: 'Contra', date: ibt.date, companyId,
      legs: [
        { account: toAccount,   debit: ibt.amount, credit: 0 },
        { account: fromAccount, debit: 0,          credit: ibt.amount },
      ],
      narration: ibt.narration || `Transfer: ${ibt.from_account} -> ${ibt.to_account}`,
      reference: ibt.ibt_id,
    });
    return supabase.from('inter_bank_transfers').insert([ibt]).select().single();
  },

  getPettyCash: () =>
    supabase.from('petty_cash').select('*').order('date', { ascending: false }),

  addPettyCash: async (pc, { sourceAccount, expenseAccount, companyId }) => {
    const voucherId = 'PC-' + String(Date.now()).slice(-6);
    await financeDb.postJournalEntry({
      voucherId, voucherType: 'Payment', date: pc.date, companyId,
      legs: [
        { account: expenseAccount, debit: pc.amount, credit: 0 },
        { account: sourceAccount,  debit: 0,         credit: pc.amount },
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
          { account: bankAccount,   debit: 0,             credit: cheque.amount },
        ]
      : [
          { account: bankAccount,   debit: cheque.amount, credit: 0 },
          { account: ledgerAccount, debit: 0,             credit: cheque.amount },
        ];
    await financeDb.postJournalEntry({ voucherId, voucherType: 'BankRec', date: cheque.due_date, companyId, legs, narration, reference: cheque.cheque_no });
    return supabase.from('cheque_tracking').update({ status: 'cleared' }).eq('id', cheque.id).select().single();
  },

  getAgingReport: (companyId = 1) =>
    supabase.from('aging_report_computed').select('*').eq('company_id', companyId).order('total', { ascending: false }),

  getPaymentReconciliation: () =>
    supabase.from('payment_reconciliation').select('*').order('payment_date', { ascending: false }),

  getVoucherAccounts: () =>
    supabase.from('distinct_voucher_accounts').select('account_name'),

  getVouchersByAccount: (accountName, fromDate, toDate) => {
    let q = supabase.from('vouchers')
      .select('id, voucher_id, voucher_type, date, narration, debit, credit, reference')
      .eq('account_name', accountName)
      .order('date');
    if (fromDate) q = q.gte('date', fromDate);
    if (toDate) q = q.lte('date', toDate);
    return q;
  },
};

// ── INVENTORY ─────────────────────────────────────────────────────────────

export const inventoryDb = {
  getStockItems: (companyId = 1) =>
    supabase.from('stock_items')
      .select('id, item_code, item_name, category, gauge, current_stock, reorder_level, warehouse, batch_no, status, unit, company_id')
      .eq('company_id', companyId)
      .order('item_code'),

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
  getCustomers: () =>
    supabase.from('customers')
      .select('id, customer_id, name, cnic, ntn, region, status, contact, address, credit_limit, outstanding_balance')
      .order('id', { ascending: false }),

  searchCustomers: (query) =>
    supabase.from('customers')
      .select('id, customer_id, name, cnic, ntn, region, status, contact, credit_limit, outstanding_balance')
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

  addCustomer: (c) =>
    supabase.from('customers').insert([c]).select().single(),

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
    await supabase.from('order_confirmations').delete().eq('so_ref', soId);
    await supabase.from('work_orders').delete().eq('so_ref', soId);
    await supabase.from('delivery_notes').delete().eq('so_ref', soId);
    await supabase.from('gate_passes').delete().eq('so_ref', soId);
    await supabase.from('sales_invoices').delete().eq('so_ref', soId);
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

  addSalesInvoice: (inv) =>
    supabase.from('sales_invoices').insert([inv]).select().single(),

  getSalesReturns: (companyId = 1) =>
    supabase.from('sales_returns').select('*').eq('company_id', companyId).order('return_date', { ascending: false }),
};

// ── PROCUREMENT ───────────────────────────────────────────────────────────

export const procurementDb = {
  getVendors: () =>
    supabase.from('vendors').select('*').order('name'),

  addVendor: (v) =>
    supabase.from('vendors').insert([v]).select().single(),

  getPdns: (companyId = 1) =>
    supabase.from('pdns').select('*').eq('company_id', companyId).order('pdn_date', { ascending: false }),

  addPdn: (pdn) =>
    supabase.from('pdns').insert([pdn]).select().single(),

  addPdnLineItems: (lineItems) =>
    supabase.from('pdn_line_items').insert(lineItems).select(),

  deletePdn: async (id, pdnId) => {
    await supabase.from('pdn_line_items').delete().eq('pdn_id', pdnId);
    return supabase.from('pdns').delete().eq('id', id);
  },

  getPurchaseRequisitions: () =>
    supabase.from('purchase_requisitions').select('*').order('date', { ascending: false }),

  addPurchaseRequisition: (pr) =>
    supabase.from('purchase_requisitions').insert([pr]).select().single(),

  addPrLineItems: (items) =>
    supabase.from('pr_line_items').insert(items).select(),

  getPurchaseOrders: (companyId = 1) =>
    supabase.from('purchase_orders')
      .select('id, po_id, vendor_name, po_date, delivery_due_date, item_count, total_amount, status, company_id, pr_ref, pdn_ref')
      .eq('company_id', companyId)
      .order('po_date', { ascending: false }),

  addPurchaseOrder: (po) =>
    supabase.from('purchase_orders').insert([po]).select().single(),

  addPoLineItems: (items) =>
    supabase.from('po_line_items').insert(items).select(),

  getGatePassesInward: (companyId = 1) =>
    supabase.from('gate_passes_inward').select('*').eq('company_id', companyId).order('gate_date', { ascending: false }),

  addGatePassInward: (gp) =>
    supabase.from('gate_passes_inward').insert([gp]).select().single(),

  getGrns: (companyId = 1) =>
    supabase.from('grns').select('*').eq('company_id', companyId).order('received_date', { ascending: false }),

  addGrn: (grn) =>
    supabase.from('grns').insert([grn]).select().single(),

  addGrnLineItems: (items) =>
    supabase.from('grn_line_items').insert(items).select(),

  getPurchaseInvoices: (companyId = 1) =>
    supabase.from('purchase_invoices').select('*').eq('company_id', companyId).order('bill_date', { ascending: false }),

  addPurchaseInvoice: (pinv) =>
    supabase.from('purchase_invoices').insert([pinv]).select().single(),

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
