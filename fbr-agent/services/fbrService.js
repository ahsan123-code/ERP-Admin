const axios = require('axios');
const {
  LOCAL_SERVICE_URL,
  CLOUD_SANDBOX_URL,
  CLOUD_PRODUCTION_URL,
  PRODUCTION_TOKEN,
  SANDBOX_TOKEN,
  TIMEOUT_MS,
} = require('../config/fbr');

const IS_PRODUCTION = process.env.FBR_ENV === 'production';

/**
 * Checks if the local AJK-IRD fiscal service is running.
 * Returns { online: true } or { online: false, error }
 */
async function checkLocalService() {
  try {
    const res = await axios.get(`${LOCAL_SERVICE_URL}/Get`, { timeout: 5000 });
    return { online: true, message: res.data };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

/**
 * Submits invoice to the LOCAL fiscal component (installed on same machine).
 * This is the primary submission method per AJK-IRD spec.
 * The local component then auto-uploads to AJK-IRD servers.
 *
 * @param {Object} payload - Built by invoiceBuilder.buildInvoicePayload()
 * @returns {{ success, fiscalInvoiceNumber, code, response, error }}
 */
async function submitToLocal(payload) {
  try {
    const res = await axios.post(
      `${LOCAL_SERVICE_URL}/GetInvoiceNumberByModel`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: TIMEOUT_MS,
      }
    );

    const data = res.data;

    if (data.Code === '100') {
      return {
        success: true,
        fiscalInvoiceNumber: data.InvoiceNumber,
        code: data.Code,
        response: data.Response,
        errors: data.Errors || null,
      };
    }

    return {
      success: false,
      code: data.Code,
      response: data.Response,
      errors: data.Errors,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      code: err.response?.status || 'TIMEOUT',
    };
  }
}

/**
 * Submits invoice directly to AJK-IRD cloud (bypass local component).
 * Used when local component is unavailable or for cloud-mode integration.
 *
 * @param {Object} payload - Built by invoiceBuilder.buildInvoicePayload()
 * @param {boolean} sandbox - Use sandbox environment
 * @returns {{ success, fiscalInvoiceNumber, code, response, error }}
 */
async function submitToCloud(payload, sandbox = !IS_PRODUCTION) {
  const url   = sandbox ? CLOUD_SANDBOX_URL : CLOUD_PRODUCTION_URL;
  const token = sandbox ? SANDBOX_TOKEN      : PRODUCTION_TOKEN;

  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      timeout: TIMEOUT_MS,
      // AJK IRD uses self-signed cert in sandbox
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: IS_PRODUCTION }),
    });

    const data = res.data;

    return {
      success: true,
      fiscalInvoiceNumber: data['AJK-IRDInvoiceNumber'] || data.InvoiceNumber,
      code: data.Code,
      response: data.Response,
      errors: data.Errors || null,
      environment: sandbox ? 'sandbox' : 'production',
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      code: err.response?.status || 'TIMEOUT',
      environment: sandbox ? 'sandbox' : 'production',
    };
  }
}

/**
 * Main submit function — tries local first, falls back to cloud if local is down.
 */
async function submitInvoice(payload) {
  const localCheck = await checkLocalService();

  if (localCheck.online) {
    const result = await submitToLocal(payload);
    result.method = 'local';
    return result;
  }

  // Local service unavailable — fall back to cloud
  console.warn('[FBR] Local fiscal service offline — falling back to cloud submission');
  const result = await submitToCloud(payload);
  result.method = 'cloud_fallback';
  return result;
}

module.exports = { checkLocalService, submitToLocal, submitToCloud, submitInvoice };
