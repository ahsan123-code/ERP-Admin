import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import EmptyState from './EmptyState';
import { SkeletonTable } from './Skeleton';
import styles from './DataTable.module.css';

const PAGE_SIZE = 12;

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
}) {
  const [query,   setQuery]   = useState('');
  const [page,    setPage]    = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const rows = data || [];

  const filtered = searchable && query.trim()
    ? rows.filter(row =>
        Object.values(row).some(v =>
          String(v ?? '').toLowerCase().includes(query.toLowerCase())
        )
      )
    : rows;

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const av = a[sortKey] ?? '';
        const bv = b[sortKey] ?? '';
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : filtered;

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const slice      = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
                  key={row[keyField] ?? i}
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
            Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length} results
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
