import styles from './Card.module.css';

export default function Card({ children, className = '', padding = true, hover = false }) {
  return (
    <div className={[styles.card, padding ? '' : styles.noPad, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions }) {
  return (
    <div className={styles.cardHeader}>
      <div>
        <h3 className={styles.cardTitle}>{title}</h3>
        {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.cardActions}>{actions}</div>}
    </div>
  );
}
