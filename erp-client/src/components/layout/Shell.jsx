import { useState, useCallback, useEffect } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { Outlet, useLocation } from 'react-router-dom';
import styles from './Shell.module.css';

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  // Land at the top of the page whenever the route (or a tab that changes the
  // route) switches — otherwise the previous scroll position is kept and the
  // new section appears off-screen.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

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
