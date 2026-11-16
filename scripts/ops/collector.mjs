import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync, mkdirSync, statSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

const types = new Set(['http_request', 'deployment_started', 'deployment_succeeded', 'deployment_failed', 'rollback_succeeded', 'rollback_failed', 'availability_failure', 'availability_restored']);
export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || !types.has(event.type)) throw new Error('INVALID_EVENT');
  if (Object.keys(event).some((key) => !['type', 'source', 'status', 'durationMs', 'release'].includes(key))) throw new Error('UNKNOWN_EVENT_FIELD');
  if (!['frontend', 'release-manager', 'monitor'].includes(event.source)) throw new Error('INVALID_SOURCE');
  if (event.status !== undefined && (!Number.isInteger(event.status) || event.status < 100 || event.status > 599)) throw new Error('INVALID_STATUS');
  if (event.durationMs !== undefined && (!Number.isFinite(event.durationMs) || event.durationMs < 0)) throw new Error('INVALID_DURATION');
  if (event.release !== undefined && !/^[a-z0-9-]{1,64}$/.test(event.release)) throw new Error('INVALID_RELEASE');
  return { ...event };
}

export async function startCollector({ directory, port = 0 } = {}) {
  mkdirSync(directory, { recursive: true });
  const token = randomBytes(32).toString('hex');
  const counts = { events: 0, alerts: 0, rejected: 0 };
  let availabilityDown = 0;
  const alerts = [];
  let recent404 = [];
  let lastBurst = 0;
  function append(name, event) {
    const file = path.join(directory, name);
    // Bounded local retention: active + one rotated 5 MiB file.
    try { if (statSync(file).size > 5 * 1024 * 1024) { rmSync(file + '.1', { force: true }); renameSync(file, file + '.1'); } }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    appendFileSync(file, JSON.stringify(event) + '\n');
  }
  function alert(code, severity, event) {
    const entry = { timestamp: new Date().toISOString(), code, severity, source: event.source, release: event.release };
    append('alerts.ndjson', entry); counts.alerts++; alerts.push(entry);
    if (alerts.length > 100) alerts.shift();
  }
  function ingest(input) {
    const event = { timestamp: new Date().toISOString(), ...validateEvent(input) };
    append('events.ndjson', event); counts.events++;
    if (event.type === 'availability_failure') availabilityDown = 1;
    if (event.type === 'availability_restored') availabilityDown = 0;
    if (event.type === 'http_request' && event.status === 404) {
      const now = Date.now(); recent404 = recent404.filter((stamp) => stamp > now - 10_000); recent404.push(now);
      if (recent404.length >= 5 && now - lastBurst > 30_000) { alert('HTTP_404_BURST', 'warning', event); lastBurst = now; }
    }
    const codes = { deployment_failed: ['DEPLOYMENT_HEALTH_FAILED', 'high'], rollback_failed: ['ROLLBACK_FAILED', 'critical'], availability_failure: ['AVAILABILITY_DOWN', 'critical'] };
    if (codes[event.type]) alert(...codes[event.type], event);
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'GET' && req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(Object.entries(counts).map(([key, value]) => `reservasi_${key}_total ${value}\n`).join('') + `reservasi_availability_down ${availabilityDown}\n`); return;
    }
    if (req.method === 'GET' && req.url === '/health') { res.end('healthy'); return; }
    const provided = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) { counts.rejected++; res.writeHead(401); res.end(); return; }
    if (req.method !== 'POST' || req.url !== '/events') { res.writeHead(404); res.end(); return; }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16_384) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      ingest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      res.writeHead(202); res.end();
    } catch { counts.rejected++; res.writeHead(400); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, counts, alerts,
    emit: async (event) => {
      validateEvent(event);
      const response = await fetch(`${url}/events`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event), signal: AbortSignal.timeout(3000) });
      if (response.status !== 202) throw new Error('COLLECTOR_DELIVERY_FAILED');
    },
    close: () => new Promise((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); }),
  };
}
