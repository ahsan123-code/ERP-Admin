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
