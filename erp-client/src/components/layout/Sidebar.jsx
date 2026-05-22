import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, Factory, Users,
  Receipt, Wallet, UserCheck, ChevronRight, ChevronLeft,
  BarChart3, TrendingUp, FileText, Building2, CreditCard,
  Truck, ClipboardList, PanelLeftClose, PanelLeftOpen,
  BookOpen, Banknote, Scale,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { currentUser } from '../../data/shell';
import Tooltip from '../ui/Tooltip';
import styles from './Sidebar.module.css';

const NAV = [
  {
    label: 'Overview',
    items: [
      {
        path: '/', label: 'Dashboard', icon: LayoutDashboard,
        sub: [
          { path: '/dashboard/analytics',  label: 'Analytics' },
          { path: '/dashboard/sales-tax',  label: 'Sales Tax Dashboard' },
          { path: '/dashboard/stock',      label: 'Available Stock' },
          { path: '/dashboard/sales-summary', label: 'Sales Summary' },
          { path: '/dashboard/tracking',   label: 'Sales Tracking' },
        ],
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        path: '/inventory', label: 'Inventory', icon: Package,
        sub: [
          { path: '/inventory/items',     label: 'Items & Stock' },
          { path: '/inventory/warehouse', label: 'Warehouse Stock' },
          { path: '/inventory/transfers', label: 'Transfers' },
          { path: '/inventory/alerts',    label: 'Low Stock Alerts' },
        ],
      },
      {
        path: '/procurement', label: 'Procurement', icon: ShoppingCart,
        sub: [
          { path: '/procurement/pdn',          label: 'Purchase Demand Note' },
          { path: '/procurement/pdn-approval', label: 'PDN Approval' },
          { path: '/procurement/requisitions', label: 'Requisitions' },
          { path: '/procurement/orders',       label: 'Purchase Orders' },
          { path: '/procurement/grn',          label: 'Goods Received Note' },
          { path: '/procurement/vendors',      label: 'Vendors' },
        ],
      },
      {
        path: '/production', label: 'Production', icon: Factory,
        sub: [
          { path: '/production/bom',       label: 'Bill of Materials' },
          { path: '/production/orders',    label: 'Work Orders' },
          { path: '/production/schedules', label: 'Schedules' },
          { path: '/production/finished',  label: 'Finished Goods' },
        ],
      },
      {
        path: '/sales', label: 'Sales & CRM', icon: TrendingUp,
        sub: [
          { path: '/sales/customers',     label: 'Customers' },
          { path: '/sales/orders',        label: 'Order Booking' },
          { path: '/sales/confirmation',  label: 'Order Confirmation' },
          { path: '/sales/work-order',    label: 'Work Orders' },
          { path: '/sales/delivery',      label: 'Deliveries' },
          { path: '/sales/invoice',       label: 'Sales Invoice' },
          { path: '/sales/returns',       label: 'Sales Returns' },
          { path: '/sales/gate-pass',     label: 'Gate Pass' },
        ],
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        path: '/invoicing', label: 'Invoicing', icon: Receipt,
        sub: [
          { path: '/invoicing/list',         label: 'Invoices' },
          { path: '/invoicing/fbr',          label: 'FBR Queue' },
          { path: '/invoicing/sale-return',  label: 'Sale Return Invoice' },
        ],
      },
      {
        path: '/finance', label: 'Finance', icon: Wallet,
        sub: [
          { path: '/finance/vouchers',      label: 'Vouchers' },
          { path: '/finance/bank',          label: 'Bank Accounts' },
          { path: '/finance/cheques',       label: 'Cheque Tracking' },
          { path: '/finance/accounts',      label: 'Chart of Accounts' },
          { path: '/finance/aging',         label: 'Aging Report' },
          { path: '/finance/cash-received', label: 'Cash Received' },
          { path: '/finance/inter-bank',    label: 'Inter Bank Transfer' },
          { path: '/finance/petty-cash',    label: 'Petty Cash' },
          { path: '/finance/daily-cash',    label: 'Daily Cash' },
        ],
      },
      {
        path: '/reports', label: 'Reports', icon: BarChart3,
        sub: [
          { path: '/reports/ledger',           label: 'Ledger Report' },
          { path: '/reports/trial',            label: 'Trial Balance' },
          { path: '/reports/receivables',      label: 'Accounts Receivable' },
          { path: '/reports/payables',         label: 'Accounts Payable' },
          { path: '/reports/income',           label: 'Income Statement' },
          { path: '/reports/customer-ledger',  label: 'Customer Sales Ledger' },
          { path: '/reports/region',           label: 'Region Wise Sales' },
          { path: '/reports/sold-items',       label: 'Sold Item Detail' },
          { path: '/reports/invoice-summary',  label: 'Invoice Summary' },
          { path: '/reports/gst',              label: 'Order Wise GST' },
          { path: '/reports/challan',          label: 'Delivery Challan' },
          { path: '/reports/bank-recon',       label: 'Bank Reconciliation' },
        ],
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        path: '/hr', label: 'HR & Payroll', icon: UserCheck,
        sub: [
          { path: '/hr/employees',  label: 'Employees' },
          { path: '/hr/attendance', label: 'Attendance' },
          { path: '/hr/leaves',     label: 'Leave Management' },
          { path: '/hr/loans',      label: 'Loans & Advances' },
          { path: '/hr/payroll',    label: 'Payroll' },
        ],
      },
    ],
  },
];

function NavItem({ item, collapsed }) {
  const location = useLocation();
  const hasSub = item.sub?.length > 0;
  const isParentActive = location.pathname.startsWith(item.path) && item.path !== '/';
  const isSubPathActive = hasSub && item.sub.some(s => location.pathname.startsWith(s.path));
  const active = item.path === '/'
    ? (location.pathname === '/' || isSubPathActive)
    : (isParentActive || isSubPathActive);
  const [open, setOpen] = useState(active);
  const Icon = item.icon;

  useEffect(() => {
    if (active) setOpen(true);
  }, [location.pathname]);

  if (collapsed) {
    return (
      <div className={styles.navGroup}>
        <Tooltip content={item.label} placement="right">
          <NavLink
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `${styles.navItem} ${styles.navItemMini} ${isActive || active ? styles.navActive : ''}`
            }
          >
            <Icon size={18} strokeWidth={1.75} />
          </NavLink>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={styles.navGroup}>
      {hasSub ? (
        <button
          className={`${styles.navItem} ${active ? styles.navActive : ''}`}
          onClick={() => setOpen(o => !o)}
        >
          <Icon size={17} strokeWidth={1.75} className={styles.navIcon} />
          <span className={styles.navLabel}>{item.label}</span>
          <ChevronRight
            size={14}
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          />
        </button>
      ) : (
        <NavLink
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.navActive : ''}`
          }
        >
          <Icon size={17} strokeWidth={1.75} className={styles.navIcon} />
          <span className={styles.navLabel}>{item.label}</span>
        </NavLink>
      )}

      {hasSub && open && (
        <div className={styles.subMenu}>
          {item.sub.map(s => (
            <NavLink
              key={s.path}
              to={s.path}
              className={({ isActive }) =>
                `${styles.subItem} ${isActive ? styles.subActive : ''}`
              }
            >
              {s.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      {/* Logo */}
      <div className={styles.logoSection}>
        {!collapsed && (
          <div className={styles.logoMark}>
            <Scale size={16} color="#fff" strokeWidth={2} />
          </div>
        )}
        {!collapsed && (
          <div className={styles.logoText}>
            <h1>Ahsan Brothers</h1>
            <p>Steel ERP</p>
          </div>
        )}
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <PanelLeftOpen size={16} />
            : <PanelLeftClose size={16} />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {NAV.map(section => (
          <div key={section.label} className={styles.section}>
            {!collapsed && (
              <p className={styles.sectionTitle}>{section.label}</p>
            )}
            {section.items.map(item => (
              <NavItem key={item.path} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      {/* Profile */}
      {!collapsed && (
        <div className={styles.profile}>
          <div className={styles.profileAvatar}>
            {currentUser.initials}
          </div>
          <div className={styles.profileInfo}>
            <p className={styles.profileName}>{currentUser.name}</p>
            <p className={styles.profileRole}>{currentUser.role}</p>
          </div>
          <div className={styles.onlineDot} />
        </div>
      )}
      {collapsed && (
        <Tooltip content={currentUser.name} placement="right">
          <div className={`${styles.profile} ${styles.profileMini}`}>
            <div className={styles.profileAvatar}>{currentUser.initials}</div>
          </div>
        </Tooltip>
      )}
    </aside>
  );
}
