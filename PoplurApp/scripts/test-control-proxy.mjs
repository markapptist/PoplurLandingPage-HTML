import { createServer } from 'node:http';

const port = Number(process.env.POPLUR_TEST_CONTROL_PORT || 8096);
const credential = process.env.POPLUR_TEST_CONTROL_TOKEN || '';
const functionURL = 'https://us-central1-poplur2025.cloudfunctions.net/testActivityControl';
const allowedOrigins = new Set(['http://127.0.0.1:8084', 'http://localhost:8084']);
const allowedActions = new Set(['dashboard', 'simulation', 'simulationStep']);
const maxBodyBytes = 16 * 1024;

if (!credential) {
  throw new Error('POPLUR_TEST_CONTROL_TOKEN is required. Keep it in the local machine keychain; never put it in the web bundle.');
}

function headers(origin = '') {
  return {
    ...(allowedOrigins.has(origin) ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  };
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.method === 'OPTIONS') {
    if (!allowedOrigins.has(origin)) { response.writeHead(403, headers(origin)); response.end(); return; }
    response.writeHead(204, headers(origin));
    response.end();
    return;
  }
  if (request.method !== 'POST' || request.url !== '/api/control' || !allowedOrigins.has(origin)) {
    response.writeHead(allowedOrigins.has(origin) ? 404 : 403, headers(origin));
    response.end(JSON.stringify({ error: { message: 'Local beta desk route not found.' } }));
    return;
  }
  let body = '';
  let bodyTooLarge = false;
  request.on('data', chunk => { if (!bodyTooLarge) { body += chunk; bodyTooLarge = Buffer.byteLength(body) > maxBodyBytes; } });
  request.on('end', async () => {
    try {
      if (bodyTooLarge) {
        response.writeHead(413, headers(origin));
        response.end(JSON.stringify({ error: { message: 'Local desk request is too large.' } }));
        return;
      }
      const parsed = JSON.parse(body || '{}');
      const data = parsed?.data;
      if (!data || typeof data !== 'object' || !allowedActions.has(data.action)) {
        response.writeHead(400, headers(origin));
        response.end(JSON.stringify({ error: { message: 'Unsupported local desk action.' } }));
        return;
      }
      if (data.action === 'simulation' && typeof data.enabled !== 'boolean') {
        response.writeHead(400, headers(origin));
        response.end(JSON.stringify({ error: { message: 'Simulation requires an explicit enabled state.' } }));
        return;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const upstream = await fetch(functionURL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: { ...data, accessCode: credential } }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      const result = await upstream.text();
      response.writeHead(upstream.status, headers(origin));
      response.end(result);
    } catch {
      response.writeHead(502, headers(origin));
      response.end(JSON.stringify({ error: { message: 'The local beta desk could not reach Poplur.' } }));
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Poplur Test Control proxy listening at http://127.0.0.1:${port}`);
});
server.on('error', error => {
  console.error('Poplur Test Control proxy failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
