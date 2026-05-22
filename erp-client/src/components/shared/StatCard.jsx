import { ArrowUp, ArrowDown } from 'lucide-react';
import styles from './StatCard.module.css';

export default function StatCard({ stat, icon }) {
  const { label, value, change, changeType, accentVar, bgVar } = stat;
  return (
    <div className={styles.card} style={{ '--accent': `var(${accentVar})`, '--bg': `var(${bgVar})` }}>
      <div className={styles.iconRow}>
        <p className={styles.label}>{label}</p>
        <div className={styles.iconBox}>{icon}</div>
      </div>
      <p className={styles.value}>{value}</p>
      <div className={styles.footer}>
        {changeType !== 'neutral' && (
          <span className={`${styles.change} ${changeType === 'up' ? styles.up : styles.down}`}>
            {changeType === 'up'
              ? <ArrowUp size={11} strokeWidth={2.5} />
              : <ArrowDown size={11} strokeWidth={2.5} />}
            {change}%
          </span>
        )}
        <span className={styles.changePeriod}>vs last month</span>
      </div>
    </div>
  );
}
