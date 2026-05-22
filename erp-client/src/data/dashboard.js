// Dashboard data is now computed from Supabase PostgreSQL.
// Use dashboardDb from src/lib/db.js with the useDb hook.
export const kpiStats    = [];
export const moduleCards = [
  { id: 'inventory',   label: 'Inventory',    path: '/inventory',   accentVar: '--blue',   stat1Label: 'Items',       stat1Value: '—', stat2Label: 'Low Stock',  stat2Value: '—', stat2Warn: false },
  { id: 'procurement', label: 'Procurement',  path: '/procurement', accentVar: '--purple', stat1Label: 'Active POs',  stat1Value: '—', stat2Label: 'Pending',    stat2Value: '—', stat2Warn: false },
  { id: 'production',  label: 'Production',   path: '/production',  accentVar: '--orange', stat1Label: 'Work Orders', stat1Value: '—', stat2Label: 'This Month', stat2Value: '—', stat2Warn: false },
  { id: 'sales',       label: 'Sales & CRM',  path: '/sales',       accentVar: '--green',  stat1Label: 'Orders',      stat1Value: '—', stat2Label: 'Customers',  stat2Value: '—', stat2Warn: false },
  { id: 'invoicing',   label: 'Invoicing',    path: '/invoicing',   accentVar: '--cyan',   stat1Label: 'Today',       stat1Value: '—', stat2Label: 'FBR Failed', stat2Value: '—', stat2Warn: false },
  { id: 'finance',     label: 'Finance',      path: '/finance',     accentVar: '--blue',   stat1Label: 'Vouchers',    stat1Value: '—', stat2Label: 'Overdue',    stat2Value: '—', stat2Warn: false },
  { id: 'hr',          label: 'HR & Payroll', path: '/hr',          accentVar: '--purple', stat1Label: 'Employees',   stat1Value: '—', stat2Label: 'On Leave',   stat2Value: '—', stat2Warn: false },
];
export const chartData    = { '7d': [], '30d': [], '90d': [] };
export const activityFeed = [];
export const recentOrders = [];
