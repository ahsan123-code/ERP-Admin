import { formatCurrency, formatDate, itemLabel } from './format';
import { esc, layoutTable, labelValueTable, companyHeader, documentFooter } from './wordExport';

const COMPANY = {
  name: 'Allied Steel Center',
  address: 'Shop No. 41, Steel Sheet Market, Lahore',
  ntn: '9207491-5',
  strn: '3277876323039',
};

const CSS = `
  .items { width: 100%; font-size: 10px; margin-bottom: 14px; }
  .items th { background: #1a1a1a; color: #fff; font-size: 9px; text-transform: uppercase;
              padding: 6px 8px; text-align: left; border: 1px solid #1a1a1a; }
  .items td { padding: 5px 8px; border: 1px solid #ddd; }
  .totals td { padding: 4px 0; font-size: 11px; border-bottom: 1px solid #eee; }
  .totals td.grand { font-size: 13px; font-weight: 700; border-top: 2px solid #000; border-bottom: none; padding-top: 7px; }
  .charge td { padding: 3px 0; font-size: 10px; color: #555; border-bottom: 1px solid #f0f0f0; }
`;

const qty = (v) => (v == null ? '' : Number(v).toLocaleString('en-PK'));

// Size and gauge share one column, matching the customer ledger. Rows imported before
// these became their own fields kept both baked into the item name, so they read "—"
// here rather than being parsed back out of free text.
const spec = (it) => [it.size, it.gauge].filter(Boolean).join(' · ') || '—';

// Builds the sales-invoice document spec, shared by the preview and the download.
// `lineItems` come from so_line_items (by so_ref); when none exist the item table is
// skipped and only the amount summary is shown.
export function buildSalesInvoiceDoc(inv, lineItems = []) {
  const itemsSection = lineItems.length > 0
    ? `<table class="items">
        <thead><tr>
          <th class="w-right" width="28">#</th><th>Item Description</th>
          <th width="90">Size / Gauge</th>
          <th class="w-right" width="65">Qty</th><th width="55">Unit</th>
          <th class="w-right" width="85">Rate</th><th class="w-right" width="95">Amount</th>
        </tr></thead>
        <tbody>${lineItems.map((it, i) => {
          const amount = it.total_price ?? (it.quantity * it.unit_price);
          return `<tr>
            <td class="w-right">${i + 1}</td>
            <td>${esc(itemLabel(it.item_name))}</td>
            <td>${esc(spec(it))}</td>
            <td class="w-right">${qty(it.quantity)}</td>
            <td>${esc(it.unit)}</td>
            <td class="w-right w-mono">${formatCurrency(it.unit_price)}</td>
            <td class="w-right w-mono"><strong>${formatCurrency(amount)}</strong></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`
    : `<div style="padding:10px 14px;background:#fff8f0;border:1px solid #f0c080;margin-bottom:14px;
                   font-size:10px;color:#c60;text-align:center">
         <em>Itemised line items not available for this invoice.</em>
       </div>`;

  const chargeRows = [
    inv.freight > 0 ? ['Freight', inv.freight] : null,
    inv.loading_unloading > 0 ? ['Loading / Unloading', inv.loading_unloading] : null,
    inv.packing > 0 ? ['Packing', inv.packing] : null,
    inv.toll_tax > 0 ? ['Toll Tax', inv.toll_tax] : null,
    inv.slitting > 0 ? ['Slitting', inv.slitting] : null,
  ].filter(Boolean);

  const chargesBlock = chargeRows.length > 0
    ? `<div style="margin-bottom:14px;padding:10px 14px;background:#f8f8f8;border:1px solid #eee">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#666;
                    border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:6px">Additional Charges</div>
        <table class="charge" width="100%">${chargeRows.map(([l, v]) =>
          `<tr><td>${esc(l)}</td><td class="w-right w-mono">${formatCurrency(v)}</td></tr>`).join('')}
        </table>
      </div>`
    : '';

  const totalsBlock = `
    <table class="totals" width="280" align="right">
      <tr><td style="color:#444">Subtotal</td>
          <td class="w-right w-mono">${formatCurrency(inv.subtotal || 0)}</td></tr>
      ${inv.total_charges > 0
        ? `<tr><td style="color:#444">Additional Charges</td>
               <td class="w-right w-mono">${formatCurrency(inv.total_charges)}</td></tr>`
        : ''}
      <tr><td class="grand">Grand Total</td>
          <td class="grand w-right w-mono">${formatCurrency(inv.grand_total || 0)}</td></tr>
    </table>`;

  const headerRight = `
    <div style="text-align:right">
      <div style="font-size:17px;font-weight:700">SALES INVOICE</div>
      <div style="display:inline-block;margin-top:4px;padding:2px 10px;background:#e8f5e9;color:#1b5e20;
                  border:1px solid #a5d6a7;font-size:9px;font-weight:700;text-transform:uppercase">
        ${esc((inv.status || 'posted').toUpperCase())}
      </div>
    </div>`;

  const metaRight = `
    <div style="text-align:right;font-size:10px;line-height:1.8">
      <div><span class="w-muted">Date: </span><strong>${formatDate(inv.date)}</strong></div>
      ${inv.so_ref ? `<div><span class="w-muted">SO Ref: </span><strong>${esc(inv.so_ref)}</strong></div>` : ''}
      ${inv.dn_ref ? `<div><span class="w-muted">DN Ref: </span><strong>${esc(inv.dn_ref)}</strong></div>` : ''}
    </div>`;

  const invNoBlock = `
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#666">Invoice No.</div>
      <div style="font-size:17px;font-weight:700;font-family:'Courier New',monospace">${esc(inv.sale_inv_id)}</div>
    </div>`;

  const billTo = `
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#666;
                  border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:6px">Bill To</div>
      ${labelValueTable([['Customer:', esc(inv.customer_name || '—')]], { labelWidth: 70 })}
    </div>`;

  const amountSummary = `
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#666;
                  border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:6px">Amount Summary</div>
      ${labelValueTable([
        ['Subtotal:', `<span class="w-mono">${formatCurrency(inv.subtotal || 0)}</span>`],
        ['Extra Charges:', `<span class="w-mono">${formatCurrency(inv.total_charges || 0)}</span>`],
      ], { labelWidth: 85 })}
    </div>`;

  const body = `
    ${companyHeader(COMPANY, { rightHtml: headerRight })}
    ${layoutTable([invNoBlock, metaRight])}
    <div style="height:12px"></div>
    ${layoutTable([billTo, amountSummary], { widths: ['50%', '50%'] })}
    <div style="height:12px"></div>
    ${itemsSection}
    ${chargesBlock}
    ${totalsBlock}
    <div style="clear:both"></div>
    ${documentFooter('This is a computer generated document and does not require a physical signature.', COMPANY)}`;

  return {
    filename: inv.sale_inv_id || 'invoice',
    title: `Invoice ${inv.sale_inv_id || ''}`.trim(),
    css: CSS,
    body,
  };
}
