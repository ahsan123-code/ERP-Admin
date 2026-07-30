import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { FileDown, Eye, X, BadgeCheck } from 'lucide-react';
import Button from '../../components/ui/Button';
import { formatCurrency, formatDate } from '../../utils/format';
import { downloadWordDoc, esc, layoutTable, labelValueTable, companyHeader } from '../../utils/wordExport';
import { useWordPreview } from '../../hooks/useWordPreview';
import styles from './InvoicePrintModal.module.css';

const COMPANY = {
  name:    'Allied Steel Center',
  address: 'Main Market, Lahore, Punjab, Pakistan',
  ntn:     '9207491-5',
  strn:    '3277876323039',
  phone:   '0300-0000000',
};

const TAX_RATE = 18;

export default function InvoicePrintModal({ invoice: raw, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const { showPreview, previewNode } = useWordPreview();


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

  const buildDoc = () => {
    if (!invoice) return;

    const lineItemRows = lineItems.map((item, i) => {
      const saleVal = item.totalPrice / (1 + TAX_RATE / 100);
      const taxAmt  = item.totalPrice - saleVal;
      const unitPr  = item.unitPrice || (item.totalPrice / item.quantity);
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(item.itemName)}</td>
          <td class="w-mono">${esc(item.pctCode || '72085190')}</td>
          <td class="w-right">${esc(item.quantity)}</td>
          <td>${esc(item.unit)}</td>
          <td class="w-right w-mono">${formatCurrency(unitPr)}</td>
          <td class="w-right w-mono">${formatCurrency(saleVal)}</td>
          <td class="w-right w-mono">${formatCurrency(taxAmt)}</td>
          <td class="w-right w-mono"><strong>${formatCurrency(item.totalPrice)}</strong></td>
        </tr>`;
    }).join('');

    const itemsSection = lineItems.length > 0
      ? `<table class="items">
          <thead>
            <tr>
              <th width="26">#</th><th>Item Description</th><th width="70">PCT Code</th>
              <th class="w-right" width="50">Qty</th><th width="45">Unit</th>
              <th class="w-right" width="80">Unit Price</th>
              <th class="w-right" width="85">Sale Value</th>
              <th class="w-right" width="80">GST ${displayRate}%</th>
              <th class="w-right" width="90">Total</th>
            </tr>
          </thead>
          <tbody>${lineItemRows}</tbody>
        </table>`
      : `<div style="background:#fff8f0;border:1px solid #f0c080;padding:12px 16px;margin-bottom:14px;
                     font-size:10px;color:#c60;text-align:center">
          <em>Itemised line items not available for this invoice.</em><br/>
          <span style="color:#444;font-family:'Courier New',monospace">
            Subtotal: ${formatCurrency(displaySubtotal)} &nbsp;|&nbsp;
            Tax: ${formatCurrency(displayTax)} &nbsp;|&nbsp;
            Total: ${formatCurrency(displayGrandTotal)}
          </span>
        </div>`;

    const fiscalSection = `
      <table width="100%" style="border:1.5px solid ${isSubmitted ? '#1a6b1a' : '#e0a040'};
             background:${isSubmitted ? '#f0f7f0' : '#fff8f0'};margin-bottom:14px">
        <tr>
          <td style="padding:8px 14px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;
                        color:${isSubmitted ? '#1a6b1a' : '#c60'};margin-bottom:3px">
              ${isSubmitted ? '&#10003; AJK-IRD Fiscal Invoice Number' : 'Fiscal Number'}
            </div>
            <div style="font-size:14px;font-weight:700;font-family:'Courier New',monospace;
                        color:${isSubmitted ? '#000' : '#c60'}">${esc(fiscalNo)}</div>
          </td>
          <td align="right" style="padding:8px 14px;font-size:9px;
                     color:${isSubmitted ? '#1a6b1a' : '#c60'}">
            ${isSubmitted ? 'Verify at: iris.ajkird.gov.pk' : '<em>Submit to AJK-IRD to generate fiscal number</em>'}
          </td>
        </tr>
      </table>`;

    const headerRight = `
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:900;color:#1a6b1a;letter-spacing:2px">FBR</div>
        <div style="display:inline-block;margin-top:4px;font-size:9px;font-weight:700;color:#1a6b1a;
                    border:1.5px solid #1a6b1a;padding:3px 8px">AJK-IRD Certified POS</div>
      </div>`;

    const titleRow = layoutTable([
      `<div style="font-size:17px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Sales Invoice</div>`,
      `<div style="text-align:right;font-size:10px;line-height:1.7">
         <div><span class="w-muted">Invoice No: </span><strong>${esc(invoice.invoiceId)}</strong></div>
         <div><span class="w-muted">Date: </span>${formatDate(invoice.invoiceDate)}</div>
         <div><span class="w-muted">Type: </span>${esc(invoice.invoiceType)}</div>
       </div>`,
    ]);

    const billTo = `
      <div>
        <div class="sec-ttl">Bill To</div>
        ${labelValueTable([
          ['Customer:', esc(invoice.customerName || '—')],
          ['NTN:', esc(invoice.ntn || '—')],
          ['CNIC:', esc(invoice.cnic || '—')],
          ['Contact:', esc(invoice.contact || '—')],
        ], { labelWidth: 65 })}
      </div>`;

    const invDetails = `
      <div>
        <div class="sec-ttl">Invoice Details</div>
        ${labelValueTable([
          ['SO Ref:', esc(invoice.soRef || '—')],
          ['Tax Rate:', `${displayRate}% GST`],
          ['FBR Status:', esc(invoice.fbrStatus?.toUpperCase() || '—')],
        ], { labelWidth: 75 })}
      </div>`;

    const totalsBlock = `
      <table class="totals" width="270" align="right">
        <tr><td style="color:#444">Subtotal (excl. tax)</td>
            <td class="w-right w-mono">${formatCurrency(displaySubtotal)}</td></tr>
        <tr><td style="color:#444">GST @ ${displayRate}%</td>
            <td class="w-right w-mono">${formatCurrency(displayTax)}</td></tr>
        <tr><td class="grand">Grand Total</td>
            <td class="grand w-right w-mono">${formatCurrency(displayGrandTotal)}</td></tr>
      </table>
      <div style="clear:both"></div>`;

    const footerBlock = layoutTable([
      `<div style="font-size:9px;color:#666;line-height:1.7">
         <div>This is a computer generated document and does not require any sign and stamp.</div>
         <div>NTN: ${COMPANY.ntn} &nbsp;|&nbsp; STRN: ${COMPANY.strn}</div>
         ${isSubmitted
           ? `<div style="font-size:8px;color:#1a6b1a;font-weight:600;margin-top:4px">Scan QR code to verify this invoice on iris.ajkird.gov.pk</div>`
           : `<div style="font-size:8px;color:#c60;font-style:italic;margin-top:4px">Fiscal number pending — not yet submitted to AJK-IRD</div>`}
       </div>`,
      `<div style="text-align:center">
         ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" width="105" height="105" />` : ''}
         <div style="font-size:8px;color:#666;margin-top:3px">${isSubmitted ? 'Scan to Verify' : 'Invoice QR'}</div>
       </div>`,
    ], { valign: 'bottom' });

    return {
      filename: `Invoice ${invoice.invoiceId || ''}`.trim(),
      title: `Invoice ${invoice.invoiceId || ''}`.trim(),
      css: `
        .sec-ttl { font-size:9px; font-weight:700; text-transform:uppercase; color:#666;
                   border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:6px; }
        .items { width:100%; font-size:10px; margin-bottom:14px; }
        .items th { background:#1a1a1a; color:#fff; font-size:9px; text-transform:uppercase;
                    padding:6px 7px; text-align:left; border:1px solid #1a1a1a; }
        .items td { padding:5px 7px; border:1px solid #ddd; }
        .totals td { padding:4px 0; font-size:11px; border-bottom:1px solid #eee; }
        .totals td.grand { font-size:13px; font-weight:700; border-top:2px solid #000;
                           border-bottom:none; padding-top:7px; }
      `,
      body: `
        ${companyHeader(COMPANY, { rightHtml: headerRight })}
        ${titleRow}
        <div style="height:12px"></div>
        ${fiscalSection}
        ${layoutTable([billTo, invDetails], { widths: ['50%', '50%'] })}
        <div style="height:12px"></div>
        ${itemsSection}
        ${totalsBlock}
        <div style="height:14px"></div>
        <div style="border-top:1px solid #ddd;padding-top:12px">${footerBlock}</div>`,
    };
  };

  const handlePreview  = () => { const d = buildDoc(); if (d) showPreview(d); };
  const handleDownload = () => { const d = buildDoc(); if (d) downloadWordDoc(d); };

  if (!invoice) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Invoice Preview — {invoice.invoiceId}</span>
          <div className={styles.toolbarActions}>
            <Button variant="secondary" size="sm" icon={<Eye size={14} strokeWidth={1.75} />} onClick={handlePreview}>
              Preview
            </Button>
            <Button variant="primary" size="sm" icon={<FileDown size={14} strokeWidth={1.75} />} onClick={handleDownload}>
              Download Word
            </Button>
            <Button variant="ghost" size="sm" icon={<X size={14} strokeWidth={2} />} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className={styles.printArea}>
          <div className={styles.invoiceWrap}>

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
      {previewNode}
    </div>
  );
}
