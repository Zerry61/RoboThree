import { createReadStream, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ADMIN_INTEGRATION_HOST = '127.0.0.1';
export const ADMIN_INTEGRATION_PORT = 41731;
export const ADMIN_INTEGRATION_ORIGIN = `http://${ADMIN_INTEGRATION_HOST}:${ADMIN_INTEGRATION_PORT}`;
export const ADMIN_SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store'
});

const allowedRequestHeaders = new Set([
  'accept',
  'content-type',
  'if-none-match',
  'x-robothree-contract-version',
  'x-robothree-query-id',
  'x-robothree-correlation-id'
]);

export function createAdminIntegrationServer(input) {
  const root = resolve(input.staticRoot);
  const central = new URL(input.centralOrigin);
  if (central.protocol !== 'http:' || central.hostname !== ADMIN_INTEGRATION_HOST) {
    throw new Error('Central integration origin must be loopback HTTP');
  }
  return createServer((incoming, outgoing) => {
    applySecurityHeaders(outgoing);
    if (!validBrowserMetadata(incoming.headers)) return end(outgoing, 403, 'Forbidden');
    const url = new URL(incoming.url ?? '/', ADMIN_INTEGRATION_ORIGIN);
    if (url.pathname.startsWith('/admin/v1alpha1/')) {
      if (incoming.method !== 'GET' && incoming.method !== 'HEAD') return end(outgoing, 405, 'Method Not Allowed');
      proxyAdminRequest(incoming, outgoing, central, url);
      return;
    }
    if (url.pathname.startsWith('/admin/v1alpha2/')) {
      if (incoming.method !== 'GET' && incoming.method !== 'POST') return end(outgoing, 405, 'Method Not Allowed');
      proxyAdminRequest(incoming, outgoing, central, url);
      return;
    }
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') return end(outgoing, 405, 'Method Not Allowed');
    serveStatic(incoming.method, outgoing, root, url.pathname);
  });
}

function validBrowserMetadata(headers) {
  const origin = headers.origin;
  if (origin !== undefined && origin !== ADMIN_INTEGRATION_ORIGIN) return false;
  const fetchSite = headers['sec-fetch-site'];
  return fetchSite === undefined || fetchSite === 'same-origin';
}

function proxyAdminRequest(incoming, outgoing, central, url) {
  const headers = {};
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (allowedRequestHeaders.has(name) && value !== undefined) headers[name] = value;
  }
  const upstream = httpRequest({
    protocol: central.protocol,
    hostname: central.hostname,
    port: central.port,
    method: incoming.method,
    path: `${url.pathname}${url.search}`,
    headers
  }, (response) => {
    outgoing.statusCode = response.statusCode ?? 503;
    for (const name of ['content-type', 'content-length', 'etag']) {
      const value = response.headers[name];
      if (value !== undefined) outgoing.setHeader(name, value);
    }
    applySecurityHeaders(outgoing);
    response.pipe(outgoing);
  });
  upstream.setTimeout(30_000, () => upstream.destroy(new Error('admin upstream timeout')));
  upstream.on('error', () => end(outgoing, 503, 'Service Unavailable'));
  if (incoming.method === 'POST') {
    const contentLength = Number(incoming.headers['content-length'] ?? '0');
    if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > 1024 * 1024) {
      upstream.destroy();
      end(outgoing, 413, 'Payload Too Large');
      return;
    }
    incoming.pipe(upstream);
    return;
  }
  upstream.end();
}

function serveStatic(method, outgoing, root, pathname) {
  const relative = pathname === '/' ? 'integration.html' : pathname.slice(1);
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return end(outgoing, 404, 'Not Found');
  let stats;
  try { stats = statSync(file); } catch { return end(outgoing, 404, 'Not Found'); }
  if (!stats.isFile() || stats.size > 5 * 1024 * 1024) return end(outgoing, 404, 'Not Found');
  outgoing.statusCode = 200;
  outgoing.setHeader('Content-Type', mediaType(file));
  outgoing.setHeader('Content-Length', String(stats.size));
  if (method === 'HEAD') return outgoing.end();
  createReadStream(file).pipe(outgoing);
}

function applySecurityHeaders(response) {
  for (const [name, value] of Object.entries(ADMIN_SECURITY_HEADERS)) response.setHeader(name, value);
}

function mediaType(file) {
  switch (extname(file)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

function end(response, status, message) {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(message);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const centralOrigin = process.argv[2];
  if (centralOrigin === undefined) throw new Error('usage: integration-loopback-server.mjs <central-origin>');
  const staticRoot = resolve(fileURLToPath(new URL('../dist-integration', import.meta.url)));
  createAdminIntegrationServer({ staticRoot, centralOrigin }).listen(ADMIN_INTEGRATION_PORT, ADMIN_INTEGRATION_HOST, () => {
    process.stdout.write(`${JSON.stringify({ status: 'ready', origin: ADMIN_INTEGRATION_ORIGIN })}\n`);
  });
}
