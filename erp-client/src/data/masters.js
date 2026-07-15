// Master data is now served from Supabase PostgreSQL.
// Use mastersDb from src/lib/db.js with the useDb hook.
export const companies = [
  { id: 1, name: 'Allied Steel Center', ntn: '9207491-5', strn: '3277876323039', address: 'Lahore, Punjab' },
];
// Branches map to the underlying company_id, so selecting a branch switches
// which shop's data is shown (Shop #41 → company 1, Shop #58 → company 2).
export const branches = [
  { id: 1, name: 'Shop #41' },
  { id: 2, name: 'Shop #58' },
];
export const fiscalYears = [
  { id: 1, label: 'F-2026-2027', startDate: '2026-07-01', endDate: '2027-06-30', isActive: true },
];
export const departments = [];
export const warehouses = [];
export const units = [];
export const productCatalogue = [];
