import { Sun, Moon, Maximize2, Minimize2, LogOut, ChevronDown, Bell, Check, Building2, MapPin, CalendarDays, Menu, HelpCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { branches, fiscalYears } from '../../data/masters';
import { currentUser } from '../../data/shell';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useCompany } from '../../context/CompanyContext';
import Tooltip from '../ui/Tooltip';
import styles from './TopBar.module.css';

function DropdownSelect({ label, icon: Icon, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = options?.find(o => o.id === value);
  const displayName = selected?.name ?? selected?.label ?? '—';
  const disabled = !options || options.length === 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className={`${styles.dropdown} ${open ? styles.dropdownOpen : ''} ${disabled ? styles.dropdownDisabled : ''}`} ref={ref}>
      <button
        type="button"
        className={styles.dropdownTrigger}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        disabled={disabled}
      >
        <div className={styles.dropdownContent}>
          {Icon && <Icon size={13} className={styles.dropdownIcon} strokeWidth={1.75} />}
          <div className={styles.dropdownText}>
            <span className={styles.dropdownLabel}>{label}</span>
            <span className={styles.dropdownValue} title={displayName}>{displayName}</span>
          </div>
        </div>
        <ChevronDown size={12} className={`${styles.dropdownArrow} ${open ? styles.dropdownArrowOpen : ''}`} />
      </button>

      {open && !disabled && (
        <div className={styles.dropdownPanel}>
          {options.map(o => {
            const active = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                className={`${styles.dropdownOption} ${active ? styles.dropdownOptionActive : ''}`}
                onClick={() => { onChange(o.id); setOpen(false); }}
              >
                <span className={styles.dropdownCheck}>{active && <Check size={11} strokeWidth={2.5} />}</span>
                {o.name ?? o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TopBar({ collapsed, onMenuOpen }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { companies, companyId, setCompanyId } = useCompany();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? 1);
  const [fyId,     setFyId]     = useState(fiscalYears[0]?.id ?? 1);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const companyBranches = branches.filter(b => b.companyId === companyId);

  return (
    <header className={`${styles.topbar} ${collapsed ? styles.topbarCollapsed : ''}`}>
      <div className={styles.left}>
        <button className={styles.menuBtn} onClick={onMenuOpen} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className={styles.userChip}>
          <div className={styles.avatar}>{currentUser.initials}</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{currentUser.name}</span>
            <span className={styles.userRole}>Administrator</span>
          </div>
        </div>
      </div>

      <div className={styles.center}>
        <DropdownSelect
          label="Company"
          icon={Building2}
          options={companies}
          value={companyId}
          onChange={setCompanyId}
        />
        <span className={styles.divider} />
        <DropdownSelect
          label="Branch"
          icon={MapPin}
          options={companyBranches}
          value={branchId}
          onChange={setBranchId}
        />
        <span className={styles.divider} />
        <DropdownSelect
          label="Fiscal Year"
          icon={CalendarDays}
          options={fiscalYears}
          value={fyId}
          onChange={setFyId}
        />
      </div>

      <div className={styles.right}>
        <Tooltip content="Help & Guide" placement="bottom">
          <button className={styles.iconBtn} onClick={() => navigate('/help')}>
            <HelpCircle size={16} />
          </button>
        </Tooltip>

        <Tooltip content="Notifications" placement="bottom">
          <button className={styles.iconBtn}>
            <Bell size={16} />
          </button>
        </Tooltip>

        <Tooltip content={theme === 'dark' ? 'Light mode' : 'Dark mode'} placement="bottom">
          <button className={styles.iconBtn} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </Tooltip>

        <Tooltip content={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} placement="bottom">
          <button className={styles.iconBtn} onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </Tooltip>

        <Tooltip content="Log out" placement="bottom">
          <button className={`${styles.iconBtn} ${styles.logoutBtn}`} onClick={logout}>
            <LogOut size={16} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
