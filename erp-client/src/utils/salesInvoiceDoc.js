import { itemLabel } from './format';
import { esc, layoutTable, documentFooter } from './wordExport';

// The letterhead as the office prints it today, kept verbatim from the issued bill —
// with NTN and STRN added, since the business is sales-tax registered and the figures
// belong on the document even though the old print omitted them.
const COMPANY = {
  name: 'Allied Steel Centre',
  trade: 'Importers & Retailors of All Kinds of Steel Sheets, Coils & General Order Suppliers',
  address: '46-Steel Sheet Market, Landa Bazar, Lahore.',
  tel: '37664375, 37650599',
  mobile: '0321-8481525',
  email: 'maqsud_ahmad@yahoo.com',
  ntn: '9207491-5',
  strn: '3277876323039',
};

// The Bill To panel and the Date / Invoice No. panel are ruled heavier than the item
// grid, as they are on the printed bill — they are the two blocks the eye goes to first.
const CSS = `
  .bill th, .bill td { border: 1px solid #000; padding: 3px 6px; font-size: 10px; }
  .bill th { font-weight: 700; text-align: center; vertical-align: middle; }
  .bill td.n { border: none; }
  .panel { border: 2px solid #000; }
  .panel th, .panel td { border: 2px solid #000; padding: 3px 6px; font-size: 10px; }
  .panel th { font-weight: 700; text-align: center; font-size: 11px; }
  .box { border: 2px solid #000; }
  .box .cap { border-bottom: 2px solid #000; text-align: center; font-weight: 700;
              font-size: 11px; padding: 3px; }
  .box td { font-size: 10px; padding: 3px 6px; vertical-align: top; }
  .meta td { font-size: 10px; padding: 2px 0; }
  .chg td { font-size: 10px; padding: 2px 4px; }
  .chg td.net { font-weight: 700; color: #c00; border-top: 1px solid #000;
                border-bottom: 1px solid #000; padding: 3px 4px; }
`;

// Figures print bare, as they always have: no currency prefix, grouped thousands, and
// decimals only where they exist. The rate column is the exception — always two places.
const num = (v, dp = 0) => {
  const n = Number(v) || 0;
  const places = dp > 0 ? dp : (Math.abs(n % 1) > 0.004 ? 2 : 0);
  return n.toLocaleString('en-PK', { minimumFractionDigits: places, maximumFractionDigits: places });
};
const rate = (v) => num(v, 2);

// "22-Jul-2026", built from the ISO string rather than Date so a plain 'YYYY-MM-DD'
// cannot slip a day backwards in a timezone behind UTC.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const billDate = (v) => {
  if (!v) return '';
  const iso = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${MONTHS[+iso[2] - 1]}-${iso[1]}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v)
    : `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
};

// The bill is headed by the invoice number the customer and the office both quote.
// Our ids carry prefixes ("INV-", "SO-", "DN-") that the printed document never had.
const stripPrefix = (id) => String(id || '').replace(/^(INV|SO|DN)-/, '');

// The six lines the printed bill has always carried, in its order. These print whether or
// not they hold a figure — the breakdown is read against the previous bill line by line,
// and a row that vanishes when it is zero makes the two impossible to compare.
const FIXED_LINES = ['bending', 'freight', 'loading_unloading', 'cutting', 'labour'];
const LABELS = {
  bending: 'Bending', freight: 'Freight', loading_unloading: 'Loading & Unloading',
  cutting: 'Cutting', labour: 'Labour', packing: 'Packing', toll_tax: 'Toll Tax',
  slitting: 'Slitting', other_charges: 'Other',
};

// Packing, toll tax, slitting and other charges are not on the printed form, so they
// appear only when one is actually charged. Dropping them outright would take money out
// of the breakdown while leaving it in the net amount.
const EXTRA_LINES = ['packing', 'toll_tax', 'slitting', 'other_charges'];

const chargeLines = (inv) => [
  [`GST  ${num(inv.gst_rate, 2)} %`, inv.gst_amount],
  ...FIXED_LINES.map(f => [LABELS[f], inv[f]]),
  ...EXTRA_LINES.filter(f => (Number(inv[f]) || 0) !== 0).map(f => [LABELS[f], inv[f]]),
];

// Builds the sales-invoice document spec, shared by the preview and the download, laid
// out to match the "Sale Bill" the office has always issued.
//
// `lineItems` come from so_line_items (by so_ref). `context` carries what the invoice row
// does not itself hold — the customer's address, and the PO number and date agreed at
// order confirmation. All optional; each line simply prints blank without it.
export function buildSalesInvoiceDoc(inv, lineItems = [], context = {}) {
  const totalQty = lineItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const totalAmt = lineItems.reduce(
    (s, it) => s + (Number(it.total_price ?? (it.quantity * it.unit_price)) || 0), 0);

  const itemRows = lineItems.map((it, i) => `
    <tr>
      <td align="center">${i + 1}</td>
      <td>${esc(itemLabel(it.item_name))}</td>
      <td align="right">${it.coils_rolls != null ? num(it.coils_rolls) : ''}</td>
      <td align="right">${it.no_of_sheets != null ? num(it.no_of_sheets) : ''}</td>
      <td align="right">${num(it.quantity)}</td>
      <td align="right">${rate(it.unit_price)}</td>
      <td align="right">${num(it.total_price ?? (it.quantity * it.unit_price))}</td>
    </tr>`).join('');

  // With no stored lines the grid would print headed and empty, so the subtotal stands
  // in for the detail rather than the bill showing a table with nothing under it.
  const bodyRows = lineItems.length > 0 ? itemRows : `
    <tr>
      <td align="center">1</td>
      <td><em>Itemised detail not recorded for this invoice</em></td>
      <td></td><td></td><td></td><td></td>
      <td align="right">${num(inv.subtotal)}</td>
    </tr>`;

  // The totals ride in a borderless final row of the same table, so they stay under the
  // Qty and Amount columns however the column widths are rendered.
  const itemsTable = `
    <table class="bill" width="100%" style="border-collapse:collapse">
      <colgroup>
        <col width="6%"><col width="40%"><col width="9%"><col width="11%">
        <col width="11%"><col width="10%"><col width="13%">
      </colgroup>
      <thead><tr>
        <th>Sr #</th><th>Particulars</th><th>Coils /<br>Rolls</th>
        <th>No of<br>Sheets (size)</th><th>Qty (Kg)</th><th>Rate</th><th>Amount</th>
      </tr></thead>
      <tbody>
        ${bodyRows}
        <tr>
          <td class="n" colspan="4"></td>
          <td class="n" align="right">${num(lineItems.length > 0 ? totalQty : 0)}</td>
          <td class="n"></td>
          <td class="n" align="right">${num(lineItems.length > 0 ? totalAmt : inv.subtotal)}</td>
        </tr>
      </tbody>
    </table>`;

  // Sits under the right-hand end of the item grid, where the printed bill puts it.
  const chargesTable = `
    <table class="chg" width="40%" align="right" style="border-collapse:collapse">
      <colgroup><col width="62%"><col width="38%"></colgroup>
      ${chargeLines(inv).map(([label, value]) => `
        <tr><td>${esc(label)}</td><td align="right">${num(value)}</td></tr>`).join('')}
      <tr>
        <td class="net">Net Amount</td>
        <td class="net" align="right">${num(inv.grand_total)}</td>
      </tr>
    </table>`;

  const companyBlock = `
    <div style="font-size:17px;font-weight:700">${esc(COMPANY.name)}</div>
    <div style="font-size:9px;line-height:1.5;margin-top:2px">
      ${esc(COMPANY.trade)}<br>
      ${esc(COMPANY.address)}<br>
      Tel : ${esc(COMPANY.tel)} &nbsp; Mob #: ${esc(COMPANY.mobile)}<br>
      E-Mail: ${esc(COMPANY.email)}<br>
      NTN: ${esc(COMPANY.ntn)} &nbsp;|&nbsp; STRN: ${esc(COMPANY.strn)}
    </div>`;

  const printedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).replace(', ', ',');

  // Print date, title and the Date / Invoice No. panel share one right-hand column, so
  // the title stays centred over the panel rather than drifting to the page edge.
  const titleBlock = `
    <table width="72%" align="right" style="border-collapse:collapse">
      <tr><td style="font-size:9px;text-align:right;padding-bottom:1px">Print Date&nbsp; ${esc(printedAt)}</td></tr>
      <tr><td style="font-size:23px;font-weight:700;letter-spacing:1px;text-align:center;padding-bottom:5px">Sale &nbsp;Bill</td></tr>
      <tr><td style="padding:0">
        <table class="panel" width="100%" style="border-collapse:collapse">
          <tr><th width="48%">Date</th><th width="52%">Invoice No.</th></tr>
          <tr>
            <td align="center">${esc(billDate(inv.date))}</td>
            <td align="center">${esc(stripPrefix(inv.sale_inv_id))}</td>
          </tr>
        </table>
      </td></tr>
    </table>`;

  const billTo = `
    <table class="box" width="100%" style="border-collapse:collapse">
      <tr><td class="cap" colspan="3">Bill To</td></tr>
      <tr>
        <td width="90"><strong>Party Name</strong></td>
        <td width="10">:</td>
        <td><strong>${esc(inv.customer_name || '')}</strong></td>
      </tr>
      <tr>
        <td><strong>Party Address</strong></td>
        <td>:</td>
        <td>${esc(context.customerAddress || '')}</td>
      </tr>
    </table>`;

  // Held to the right-hand end of its cell so a gap opens between it and the Bill To
  // panel, instead of the two blocks running together.
  const metaBlock = `
    <table class="meta" width="72%" align="right" style="border-collapse:collapse">
      ${[
        ['Book # :',         esc(inv.manual_bill_no || '')],
        ['Client P.O# :',    esc(context.poNo || '')],
        ['P.O Date :',       esc(context.poDate ? billDate(context.poDate) : '')],
        ['Order #:',         esc(stripPrefix(inv.so_ref))],
        ['Delivery Number:', esc(stripPrefix(inv.dn_ref))],
      ].map(([label, value]) => `
        <tr><td>${label}</td><td align="right"><strong>${value}</strong></td></tr>`).join('')}
    </table>`;

  const body = `
    ${layoutTable([companyBlock, titleBlock], { widths: ['58%', '42%'] })}
    <div style="height:10px"></div>
    ${layoutTable([billTo, metaBlock], { widths: ['49%', '51%'] })}
    <div style="height:12px"></div>
    ${itemsTable}
    ${chargesTable}
    <div style="clear:both"></div>
    ${documentFooter('This is a computer generated document and does not require a physical signature.')}`;

  return {
    filename: stripPrefix(inv.sale_inv_id) || 'invoice',
    title: `Sale Bill ${stripPrefix(inv.sale_inv_id)}`.trim(),
    css: CSS,
    body,
  };
}
