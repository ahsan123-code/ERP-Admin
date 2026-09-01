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

// ── Option lists for <SearchableSelect> ──────────────────────────────────────────
//
// Six screens built the bank list by hand, each mapping bank_accounts to <option>
// themselves and each labelling it slightly differently — five as "HBL (12345)", one
// as "HBL — 12345". Centralising the shape here means a bank reads the same wherever
// it is picked, and a screen moving from a plain dropdown to a searchable one is a
// change of component rather than a rewrite of its data.
//
// The shape is SearchableSelect's: { value, label, hint, search }. `hint` renders
// beside the label and is searchable; `search` matches without being shown.

/**
 * Bank accounts as picker options.
 *
 * `prefix` is prepended to the value ('bank:' for the payment and receipt voucher,
 * which encodes the kind of pocket in the value it posts against). `by` chooses what
 * the value identifies — the bank row ('account_id', the default, which is what most
 * screens store) or its ledger account ('account_code').
 */
export const bankAccountOptions = (bankAccounts = [], { prefix = '', by = 'account_id' } = {}) =>
  (bankAccounts || [])
    .filter(b => b[by])
    .map(b => ({
      value:  `${prefix}${b[by]}`,
      label:  b.bank_name || '(unnamed bank)',
      hint:   b.account_no || '',
      search: `${b.bank_name ?? ''} ${b.account_no ?? ''} ${b.account_code ?? ''}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

/**
 * Cash and wallet pockets as picker options, read from the chart so a renamed account
 * is renamed here too.
 */
export const cashPocketOptions = (chartOfAccounts = [], { prefix = '', codes = CASH_POCKET_CODES } = {}) => {
  const byCode = new Map((chartOfAccounts || []).map(a => [a.account_code, a]));
  return codes
    .map(code => byCode.get(code))
    .filter(Boolean)
    .map(a => ({
      value:  `${prefix}${a.account_code}`,
      label:  a.account_name,
      search: a.account_code,
    }));
};

/**
 * Every pocket in one list, cash first then banks, tagged so the two are told apart
 * in a single searchable dropdown.
 */
export const paymentSourceOptions = (chartOfAccounts = [], bankAccounts = [], { prefix = '' } = {}) => [
  ...cashPocketOptions(chartOfAccounts, { prefix }).map(o => ({ ...o, hint: 'Cash' })),
  ...bankAccountOptions(bankAccounts, { prefix, by: 'account_code' }),
];
