/**
 * POS identity and AJK endpoints.
 *
 * The POS ID and production token are per-registered-machine, not per-product: AJK issue
 * a token at POS registration and it is only valid for that POS ID. Hardcoding them meant
 * the packaged .exe carried one shop's identity, so a second machine could not be set up
 * without a rebuild — and, worse, a machine registered under a different POS ID would file
 * perfectly valid-looking invoices against somebody else's registration.
 *
 * They come from .env now. The fallbacks are the original Allied Steel Center values so
 * an existing install that has not had its .env updated keeps working.
 */

const num = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

module.exports = {
  // Must match the POS ID this machine is registered under on the IRIS-AJK portal.
  // It is sent as POSID on every invoice.
  POS_ID: num(process.env.FBR_POS_ID, 193532),

  // Issued at POS registration, found under the POS Clients menu on the IRIS-AJK portal.
  // This is NOT the Access Code — that one is for the fiscal component's installer and is
  // never sent to the API. Only used for the cloud endpoint; the local component on 8524
  // authenticates from its own installation instead.
  PRODUCTION_TOKEN: process.env.FBR_PRODUCTION_TOKEN || '4cd2387d-1c32-38e8-9caa-ecb7994b31c9',
  SANDBOX_TOKEN:    process.env.FBR_SANDBOX_TOKEN    || '7ddff49d-246c-3e96-9d79-2117a62ae862',

  LOCAL_SERVICE_URL:    'http://localhost:8524/api/IMSFiscal',
  CLOUD_SANDBOX_URL:    'https://gw.fbr.gov.pk/ajkposdsandbox/v1/postinvoicedata',
  CLOUD_PRODUCTION_URL: 'https://gw.fbr.gov.pk/ajkposd/v1/postinvoicedata',

  DEFAULT_TAX_RATE: 18,
  TIMEOUT_MS: 30000,
};
