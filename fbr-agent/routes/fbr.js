const express = require('express');
const router  = express.Router();
const { buildInvoicePayload }  = require('../utils/invoiceBuilder');
const { normaliseInvoice, syntheticLineItems } = require('../utils/normalise');
const { checkLocalService, submitInvoice, submitToCloud } = require('../services/fbrService');
const queue = require('../services/queue');

/** Line items as given, or a synthetic single line when the invoice has none. */
function itemsFor(norm, lineItems) {
  return Array.isArray(lineItems) && lineItems.length > 0 ? lineItems : syntheticLineItems(norm);
}

// GET /api/fbr/status
// Check if AJK-IRD local fiscal service is running
router.get('/status', async (req, res) => {
  const result = await checkLocalService();
  res.json(result);
});

// GET /api/fbr/queue
// How many invoices are waiting to be filed, and what the last run did.
router.get('/queue', async (req, res) => {
  try {
    res.json(await queue.status());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fbr/queue/run
// File the backlog now instead of waiting for the next interval.
router.post('/queue/run', async (req, res) => {
  try {
    res.json(await queue.drain('manual'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fbr/submit
router.post('/submit', async (req, res) => {
  const { invoice, lineItems, options } = req.body;

  if (!invoice) {
    return res.status(400).json({ error: 'invoice is required' });
  }

  try {
    const norm    = normaliseInvoice(invoice);
    const payload = buildInvoicePayload(norm, itemsFor(norm, lineItems), options);
    const result  = await submitInvoice(payload);

    res.json({ invoiceId: norm.invoiceId, ...result, submittedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fbr/submit-cloud
router.post('/submit-cloud', async (req, res) => {
  const { invoice, lineItems, options, sandbox = true } = req.body;

  if (!invoice) {
    return res.status(400).json({ error: 'invoice is required' });
  }

  try {
    const norm    = normaliseInvoice(invoice);
    const payload = buildInvoicePayload(norm, itemsFor(norm, lineItems), options);
    const result  = await submitToCloud(payload, sandbox);

    res.json({ invoiceId: norm.invoiceId, ...result, submittedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fbr/preview
router.post('/preview', (req, res) => {
  const { invoice, lineItems, options } = req.body;

  if (!invoice) {
    return res.status(400).json({ error: 'invoice is required' });
  }

  try {
    const norm = normaliseInvoice(invoice);
    res.json(buildInvoicePayload(norm, itemsFor(norm, lineItems), options));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
