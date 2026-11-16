import { mkdirSync, cpSync, realpathSync, readFileSync, writeFileSync, renameSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { startStaging } from '../dast/staging.mjs';

function inventory(directory) {
  const files = [];
  function visit(current) {
    for (const entry of readdirSync(current)) {
      const file = path.join(current, entry); const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('RELEASE_SYMLINK_FORBIDDEN');
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) files.push({ name: path.relative(directory, file).replaceAll('\\', '/'), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') });
    }
  }
  visit(directory); return files.sort((a, b) => a.name.localeCompare(b.name));
}

export function prepareRelease(source, releases, id) {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error('INVALID_RELEASE_ID');
  const from = realpathSync(source); const manifest = inventory(from);
  if (!manifest.some((file) => file.name === 'index.html')) throw new Error('MISSING_RELEASE_INDEX');
  mkdirSync(releases, { recursive: true });
  const destination = path.join(releases, id);
  mkdirSync(destination); // Never overwrite an existing release.
  cpSync(from, destination, { recursive: true, errorOnExist: true, force: false });
  writeFileSync(path.join(destination, 'release-manifest.json'), JSON.stringify({ id, files: manifest }, null, 2));
  return destination;
}

export async function smoke(origin) {
  const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(3000) });
  if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('text/html')) throw new Error('FRONTEND_UNHEALTHY');
  const html = await response.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]);
  if (!assets.some((asset) => asset.endsWith('.js'))) throw new Error('FRONTEND_ASSETS_MISSING');
  for (const asset of assets) {
    const resource = await fetch(origin + asset, { signal: AbortSignal.timeout(3000) });
    if (resource.status !== 200 || (asset.endsWith('.js') && !resource.headers.get('content-type')?.startsWith('text/javascript'))) throw new Error('FRONTEND_ASSET_UNHEALTHY');
    await resource.arrayBuffer();
  }
}

export async function startReleaseService({ releases, initial, stateFile, collector, port = 0 }) {
  const base = realpathSync(releases);
  let current; let busy = false; const pending = []; const failures = [];
  const location = (id) => {
    if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error('INVALID_RELEASE_ID');
    const directory = realpathSync(path.join(base, id));
    const relative = path.relative(base, directory);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('RELEASE_OUTSIDE_STORE');
    return directory;
  };
  const verify = (id) => {
    const directory = location(id); const manifest = JSON.parse(readFileSync(path.join(directory, 'release-manifest.json'), 'utf8'));
    const actual = inventory(directory).filter((entry) => entry.name !== 'release-manifest.json');
    if (manifest.id !== id || JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error('RELEASE_INTEGRITY_FAILED');
    return directory;
  };
  const activate = (id) => {
    verify(id);
    writeFileSync(stateFile + '.tmp', JSON.stringify({ release: id }) + '\n');
    renameSync(stateFile + '.tmp', stateFile); current = id;
  };
  activate(initial);
  const server = await startStaging({ directoryProvider: () => location(current), port,
    onEvent: (event) => { const delivery = collector.emit(event).catch((error) => { failures.push(error); }); pending.push(delivery); } });
  const event = (type, release) => collector.emit({ type, source: 'release-manager', release });
  return {
    url: server.url, current: () => current,
    flush: async () => { await Promise.all(pending.splice(0)); if (failures.length) throw failures[0]; },
    deploy: async (id) => {
      if (busy) throw new Error('DEPLOYMENT_IN_PROGRESS'); busy = true;
      const previous = current; const started = Date.now();
      try {
        await event('deployment_started', id); activate(id);
        await smoke(server.url); await event('deployment_succeeded', id);
        return { status: 'deployed', release: id };
      } catch {
        await event('deployment_failed', id);
        try { activate(previous); await smoke(server.url); await event('rollback_succeeded', previous); }
        catch { await event('rollback_failed', previous); throw new Error('ROLLBACK_FAILED'); }
        return { status: 'rolled_back', failedRelease: id, activeRelease: previous, recoveryMs: Date.now() - started };
      } finally { busy = false; }
    },
    close: () => server.close(),
  };
}
