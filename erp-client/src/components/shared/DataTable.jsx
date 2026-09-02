import { useState, useMemo, useDeferredValue } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import EmptyState from './EmptyState';
import { SkeletonTable } from './Skeleton';
import styles from './DataTable.module.css';

const PAGE_SIZE = 12;

// A stable empty array. `data || []` would hand every memo below a fresh identity on
// each render and defeat the caching entirely.
const EMPTY = [];

// Joins a row's values for searching. Not a space: the separator has to be something a
// user cannot type, or a query spanning the end of one field and the start of the next
// would match, which searching value-by-value never did.
const SEP = '\u0001';

export default function DataTable({
  columns,
  data,
  searchable = true,
  searchPlaceholder = 'Search...',
  filterTabs,
  activeTab,
  onTabChange,
  actions,
  keyField = 'id',
  onRowClick,
  loading = false,
  skeletonRows = 6,
  pageSize = PAGE_SIZE,
}) {
  const [query,   setQuery]   = useState('');
  const [page,    setPage]    = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const rows = data || EMPTY;

  // Typing stays instant while the filtering of a large list happens at lower priority,
  // so a keystroke never waits on 20,000 rows before it appears in the box.
  const deferredQuery = useDeferredValue(query);

  // Each row flattened and lower-cased once per data change, instead of once per row per
  // keystroke. The old predicate rebuilt Object.values(row) and re-lower-cased the query
  // for every cell it looked at — roughly 300,000 string allocations per keystroke on
  // Shop #41's invoice list, all on the main thread.
  const haystacks = useMemo(
    () => rows.map(row => Object.values(row).map(v => String(v ?? '')).join(SEP).toLowerCase()),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!searchable || !q) return rows;
    return rows.filter((_, i) => haystacks[i].includes(q));
  }, [rows, haystacks, deferredQuery, searchable]);

  // Sorting was re-running on EVERY render, not only when the sort changed: `filtered`
  // was a fresh array each time, so [...filtered].sort() copied and sorted the whole
  // list again on any parent state change.
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const firstIndex = (safePage - 1) * pageSize;
  const slice      = sorted.slice(firstIndex, firstIndex + pageSize);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) return <ArrowUpDown size={12} className={styles.sortIcon} />;
    return sortDir === 'asc'
      ? <ArrowUp size={12} className={styles.sortIconActive} />
      : <ArrowDown size={12} className={styles.sortIconActive} />;
  };

  return (
    <div className={styles.wrapper}>
      {/* Toolbar */}
      {(filterTabs || searchable || actions) && (
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {filterTabs && (
              <div className={styles.tabs}>
                {filterTabs.map(tab => (
                  <button
                    key={tab.value}
                    className={`${styles.tab} ${activeTab === tab.value ? styles.tabActive : ''}`}
                    onClick={() => { onTabChange?.(tab.value); setPage(1); }}
                  >
                    {tab.label}
                    {tab.count != null && (
                      <span className={styles.tabCount}>{tab.count}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={styles.toolbarRight}>
            {searchable && (
              <div className={styles.searchBox}>
                <Search size={14} className={styles.searchIcon} />
                <input
                  className={styles.searchInput}
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setPage(1); }}
                />
              </div>
            )}
            {actions && <div className={styles.toolbarActions}>{actions}</div>}
          </div>
        </div>
      )}

      {/* Table */}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{ width: col.width, textAlign: col.align ?? 'left' }}
                  className={col.sortable !== false ? styles.sortable : ''}
                  onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                >
                  <span className={styles.thInner}>
                    {col.label}
                    {col.sortable !== false && col.label && <SortIcon colKey={col.key} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonTable columns={columns} rows={skeletonRows} />
            ) : slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.emptyCell}>
                  <EmptyState
                    message={query ? `No results for "${query}"` : 'No records found'}
                    small
                  />
                </td>
              </tr>
            ) : (
              slice.map((row, i) => (
                <tr
                  // Absolute, not the slice index: a row with no keyField fell back to
                  // its position within the page, so the third row of page 2 reused the
                  // key of the third row of page 1 and React kept the old row's state.
                  key={row[keyField] ?? `row-${firstIndex + i}`}
                  className={onRowClick ? styles.clickableRow : ''}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map(col => (
                    <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>
            Showing {firstIndex + 1}–{Math.min(firstIndex + pageSize, sorted.length)} of {sorted.length} results
          </span>
          <div className={styles.pageButtons}>
            <button
              className={styles.pageBtn}
              disabled={safePage <= 1}
              onClick={() => setPage(p => p - 1)}
            ><ChevronLeft size={15} /></button>
            <span className={styles.pageNum}>{safePage} / {totalPages}</span>
            <button
              className={styles.pageBtn}
              disabled={safePage >= totalPages}
              onClick={() => setPage(p => p + 1)}
            ><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
