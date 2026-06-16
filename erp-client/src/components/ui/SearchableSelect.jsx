import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import styles from './SearchableSelect.module.css';

/**
 * A searchable dropdown ("combobox"). Type to filter `options` by label/hint,
 * click an option to select it. Falls back to a plain "no options" message
 * when the list is empty.
 */
export default function SearchableSelect({
  label, required, error,
  placeholder = 'Search…', emptyText = 'No options found',
  options, value, onChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const fieldRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (fieldRef.current && !fieldRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = query.trim()
    ? options.filter(o => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const handleSelect = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0) handleSelect(filtered[0]);
    }
  };

  return (
    <div className={styles.field} ref={fieldRef}>
      {label && (
        <label className={styles.label}>
          {label}{required && <span className={styles.req}>*</span>}
        </label>
      )}
      <div
        className={`${styles.control} ${error ? styles.hasError : ''} ${open ? styles.controlOpen : ''}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <Search size={14} className={styles.searchIcon} />
        <input
          ref={inputRef}
          className={styles.searchInput}
          value={open ? query : (selected?.label ?? '')}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected ? selected.label : placeholder}
        />
        <ChevronDown size={14} className={styles.chevron} />
      </div>

      {open && (
        <div className={styles.panel}>
          {filtered.length === 0 && <div className={styles.empty}>{emptyText}</div>}
          {filtered.map(o => (
            <button
              type="button"
              key={o.value}
              className={`${styles.option} ${o.value === value ? styles.optionActive : ''}`}
              onClick={() => handleSelect(o)}
            >
              <span className={styles.optionCheck}>
                {o.value === value && <Check size={12} strokeWidth={2.5} />}
              </span>
              <span className={styles.optionLabel}>{o.label}</span>
              {o.hint && <span className={styles.optionHint}>{o.hint}</span>}
            </button>
          ))}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
