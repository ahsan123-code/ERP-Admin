// Master data is now served from Supabase PostgreSQL.
// Use mastersDb from src/lib/db.js with the useDb hook.
export const companies = [
  { id: 1, name: 'Allied Steel Center', ntn: '9207491-5', strn: '3277876323039', address: 'Lahore, Punjab' },
];
export const branches = [
  { id: 1, name: 'Head Office', companyId: 1 },
  { id: 2, name: 'Main Branch', companyId: 2 },
];
export const fiscalYears = [
  { id: 1, label: 'F-2025-2026', startDate: '2025-07-01', endDate: '2026-06-30', isActive: true },
];
export const departments = [];
export const warehouses  = [];
export const units       = [];
export const productCatalogue = [];
