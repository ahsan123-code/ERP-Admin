const axios = require('axios');

/**
 * Minimal PostgREST client for the handful of tables the queue touches.
 *
 * @supabase/supabase-js would do the same job, but it pulls in a websocket stack
 * and a auth client this agent never uses, and every one of those bytes has to be
 * bundled into the .exe. Four REST calls against axios, which is already a
 * dependency, is the whole requirement.
 */

const URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_KEY || '';

const configured = Boolean(URL && KEY);

function client() {
  if (!configured) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY are not set in .env — the queue cannot reach the database.');
  }
  return axios.create({
    baseURL: `${URL}/rest/v1`,
    timeout: 20000,
    headers: {
      apikey:          KEY,
      Authorization:   `Bearer ${KEY}`,
      'Content-Type':  'application/json',
    },
  });
}

/**
 * Invoices waiting to be filed, oldest first so the backlog drains in the order
 * it was raised. 'synced' is excluded by the filter rather than in code so a
 * filed invoice can never be picked up twice.
 */
async function getUnfiledInvoices({ maxRetries, limit }) {
  const res = await client().get('/invoices', {
    params: {
      select:      '*',
      fbr_status:  'in.(pending,failed)',
      or:          `(fbr_retry_count.is.null,fbr_retry_count.lt.${maxRetries})`,
      order:       'invoice_date.asc,id.asc',
      limit,
    },
  });
  return res.data || [];
}

async function getInvoiceItems(invoiceId) {
  const res = await client().get('/invoice_items', {
    params: {
      select:     '*',
      invoice_id: `eq.${invoiceId}`,
      order:      'line_no.asc',
    },
  });
  return res.data || [];
}

async function updateInvoiceFbrStatus(invoiceId, fields) {
  await client().patch('/invoices', fields, {
    params:  { invoice_id: `eq.${invoiceId}` },
    headers: { Prefer: 'return=minimal' },
  });
}

/**
 * One row per attempt. This is the audit trail for anything filed while nobody
 * was watching, which is most of what the queue does.
 */
async function logSubmission({ invoiceId, result, responseCode, message }) {
  try {
    await client().post('/fbr_submission_log', {
      invoice_id:    invoiceId,
      attempted_at:  new Date().toISOString(),
      result,
      response_code: responseCode == null ? null : String(responseCode),
      message:       message == null ? null : String(message).substring(0, 1000),
    }, { headers: { Prefer: 'return=minimal' } });
  } catch (err) {
    // A log write failing must not undo a successful filing, so this is
    // swallowed deliberately and only reported.
    console.error(`[FBR] could not write submission log for ${invoiceId}: ${err.message}`);
  }
}

/** How many invoices are waiting, without pulling the rows themselves. */
async function countUnfiled({ maxRetries }) {
  const res = await client().get('/invoices', {
    params: {
      select:     'invoice_id',
      fbr_status: 'in.(pending,failed)',
      or:         `(fbr_retry_count.is.null,fbr_retry_count.lt.${maxRetries})`,
    },
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  const range = res.headers['content-range'] || '';
  const total = parseInt(range.split('/')[1], 10);
  return Number.isNaN(total) ? (res.data || []).length : total;
}

module.exports = {
  configured,
  getUnfiledInvoices,
  getInvoiceItems,
  updateInvoiceFbrStatus,
  logSubmission,
  countUnfiled,
};
