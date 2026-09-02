import { Sun, Moon, Maximize2, Minimize2, LogOut, ChevronDown, Bell, Check, Building2, MapPin, CalendarDays, Menu, HelpCircle, Archive } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { branches } from '../../data/masters';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useCompany } from '../../context/CompanyContext';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { useDataScope } from '../../context/DataScopeContext';
import { useAdminProfile } from '../../context/AdminProfileContext';
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
  const { companyId, setCompanyId } = useCompany();
  const { fiscalYears, fiscalYearId, setFiscalYearId } = useFiscalYear();
  const { hasArchive, showingAll } = useDataScope();
  const { name, role, photo, initials } = useAdminProfile();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const COMPANY_OPTIONS = [{ id: 1, name: 'Allied Steel Center' }];

  return (
    <header className={`${styles.topbar} ${collapsed ? styles.topbarCollapsed : ''}`}>
      <div className={styles.left}>
        <button className={styles.menuBtn} onClick={onMenuOpen} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className={styles.userChip}>
          <div className={styles.avatar}>
            {photo
              ? <img src={photo} alt="" className={styles.avatarImg} />
              : initials}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{name}</span>
            <span className={styles.userRole}>{role}</span>
          </div>
        </div>
      </div>

      <div className={styles.center}>
        <DropdownSelect
          label="Company"
          icon={Building2}
          options={COMPANY_OPTIONS}
          value={1}
          onChange={() => {}}
        />
        <span className={styles.divider} />
        <DropdownSelect
          label="Branch"
          icon={MapPin}
          options={branches}
          value={companyId}
          onChange={setCompanyId}
        />
        <span className={styles.divider} />
        <DropdownSelect
          label="Fiscal Year"
          icon={CalendarDays}
          options={fiscalYears}
          value={fiscalYearId}
          onChange={setFiscalYearId}
        />
        {/* Only for a branch that actually has archived years, so Shop #58 is never told
            about a cut-off that does not apply to it. Without this a user who left the
            toggle on has no way to tell why a list holds ten years of rows. */}
        {hasArchive && (
          <>
            <span className={styles.divider} />
            <Tooltip
              content={showingAll
                ? 'Lists include the archived years. Click to manage.'
                : 'Older years are in Manage Data. Click to view them.'}
              placement="bottom"
            >
              <button
                className={`${styles.scopePill} ${showingAll ? styles.scopePillAll : ''}`}
                onClick={() => navigate('/manage-data')}
              >
                <Archive size={13} strokeWidth={2} />
                {showingAll ? 'All data' : 'Recent data'}
              </button>
            </Tooltip>
          </>
        )}
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
