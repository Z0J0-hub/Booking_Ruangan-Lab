import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './plan.mjs';

const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
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
  if (execution.error || execution.signal || ![0, 1].includes(execution.status)) throw new Error('PR_AUDIT_EXECUTION_ERROR');
  let raw;
  try { raw = JSON.parse(execution.stdout); } catch { throw new Error('PR_AUDIT_REPORT_INVALID'); }
  if (raw.error) throw new Error('PR_AUDIT_SERVICE_ERROR');
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

export function runPrAudit({ source, provenance = {}, runner = spawnSync, npmEntry = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js') } = {}) {
  const directory = path.join(source, 'reports', 'audit'); mkdirSync(directory, { recursive: true });
  const result = { status: 'error', exitCode: 2, tool: 'npm audit (PR lockfile, no install or lifecycle scripts)',
    scope: 'Frontend dependencies and devDependencies recorded in the PR merge package-lock.json; HIGH/CRITICAL gate; no backend audit.',
    ...provenance, vulnerabilities: {}, findings: [] };
  const save = () => {
    const counts = result.vulnerabilities;
    const explanation = result.status === 'error' ? 'Pemeriksaan tidak selesai; hasil ini bukan lolos.' : result.status === 'blocked'
      ? 'PR ditolak: ditemukan masalah tingkat tinggi atau kritis.' : 'Audit lolos batas tinggi/kritis. Temuan sedang/rendah tetap perlu ditinjau.';
    const text = `${explanation}\nStatus: ${result.status}\nTinggi: ${counts.high ?? '-'}; kritis: ${counts.critical ?? '-'}; sedang: ${counts.moderate ?? '-'}; rendah: ${counts.low ?? '-'}\n${result.code || ''}\n`;
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
    validateAuditInput(manifest, JSON.parse(lockText));
    if (!path.isAbsolute(npmEntry) || path.basename(npmEntry) !== 'npm-cli.js' || !existsSync(npmEntry)) throw new Error('TRUSTED_NPM_CLI_REQUIRED');
    const safeManifest = { name: 'reservasi-pr-dependency-audit', version: '1.0.0', private: true };
    for (const field of dependencyFields) if (manifest[field]) safeManifest[field] = manifest[field];
    writeFileSync(path.join(scratch, 'package.json'), JSON.stringify(safeManifest));
    writeFileSync(path.join(scratch, 'package-lock.json'), lockText);
    const userConfig = path.join(scratch, 'user.npmrc'); const globalConfig = path.join(scratch, 'global.npmrc');
    writeFileSync(userConfig, ''); writeFileSync(globalConfig, '');
    const env = { SystemRoot: process.env.SystemRoot || 'C:\\Windows', WINDIR: process.env.WINDIR || 'C:\\Windows',
      PATH: process.env.PATH || process.env.Path || '', TEMP: scratch, TMP: scratch, HOME: scratch, USERPROFILE: scratch,
      APPDATA: scratch, LOCALAPPDATA: scratch, CI: 'true', NO_COLOR: '1' };
    const execution = runner(process.execPath, [npmEntry, 'audit', '--json', '--audit-level=high', '--package-lock-only', '--ignore-scripts', '--workspaces=false', '--include=dev',
      '--registry=https://registry.npmjs.org/', `--userconfig=${userConfig}`, `--globalconfig=${globalConfig}`, `--cache=${path.join(scratch, 'cache')}`],
    { cwd: scratch, env, encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
    Object.assign(result, auditOutcome(execution));
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
