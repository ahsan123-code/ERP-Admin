import { useState } from 'react';
import Modal from '../../components/shared/Modal';
import Button from '../../components/ui/Button';
import { Trash2, TriangleAlert } from 'lucide-react';
import styles from './DeleteConfirmModal.module.css';

export default function DeleteConfirmModal({ employee, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  return (
    <Modal
      open={!!employee}
      onClose={onClose}
      title=""
      size="sm"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirm} disabled={deleting} icon={<Trash2 size={14} />}>
            {deleting ? 'Deleting…' : 'Yes, Delete'}
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <div className={styles.iconWrap}>
          <TriangleAlert size={32} strokeWidth={1.5} />
        </div>
        <h3 className={styles.title}>Delete Employee?</h3>
        <p className={styles.desc}>
          You are about to permanently delete
        </p>
        <div className={styles.empCard}>
          <span className={styles.empName}>{employee?.name}</span>
          <span className={styles.empId}>{employee?.employee_id}</span>
        </div>
        <p className={styles.warn}>This action cannot be undone.</p>
      </div>
    </Modal>
  );
}
