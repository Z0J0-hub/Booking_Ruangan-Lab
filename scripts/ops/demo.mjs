import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCollector } from './collector.mjs';
import { prepareRelease, startReleaseService, smoke } from './releases.mjs';
import { createMonitor } from './monitor.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reportDir = path.join(root, 'reports', 'ops'); mkdirSync(reportDir, { recursive: true });
const runtime = path.join(root, '.runtime'); mkdirSync(runtime, { recursive: true });
const scratch = mkdtempSync(path.join(runtime, 'drill-'));
const report = { status: 'error', scope: 'Local Windows frontend only; no Supabase data changed; no external notifications sent.', checks: {} };
let collector; let service;
try {
  collector = await startCollector({ directory: path.join(scratch, 'logs') });
  const releases = path.join(scratch, 'releases');
  prepareRelease(path.join(root, 'dist'), releases, 'baseline');
  const broken = path.join(scratch, 'broken'); mkdirSync(broken);
  writeFileSync(path.join(broken, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="/assets/missing.js"></script>');
  prepareRelease(broken, releases, 'broken-build');
  service = await startReleaseService({ releases, initial: 'baseline', stateFile: path.join(scratch, 'active.json'), collector });
  await smoke(service.url);
  const rejected = await fetch(`${collector.url}/events`, { method: 'POST', body: '{}' });
  report.checks.unauthenticatedLogWriteRejected = rejected.status === 401;
  for (let i = 0; i < 6; i++) await fetch(`${service.url}/missing-${i}.js?token=never-log-query`);
  await service.flush();
  report.checks.anomalyAlert = collector.alerts.some((alert) => alert.code === 'HTTP_404_BURST');
  report.rollback = await service.deploy('broken-build');
  await smoke(service.url); await service.flush();
  report.checks.automaticRollback = report.rollback.status === 'rolled_back' && service.current() === 'baseline';
  report.checks.deploymentFailureAlert = collector.alerts.some((alert) => alert.code === 'DEPLOYMENT_HEALTH_FAILED');
  const monitor = createMonitor({ url: service.url, emit: collector.emit });
  report.checks.monitorHealthy = (await monitor.check()).healthy;
  await service.close(); service = null;
  const first = await monitor.check(); const second = await monitor.check(); const third = await monitor.check();
  report.checks.availabilityThreshold = !first.down && !second.down && third.down;
  report.checks.criticalAvailabilityAlert = collector.alerts.some((alert) => alert.code === 'AVAILABILITY_DOWN' && alert.severity === 'critical');
  const events = readFileSync(path.join(scratch, 'logs', 'events.ndjson'), 'utf8');
  report.checks.noQueryOrTokenInLogs = !events.includes('never-log-query') && !events.includes('token=');
  report.metrics = await (await fetch(`${collector.url}/metrics`)).text();
  report.alerts = collector.alerts; report.eventCount = collector.counts.events;
  writeFileSync(path.join(reportDir, 'events.ndjson'), events);
  writeFileSync(path.join(reportDir, 'alerts.ndjson'), readFileSync(path.join(scratch, 'logs', 'alerts.ndjson')));
  report.status = Object.values(report.checks).every(Boolean) ? 'passed' : 'failed';
} catch { report.status = 'error'; report.code = 'OPS_DRILL_FAILED'; }
finally {
  if (service) { await service.flush(); await service.close(); }
  if (collector) await collector.close();
  const relative = path.relative(runtime, scratch);
  if (!relative.startsWith('drill-') || relative.includes(path.sep)) throw new Error('INVALID_DRILL_DIRECTORY');
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(path.join(reportDir, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(`Operations drill: ${report.status}. Evidence: reports/ops/. All demo services stopped.`);
process.exitCode = report.status === 'passed' ? 0 : 1;
