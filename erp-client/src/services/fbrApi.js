// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE MODE
// Set to true to disable all FBR / POS integration immediately.
// The Invoicing page will show the service as offline with a clear message.
// Flip back to false when the integration is ready to go live again.
// ─────────────────────────────────────────────────────────────────────────────
const MAINTENANCE_MODE = true;
const MAINTENANCE_MSG = 'FBR service is temporarily offline for maintenance. Please try again later.';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000') + '/api/fbr';

async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Check if the AJK-IRD local fiscal service is online.
 * @returns {{ online: boolean, message?, error? }}
 */
export async function checkFbrServiceStatus() {
  if (MAINTENANCE_MODE) return { online: false, message: MAINTENANCE_MSG };
  const res = await fetch(`${BASE}/status`);
  return handleResponse(res);
}

/**
 * Submit an invoice to AJK-IRD (local fiscal component first, cloud fallback).
 *
 * @param {Object} invoice    - Invoice record from ERP
 * @param {Array}  lineItems  - Line items array
 * @param {Object} options    - { invoiceType, paymentMode, refUSIN }
 * @returns {{ success, fiscalInvoiceNumber, code, response, method, submittedAt }}
 */
export async function submitInvoice(invoice, lineItems, options = {}) {
  if (MAINTENANCE_MODE) throw new Error(MAINTENANCE_MSG);
  const res = await fetch(`${BASE}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice, lineItems, options }),
  });
  return handleResponse(res);
}

/**
 * Submit directly to AJK-IRD cloud (skips local fiscal component).
 *
 * @param {Object}  invoice
 * @param {Array}   lineItems
 * @param {Object}  options
 * @param {boolean} sandbox - true = sandbox, false = production
 */
export async function submitInvoiceCloud(invoice, lineItems, options = {}, sandbox = true) {
  if (MAINTENANCE_MODE) throw new Error(MAINTENANCE_MSG);
  const res = await fetch(`${BASE}/submit-cloud`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice, lineItems, options, sandbox }),
  });
  return handleResponse(res);
}

/**
 * How many invoices are waiting to be filed, and what the agent's last run did.
 */
export async function getFbrQueueStatus() {
  if (MAINTENANCE_MODE) throw new Error(MAINTENANCE_MSG);
  const res = await fetch(`${BASE}/queue`);
  return handleResponse(res);
}

/**
 * File the backlog now instead of waiting for the agent's next pass.
 * @returns {{ found, synced, failed, errors } | { skipped }}
 */
export async function runFbrQueue() {
  if (MAINTENANCE_MODE) throw new Error(MAINTENANCE_MSG);
  const res = await fetch(`${BASE}/queue/run`, { method: 'POST' });
  return handleResponse(res);
}

/**
 * Preview the AJK-IRD payload without submitting.
 */
export async function previewInvoicePayload(invoice, lineItems, options = {}) {
  if (MAINTENANCE_MODE) throw new Error(MAINTENANCE_MSG);
  const res = await fetch(`${BASE}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice, lineItems, options }),
  });
  return handleResponse(res);
}

export const PAYMENT_MODES = {
  Cash: 1,
  Card: 2,
  GiftVoucher: 3,
  LoyaltyCard: 4,
  Mixed: 5,
  Cheque: 6,
};

export const INVOICE_TYPES = {
  New: 1,
  Debit: 2,
  Credit: 3,
};
