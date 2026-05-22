import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { Outlet } from 'react-router-dom';
import styles from './Shell.module.css';

export default function Shell() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <TopBar />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
