// ============================================================================
// CLOUDFLARE WORKER - OCR PROXY
// Proxies OCR requests to OCR.space API, keeping API keys server-side.
// Works from GitHub Pages (direct) and Discord Activity (via /.proxy/ocr-proxy/).
// ============================================================================

const API_KEY_1 = 'K88077327588957';
const API_KEY_2 = 'K85650756988957';

// Allowed origins: GitHub Pages + Discord Activity
const ALLOWED_ORIGINS = [
  'https://burni2001.github.io',
  'https://1470106608687255623.discordsays.com'
];

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

async function handleRequest(request) {
  const origin = request.headers.get('Origin');

  // Pick the matching origin for the CORS header, or default to first
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };

  // Handle OPTIONS (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }

  // Allow requests with no Origin (server-to-server, e.g. Discord's proxy)
  // and requests from any allowed origin
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(`Origin "${origin}" not allowed`, {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }

  try {
    const formData = await request.formData();

    // Select API key
    const keyIndex = formData.get('keyIndex') || '0';
    const apiKey = keyIndex === '1' ? API_KEY_2 : API_KEY_1;

    // Remove keyIndex before forwarding to OCR.space
    formData.delete('keyIndex');

    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'apikey': apiKey },
      body: formData
    });

    const responseText = await ocrResponse.text();

    return new Response(responseText, {
      status: ocrResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Proxy error',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
