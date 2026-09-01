/**
 * Shared shaping of an ERP invoice row into what buildInvoicePayload expects.
 *
 * Both the HTTP routes and the background queue file the same invoices, so this
 * has to live in one place: a difference between the two would mean an invoice
 * filed by hand carried different figures to the same invoice filed on retry.
 */

/**
 * Normalise an invoice row to the camelCase shape buildInvoicePayload expects.
 * Accepts both snake_case (from the database) and camelCase (from the frontend form).
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

/**
 * Map invoice_items rows to the line shape buildInvoicePayload expects.
 * total_price is tax-inclusive and tax_rate is per line, so an invoice raised
 * at a rate other than the default is rebuilt at the rate it was raised at.
 */
function normaliseLineItems(rows) {
  return (rows || []).map(it => ({
    itemCode:   it.item_code,
    itemName:   it.item_name,
    category:   it.category || 'Steel',
    quantity:   parseFloat(it.quantity) || 0,
    totalPrice: parseFloat(it.total_price) || 0,
    taxRate:    parseFloat(it.tax_rate) || 0,
    discount:   0,
  }));
}

module.exports = { normaliseInvoice, syntheticLineItems, normaliseLineItems };
