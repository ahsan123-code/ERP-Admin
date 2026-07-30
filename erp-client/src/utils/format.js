export const formatCurrency = (value) => {
  if (value == null) return '—';
  return 'PKR ' + Number(value).toLocaleString('en-PK');
};

export const formatNumber = (value) => {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-PK');
};

// Item codes are not shown anywhere in the app — only the product name is. A short-lived
// version of NewOrderModal stored sold lines as "CODE — Name" (so_line_items has no
// item_code column), so a handful of existing rows carry the merged form; this strips it
// wherever a stored item name is displayed. Rows saved with a bare name pass through
// untouched.
//
// The leading segment is dropped only when it looks like a code (no whitespace), so a
// product whose name genuinely contains an em dash — e.g. 'GI Sheet, 48" — Heavy' —
// keeps both halves.
export const itemLabel = (name) => {
  const s = String(name ?? '').trim();
  if (!s) return '—';
  const at = s.indexOf(' — ');
  if (at > 0 && !/\s/.test(s.slice(0, at))) return s.slice(at + 3).trim() || s;
  return s;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

export const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

export const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};
