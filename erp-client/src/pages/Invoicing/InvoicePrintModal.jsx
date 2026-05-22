import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, X, BadgeCheck } from 'lucide-react';
import Button from '../../components/ui/Button';
import { formatCurrency, formatDate } from '../../utils/format';
import styles from './InvoicePrintModal.module.css';

const COMPANY = {
  name:    'Ahsan Brothers Steel',
  address: 'Main Market, Lahore, Punjab, Pakistan',
  ntn:     '9207491-5',
  strn:    '3277876323039',
  phone:   '0300-0000000',
};

const TAX_RATE = 18;

export default function InvoicePrintModal({ invoice: raw, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const printRef = useRef();

  const invoice = raw ? {
    invoiceId:            raw.invoice_id           ?? raw.invoiceId           ?? '',
    invoiceDate:          raw.invoice_date          ?? raw.invoiceDate          ?? '',
    invoiceType:          raw.invoice_type          ?? raw.invoiceType          ?? '',
    customerName:         raw.customer_name         ?? raw.customerName         ?? '',
    cnic:                 raw.cnic                  ?? '',
    ntn:                  raw.ntn                   ?? '',
    contact:              raw.contact               ?? '',
    soRef:                raw.so_ref                ?? raw.soRef                ?? '',
    subtotal:             raw.subtotal              ?? 0,
    taxAmount:            raw.tax_amount            ?? raw.taxAmount            ?? 0,
    totalValue:           raw.total_value           ?? raw.totalValue           ?? 0,
    fbrStatus:            raw.fbr_status            ?? raw.fbrStatus            ?? '',
    fbrSubmittedAt:       raw.fbr_submitted_at      ?? raw.fbrSubmittedAt       ?? '',
    fiscalInvoiceNumber:  raw.fiscal_invoice_number ?? raw.fiscalInvoiceNumber  ?? '',
    lineItems:            raw.lineItems             ?? [],
  } : null;

  const lineItems   = invoice?.lineItems || [];
  const fiscalNo    = invoice?.fiscalInvoiceNumber || '— pending submission —';
  const isSubmitted = !!invoice?.fiscalInvoiceNumber;

  useEffect(() => {
    if (!invoice) return;
    const qrContent = isSubmitted
      ? `FBR-AJK|${fiscalNo}|${invoice.invoiceId}|${invoice.totalValue}`
      : (invoice.invoiceId || 'INVOICE');
    QRCode.toDataURL(qrContent, { width: 120, margin: 1, color: { dark: '#000', light: '#fff' } })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [invoice, fiscalNo, isSubmitted]);

  const subtotal   = lineItems.reduce((s, l) => s + (l.totalPrice / (1 + TAX_RATE / 100)), 0);
  const tax        = lineItems.reduce((s, l) => s + (l.totalPrice - l.totalPrice / (1 + TAX_RATE / 100)), 0);
  const grandTotal = subtotal + tax;

  // For invoices without line items, derive subtotal from totals
  const displaySubtotal   = lineItems.length ? subtotal   : (invoice?.totalValue - invoice?.taxAmount) || 0;
  const displayTax        = lineItems.length ? tax        : invoice?.taxAmount   || 0;
  const displayGrandTotal = lineItems.length ? grandTotal : invoice?.totalValue  || 0;

  // Derive actual rate from stored values so the label is always accurate
  const displayRate = lineItems.length
    ? TAX_RATE
    : (displaySubtotal > 0 ? Math.round((displayTax / displaySubtotal) * 100) : TAX_RATE);

  const handlePrint = () => {
    if (!invoice) return;
    const win = window.open('', '_blank', 'width=950,height=750');

    const lineItemRows = lineItems.map((item, i) => {
      const saleVal = item.totalPrice / (1 + TAX_RATE / 100);
      const taxAmt  = item.totalPrice - saleVal;
      const unitPr  = item.unitPrice || (item.totalPrice / item.quantity);
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${item.itemName || ''}</td>
          <td style="font-family:monospace">${item.pctCode || '72085190'}</td>
          <td class="right">${item.quantity}</td>
          <td>${item.unit || ''}</td>
          <td class="right">${formatCurrency(unitPr)}</td>
          <td class="right">${formatCurrency(saleVal)}</td>
          <td class="right">${formatCurrency(taxAmt)}</td>
          <td class="right"><strong>${formatCurrency(item.totalPrice)}</strong></td>
        </tr>`;
    }).join('');

    const itemsSection = lineItems.length > 0
      ? `<table>
          <thead>
            <tr>
              <th>#</th><th>Item Description</th><th>PCT Code</th>
              <th class="right">Qty</th><th>Unit</th><th class="right">Unit Price</th>
              <th class="right">Sale Value</th><th class="right">GST ${displayRate}%</th><th class="right">Total</th>
            </tr>
          </thead>
          <tbody>${lineItemRows}</tbody>
        </table>`
      : `<div style="background:#fff8f0;border:1px solid #f0c080;border-radius:4px;padding:12px 16px;margin-bottom:16px;font-size:11px;color:#cc6600;text-align:center;">
          <em>Itemised line items not available for this invoice.</em><br/>
          <span style="color:#444;font-family:monospace">
            Subtotal: ${formatCurrency(displaySubtotal)} &nbsp;|&nbsp;
            Tax: ${formatCurrency(displayTax)} &nbsp;|&nbsp;
            Total: ${formatCurrency(displayGrandTotal)}
          </span>
        </div>`;

    const fiscalSection = isSubmitted
      ? `<div class="fiscal-box" style="background:#f0f7f0;border-color:#1a6b1a;">
          <div>
            <div class="fiscal-label" style="color:#1a6b1a;">&#10003; AJK-IRD Fiscal Invoice Number</div>
            <div class="fiscal-number">${fiscalNo}</div>
          </div>
          <div style="font-size:10px;color:#1a6b1a;">Verify at: iris.ajkird.gov.pk</div>
        </div>`
      : `<div class="fiscal-box" style="background:#fff8f0;border-color:#e0a040;">
          <div>
            <div class="fiscal-label" style="color:#cc6600;">Fiscal Number</div>
            <div class="fiscal-number" style="color:#cc6600;">${fiscalNo}</div>
          </div>
          <div style="font-size:10px;color:#cc6600;font-style:italic;">Submit to AJK-IRD to generate fiscal number</div>
        </div>`;

    const qrSection = qrDataUrl
      ? `<img src="${qrDataUrl}" alt="QR" width="110" height="110" style="display:block;margin:0 auto 4px;" />`
      : '';

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${invoice.invoiceId}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:Arial,sans-serif; font-size:12px; color:#000; background:#fff; }
    .wrap { max-width:850px; margin:0 auto; padding:30px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:16px; margin-bottom:16px; }
    .co-name { font-size:22px; font-weight:700; letter-spacing:-0.5px; }
    .co-meta { font-size:11px; color:#444; margin-top:4px; line-height:1.6; }
    .fbr-badge { text-align:right; }
    .fbr-logo { font-size:22px; font-weight:900; color:#1a6b1a; letter-spacing:2px; }
    .fbr-cert { font-size:10px; font-weight:700; color:#1a6b1a; border:1.5px solid #1a6b1a; padding:3px 8px; border-radius:3px; display:inline-block; margin-top:4px; }
    .inv-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .inv-title h2 { font-size:18px; font-weight:700; text-transform:uppercase; letter-spacing:1px; }
    .inv-meta { font-size:11px; text-align:right; line-height:1.7; }
    .inv-meta .lbl { color:#666; }
    .fiscal-box { border:1.5px solid; border-radius:4px; padding:8px 14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; }
    .fiscal-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }
    .fiscal-number { font-size:15px; font-weight:700; font-family:monospace; color:#000; }
    .section-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:16px; }
    .section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#666; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px; }
    .field-row { display:flex; gap:6px; margin-bottom:4px; font-size:11px; }
    .field-lbl { color:#666; min-width:65px; }
    .field-val { font-weight:600; }
    table { width:100%; border-collapse:collapse; margin-bottom:16px; font-size:11px; }
    thead th { background:#1a1a1a; color:#fff; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; padding:7px 8px; text-align:left; }
    thead th.right { text-align:right; }
    tbody td { padding:6px 8px; border-bottom:1px solid #eee; }
    tbody td.right { text-align:right; font-family:monospace; }
    tbody tr:nth-child(even) { background:#fafafa; }
    .totals { display:flex; justify-content:flex-end; margin-bottom:20px; }
    .totals-box { min-width:260px; }
    .total-row { display:flex; justify-content:space-between; padding:4px 0; font-size:12px; border-bottom:1px solid #eee; }
    .total-row.grand { font-size:14px; font-weight:700; border-top:2px solid #000; border-bottom:none; padding-top:8px; margin-top:4px; }
    .total-lbl { color:#444; }
    .total-val { font-family:monospace; font-weight:600; }
    .footer { display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #ddd; padding-top:16px; }
    .footer-note { font-size:10px; color:#666; line-height:1.7; }
    .verify-text { font-size:9px; color:#1a6b1a; font-weight:600; margin-top:4px; }
    .no-fiscal { font-size:9px; color:#cc6600; font-style:italic; margin-top:4px; }
    .qr-label { font-size:9px; color:#666; text-align:center; margin-top:4px; }
  </style>
</head>
<body>
<div class="wrap">

  <div class="header">
    <div>
      <div class="co-name">${COMPANY.name}</div>
      <div class="co-meta">
        ${COMPANY.address}<br/>
        NTN: ${COMPANY.ntn} &nbsp;|&nbsp; STRN: ${COMPANY.strn}<br/>
        Tel: ${COMPANY.phone}
      </div>
    </div>
    <div class="fbr-badge">
      <div class="fbr-logo">FBR</div>
      <div class="fbr-cert">AJK-IRD Certified POS</div>
    </div>
  </div>

  <div class="inv-title">
    <h2>Sales Invoice</h2>
    <div class="inv-meta">
      <div><span class="lbl">Invoice No: </span><strong>${invoice.invoiceId}</strong></div>
      <div><span class="lbl">Date: </span>${formatDate(invoice.invoiceDate)}</div>
      <div><span class="lbl">Type: </span>${invoice.invoiceType}</div>
    </div>
  </div>

  ${fiscalSection}

  <div class="section-grid">
    <div>
      <div class="section-title">Bill To</div>
      <div class="field-row"><span class="field-lbl">Customer:</span><span class="field-val">${invoice.customerName || '—'}</span></div>
      <div class="field-row"><span class="field-lbl">NTN:</span><span class="field-val">${invoice.ntn || '—'}</span></div>
      <div class="field-row"><span class="field-lbl">CNIC:</span><span class="field-val">${invoice.cnic || '—'}</span></div>
      <div class="field-row"><span class="field-lbl">Contact:</span><span class="field-val">${invoice.contact || '—'}</span></div>
    </div>
    <div>
      <div class="section-title">Invoice Details</div>
      <div class="field-row"><span class="field-lbl">SO Ref:</span><span class="field-val">${invoice.soRef || '—'}</span></div>
      <div class="field-row"><span class="field-lbl">Tax Rate:</span><span class="field-val">${displayRate}% GST</span></div>
      <div class="field-row"><span class="field-lbl">FBR Status:</span><span class="field-val">${invoice.fbrStatus?.toUpperCase() || '—'}</span></div>
    </div>
  </div>

  ${itemsSection}

  <div class="totals">
    <div class="totals-box">
      <div class="total-row">
        <span class="total-lbl">Subtotal (excl. tax)</span>
        <span class="total-val">${formatCurrency(displaySubtotal)}</span>
      </div>
      <div class="total-row">
        <span class="total-lbl">GST @ ${displayRate}%</span>
        <span class="total-val">${formatCurrency(displayTax)}</span>
      </div>
      <div class="total-row grand">
        <span class="total-lbl">Grand Total</span>
        <span class="total-val">${formatCurrency(displayGrandTotal)}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-note">
      <div>This is a computer generated document and does not require any sign and stamp.</div>
      <div>NTN: ${COMPANY.ntn} &nbsp;|&nbsp; STRN: ${COMPANY.strn}</div>
      ${isSubmitted
        ? `<div class="verify-text">Scan QR code to verify this invoice on iris.ajkird.gov.pk</div>`
        : `<div class="no-fiscal">Fiscal number pending — not yet submitted to AJK-IRD</div>`}
    </div>
    <div>
      ${qrSection}
      <div class="qr-label">${isSubmitted ? 'Scan to Verify' : 'Invoice QR'}</div>
    </div>
  </div>

</div>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  if (!invoice) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Invoice Preview — {invoice.invoiceId}</span>
          <div className={styles.toolbarActions}>
            <Button variant="primary" size="sm" icon={<Printer size={14} strokeWidth={1.75} />} onClick={handlePrint}>
              Print / Save PDF
            </Button>
            <Button variant="ghost" size="sm" icon={<X size={14} strokeWidth={2} />} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className={styles.printArea}>
          <div ref={printRef} className={styles.invoiceWrap}>

            <div className={styles.header}>
              <div>
                <div className={styles.coName}>{COMPANY.name}</div>
                <div className={styles.coMeta}>
                  {COMPANY.address}<br />
                  NTN: {COMPANY.ntn} &nbsp;|&nbsp; STRN: {COMPANY.strn}<br />
                  Tel: {COMPANY.phone}
                </div>
              </div>
              <div className={styles.fbrBadge}>
                <div className={styles.fbrLogo}>FBR</div>
                <div className={styles.fbrCertified}>AJK-IRD Certified POS</div>
              </div>
            </div>

            <div className={styles.invTitle}>
              <h2 className={styles.invHeading}>Sales Invoice</h2>
              <div className={styles.invMeta}>
                <div><span className={styles.metaLabel}>Invoice No:</span> <strong>{invoice.invoiceId}</strong></div>
                <div><span className={styles.metaLabel}>Date:</span> {formatDate(invoice.invoiceDate)}</div>
                <div><span className={styles.metaLabel}>Type:</span> {invoice.invoiceType}</div>
              </div>
            </div>

            <div className={`${styles.fiscalBox} ${isSubmitted ? styles.fiscalSynced : styles.fiscalPending}`}>
              <div>
                <div className={styles.fiscalLabel}>
                  {isSubmitted ? <><BadgeCheck size={12} strokeWidth={2} /> AJK-IRD Fiscal Invoice Number</> : 'Fiscal Number'}
                </div>
                <div className={styles.fiscalNumber}>{fiscalNo}</div>
              </div>
              {isSubmitted
                ? <div className={styles.fiscalVerify}>Verify at: iris.ajkird.gov.pk</div>
                : <div className={styles.fiscalNote}>Submit to AJK-IRD to generate fiscal number</div>
              }
            </div>

            <div className={styles.sectionGrid}>
              <div className={styles.sectionBox}>
                <div className={styles.sectionTitle}>Bill To</div>
                <div className={styles.fieldRow}><span className={styles.fieldLabel}>Customer:</span> <span className={styles.fieldVal}>{invoice.customerName}</span></div>
                <div className={styles.fieldRow}><span className={styles.fieldLabel}>NTN:</span> <span className={styles.fieldVal}>{invoice.ntn || '—'}</span></div>
                <div className={styles.fieldRow}><span className={styles.fieldLabel}>CNIC:</span> <span className={styles.fieldVal}>{invoice.cnic || '—'}</span></div>
                <div className={styles.fieldRow}><span className={styles.fieldLabel}>Contact:</span> <span className={styles.fieldVal}>{invoice.contact || '—'}</span></div>
              </div>
              <div className={styles.sectionBox}>
                <div className={styles.sectionTitle}>Invoice Details</div>
                <div className={styles.fieldRow}><span className={styles.fieldLabel}>SO Ref:</span> <span className={styles.fieldVal}>{invoice.soRef || '—'}</span></div>
                <div className={styles.fieldRow}><span className={styles.fieldLabel}>Tax Rate:</span> <span className={styles.fieldVal}>{displayRate}% GST</span></div>
                <div className={styles.fieldRow}><span className={styles.fieldLabel}>FBR Status:</span> <span className={styles.fieldVal}>{invoice.fbrStatus?.toUpperCase()}</span></div>
              </div>
            </div>

            {lineItems.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Description</th>
                    <th>PCT Code</th>
                    <th className={styles.right}>Qty</th>
                    <th>Unit</th>
                    <th className={styles.right}>Unit Price</th>
                    <th className={styles.right}>Sale Value</th>
                    <th className={styles.right}>GST {displayRate}%</th>
                    <th className={styles.right}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => {
                    const saleVal = item.totalPrice / (1 + TAX_RATE / 100);
                    const taxAmt  = item.totalPrice - saleVal;
                    const unitPr  = item.unitPrice || (item.totalPrice / item.quantity);
                    return (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{item.itemName}</td>
                        <td className={styles.mono}>{item.pctCode || '72085190'}</td>
                        <td className={styles.right}>{item.quantity}</td>
                        <td>{item.unit}</td>
                        <td className={styles.right}>{formatCurrency(unitPr)}</td>
                        <td className={styles.right}>{formatCurrency(saleVal)}</td>
                        <td className={styles.right}>{formatCurrency(taxAmt)}</td>
                        <td className={styles.right}><strong>{formatCurrency(item.totalPrice)}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className={styles.noItems}>
                Line items not available for this invoice reference.
                <div className={styles.noItemsSub}>
                  Subtotal: {formatCurrency(displaySubtotal)} | Tax: {formatCurrency(displayTax)} | Total: {formatCurrency(displayGrandTotal)}
                </div>
              </div>
            )}

            <div className={styles.totals}>
              <div className={styles.totalsBox}>
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>Subtotal (excl. tax)</span>
                  <span className={styles.totalVal}>{formatCurrency(displaySubtotal)}</span>
                </div>
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>GST @ {displayRate}%</span>
                  <span className={styles.totalVal}>{formatCurrency(displayTax)}</span>
                </div>
                <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                  <span className={styles.totalLabel}>Grand Total</span>
                  <span className={styles.totalVal}>{formatCurrency(displayGrandTotal)}</span>
                </div>
              </div>
            </div>

            <div className={styles.footer}>
              <div className={styles.footerLeft}>
                <div className={styles.footerNote}>This is a computer generated document and does not require any sign and stamp.</div>
                <div className={styles.footerNote}>NTN: {COMPANY.ntn} | STRN: {COMPANY.strn}</div>
                {isSubmitted
                  ? <div className={styles.footerVerify}>Scan QR code to verify this invoice on iris.ajkird.gov.pk</div>
                  : <div className={styles.footerPending}>Fiscal number pending — not yet submitted to AJK-IRD</div>
                }
              </div>
              <div className={styles.footerRight}>
                {qrDataUrl && <img src={qrDataUrl} alt="QR Code" width={110} height={110} />}
                <div className={styles.qrLabel}>{isSubmitted ? 'Scan to Verify' : 'Invoice QR'}</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
