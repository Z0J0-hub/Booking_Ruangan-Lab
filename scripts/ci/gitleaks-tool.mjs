import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GITLEAKS_VERSION = '8.30.1';
const archiveHash = 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e';
const executableHash = '17157e2ee8b76fc8b1d8bee607a250e34b8a8023c8bc81822d4b5ee4d78fcb7c';
const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function ensureGitleaks() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('This secret scanner setup supports Windows x64 only.');
  }
  const directory = path.join(root, '.tools', 'gitleaks', GITLEAKS_VERSION);
  const binary = path.join(directory, 'gitleaks.exe');
  if (existsSync(binary)) {
    if (hash(readFileSync(binary)) !== executableHash) {
      throw new Error('Cached Gitleaks executable checksum does not match the pinned version.');
    }
    return binary;
  }
  mkdirSync(directory, { recursive: true });
  const temporary = mkdtempSync(path.join(directory, 'download-'));
  try {
    let response;
    try {
      response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_windows_x64.zip`, {
        signal: AbortSignal.timeout(60_000),
      });
    } catch { throw new Error('Cannot download pinned Gitleaks release; check GitHub connectivity.'); }
    if (!response.ok) throw new Error(`Gitleaks download failed (HTTP ${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== archiveHash) throw new Error('Downloaded Gitleaks archive checksum does not match.');
    const archive = path.join(temporary, 'gitleaks.zip');
    const extracted = path.join(temporary, 'extracted');
    writeFileSync(archive, bytes);
    const extraction = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:RESERVASI_GITLEAKS_ZIP -DestinationPath $env:RESERVASI_GITLEAKS_DEST -Force",
    ], {
      env: { ...process.env, RESERVASI_GITLEAKS_ZIP: archive, RESERVASI_GITLEAKS_DEST: extracted },
      encoding: 'utf8', windowsHide: true, timeout: 30_000,
    });
    if (extraction.error || extraction.status !== 0) throw new Error('Cannot extract Gitleaks using Windows PowerShell.');
    const candidate = path.join(extracted, 'gitleaks.exe');
    if (!existsSync(candidate) || hash(readFileSync(candidate)) !== executableHash) {
      throw new Error('Extracted Gitleaks executable checksum does not match.');
    }
    copyFileSync(candidate, binary);
    return binary;
  } finally {
    const relative = path.relative(directory, temporary);
    if (!relative.startsWith('download-') || relative.includes(path.sep)) {
      throw new Error('Invalid tool temporary directory.');
    }
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await ensureGitleaks();
    console.log(`Gitleaks ${GITLEAKS_VERSION} verified in .tools/. System PATH unchanged.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
