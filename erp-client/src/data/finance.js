// Finance data is now served from Supabase PostgreSQL.
// Use financeDb from src/lib/db.js with the useDb hook.
export const chartOfAccounts       = [];
export const vouchers               = [];
export const plReport               = { period: '', revenue: 0, costOfGoodsSold: 0, grossProfit: 0, operatingExpenses: 0, payrollExpenses: 0, netProfit: 0 };
export const balanceSheet           = { asAt: '', totalAssets: 0, totalLiabilities: 0, equity: 0 };
export const agingReport            = [];
export const paymentReconciliation  = [];
export const bankAccounts           = [];
export const ledgerParties          = [];
export const ledgerEntries          = {};
export const cashReceived           = [];
export const interBankTransfers     = [];
export const pettyCash              = [];
export const dailyCash              = [];
export const chequeTracking         = [];
