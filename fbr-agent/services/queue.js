const db = require('./supabase');
const { checkLocalService, submitInvoice } = require('./fbrService');
const { buildInvoicePayload } = require('../utils/invoiceBuilder');
const { normaliseInvoice, syntheticLineItems, normaliseLineItems } = require('../utils/normalise');

/**
 * Files invoices that were raised while this machine was off.
 *
 * The shop PC is switched off after office hours, but the ERP itself is hosted and
 * staff can raise an invoice from anywhere at any time. Those invoices land in the
 * database as fbr_status 'pending' and, without this, would sit there until somebody
 * remembered to open the Invoicing screen on the right machine and press Submit.
 * The queue drains them on its own: once when the agent starts, then on an interval.
 */

const ENABLED       = process.env.QUEUE_ENABLED !== 'false';
const INTERVAL_MIN  = Math.max(1, parseInt(process.env.QUEUE_INTERVAL_MINUTES || '5', 10));
const MAX_RETRIES   = Math.max(1, parseInt(process.env.QUEUE_MAX_RETRIES || '5', 10));
const BATCH_LIMIT   = Math.max(1, parseInt(process.env.QUEUE_BATCH_LIMIT || '50', 10));
// Both this agent and the AJK fiscal component start with Windows. The component is
// an IIS-hosted service and is reliably the slower of the two, so the first drain
// waits rather than burning a retry on every backlogged invoice at 8am.
const STARTUP_DELAY_SEC = Math.max(0, parseInt(process.env.QUEUE_STARTUP_DELAY_SECONDS || '45', 10));
// Filing through the AJK cloud endpoint reaches the same place, but AJK register a POS
// against one till machine and the local component is the path they nominate. Left true,
// the queue waits for that component rather than filing around it.
const REQUIRE_LOCAL = process.env.QUEUE_REQUIRE_LOCAL !== 'false';

let running   = false;
let timer     = null;
let lastRun   = null;

/** File one invoice. Returns the result and whether it should count as an attempt. */
async function fileOne(invoice) {
  const norm  = normaliseInvoice(invoice);
  const rows  = await db.getInvoiceItems(norm.invoiceId);
  const items = rows.length > 0 ? normaliseLineItems(rows) : syntheticLineItems(norm);

  const payload = buildInvoicePayload(norm, items, { invoiceType: 1, paymentMode: 1 });
  const result  = await submitInvoice(payload);
  const now     = new Date().toISOString();

  if (result.success) {
    await db.updateInvoiceFbrStatus(norm.invoiceId, {
      fbr_status:            'synced',
      fbr_submitted_at:      now,
      fiscal_invoice_number: result.fiscalInvoiceNumber,
    });
    await db.logSubmission({
      invoiceId:    norm.invoiceId,
      result:       'synced',
      responseCode: result.code,
      message:      `${result.method}: ${result.fiscalInvoiceNumber}`,
    });
  } else {
    await db.updateInvoiceFbrStatus(norm.invoiceId, {
      fbr_status:       'failed',
      fbr_submitted_at: now,
      fbr_retry_count:  (parseInt(invoice.fbr_retry_count, 10) || 0) + 1,
    });
    await db.logSubmission({
      invoiceId:    norm.invoiceId,
      result:       'failed',
      responseCode: result.code,
      message:      result.error || result.response || 'submission rejected',
    });
  }

  return result;
}

/**
 * Drain the backlog. Safe to call at any time — overlapping runs are refused rather
 * than queued, so a slow batch cannot be started twice by the timer and a button press.
 */
async function drain(trigger = 'manual') {
  if (!db.configured) {
    return { skipped: 'not-configured', message: 'SUPABASE_URL / SUPABASE_KEY are not set in .env' };
  }
  if (running) {
    return { skipped: 'already-running' };
  }

  running = true;
  const startedAt = new Date().toISOString();

  try {
    if (REQUIRE_LOCAL) {
      const local = await checkLocalService();
      if (!local.online) {
        const out = { skipped: 'component-offline', trigger, startedAt,
                      message: 'AJK fiscal component is not answering on port 8524 — leaving the backlog for the next run.' };
        lastRun = out;
        console.warn(`[queue] ${out.message}`);
        return out;
      }
    }

    const invoices = await db.getUnfiledInvoices({ maxRetries: MAX_RETRIES, limit: BATCH_LIMIT });
    if (invoices.length === 0) {
      const out = { trigger, startedAt, finishedAt: new Date().toISOString(), found: 0, synced: 0, failed: 0 };
      lastRun = out;
      return out;
    }

    console.log(`[queue] ${invoices.length} invoice(s) waiting (trigger: ${trigger})`);

    let synced = 0, failed = 0;
    const errors = [];

    // Serially, not in parallel: the fiscal component is a single till and issues
    // fiscal numbers in sequence. Firing a batch at it concurrently is how you get
    // one invoice's number handed to another.
    for (const inv of invoices) {
      try {
        const result = await fileOne(inv);
        if (result.success) {
          synced++;
          console.log(`[queue] ${inv.invoice_id} filed -> ${result.fiscalInvoiceNumber}`);
        } else {
          failed++;
          const why = result.error || result.response || `code ${result.code}`;
          errors.push({ invoiceId: inv.invoice_id, message: why });
          console.warn(`[queue] ${inv.invoice_id} rejected: ${why}`);
        }
      } catch (err) {
        failed++;
        errors.push({ invoiceId: inv.invoice_id, message: err.message });
        console.error(`[queue] ${inv.invoice_id} errored: ${err.message}`);
      }
    }

    const out = {
      trigger, startedAt, finishedAt: new Date().toISOString(),
      found: invoices.length, synced, failed,
      errors: errors.slice(0, 10),
    };
    lastRun = out;
    console.log(`[queue] done — ${synced} filed, ${failed} failed`);
    return out;
  } catch (err) {
    const out = { trigger, startedAt, finishedAt: new Date().toISOString(), error: err.message };
    lastRun = out;
    console.error(`[queue] run failed: ${err.message}`);
    return out;
  } finally {
    running = false;
  }
}

/** Waiting count plus what the last run did, for the Invoicing screen. */
async function status() {
  const base = {
    enabled:         ENABLED,
    configured:      db.configured,
    running,
    intervalMinutes: INTERVAL_MIN,
    maxRetries:      MAX_RETRIES,
    requireLocal:    REQUIRE_LOCAL,
    lastRun,
  };
  if (!db.configured) return { ...base, pending: null };
  try {
    return { ...base, pending: await db.countUnfiled({ maxRetries: MAX_RETRIES }) };
  } catch (err) {
    return { ...base, pending: null, error: err.message };
  }
}

function start() {
  if (!ENABLED) {
    console.log('[queue] disabled (QUEUE_ENABLED=false)');
    return;
  }
  if (!db.configured) {
    console.warn('[queue] SUPABASE_URL / SUPABASE_KEY missing in .env — invoices raised while this PC was off will NOT be filed automatically.');
    return;
  }

  console.log(`[queue] on — first run in ${STARTUP_DELAY_SEC}s, then every ${INTERVAL_MIN} min`);
  setTimeout(() => {
    drain('startup');
    timer = setInterval(() => drain('interval'), INTERVAL_MIN * 60 * 1000);
  }, STARTUP_DELAY_SEC * 1000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, drain, status };
