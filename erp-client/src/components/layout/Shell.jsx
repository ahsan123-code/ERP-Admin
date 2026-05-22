import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { Outlet } from 'react-router-dom';
import styles from './Shell.module.css';

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = useCallback(() => setCollapsed(c => !c), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className={styles.shell}>
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />
      {mobileOpen && (
        <div className={styles.backdrop} onClick={closeMobile} aria-hidden="true" />
      )}
      <TopBar collapsed={collapsed} onMenuOpen={openMobile} />
      <main className={`${styles.main} ${collapsed ? styles.mainCollapsed : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
