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
  getChartOfAccounts: () =>
    supabase.from('chart_of_accounts').select('*').order('account_code'),

  getVouchers: (companyId = 1) =>
    supabase.from('vouchers')
      .select('id, voucher_id, voucher_type, date, account_name, debit, credit, narration, reference, company_id')
      .eq('company_id', companyId)
      .order('date', { ascending: false })
      .limit(500),

  addVoucher: (v) =>
    supabase.from('vouchers').insert([v]).select().single(),

  getBankAccounts: () =>
    supabase.from('bank_accounts').select('*'),

  getCashReceived: () =>
    supabase.from('cash_received').select('*').order('date', { ascending: false }),

  getInterBankTransfers: () =>
    supabase.from('inter_bank_transfers').select('*').order('date', { ascending: false }),

  getPettyCash: () =>
    supabase.from('petty_cash').select('*').order('date', { ascending: false }),

  getDailyCash: () =>
    supabase.from('daily_cash').select('*').order('date', { ascending: false }),

  getChequeTracking: () =>
    supabase.from('cheque_tracking').select('*').order('due_date'),

  getAgingReport: () =>
    supabase.from('aging_report').select('*'),

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
      .order('name'),

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

  getSalesOrders: (companyId = 1) =>
    supabase.from('sales_orders')
      .select('so_id, customer_name, customer_id, order_date, delivery_date, total_amount, item_count, status, company_id')
      .eq('company_id', companyId)
      .order('order_date', { ascending: false }),

  addSalesOrder: (so) =>
    supabase.from('sales_orders').insert([so]).select().single(),

  getDeliveryNotes: (companyId = 1) =>
    supabase.from('delivery_notes').select('*').eq('company_id', companyId).order('delivery_date', { ascending: false }),

  getOrderConfirmations: () =>
    supabase.from('order_confirmations').select('*').order('confirm_date', { ascending: false }),

  getWorkOrders: () =>
    supabase.from('work_orders').select('*').order('work_order_date', { ascending: false }),

  getGatePasses: (companyId = 1) =>
    supabase.from('gate_passes').select('*').eq('company_id', companyId).order('date', { ascending: false }),

  getSalesInvoices: (companyId = 1) =>
    supabase.from('sales_invoices')
      .select('id, sale_inv_id, customer_name, date, subtotal, freight, grand_total, status, so_ref, company_id')
      .eq('company_id', companyId)
      .order('date', { ascending: false }),

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

  getPurchaseRequisitions: () =>
    supabase.from('purchase_requisitions').select('*').order('date', { ascending: false }),

  getPurchaseOrders: (companyId = 1) =>
    supabase.from('purchase_orders')
      .select('id, po_id, vendor_name, po_date, delivery_due_date, item_count, total_amount, status, company_id')
      .eq('company_id', companyId)
      .order('po_date', { ascending: false }),

  getGrns: (companyId = 1) =>
    supabase.from('grns').select('*').eq('company_id', companyId).order('received_date', { ascending: false }),

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
