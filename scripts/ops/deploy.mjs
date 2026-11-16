import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRelease } from './releases.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = path.join(root, '.runtime', 'local');
if (!existsSync(path.join(runtime, 'active.json'))) throw new Error('Run npm run ops:serve first.');
const supplied = process.argv[2];
const release = supplied || `build-${Date.now()}`;
if (!/^[a-z0-9-]{1,64}$/.test(release)) throw new Error('Invalid release id.');
if (!supplied) prepareRelease(path.join(root, 'dist'), path.join(runtime, 'releases'), release);
const requestId = randomBytes(16).toString('hex');
writeFileSync(path.join(runtime, 'deploy-request.json'), JSON.stringify({ release, requestId }), { flag: 'wx' });
let done = false;
for (let attempt = 0; attempt < 30; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const file = path.join(runtime, 'deploy-result.json');
  if (!existsSync(file)) continue;
  const result = JSON.parse(readFileSync(file, 'utf8'));
  if (result.requestId !== requestId) continue;
  console.log(JSON.stringify(result, null, 2)); done = true;
  process.exitCode = result.status === 'deployed' ? 0 : 1; break;
}
if (!done) { console.error('No deployment confirmation. Check the running ops service and request file; do not assume success.'); process.exitCode = 2; }
