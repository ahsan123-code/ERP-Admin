/**
 * How an account's normal side is decided, in one place.
 *
 * The `account_type` text column cannot be used for this: of company 1's 1,801 accounts
 * it reads null on 817, empty on 344 and "User Defined" on 637, leaving 3 accounts —
 * three — actually labelled. The account *code* is the reliable classifier, and it is
 * already what financeDb.applyVoucherToBalances uses to decide which way a posting moves
 * a balance. Anything that reports on balances has to agree with the thing that writes
 * them, so both read this module.
 *
 * The top-level headings in the chart give the mapping directly:
 *   10 Income · 11 Asset · 12 Expense · 13 Owner Equity · 14 Liability
 */

// Income, Owner Equity and Liability grow on the credit side; Asset and Expense on
// the debit side. Anything with an unrecognised code is treated as debit-normal,
// which matches applyVoucherToBalances' own fallback.
const CREDIT_NORMAL_PREFIXES = ['10', '13', '14'];

const GROUP_LABELS = {
  10: 'Income',
  11: 'Asset',
  12: 'Expense',
  13: 'Owner Equity',
  14: 'Liability',
};

export const accountPrefix = (accountCode) => String(accountCode ?? '').slice(0, 2);

export const isCreditNormal = (accountCode) =>
  CREDIT_NORMAL_PREFIXES.includes(accountPrefix(accountCode));

/**
 * What kind of account this is, from its code. Falls back to the stored `account_type`
 * only when the code is unrecognised, and to a dash when neither says anything — so the
 * column reads as a real classification instead of the blank it showed before.
 */
export const accountGroupLabel = (accountCode, storedType) => {
  const label = GROUP_LABELS[accountPrefix(accountCode)];
  if (label) return label;
  const stored = String(storedType ?? '').trim();
  return stored && stored.toLowerCase() !== 'user defined' ? stored : '—';
};

/**
 * Splits one account's stored balance into its trial-balance debit and credit columns.
 *
 * Balances are stored signed against the account's own normal side (see
 * applyVoucherToBalances), so a positive balance sits on that normal side and a negative
 * one is a contra — an asset in credit, a liability in debit — and belongs in the
 * opposite column at its absolute value rather than being printed as a negative.
 */
export const splitBalance = (accountCode, balance) => {
  const value = Number(balance) || 0;
  if (value === 0) return { debit: 0, credit: 0 };
  const onCreditSide = isCreditNormal(accountCode) ? value > 0 : value < 0;
  return onCreditSide
    ? { debit: 0, credit: Math.abs(value) }
    : { debit: Math.abs(value), credit: 0 };
};
