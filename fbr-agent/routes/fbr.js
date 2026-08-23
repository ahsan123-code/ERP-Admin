const express = require('express');
const router  = express.Router();
const { buildInvoicePayload }  = require('../utils/invoiceBuilder');
const { checkLocalService, submitInvoice, submitToCloud } = require('../services/fbrService');

// GET /api/fbr/status
// Check if AJK-IRD local fiscal service is running
router.get('/status', async (req, res) => {
  const result = await checkLocalService();
  res.json(result);
});

/**
 * Normalise an invoice row to the camelCase shape buildInvoicePayload expects.
 * Accepts both snake_case (from DB) and camelCase (from frontend form).
 */
function normaliseInvoice(inv) {
  return {
    invoiceId:    inv.invoice_id    ?? inv.invoiceId    ?? '',
    invoiceDate:  inv.invoice_date  ?? inv.invoiceDate  ?? new Date().toISOString().split('T')[0],
    customerName: inv.customer_name ?? inv.customerName ?? '',
    cnic:         inv.cnic          ?? '',
    ntn:          inv.ntn           ?? '',
    contact:      inv.contact       ?? '',
    subtotal:     parseFloat(inv.subtotal   ?? 0),
    taxAmount:    parseFloat(inv.tax_amount ?? inv.taxAmount ?? 0),
    totalValue:   parseFloat(inv.total_value ?? inv.totalValue ?? 0),
    invoiceType:  inv.invoice_type  ?? inv.invoiceType  ?? 1,
  };
}

/**
 * Build a synthetic single-line item from invoice totals when no itemised
 * line items are available (common for imported / legacy invoices).
 */
function syntheticLineItems(inv) {
  const totalPrice = inv.totalValue || inv.subtotal + inv.taxAmount || 0;
  return [{
    itemCode:   'STEEL-GENERAL',
    itemName:   'Steel Products',
    category:   'Steel',
    quantity:   1,
    totalPrice,
    discount:   0,
  }];
}

// POST /api/fbr/submit
router.post('/submit', async (req, res) => {
  const { invoice, lineItems, options } = req.body;

  if (!invoice) {
    return res.status(400).json({ error: 'invoice is required' });
  }

  try {
    const norm  = normaliseInvoice(invoice);
    const items = Array.isArray(lineItems) && lineItems.length > 0
      ? lineItems
      : syntheticLineItems(norm);

    const payload = buildInvoicePayload(norm, items, options);
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
    const norm  = normaliseInvoice(invoice);
    const items = Array.isArray(lineItems) && lineItems.length > 0
      ? lineItems
      : syntheticLineItems(norm);

    const payload = buildInvoicePayload(norm, items, options);
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
    const norm  = normaliseInvoice(invoice);
    const items = Array.isArray(lineItems) && lineItems.length > 0
      ? lineItems
      : syntheticLineItems(norm);

    const payload = buildInvoicePayload(norm, items, options);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
