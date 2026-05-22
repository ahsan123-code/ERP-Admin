import { useState, useRef } from 'react';
import styles from './Tooltip.module.css';

export default function Tooltip({ children, content, placement = 'top', delay = 400 }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  if (!content) return children;

  const show = () => {
    timer.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setVisible(false);
  };

  return (
    <span className={styles.wrap} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <span className={`${styles.tooltip} ${styles[placement]}`} role="tooltip">
          {content}
        </span>
      )}
    </span>
  );
}
