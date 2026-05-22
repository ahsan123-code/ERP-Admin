const { POS_ID, DEFAULT_TAX_RATE } = require('../config/fbr');
const { getPctCode } = require('./pctCodes');

/**
 * Builds an AJK-IRD compliant invoice payload from ERP invoice + line items.
 *
 * @param {Object} invoice   - ERP invoice record
 * @param {Array}  lineItems - Array of sale line items for this invoice
 * @param {Object} options   - { invoiceType: 1|2|3, paymentMode: 1-6, refUSIN: string }
 * @returns {Object} AJK-IRD invoice JSON body
 */
function buildInvoicePayload(invoice, lineItems, options = {}) {
  const {
    invoiceType = 1,   // 1=New, 2=Debit, 3=Credit
    paymentMode = 1,   // 1=Cash, 2=Card, 3=Gift Voucher, 4=Loyalty, 5=Mixed, 6=Cheque
    refUSIN = '',
  } = options;

  const taxRate = DEFAULT_TAX_RATE;

  const items = lineItems.map(line => {
    const saleValue   = parseFloat((line.totalPrice / (1 + taxRate / 100)).toFixed(2));
    const taxCharged  = parseFloat((line.totalPrice - saleValue).toFixed(2));
    const totalAmount = parseFloat(line.totalPrice.toFixed(2));
    const pctCode     = getPctCode(line.itemName, line.category || '');

    return {
      ItemCode:    line.itemCode || line.itemName.substring(0, 20),
      ItemName:    line.itemName,
      PCTCode:     pctCode,
      Quantity:    parseFloat(line.quantity),
      TaxRate:     taxRate,
      SaleValue:   saleValue,
      Discount:    parseFloat((line.discount || 0).toFixed(2)),
      FurtherTax:  0.00,
      TaxCharged:  taxCharged,
      TotalAmount: totalAmount,
      InvoiceType: invoiceType,
      RefUSIN:     refUSIN || null,
    };
  });

  const totalSaleValue   = parseFloat(items.reduce((s, i) => s + i.SaleValue, 0).toFixed(2));
  const totalTaxCharged  = parseFloat(items.reduce((s, i) => s + i.TaxCharged, 0).toFixed(2));
  const totalQuantity    = parseFloat(items.reduce((s, i) => s + i.Quantity, 0).toFixed(2));
  const totalBillAmount  = parseFloat((totalSaleValue + totalTaxCharged).toFixed(2));
  const totalDiscount    = parseFloat(items.reduce((s, i) => s + i.Discount, 0).toFixed(2));

  const dateTime = invoice.invoiceDate
    ? `${invoice.invoiceDate} 00:00:00`
    : new Date().toISOString().replace('T', ' ').substring(0, 19);

  return {
    InvoiceNumber:    '',
    POSID:            String(POS_ID),
    USIN:             invoice.invoiceId,
    RefUSIN:          refUSIN || '',
    DateTime:         dateTime,
    BuyerName:        invoice.customerName  || '',
    BuyerNTN:         invoice.ntn           || '',
    BuyerCNIC:        invoice.cnic          || '',
    BuyerPhoneNumber: invoice.contact       || '',
    TotalSaleValue:   totalSaleValue,
    TotalTaxCharged:  totalTaxCharged,
    TotalQuantity:    totalQuantity,
    Discount:         totalDiscount,
    FurtherTax:       0.00,
    TotalBillAmount:  totalBillAmount,
    PaymentMode:      paymentMode,
    InvoiceType:      invoiceType,
    Items:            items,
  };
}

module.exports = { buildInvoicePayload };
