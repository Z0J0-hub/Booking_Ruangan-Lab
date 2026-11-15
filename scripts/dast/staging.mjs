import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
export const headers = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
};

export async function startStaging({ directory = root, port = 0, directoryProvider, onEvent } = {}) {
  const initial = await realpath(directoryProvider ? directoryProvider() : directory);
  await stat(path.join(initial, 'index.html')); // Fail before listening if no production build exists.
  let requests = 0;
  const server = createServer(async (req, res) => {
    const started = Date.now();
    if (onEvent) res.once('finish', () => onEvent({ type: 'http_request', source: 'frontend',
      status: res.statusCode, durationMs: Date.now() - started }));
    requests++;
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    try {
      const base = directoryProvider ? await realpath(directoryProvider()) : initial;
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      if (pathname.split(/[\\/]/).some((part) => part.startsWith('.') && part !== '')) {
        res.writeHead(404); res.end(); return;
      }
      if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(req.method === 'HEAD' ? undefined : 'healthy'); return; }
      let file = path.resolve(base, `.${pathname}`);
      const relative = path.relative(base, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(404); res.end(); return; }
      try { if (!(await stat(file)).isFile()) throw new Error('NOT_FILE'); }
      catch {
        // Only extensionless frontend routes use SPA fallback; missing assets are 404.
        if (path.extname(pathname)) { res.writeHead(404); res.end(); return; }
        file = path.join(base, 'index.html');
      }
      const resolved = await realpath(file);
      const safe = path.relative(base, resolved);
      if (safe.startsWith('..') || path.isAbsolute(safe)) { res.writeHead(404); res.end(); return; }
      const body = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(400); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requestCount: () => requests,
    close: () => new Promise((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.STAGING_PORT || '8081');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid STAGING_PORT.');
  const staging = await startStaging({ port });
  console.log(`Production build staging: ${staging.url} (loopback only).`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await staging.close(); });
}
