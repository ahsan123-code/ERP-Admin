export const formatCurrency = (value) => {
  if (value == null) return '—';
  return 'PKR ' + Number(value).toLocaleString('en-PK');
};

// Money without the "PKR" prefix — the ledgers repeat an amount on every row, where the
// currency on each one is noise. Same digits as formatCurrency, prefix dropped.
export const formatAmount = (value) => {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-PK');
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

// Sheet dimensions are stored two different ways. Anything raised in the app fills the
// gauge/size columns; the imported history left them empty (0 of 36,922 sales lines have
// a size) and packed the numbers into the item name instead — "GI,3.00MM X 48"",
// "15"2.50 MM", "GI Sheet, 48", 1.90MM". Reading both means a ledger row shows its real
// dimensions either way: 90.6% of lines yield a width, 41.7% a thickness.
const THICKNESS = /(\d+(?:\.\d+)?)\s*MM\b/i;
const WIDTH     = /(\d+(?:\.\d+)?)\s*(?:"|''|inch(?:es)?\b)/i;

const num = (v) => Number(v).toLocaleString('en-PK', { maximumFractionDigits: 2 });

// The stored gauge/size are matched with the same patterns rather than printed as-is:
// they arrive in whatever form was typed ("3.00MM", and in one case the entire spec
// "3.00 MM x 15"" crammed into the gauge field), so reading them the same way keeps every
// row in one shape.
const pick = (re, ...sources) => {
  for (const s of sources) {
    const m = s ? re.exec(String(s)) : null;
    if (m) return parseFloat(m[1]);
  }
  return null;
};

// Thickness: "3.00 mm". Present on 41.7% of lines — the rest were sold by width alone.
export const itemGauge = (li) => {
  const mm = li ? pick(THICKNESS, li.gauge, li.item_name) : null;
  return mm != null ? `${mm.toFixed(2)} mm` : '';
};

// Width: `48"`. Present on 90.6% of lines.
export const itemSize = (li) => {
  const inch = li ? pick(WIDTH, li.size, li.item_name) : null;
  return inch != null ? `${num(inch)}"` : '';
};

// Weight is the line quantity. Steel is sold by weight — 92% of lines are in Kilo Grams —
// but the same column carries counts for fittings (Nut Bolt, Control Box), so the unit is
// shown as stored rather than assumed to be kg.
export const itemWeight = (li) => {
  const qty = parseFloat(li?.quantity) || 0;
  if (!qty) return '';
  const unit = String(li?.unit || '').trim();
  if (/^kilo|^kgs?$/i.test(unit)) return `${num(qty)} kg`;
  return unit ? `${num(qty)} ${unit}` : num(qty);
};

// What the item actually is, with the dimensions taken out — "GI,0.80MM X 48"" becomes
// "GI", because gauge and size now have columns of their own and repeating them in the
// name is what made the row hard to read. Names that are nothing but a dimension ("48"",
// "15"3.00MM" — 35% of lines) have nothing left to show, and return empty rather than a
// stray fragment of punctuation.
export const itemMaterial = (li) => {
  const s = itemLabel(li?.item_name);
  if (s === '—') return '';
  return s
    .replace(THICKNESS, ' ').replace(WIDTH, ' ')
    .replace(/\s+[xX]\s+/g, ' ')
    .replace(/[,\-–—/]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// DD-MM-YYYY, the form the ledgers are read in. An ISO date is reordered as text rather
// than parsed, so a plain 'YYYY-MM-DD' never shifts a day backwards in timezones behind
// UTC (new Date('2024-01-05') is UTC midnight). Anything else falls back to Date parsing.
export const formatDateNumeric = (dateStr) => {
  if (!dateStr) return '—';
  const iso = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
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
