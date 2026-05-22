import { forwardRef } from 'react';
import styles from './Input.module.css';

const Input = forwardRef(function Input({ label, error, hint, icon, required, type = 'text', ...props }, ref) {
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label}>
          {label}{required && <span className={styles.req}>*</span>}
        </label>
      )}
      <div className={`${styles.inputWrap} ${error ? styles.hasError : ''}`}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <input
          ref={ref}
          type={type}
          className={`${styles.input} ${icon ? styles.withIcon : ''}`}
          {...props}
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {hint && !error && <p className={styles.hint}>{hint}</p>}
    </div>
  );
});

export default Input;
