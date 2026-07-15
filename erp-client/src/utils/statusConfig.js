export const STATUS_CONFIG = {
  // Generic
  active:     { label: 'Active',      variant: 'success' },
  inactive:   { label: 'Inactive',    variant: 'danger'  },

  // Orders / Work
  pending:          { label: 'Pending',            variant: 'info'    },
  processing:       { label: 'Processing',         variant: 'warning' },
  in_progress:      { label: 'In Progress',        variant: 'warning' },
  dispatched:       { label: 'Dispatched',         variant: 'info'    },
  completed:        { label: 'Completed',          variant: 'success' },
  cancelled:        { label: 'Cancelled',          variant: 'danger'  },
  approved:         { label: 'Approved',           variant: 'success' },
  rejected:         { label: 'Rejected',           variant: 'danger'  },
  submitted:        { label: 'Submitted',          variant: 'info'    },
  draft:            { label: 'Draft',              variant: 'info'    },
  converted:        { label: 'Converted to PO',   variant: 'success' },
  issued:           { label: 'Issued',             variant: 'info'    },
  confirmed:        { label: 'Confirmed',          variant: 'success' },
  partially_received: { label: 'Partial Receipt', variant: 'warning' },
  open:             { label: 'Open',               variant: 'info'    },
  received:         { label: 'Received',           variant: 'success' },
  posted:           { label: 'Posted',             variant: 'success' },
  unpaid:           { label: 'Unpaid',             variant: 'warning' },
  verified:         { label: 'Verified',           variant: 'success' },
  scheduled:        { label: 'Scheduled',          variant: 'info'    },
  cleared:          { label: 'Cleared',             variant: 'success' },
  bounced:          { label: 'Bounced',             variant: 'danger'  },

  // FBR
  synced:   { label: 'Synced',   variant: 'success' },
  failed:   { label: 'Failed',   variant: 'danger'  },

  // Matching
  matched:     { label: 'Matched',     variant: 'success' },
  discrepancy: { label: 'Discrepancy', variant: 'danger'  },

  // Attendance
  present:  { label: 'Present',  variant: 'success' },
  absent:   { label: 'Absent',   variant: 'danger'  },
  late:     { label: 'Late',     variant: 'warning' },
  half_day: { label: 'Half Day', variant: 'warning' },
  leave:    { label: 'On Leave', variant: 'info'    },

  // Payroll
  paid:      { label: 'Paid',      variant: 'success' },
  processed: { label: 'Processed', variant: 'warning' },

  // Reconciliation
  matched:   { label: 'Matched',   variant: 'success' },
  partial:   { label: 'Partial',   variant: 'warning' },
  unmatched: { label: 'Unmatched', variant: 'danger'  },

  // QC
  passed: { label: 'QC Passed', variant: 'success' },

  // Stock
  normal:   { label: 'Normal',   variant: 'success' },
  low:      { label: 'Low',      variant: 'warning' },
  critical: { label: 'Critical', variant: 'danger'  },
};

export const getStatus = (key) =>
  STATUS_CONFIG[key] ?? { label: key, variant: 'info' };

// Derive a stock alert level from current stock vs the item's reorder limit.
// No limit set (<= 0) → not alerting; out of stock → critical; at or below the
// limit → low; otherwise normal. This is the single source of truth for the
// low-stock alert across Inventory and Dashboard.
export const stockStatus = (item) => {
  const stock = Number(item?.current_stock) || 0;
  const limit = Number(item?.reorder_level) || 0;
  if (limit <= 0)     return 'normal';
  if (stock <= 0)     return 'critical';
  if (stock <= limit) return 'low';
  return 'normal';
};
