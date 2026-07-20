import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from './format';

const COMPANY = {
  name: 'Allied Steel Center',
  address: 'Shop No. 41, Steel Sheet Market, Lahore',
  ntn: '9207491-5',
  strn: '3277876323039',
};

// Builds a complete sales-invoice PDF (header, bill-to, itemised lines, charges, totals)
// and triggers a one-click download. `lineItems` come from so_line_items (by so_ref);
// when none exist the item table is skipped and only the amount summary is shown.
export function downloadSalesInvoicePdf(inv, lineItems = []) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 46;

  // ── Company header ──
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(20);
  doc.text(COMPANY.name, margin, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90);
  doc.text(COMPANY.address, margin, y + 15);
  doc.text(`NTN: ${COMPANY.ntn}   |   STRN: ${COMPANY.strn}`, margin, y + 27);

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20);
  doc.text('SALES INVOICE', pageW - margin, y, { align: 'right' });
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(27, 94, 32);
  doc.text((inv.status || 'posted').toUpperCase(), pageW - margin, y + 15, { align: 'right' });

  y += 44;
  doc.setDrawColor(20).setLineWidth(1.2).line(margin, y, pageW - margin, y);
  y += 22;

  // ── Meta: invoice no + dates ──
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20);
  doc.text(inv.sale_inv_id || '', margin, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(80);
  const metaRight = [
    `Date: ${formatDate(inv.date)}`,
    inv.so_ref ? `SO Ref: ${inv.so_ref}` : null,
    inv.dn_ref ? `DN Ref: ${inv.dn_ref}` : null,
  ].filter(Boolean);
  metaRight.forEach((t, i) => doc.text(t, pageW - margin, y - 8 + i * 12, { align: 'right' }));

  y += 18;
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(110);
  doc.text('BILL TO', margin, y);
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(30);
  doc.text(inv.customer_name || '—', margin, y + 15);
  y += 30;

  // ── Items table ──
  if (lineItems.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Item Description', 'Qty', 'Unit', 'Unit Price', 'Amount']],
      body: lineItems.map((it, i) => {
        const amount = it.total_price ?? (it.quantity * it.unit_price);
        return [
          i + 1,
          it.item_name || '',
          formatNum(it.quantity),
          it.unit || '',
          formatCurrency(it.unit_price),
          formatCurrency(amount),
        ];
      }),
      styles: { fontSize: 9, cellPadding: 5, textColor: 40 },
      headStyles: { fillColor: [26, 26, 26], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: {
        0: { cellWidth: 26, halign: 'right' },
        2: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 16;
  } else {
    doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(150);
    doc.text('Itemised line items not available for this invoice.', margin, y + 4);
    y += 24;
  }

  // ── Charges + totals (right aligned box) ──
  const boxLeft = pageW - margin - 240;
  const rowH = 16;
  const charges = [
    ['Subtotal', inv.subtotal || 0],
    inv.freight > 0 ? ['Freight', inv.freight] : null,
    inv.loading_unloading > 0 ? ['Loading / Unloading', inv.loading_unloading] : null,
    inv.packing > 0 ? ['Packing', inv.packing] : null,
    inv.toll_tax > 0 ? ['Toll Tax', inv.toll_tax] : null,
    inv.slitting > 0 ? ['Slitting', inv.slitting] : null,
  ].filter(Boolean);

  doc.setFontSize(10);
  charges.forEach(([label, val]) => {
    doc.setFont('helvetica', 'normal').setTextColor(70);
    doc.text(label, boxLeft, y);
    doc.setTextColor(30);
    doc.text(formatCurrency(val), pageW - margin, y, { align: 'right' });
    doc.setDrawColor(235).setLineWidth(0.5).line(boxLeft, y + 4, pageW - margin, y + 4);
    y += rowH;
  });

  y += 4;
  doc.setDrawColor(20).setLineWidth(1).line(boxLeft, y, pageW - margin, y);
  y += 16;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(20);
  doc.text('Grand Total', boxLeft, y);
  doc.text(formatCurrency(inv.grand_total || 0), pageW - margin, y, { align: 'right' });

  // ── Footer ──
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220).setLineWidth(0.5).line(margin, pageH - 56, pageW - margin, pageH - 56);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120);
  doc.text('This is a computer generated document and does not require a physical signature.', margin, pageH - 40);
  doc.text(`NTN: ${COMPANY.ntn}   |   STRN: ${COMPANY.strn}`, margin, pageH - 28);

  doc.save(`${inv.sale_inv_id || 'invoice'}.pdf`);
}

function formatNum(v) {
  if (v == null) return '';
  return Number(v).toLocaleString('en-PK');
}
