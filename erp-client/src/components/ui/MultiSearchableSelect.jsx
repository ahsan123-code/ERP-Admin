import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import styles from './SearchableSelect.module.css';
import multi from './MultiSearchableSelect.module.css';

/**
 * The multi-select twin of SearchableSelect: same searchable dropdown, but clicking an
 * option toggles it in and out of `values` instead of replacing the selection, and the
 * panel stays open so several can be picked in one go. Selected options show as chips
 * above the control, each removable.
 *
 * `values` is an array of option values; `onChange` receives the next array. Options
 * carry the same `label` / `hint` / `search` fields SearchableSelect understands.
 */
export default function MultiSearchableSelect({
  label, required, error,
  placeholder = 'Search…', emptyText = 'No options found',
  options, values = [], onChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const fieldRef = useRef(null);
  const inputRef = useRef(null);

  const selectedSet = new Set(values);
  const selected = options.filter(o => selectedSet.has(o.value));

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
    ? options.filter(o => `${o.label} ${o.hint ?? ''} ${o.search ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const toggle = (optValue) => {
    onChange(selectedSet.has(optValue)
      ? values.filter(v => v !== optValue)
      : [...values, optValue]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter takes the top match and clears the query, so a run of
      // type-Enter-type-Enter adds several accounts without touching the mouse.
      if (filtered.length > 0) { toggle(filtered[0].value); setQuery(''); }
    } else if (e.key === 'Backspace' && query === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className={styles.field} ref={fieldRef}>
      {label && (
        <label className={styles.label}>
          {label}{required && <span className={styles.req}>*</span>}
        </label>
      )}

      {selected.length > 0 && (
        <div className={multi.chips}>
          {selected.map(o => (
            <span key={o.value} className={multi.chip}>
              <span className={multi.chipLabel}>{o.label}</span>
              <button
                type="button"
                className={multi.chipRemove}
                onClick={() => toggle(o.value)}
                aria-label={`Remove ${o.label}`}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className={`${styles.control} ${error ? styles.hasError : ''} ${open ? styles.controlOpen : ''}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <Search size={14} className={styles.searchIcon} />
        <input
          ref={inputRef}
          className={styles.searchInput}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        {values.length > 0 && <span className={multi.count}>{values.length}</span>}
        <ChevronDown size={14} className={styles.chevron} />
      </div>

      {open && (
        <div className={styles.panel}>
          {filtered.length === 0 && <div className={styles.empty}>{emptyText}</div>}
          {filtered.map(o => (
            <button
              type="button"
              key={o.value}
              className={`${styles.option} ${selectedSet.has(o.value) ? styles.optionActive : ''}`}
              onClick={() => toggle(o.value)}
            >
              <span className={styles.optionCheck}>
                {selectedSet.has(o.value) && <Check size={12} strokeWidth={2.5} />}
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
