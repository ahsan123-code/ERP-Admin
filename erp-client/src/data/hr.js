// HR data is now served from Supabase PostgreSQL.
// Use hrDb from src/lib/db.js with the useDb hook instead of importing from here.
// These empty exports exist only to prevent import errors in components being migrated.
export const employees      = [];
export const attendance     = [];
export const leaveRequests  = [];
export const leaveBalances  = [];
export const payrollRecords = [];
export const loans          = [];

// The places an employee can be posted. Single source of truth for the Add and Edit
// employee forms: Edit carried its own copy and Add carried none at all, so every new
// hire was saved with no section and printed on the salary sheet under "Admins", the
// group the sheet uses for staff who have no section set.
//
// Deliberately no "Admin" entry. The sheet already prints sectionless admin staff as
// "Admins", so a section spelled Admin would appear beside it as a second, nearly
// identical heading on the same page.
export const EMPLOYEE_SECTIONS = ['Shop 41', 'Workshop', 'Mosque', 'Home', 'Office'];

// The loans table holds two kinds of employee credit, told apart by `type`
// (see server/migrate-loan-type.js):
//
//   loan    — repaid over several months. Its installment is the payroll row's
//             loan_deduction and it fills the salary sheet's four Loan columns.
//   advance — salary paid ahead of payday, recovered out of the coming salary.
//             It is the payroll row's advance_salary and the sheet's Advance
//             Salary column, which has always been separate from the Loan block.
//
// Keeping the two apart matters at payroll time: reading an advance as a loan
// would deduct it in the wrong column and keep deducting it every month after.
export const LOAN_TYPES = { LOAN: 'loan', ADVANCE: 'advance' };

// Rows written before the type column existed are all loans, so an absent type
// reads as 'loan' rather than as neither.
export const isAdvance = (row) => row?.type === LOAN_TYPES.ADVANCE;
export const isLoan    = (row) => !isAdvance(row);

// What an active loan or advance takes out of one month's salary: the agreed
// per-month recovery, or whatever is left of the balance if that is smaller —
// so the last installment collects the remainder instead of overshooting.
export const monthlyRecovery = (row) => {
  if (!row || row.status !== 'active') return 0;
  const balance   = Number(row.remaining_balance) || 0;
  const perMonth  = Number(row.monthly_deduction) || 0;
  return Math.max(0, Math.min(balance, perMonth));
};
