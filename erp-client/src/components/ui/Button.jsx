import { Loader2 } from 'lucide-react';
import styles from './Button.module.css';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
  fullWidth = false,
  tooltip,
  className = '',
}) {
  const btn = (
    <button
      type={type}
      className={[
        styles.btn,
        styles[variant],
        styles[size],
        fullWidth ? styles.fullWidth : '',
        loading ? styles.loading : '',
        className,
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled || loading}
      title={tooltip}
    >
      {loading
        ? <Loader2 size={14} className={styles.spinner} />
        : icon && <span className={styles.icon}>{icon}</span>
      }
      {children && <span className={styles.label}>{children}</span>}
      {iconRight && !loading && <span className={styles.iconRight}>{iconRight}</span>}
    </button>
  );

  return btn;
}
