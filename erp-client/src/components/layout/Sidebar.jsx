import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, Factory,
  Receipt, Wallet, UserCheck, ChevronRight,
  BarChart3, TrendingUp,
  PanelLeftClose, PanelLeftOpen,
  Coins, Settings as SettingsIcon,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAdminProfile } from '../../context/AdminProfileContext';
import Tooltip from '../ui/Tooltip';
import styles from './Sidebar.module.css';

const NAV = [
  {
    label: 'Overview',
    items: [
      {
        path: '/', label: 'Dashboard', icon: LayoutDashboard,
        sub: [
          { path: '/dashboard/analytics',     label: 'Analytics' },
          { path: '/dashboard/sales-tax',     label: 'Sales Tax Dashboard' },
          { path: '/dashboard/stock',         label: 'Available Stock' },
          { path: '/dashboard/sales-summary', label: 'Sales Summary' },
          { path: '/dashboard/tracking',      label: 'Sales Tracking' },
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
          { path: '/inventory/alerts',    label: 'Low Stock Alerts' },
        ],
      },
      {
        path: '/procurement', label: 'Procurement', icon: ShoppingCart,
        sub: [
          { path: '/procurement/pdns',         label: 'Purchase Demand Notes' },
          { path: '/procurement/requisitions', label: 'Requisitions' },
          { path: '/procurement/orders',       label: 'Purchase Orders' },
          { path: '/procurement/gatepass',     label: 'Gate Pass Inward' },
          { path: '/procurement/grns',         label: 'Goods Received Notes' },
          { path: '/procurement/invoices',     label: 'Purchase Invoices' },
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
          { path: '/sales/customers',    label: 'Customers' },
          { path: '/sales/orders',       label: 'Order Booking' },
          { path: '/sales/confirmation', label: 'Order Confirmation' },
          { path: '/sales/work-order',   label: 'Work Orders' },
          { path: '/sales/delivery',     label: 'Deliveries' },
          { path: '/sales/invoice',      label: 'Sales Invoice' },
          { path: '/sales/returns',      label: 'Sales Returns' },
          { path: '/sales/gate-pass',    label: 'Gate Pass' },
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
          { path: '/invoicing/list',        label: 'Invoices' },
          { path: '/invoicing/fbr',         label: 'FBR Queue' },
          { path: '/invoicing/sale-return', label: 'Sale Return Invoice' },
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
        path: '/expense-accounts', label: 'Expense Accounts', icon: Coins,
      },
      {
        path: '/reports', label: 'Reports', icon: BarChart3,
        sub: [
          { path: '/reports/ledger',          label: 'Ledger Report' },
          { path: '/reports/trial',           label: 'Trial Balance' },
          { path: '/reports/receivables',     label: 'Accounts Receivable' },
          { path: '/reports/payables',        label: 'Accounts Payable' },
          { path: '/reports/income',          label: 'Income Statement' },
          { path: '/reports/customer-ledger', label: 'Customer Sales Ledger' },
          { path: '/reports/region',          label: 'Region Wise Sales' },
          { path: '/reports/sold-items',      label: 'Sold Item Detail' },
          { path: '/reports/invoice-summary', label: 'Invoice Summary' },
          { path: '/reports/gst',             label: 'Order Wise GST' },
          { path: '/reports/challan',         label: 'Delivery Challan' },
          { path: '/reports/bank-recon',      label: 'Bank Reconciliation' },
          { path: '/reports/vendor-ledger',   label: 'Vendor Ledger' },
          { path: '/reports/cust-balance',    label: 'Customer Balance' },
          { path: '/reports/vendor-balance',  label: 'Vendor Balance' },
          { path: '/reports/party-positions', label: 'Party Net Position' },
          { path: '/reports/day-book',        label: 'Daily Day Book' },
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
  {
    label: 'System',
    items: [
      { path: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
];

function NavItem({ item, collapsed, onClose }) {
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
            onClick={onClose}
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
          onClick={onClose}
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
              onClick={onClose}
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

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { name, role, photo, initials } = useAdminProfile();
  const sidebarClass = [
    styles.sidebar,
    collapsed ? styles.collapsed : '',
    mobileOpen ? styles.mobileOpen : '',
  ].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClass}>
      {/* Logo */}
      <div className={styles.logoSection}>
        {!collapsed && (
          <div className={styles.logoMark}>
            <img src="/asc-mark.png" alt="Allied Steel Center" className={styles.logoImg} />
          </div>
        )}
        {!collapsed && (
          <div className={styles.logoText}>
            <h1>Allied Steel</h1>
            <p>Steel ERP</p>
          </div>
        )}
        <button
          className={styles.collapseBtn}
          onClick={onToggle}
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
              <NavItem
                key={item.path}
                item={item}
                collapsed={collapsed}
                onClose={onMobileClose}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Profile */}
      {!collapsed && (
        <div className={styles.profile}>
          <div className={styles.profileAvatar}>
            {photo ? <img src={photo} alt="" className={styles.profileAvatarImg} /> : initials}
          </div>
          <div className={styles.profileInfo}>
            <p className={styles.profileName}>{name}</p>
            <p className={styles.profileRole}>{role}</p>
          </div>
          <div className={styles.onlineDot} />
        </div>
      )}
      {collapsed && (
        <Tooltip content={name} placement="right">
          <div className={`${styles.profile} ${styles.profileMini}`}>
            <div className={styles.profileAvatar}>
              {photo ? <img src={photo} alt="" className={styles.profileAvatarImg} /> : initials}
            </div>
          </div>
        </Tooltip>
      )}
    </aside>
  );
}
