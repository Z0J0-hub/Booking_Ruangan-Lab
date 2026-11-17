import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './plan.mjs';

const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
export const auditLimits = { requestTimeoutMs: 60_000, processTimeoutMs: 240_000, maxAttempts: 2, retryDelayMs: 2000 };
export function ensureAuditCache(toolsRoot = path.join(projectRoot, '.tools')) {
  mkdirSync(toolsRoot, { recursive: true });
  const directory = path.join(toolsRoot, 'npm-audit-cache-v1');
  mkdirSync(directory, { recursive: true });
  if (lstatSync(directory).isSymbolicLink() || path.relative(realpathSync(toolsRoot), realpathSync(directory)) !== 'npm-audit-cache-v1') throw new Error('UNSAFE_AUDIT_CACHE');
  return directory;
}
const retryableCodes = new Set(['PR_AUDIT_TIMEOUT', 'PR_AUDIT_NETWORK_ERROR', 'PR_AUDIT_REGISTRY_UNAVAILABLE']);
const networkCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE']);
const timeoutCodes = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ERR_SOCKET_TIMEOUT']);
const tlsCodes = new Set(['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID']);
export function auditErrorExplanation(code) {
  const descriptions = {
    PR_AUDIT_TIMEOUT: 'Batas waktu audit tercapai. Hasil kerentanan belum tersedia.',
    PR_AUDIT_NETWORK_ERROR: 'Koneksi ke layanan npm gagal. Periksa koneksi internet atau DNS laptop.',
    PR_AUDIT_REGISTRY_UNAVAILABLE: 'Layanan npm sedang tidak tersedia atau membatasi permintaan.',
    PR_AUDIT_TLS_ERROR: 'Sertifikat/TLS layanan npm ditolak. Verifikasi keamanan tetap aktif.',
    PR_AUDIT_EXECUTION_ERROR: 'Proses npm audit gagal dijalankan atau berhenti tidak normal.',
    PR_AUDIT_SERVICE_ERROR: 'Layanan npm menolak audit; hasil belum dapat digunakan.',
    PR_AUDIT_INTERRUPTED: 'Proses audit dihentikan. Pemeriksaan belum selesai.',
    PR_AUDIT_REPORT_INVALID: 'Laporan audit tidak dapat dibaca. Hasil ini bukan lolos.',
    PR_AUDIT_OUTPUT_LIMIT: 'Laporan melebihi batas ukuran pemeriksaan.',
    PR_AUDIT_EXIT_REPORT_MISMATCH: 'Status proses dan isi laporan tidak cocok; hasil ditolak.',
  };
  return descriptions[code] || 'Data atau alat audit tidak valid. Periksa kode error pada laporan.';
}
function transportError(code) {
  if (timeoutCodes.has(code)) return 'PR_AUDIT_TIMEOUT';
  if (networkCodes.has(code)) return 'PR_AUDIT_NETWORK_ERROR';
  if (tlsCodes.has(code)) return 'PR_AUDIT_TLS_ERROR';
  return null;
}
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function validPackageName(name) {
  if (typeof name !== 'string' || name.length > 214) return false;
  const parts = name.split('/');
  const validPart = part => /^[a-zA-Z0-9_.-]+$/.test(part);
  return parts.length === 1 ? validPart(name) : parts.length === 2 && parts[0].startsWith('@') && validPart(parts[0].slice(1)) && validPart(parts[1]);
}
export function validateAuditInput(manifest, lock) {
  if (!manifest || !lock || ![2, 3].includes(lock.lockfileVersion) || !lock.packages || !lock.packages[''] || manifest.workspaces || manifest.overrides) throw new Error('UNSUPPORTED_PR_LOCKFILE');
  const normalized = value => JSON.stringify(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
  for (const field of dependencyFields) {
    if (normalized(manifest[field]) !== normalized(lock.packages[''][field])) throw new Error('PR_MANIFEST_LOCK_MISMATCH');
    for (const [name, spec] of Object.entries(manifest[field] || {})) {
      if (!validPackageName(name) || typeof spec !== 'string' || spec.length > 200 || /^(?:file:|link:|git|https?:|workspace:)/i.test(spec)) throw new Error('UNSUPPORTED_PR_DEPENDENCY');
    }
  }
  for (const [name, pkg] of Object.entries(lock.packages)) {
    if (!name) continue;
    if (!/^node_modules\/[a-zA-Z0-9_@./-]+$/.test(name) || name.split('/').some(part => !part || part === '..' || part === '.') || pkg.link || typeof pkg.version !== 'string') throw new Error('UNSUPPORTED_PR_LOCK_ENTRY');
    if (pkg.resolved) {
      const url = new URL(pkg.resolved);
      if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.port || url.username || url.password || url.search || url.hash) throw new Error('UNSUPPORTED_PR_PACKAGE_REGISTRY');
    }
  }
}

export function auditOutcome(execution) {
  if (execution.error) throw new Error(transportError(execution.error.code) || (execution.error.code === 'ENOBUFS' ? 'PR_AUDIT_OUTPUT_LIMIT' : 'PR_AUDIT_EXECUTION_ERROR'));
  if (execution.signal) throw new Error('PR_AUDIT_INTERRUPTED');
  if (![0, 1].includes(execution.status)) throw new Error('PR_AUDIT_EXECUTION_ERROR');
  let raw;
  try { raw = JSON.parse(execution.stdout); } catch { throw new Error('PR_AUDIT_REPORT_INVALID'); }
  if (raw.error) {
    const status = Number(raw.error.statusCode || raw.error.status || /^E([0-9]{3})$/.exec(raw.error.code || '')?.[1]);
    const code = transportError(raw.error.code) || ((status === 429 || (status >= 500 && status <= 599)) ? 'PR_AUDIT_REGISTRY_UNAVAILABLE' : 'PR_AUDIT_SERVICE_ERROR');
    throw new Error(code);
  }
  const counts = raw.metadata?.vulnerabilities;
  if (!levels.every(level => Number.isSafeInteger(counts?.[level]) && counts[level] >= 0)) throw new Error('PR_AUDIT_COUNTS_INVALID');
  const blocked = counts.high + counts.critical > 0;
  if ((execution.status === 1) !== blocked) throw new Error('PR_AUDIT_EXIT_REPORT_MISMATCH');
  if (!raw.vulnerabilities || typeof raw.vulnerabilities !== 'object' || Array.isArray(raw.vulnerabilities)) throw new Error('PR_AUDIT_DETAILS_INVALID');
  const findings = Object.entries(raw.vulnerabilities).map(([name, item]) => {
    if (!validPackageName(name) || !levels.includes(item.severity)) throw new Error('PR_AUDIT_DETAILS_INVALID');
    return { package: name, severity: item.severity, direct: item.isDirect === true, fixAvailable: Boolean(item.fixAvailable),
      titles: (Array.isArray(item.via) ? item.via : []).filter(via => via && typeof via === 'object' && typeof via.title === 'string').map(via => via.title.slice(0, 400)) };
  });
  return { status: blocked ? 'blocked' : 'passed', exitCode: blocked ? 1 : 0,
    vulnerabilities: Object.fromEntries(levels.map(level => [level, counts[level]])), findings };
}

export function runPrAudit({ source, provenance = {}, runner = spawnSync,
  pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
  npmEntry = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js') } = {}) {
  const directory = path.join(source, 'reports', 'audit'); mkdirSync(directory, { recursive: true });
  const result = { status: 'error', exitCode: 2, tool: 'npm audit (PR lockfile, no install or lifecycle scripts)',
    scope: 'Frontend dependencies and devDependencies recorded in the PR merge package-lock.json; HIGH/CRITICAL gate; no backend audit.',
    ...provenance, limits: { ...auditLimits }, cache: { mode: 'persistent', refresh: 'prefer-online' }, attempts: [], vulnerabilities: {}, findings: [] };
  const save = () => {
    const counts = result.vulnerabilities;
    const explanation = result.status === 'error' ? 'Pemeriksaan tidak selesai; hasil ini bukan lolos.' : result.status === 'blocked'
      ? 'PR ditolak: ditemukan masalah tingkat tinggi atau kritis.' : 'Audit lolos batas tinggi/kritis. Temuan sedang/rendah tetap perlu ditinjau.';
    const text = `${explanation}\nStatus: ${result.status}\nPercobaan: ${result.attempts.length}/${auditLimits.maxAttempts}\nTinggi: ${counts.high ?? '-'}; kritis: ${counts.critical ?? '-'}; sedang: ${counts.moderate ?? '-'}; rendah: ${counts.low ?? '-'}\n${result.code ? result.code + ': ' + auditErrorExplanation(result.code) : ''}\n`;
    writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
    writeFileSync(path.join(directory, 'summary.txt'), text);
    writeFileSync(path.join(directory, 'frontend.txt'), text + result.findings.map(f => `${f.package}: ${f.severity}; perbaikan tersedia=${f.fixAvailable}`).join('\n'));
    writeFileSync(path.join(directory, 'summary.html'), '<!doctype html><meta charset="utf-8"><title>Audit dependency PR</title><h1>Audit dependency PR</h1>' +
      `<p>${escape(explanation)}</p><pre>${escape(text)}</pre><p>PR #${escape(result.number ?? '-')}; ${escape(result.source ?? '-')} menuju development; versi gabungan ${escape(result.merge ?? '-')}</p>` +
      '<p>Hanya membaca daftar paket pada PR. Tidak memasang dependency atau menjalankan skrip PR.</p><table border="1"><tr><th>Paket</th><th>Tingkat masalah</th><th>Ada perbaikan?</th><th>Keterangan</th></tr>' +
      result.findings.map(f => `<tr><td>${escape(f.package)}</td><td>${escape(f.severity)}</td><td>${f.fixAvailable ? 'Ya' : 'Belum'}</td><td>${escape(f.titles.join('; '))}</td></tr>`).join('') + '</table>');
  };
  save();
  const parent = path.join(projectRoot, '.runtime', 'pr'); mkdirSync(parent, { recursive: true });
  const scratch = mkdtempSync(path.join(parent, 'audit-'));
  try {
    const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
    const lockText = readFileSync(path.join(source, 'package-lock.json'), 'utf8');
    const lock = JSON.parse(lockText);
    validateAuditInput(manifest, lock);
    result.lockfilePackages = Object.keys(lock.packages).filter(Boolean).length;
    if (!path.isAbsolute(npmEntry) || path.basename(npmEntry) !== 'npm-cli.js' || !existsSync(npmEntry)) throw new Error('TRUSTED_NPM_CLI_REQUIRED');
    const cacheDirectory = ensureAuditCache();
    result.cache.hasPreviousData = existsSync(path.join(cacheDirectory, '_cacache'));
    const safeManifest = { name: 'reservasi-pr-dependency-audit', version: '1.0.0', private: true };
    for (const field of dependencyFields) if (manifest[field]) safeManifest[field] = manifest[field];
    writeFileSync(path.join(scratch, 'package.json'), JSON.stringify(safeManifest));
    writeFileSync(path.join(scratch, 'package-lock.json'), lockText);
    const userConfig = path.join(scratch, 'user.npmrc'); const globalConfig = path.join(scratch, 'global.npmrc');
    writeFileSync(userConfig, ''); writeFileSync(globalConfig, '');
    const env = { SystemRoot: process.env.SystemRoot || 'C:\\Windows', WINDIR: process.env.WINDIR || 'C:\\Windows',
      PATH: process.env.PATH || process.env.Path || '', TEMP: scratch, TMP: scratch, HOME: scratch, USERPROFILE: scratch,
      APPDATA: scratch, LOCALAPPDATA: scratch, CI: 'true', NO_COLOR: '1' };
    const args = [npmEntry, 'audit', '--json', '--audit-level=high', '--package-lock-only', '--ignore-scripts', '--workspaces=false', '--include=dev',
      '--registry=https://registry.npmjs.org/', '--strict-ssl=true', '--prefer-online', '--logs-max=3', '--fetch-retries=0', `--fetch-timeout=${auditLimits.requestTimeoutMs}`,
      `--userconfig=${userConfig}`, `--globalconfig=${globalConfig}`, `--cache=${cacheDirectory}`];
    // Retry the whole read-only audit once. Disable npm's nested retries so the
    // HTTP timeout stays below the per-process deadline; never retry findings.
    for (let attempt = 1; attempt <= auditLimits.maxAttempts; attempt++) {
      if (attempt === 1) console.log(`Cache audit: disimpan antar-build; ${result.cache.hasPreviousData ? 'data cache sebelumnya tersedia' : 'pengisian cache awal'}. npm tetap memeriksa data terbaru secara online.`);
      console.log(`Dependency Audit: percobaan ${attempt}/${auditLimits.maxAttempts}; batas waktu proses ${auditLimits.processTimeoutMs / 1000} detik, permintaan jaringan ${auditLimits.requestTimeoutMs / 1000} detik.`);
      const started = Date.now();
      try {
        const execution = runner(process.execPath, args, { cwd: scratch, env, encoding: 'utf8', windowsHide: true,
          timeout: auditLimits.processTimeoutMs, maxBuffer: 16 * 1024 * 1024 });
        const outcome = auditOutcome(execution);
        result.attempts.push({ attempt, status: outcome.status, elapsedMs: Date.now() - started });
        Object.assign(result, outcome);
        break;
      } catch (error) {
        const code = /^[A-Z_]+$/.test(error.message) ? error.message : 'PR_AUDIT_EXECUTION_ERROR';
        result.attempts.push({ attempt, status: 'error', code, elapsedMs: Date.now() - started });
        save();
        if (!retryableCodes.has(code) || attempt === auditLimits.maxAttempts) throw new Error(code);
        console.log(`Audit belum selesai: ${auditErrorExplanation(code)} Mencoba ulang satu kali setelah ${auditLimits.retryDelayMs / 1000} detik.`);
        pause(auditLimits.retryDelayMs);
      }
    }
  } catch (error) {
    result.status = 'error'; result.exitCode = 2;
    result.code = /^[A-Z_]+$/.test(error.message) ? error.message : 'PR_AUDIT_INPUT_OR_SERVICE_ERROR';
  } finally {
    if (path.dirname(scratch) !== parent || !path.basename(scratch).startsWith('audit-')) throw new Error('INVALID_AUDIT_SCRATCH');
    rmSync(scratch, { recursive: true, force: true }); save();
  }
  console.log(`PR Dependency Audit: ${result.status}; high=${result.vulnerabilities.high ?? '-'}; critical=${result.vulnerabilities.critical ?? '-'}; exit=${result.exitCode}.`);
  return result;
}
