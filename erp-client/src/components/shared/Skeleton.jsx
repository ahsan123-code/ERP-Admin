import styles from './Skeleton.module.css';

/**
 * Placeholder blocks shown while data is in flight, so a screen reads as "loading"
 * rather than "empty". Use these instead of rendering a stale or zeroed value —
 * a wrong number that later corrects itself is worse than an obvious placeholder.
 *
 *   <Skeleton width={120} />                     one bar
 *   <SkeletonText lines={3} />                   a paragraph
 *   <SkeletonTable columns={cols} rows={6} />    table body matching real columns
 *   <SkeletonCard />                             a card's worth of content
 */
export default function Skeleton({
  width = '100%',
  height,
  variant = 'text',
  radius,
  className = '',
  style = {},
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.skeleton} ${styles[variant] ?? ''} ${className}`}
      style={{ width, ...(height ? { height } : null), ...(radius ? { borderRadius: radius } : null), ...style }}
    />
  );
}

// Stacked bars. The final line is shortened so a block of them reads as text.
export function SkeletonText({ lines = 3, width = '100%', lastWidth = '60%' }) {
  return (
    <span className={styles.lines} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? lastWidth : width} />
      ))}
    </span>
  );
}

// Table rows that mirror the real columns, so the header keeps its widths and the
// layout does not jump when the data arrives.
export function SkeletonTable({ columns = [], rows = 6 }) {
  const cols = columns.length ? columns : Array.from({ length: 4 }, (_, i) => ({ key: i }));
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} aria-hidden="true">
      {cols.map((col, c) => (
        <td key={col.key ?? c} style={{ textAlign: col.align ?? 'left' }}>
          <Skeleton
            variant="cell"
            // Vary the widths a little so it looks like content, not a grid.
            width={col.width ? Math.min(col.width - 16, 140) : ['70%', '55%', '85%', '45%'][(r + c) % 4]}
            style={col.align === 'right' ? { marginLeft: 'auto' } : undefined}
          />
        </td>
      ))}
    </tr>
  ));
}

export function SkeletonCard({ lines = 4 }) {
  return (
    <div className={styles.card} aria-hidden="true">
      <Skeleton variant="title" width="35%" />
      <SkeletonText lines={lines} />
    </div>
  );
}

// Row of summary tiles, e.g. the stat strip at the top of a page.
export function SkeletonStats({ count = 4, height = 88 }) {
  return (
    <div
      className={styles.statRow}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} radius="var(--radius-lg)" />
      ))}
    </div>
  );
}
