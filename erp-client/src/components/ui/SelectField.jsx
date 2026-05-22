import styles from './SelectField.module.css';

export default function SelectField({ label, error, required, children, ...props }) {
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label}>
          {label}{required && <span className={styles.req}>*</span>}
        </label>
      )}
      <div className={`${styles.selectWrap} ${error ? styles.hasError : ''}`}>
        <select className={styles.select} {...props}>
          {children}
        </select>
        <span className={styles.arrow}>&#9662;</span>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
