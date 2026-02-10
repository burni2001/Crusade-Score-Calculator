/**
 * Crusade OCR Proxy - Cloudflare Worker
 *
 * Proxies OCR requests to the OCR.space API, keeping API keys server-side.
 * Designed to work both directly (from GitHub Pages) and through
 * Discord Activity URL mapping (/.proxy/ocr-proxy/).
 *
 * Environment secrets (set via `wrangler secret put`):
 *   OCR_API_KEY_1  - Primary OCR.space API key
 *   OCR_API_KEY_2  - Fallback OCR.space API key
 */

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Only POST is accepted
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    try {
      const formData = await request.formData();

      // Select API key based on keyIndex parameter
      const keyIndex = parseInt(formData.get('keyIndex') || '0', 10);
      const apiKey = keyIndex === 1 ? (env.OCR_API_KEY_2 || env.OCR_API_KEY_1) : env.OCR_API_KEY_1;

      if (!apiKey) {
        return jsonResponse(
          { IsErroredOnProcessing: true, ErrorMessage: 'OCR API key not configured on worker' },
          500
        );
      }

      // Build outgoing request to OCR.space
      const ocrForm = new FormData();
      const base64Image = formData.get('base64Image');
      if (!base64Image) {
        return jsonResponse(
          { IsErroredOnProcessing: true, ErrorMessage: 'Missing base64Image field' },
          400
        );
      }
      ocrForm.append('base64Image', base64Image);
      ocrForm.append('language', formData.get('language') || 'eng');
      ocrForm.append('isOverlayRequired', formData.get('isOverlayRequired') || 'false');
      ocrForm.append('OCREngine', formData.get('OCREngine') || '2');
      ocrForm.append('scale', formData.get('scale') || 'true');
      if (formData.get('isTable') === 'true') {
        ocrForm.append('isTable', 'true');
      }

      const ocrResponse = await fetch(OCR_SPACE_URL, {
        method: 'POST',
        headers: { apikey: apiKey },
        body: ocrForm,
      });

      const result = await ocrResponse.json();

      return jsonResponse(result, ocrResponse.status);
    } catch (err) {
      return jsonResponse(
        { IsErroredOnProcessing: true, ErrorMessage: err.message || 'Internal worker error' },
        500
      );
    }
  },
};
