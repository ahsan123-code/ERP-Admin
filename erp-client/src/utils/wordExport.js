// Word (.doc) export helper.
//
// Word opens HTML natively when the file carries the msword MIME type and a .doc
// extension, so every document in the app is authored as plain HTML and handed to
// downloadWordDoc(). This keeps the printable markup we already had.
//
// IMPORTANT — Word's renderer is closer to Word 97 HTML than to a browser:
//   * flexbox and CSS grid are NOT supported; use tables for any side-by-side layout
//   * border-radius, box-shadow and most modern CSS are silently dropped
//   * background colours need `background:` on the element itself, not a shorthand class
//   * a UTF-8 BOM is required or the PKR/em-dash characters arrive mangled
// The layoutTable/labelValueTable helpers below exist so callers stop reaching for flex.

const WORD_BASE_CSS = `
  body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
  table { border-collapse: collapse; }
  .w-right  { text-align: right; }
  .w-center { text-align: center; }
  .w-mono   { font-family: 'Courier New', monospace; }
  .w-muted  { color: #666; }
`;

// Strips characters Windows rejects in filenames, collapses whitespace and trims
// length so Word never refuses to save the download.
export function safeFilename(name, fallback = 'document') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

// Escapes text destined for the HTML body. Call this on anything user- or
// database-supplied (customer names, narrations) so a stray & or < cannot break
// the document Word receives.
export function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A4 at 96dpi, used to size the on-screen preview so it matches the printed page.
const PAGE_PX = { portrait: 794, landscape: 1123 };

// Builds the document HTML. Shared by the download and the on-screen preview so the
// two can never drift apart — the preview shows the exact markup Word receives.
//   filename  — without extension; ".doc" is appended
//   title     — shown in Word's title bar / document properties
//   css       — document-specific styles, appended after the Word-safe base
//   body      — the document markup
//   landscape — A4 landscape, for wide multi-column reports
//   forScreen — adds page-like framing for the preview iframe (never in the .doc)
export function buildWordHtml({ title = 'Document', css = '', body = '', landscape = false }, { forScreen = false } = {}) {
  const screenCss = forScreen
    ? `body { background:#fff; color:#000; margin:0 auto; padding:28px;
             max-width:${PAGE_PX[landscape ? 'landscape' : 'portrait']}px; }`
    : '';

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<!--[if gte mso 9]><xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml><![endif]-->
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 1.2cm; }
  ${WORD_BASE_CSS}
  ${css}
  ${screenCss}
</style>
</head>
<body>${body}</body>
</html>`;
}

// Builds the Word document and triggers the download.
export function downloadWordDoc(spec) {
  const { filename } = spec;
  const html = buildWordHtml(spec);

  // The BOM is what makes Word read the file as UTF-8 rather than the system codepage.
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(filename)}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoked on the next tick so the click has definitely been dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Side-by-side blocks without flexbox. `cells` is an array of HTML strings; each
// becomes one column. `widths` (optional) is a matching array of CSS widths.
export function layoutTable(cells, { widths = [], valign = 'top' } = {}) {
  const tds = cells.map((cell, i) => {
    const w = widths[i] ? ` width="${widths[i]}"` : '';
    const align = i === cells.length - 1 && cells.length > 1 ? ' align="right"' : '';
    return `<td valign="${valign}"${w}${align}>${cell}</td>`;
  }).join('');
  return `<table width="100%" style="border-collapse:collapse"><tr>${tds}</tr></table>`;
}

// A stack of "Label: value" rows rendered as a real table, replacing the
// `display:flex` field rows the print templates used.
export function labelValueTable(pairs, { labelWidth = 90, fontSize = 11 } = {}) {
  const rows = pairs.filter(Boolean).map(([label, value]) => `
    <tr>
      <td style="color:#666;font-size:${fontSize}px;padding:2px 8px 2px 0;white-space:nowrap">${esc(label)}</td>
      <td style="font-weight:600;font-size:${fontSize}px;padding:2px 0">${value}</td>
    </tr>`).join('');
  return `<table style="border-collapse:collapse" cellpadding="0"><colgroup><col width="${labelWidth}"><col></colgroup>${rows}</table>`;
}

// Standard company letterhead block used at the top of every document.
export function companyHeader(company, { title = '', rightHtml = '' } = {}) {
  const left = `
    <div style="font-size:19px;font-weight:700">${esc(company.name)}</div>
    <div style="font-size:10px;color:#444;margin-top:3px">
      ${esc(company.address)}${company.ntn ? `<br>NTN: ${esc(company.ntn)}` : ''}${company.strn ? ` &nbsp;|&nbsp; STRN: ${esc(company.strn)}` : ''}${company.phone ? `<br>Tel: ${esc(company.phone)}` : ''}
    </div>`;
  const head = rightHtml ? layoutTable([left, rightHtml]) : left;
  return `
    <div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px">${head}</div>
    ${title ? `<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;text-align:center">${esc(title)}</div>` : ''}`;
}

// Footer note + generation date, matching the old printed documents.
export function documentFooter(note, company = null) {
  const generated = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `
    <div style="margin-top:22px;border-top:1px solid #ddd;padding-top:10px;font-size:9px;color:#777;text-align:center">
      ${note ? `<div>${esc(note)}</div>` : ''}
      ${company?.ntn ? `<div>NTN: ${esc(company.ntn)}${company.strn ? ` &nbsp;|&nbsp; STRN: ${esc(company.strn)}` : ''}</div>` : ''}
      <div>Generated: ${generated}</div>
    </div>`;
}
