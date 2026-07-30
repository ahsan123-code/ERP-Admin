import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, X } from 'lucide-react';
import Button from '../ui/Button';
import { buildWordHtml, downloadWordDoc } from '../../utils/wordExport';
import styles from './WordPreviewModal.module.css';

// Shows the document exactly as it will arrive in Word, then downloads it.
// The iframe is fed the same markup buildWordHtml() writes into the .doc, so what
// the user approves here is what they get. `doc` is the spec object
// ({ filename, title, css, body, landscape }); pass null to close.
export default function WordPreviewModal({ doc, onClose }) {
  useEffect(() => {
    document.body.style.overflow = doc ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [doc]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (doc) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [doc, onClose]);

  if (!doc) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.toolbar}>
          <div>
            <span className={styles.title}>{doc.title || 'Document Preview'}</span>
            <span className={styles.meta}>
              {doc.landscape ? 'A4 landscape' : 'A4 portrait'} · {doc.filename}.doc
            </span>
          </div>
          <div className={styles.actions}>
            <Button
              variant="primary"
              size="sm"
              icon={<FileDown size={14} strokeWidth={1.75} />}
              onClick={() => { downloadWordDoc(doc); onClose(); }}
            >
              Download Word
            </Button>
            <Button variant="ghost" size="sm" icon={<X size={14} strokeWidth={2} />} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className={styles.body}>
          {/* sandbox with no allow-scripts: the preview only ever renders static markup */}
          <iframe
            className={styles.frame}
            title="Document preview"
            sandbox=""
            srcDoc={buildWordHtml(doc, { forScreen: true })}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
