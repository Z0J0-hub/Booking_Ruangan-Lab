import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCollector } from './collector.mjs';
import { prepareRelease, startReleaseService, smoke } from './releases.mjs';
import { createMonitor } from './monitor.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = path.join(root, '.runtime', 'local'); mkdirSync(runtime, { recursive: true });
const releases = path.join(runtime, 'releases');
const id = `build-${Date.now()}`;
prepareRelease(path.join(root, 'dist'), releases, id);
let collector; let service; let timer;
try {
  collector = await startCollector({ directory: path.join(runtime, 'logs'), port: 9091 });
  service = await startReleaseService({ releases, initial: id, stateFile: path.join(runtime, 'active.json'), collector, port: 8081 });
  await smoke(service.url);
  const monitor = createMonitor({ url: service.url, emit: collector.emit });
  let checking = false;
  timer = setInterval(async () => {
    if (checking) return; checking = true;
    try {
      const command = path.join(runtime, 'deploy-request.json');
      if (existsSync(command)) {
        const request = JSON.parse(readFileSync(command, 'utf8'));
        if (!/^[a-z0-9-]{1,64}$/.test(request.release) || !/^[a-f0-9]{32}$/.test(request.requestId)) throw new Error('INVALID_DEPLOY_REQUEST');
        let result;
        try { result = await service.deploy(request.release); }
        catch { result = { status: 'error', code: 'DEPLOYMENT_OR_ROLLBACK_FAILED' }; }
        writeFileSync(path.join(runtime, 'deploy-result.json'), JSON.stringify({ requestId: request.requestId, ...result }));
        rmSync(command);
      }
      await monitor.check(); await service.flush();
    }
    catch { console.error('Monitoring/log delivery failed; inspect .runtime/local/logs/.'); }
    finally { checking = false; }
  }, 2000);
  console.log(`Frontend ${service.url}; metrics ${collector.url}/metrics; logs .runtime/local/logs/. Ctrl+C stops services.`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; clearInterval(timer); await service.close(); await service.flush(); await collector.close(); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop().catch(() => { process.exitCode = 1; }); });
} catch {
  clearInterval(timer);
  if (service) await service.close();
  if (collector) await collector.close();
  console.error('Cannot start local ops service. Build dist and free ports 8081/9091.'); process.exitCode = 1;
}
