import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startCollector, validateEvent } from './collector.mjs';
import { prepareRelease, startReleaseService, smoke } from './releases.mjs';

function temporary(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'reservasi-ops-'));
  t.after(() => { const relative = path.relative(os.tmpdir(), directory); assert.match(relative, /^reservasi-ops-[^\\/]+$/); rmSync(directory, { recursive: true, force: true }); });
  return directory;
}
test('collector rejects credentials/unknown fields and unauthenticated log injection', async (t) => {
  assert.throws(() => validateEvent({ type: 'http_request', source: 'frontend', token: 'secret' }));
  const directory = temporary(t);
  const collector = await startCollector({ directory }); t.after(() => collector.close());
  assert.equal((await fetch(`${collector.url}/events`, { method: 'POST', body: '{}' })).status, 401);
  await collector.emit({ type: 'http_request', source: 'frontend', status: 404 });
  assert.equal(collector.counts.events, 1);
  const log = readFileSync(path.join(directory, 'events.ndjson'), 'utf8');
  assert.doesNotMatch(log, /authorization|Bearer|token/);
});
test('bad release causes real asset 404 and rollback, tampered previous release cannot be declared healthy', async (t) => {
  const directory = temporary(t); const good = path.join(directory, 'good'); mkdirSync(good);
  mkdirSync(path.join(good, 'assets')); writeFileSync(path.join(good, 'index.html'), '<script src="/assets/app.js"></script>');
  writeFileSync(path.join(good, 'assets', 'app.js'), 'console.log("fixture");');
  const broken = path.join(directory, 'broken'); mkdirSync(broken); writeFileSync(path.join(broken, 'index.html'), '<script src="/assets/missing.js"></script>');
  const releases = path.join(directory, 'releases'); const original = prepareRelease(good, releases, 'good'); prepareRelease(broken, releases, 'bad');
  const collector = await startCollector({ directory: path.join(directory, 'logs') }); t.after(() => collector.close());
  const service = await startReleaseService({ releases, initial: 'good', stateFile: path.join(directory, 'state.json'), collector });
  t.after(async () => { await service.flush(); await service.close(); });
  assert.equal((await service.deploy('bad')).status, 'rolled_back'); await smoke(service.url);
  writeFileSync(path.join(original, 'assets', 'app.js'), 'tampered');
  await assert.rejects(() => service.deploy('bad'), /ROLLBACK_FAILED/);
  assert.ok(collector.alerts.some((alert) => alert.code === 'ROLLBACK_FAILED'));
});
