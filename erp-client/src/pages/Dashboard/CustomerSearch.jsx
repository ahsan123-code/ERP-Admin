import { useState, useEffect, useRef } from 'react';
import { Search, X, User } from 'lucide-react';
import { salesDb } from '../../lib/db';
import styles from './CustomerSearch.module.css';

export default function CustomerSearch({ onSelect }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const ref      = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const { data } = await salesDb.searchCustomers(q);
      setResults(data ?? []);
      setOpen(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (customer) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onSelect(customer);
  };

  const clear = () => { setQuery(''); setResults([]); setOpen(false); };

  return (
    <div className={styles.wrap} ref={ref}>
      <div className={styles.bar}>
        <Search size={16} className={styles.icon} />
        <input
          className={styles.input}
          placeholder="Search customer by name to view history and create invoices or orders..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {query && (
          <button className={styles.clearBtn} onClick={clear} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className={styles.dropdown}>
          {loading ? (
            <div className={styles.state}>Searching...</div>
          ) : results.length === 0 ? (
            <div className={styles.state}>No customers found for &ldquo;{query}&rdquo;</div>
          ) : (
            results.map(c => (
              <button key={c.customer_id} className={styles.item} onClick={() => handleSelect(c)}>
                <div className={styles.avatar}>{c.name.slice(0, 2).toUpperCase()}</div>
                <div className={styles.info}>
                  <span className={styles.name}>{c.name}</span>
                  <span className={styles.meta}>
                    {c.customer_id}
                    {c.ntn ? ` · NTN ${c.ntn}` : ''}
                    {c.region ? ` · ${c.region}` : ''}
                  </span>
                </div>
                <div className={styles.right}>
                  {c.outstanding_balance != null && (
                    <span className={styles.balance}>
                      PKR {Number(c.outstanding_balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                    </span>
                  )}
                  <span className={`${styles.status} ${c.status === 'active' ? styles.active : styles.inactive}`}>
                    {c.status}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
