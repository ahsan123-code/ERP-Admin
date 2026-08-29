/**
 * The pockets money can be paid out of, in one place.
 *
 * Cash and wallet accounts live under 11-01-001; banks under 11-05-001, and those come
 * from the bank_accounts list so a bank carries its own ledger link (see
 * financeDb.bankCodeToAccount — the BANK-<n> number does NOT encode the chart code).
 *
 * Options are keyed by account_code, which identifies the ledger account directly and is
 * unique across both groups, so one value covers "which pocket" and "which account to
 * post against" without a second lookup.
 */

// Cash In Hand, Jazz Cash and both Easypaisa wallets. Kept as an explicit list rather
// than "everything under 11-01-001" so the group header (…-000000 "Cash & Cash
// Equalants") is never offered as somewhere money can come from.
export const CASH_POCKET_CODES = [
  '11-01-001-000001', // Cash In Hand
  '11-01-001-000002', // Jazz Cash
  '11-01-001-000003', // Easypaisa (M. Ahsan)
  '11-01-001-000004', // Easypaisa (Maqsood Ahmad)
];

/**
 * Builds the "paid from" choices for the current company.
 * Returns { cash: [{code,label}], banks: [{code,label}] } so a caller can render them as
 * two labelled groups; `flat` is every option in one list for lookups.
 */
export const buildPaymentSources = (chartOfAccounts = [], bankAccounts = []) => {
  const byCode = new Map((chartOfAccounts || []).map(a => [a.account_code, a]));

  const cash = CASH_POCKET_CODES
    .map(code => byCode.get(code))
    .filter(Boolean)
    .map(a => ({ code: a.account_code, label: a.account_name }));

  const banks = (bankAccounts || [])
    .filter(b => b.account_code)
    .map(b => ({
      code:  b.account_code,
      label: b.account_no ? `${b.bank_name} — ${b.account_no}` : b.bank_name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { cash, banks, flat: [...cash, ...banks] };
};

/** The stored label for a chosen pocket, so history reads the same later. */
export const paymentSourceLabel = (sources, code) =>
  sources.flat.find(o => o.code === code)?.label || '';
