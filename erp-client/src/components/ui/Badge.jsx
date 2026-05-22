import styles from './Badge.module.css';

const variantMap = {
  success: styles.success,
  warning: styles.warning,
  danger:  styles.danger,
  info:    styles.info,
  neutral: styles.neutral,
  purple:  styles.purple,
  orange:  styles.orange,
  cyan:    styles.cyan,
};

export default function Badge({ variant = 'info', children, dot = true, size = 'md' }) {
  return (
    <span className={`${styles.badge} ${variantMap[variant] ?? styles.info} ${styles[size]}`}>
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
