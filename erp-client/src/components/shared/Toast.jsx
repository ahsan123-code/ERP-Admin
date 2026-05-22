import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X, Download, Save, Trash2 } from 'lucide-react';
import styles from './Toast.module.css';

const ToastContext = createContext(null);

let _id = 0;

const ICONS = {
  success:  <CheckCircle2 size={16} strokeWidth={2} />,
  error:    <XCircle      size={16} strokeWidth={2} />,
  warning:  <AlertTriangle size={16} strokeWidth={2} />,
  info:     <Info          size={16} strokeWidth={2} />,
  download: <Download      size={16} strokeWidth={2} />,
  deleted:  <Trash2        size={16} strokeWidth={2} />,
};

function ToastItem({ toast, onRemove }) {
  const duration = toast.duration ?? 4000;

  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), duration);
    return () => clearTimeout(t);
  }, [toast.id, duration, onRemove]);

  const iconKey = toast.iconType ?? toast.type;

  return (
    <div className={`${styles.toast} ${styles[toast.type]}`} role="alert">
      <span className={styles.toastIcon}>{ICONS[iconKey] ?? ICONS[toast.type]}</span>
      <div className={styles.toastBody}>
        {toast.title && <p className={styles.toastTitle}>{toast.title}</p>}
        <p className={styles.toastMsg}>{toast.message}</p>
      </div>
      <button className={styles.closeBtn} onClick={() => onRemove(toast.id)} aria-label="Dismiss">
        <X size={13} strokeWidth={2.5} />
      </button>
      <div
        className={styles.progress}
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const add = useCallback((type, message, title, duration, iconType) => {
    const id = ++_id;
    setToasts(prev => [...prev, { id, type, message, title, duration, iconType }]);
    return id;
  }, []);

  const toast = {
    success:  (msg, title)     => add('success', msg, title),
    error:    (msg, title)     => add('error',   msg, title, 6000),
    warning:  (msg, title)     => add('warning', msg, title),
    info:     (msg, title)     => add('info',    msg, title),
    download: (filename)       => add('success', `${filename} downloaded successfully`, 'Export Complete', 4000, 'download'),
    saved:    (entity)         => add('success', `${entity} saved successfully`, 'Saved'),
    deleted:  (entity)         => add('info',    `${entity} has been removed`, 'Deleted', 3500, 'deleted'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={styles.container} aria-live="polite">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
};
