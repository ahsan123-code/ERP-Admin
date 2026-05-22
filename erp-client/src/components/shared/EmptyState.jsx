import { Inbox } from 'lucide-react';
import styles from './EmptyState.module.css';

export default function EmptyState({ message = 'No data found', description, small = false, icon }) {
  const IconComponent = icon;
  return (
    <div className={`${styles.wrapper} ${small ? styles.small : ''}`}>
      <div className={styles.icon}>
        {IconComponent
          ? <IconComponent size={small ? 22 : 30} strokeWidth={1.5} />
          : <Inbox size={small ? 22 : 30} strokeWidth={1.5} />
        }
      </div>
      <p className={styles.message}>{message}</p>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
