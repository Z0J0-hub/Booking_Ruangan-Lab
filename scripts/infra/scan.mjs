import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const binary = path.join(root, '.tools', 'trivy', '0.76.2', 'trivy.exe');
const binaryHash = 'dd07adf881a72b54d1a922191d62fa939938df2155be85a727da93b67b24e617';
export function composeFindings(text, name) {
  const document = parse(text); const service = document?.services?.frontend;
  if (!service) throw new Error('COMPOSE_FRONTEND_MISSING');
  const rules = {
    NON_ROOT: service.user === '101:101', READ_ONLY: service.read_only === true,
    DROP_CAPABILITIES: service.cap_drop?.includes('ALL'),
    NO_PRIVILEGE_ESCALATION: service.security_opt?.includes('no-new-privileges:true'),
    LOOPBACK_ONLY: Array.isArray(service.ports) && service.ports.length > 0 && service.ports.every((value) => /^127\.0\.0\.1:\d+:8080$/.test(value)),
    NO_HOST_PRIVILEGES: !service.privileged && !service.pid && !service.network_mode && !service.cap_add?.length,
    NO_HOST_MOUNTS: !service.volumes?.length,
    RESOURCE_LIMITS: service.pids_limit > 0 && service.pids_limit <= 256 && Boolean(service.mem_limit) && service.cpus > 0 && service.cpus <= 1,
    ISOLATED_NETWORK: service.networks?.length === 1 && service.networks[0] === 'frontend' && document.networks?.frontend?.internal === true,
    BOUNDED_LOGS: service.logging?.options?.['max-size'] === '10m' && service.logging?.options?.['max-file'] === '3',
  };
  return { checks: Object.keys(rules).length, findings: Object.entries(rules).filter(([, passed]) => !passed).map(([rule]) => ({ file: name, rule, severity: 'HIGH' })) };
}

export function trivyFindings(raw, mode) {
  if (!raw || !Array.isArray(raw.Results) || raw.Results.length === 0) throw new Error('EMPTY_TRIVY_SCAN');
  let checks = 0;
  const findings = [];
  for (const result of raw.Results) {
    if (mode === 'config') {
      checks += Object.values(result.MisconfSummary || {}).filter(Number.isInteger).reduce((sum, value) => sum + value, 0);
      for (const item of result.Misconfigurations || []) {
        if (item.Status && item.Status !== 'FAIL') continue;
        findings.push({ file: path.basename(result.Target), rule: item.ID, severity: item.Severity });
      }
    } else {
      checks += result.Packages?.length || result.Vulnerabilities?.length || 0;
      for (const item of result.Vulnerabilities || []) findings.push({ rule: item.VulnerabilityID, package: item.PkgName, installed: item.InstalledVersion, fixed: item.FixedVersion || null, severity: item.Severity });
    }
  }
  if (mode === 'config' && checks === 0) throw new Error('NO_TRIVY_CHECKS');
  if (mode === 'image' && !raw.Metadata?.ImageID && !raw.Metadata?.OS) throw new Error('NO_IMAGE_METADATA');
  if (findings.some((item) => !['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(item.severity))) throw new Error('INVALID_TRIVY_SEVERITY');
  return { checks, findings };
}

export function runInfra(mode = 'config', { sourceRoot = root } = {}) {
  if (!['config', 'image'].includes(mode)) throw new Error('INVALID_SCAN_MODE');
  const directory = path.join(sourceRoot, 'reports', mode === 'config' ? 'infra' : 'image'); mkdirSync(directory, { recursive: true });
  const report = { status: 'error', exitCode: 2, tool: 'Trivy 0.76.2 + project Compose policy', mode, checks: 0, findings: [],
    scope: mode === 'config' ? 'Active frontend Dockerfile and Compose project policy; not full CIS compliance' : 'Exact exported application image archive; HIGH/CRITICAL gate',
    sourceDigest: process.env.CI_SOURCE_DIGEST || null, buildUrl: process.env.BUILD_URL || null };
  const save = () => writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  save(); const scratch = mkdtempSync(path.join(directory, 'private-'));
  try {
    if (createHash('sha256').update(readFileSync(binary)).digest('hex') !== binaryHash) throw new Error('TRIVY_BINARY_CHECKSUM');
    const rawFile = path.join(scratch, 'raw.json');
    let args;
    if (mode === 'config') {
      const input = path.join(scratch, 'source'); mkdirSync(input);
      copyFileSync(path.join(sourceRoot, 'frontend', 'Dockerfile'), path.join(input, 'Dockerfile'));
      args = ['config', '--skip-check-update', '--include-non-failures', '--misconfig-scanners', 'dockerfile', input];
      for (const name of ['docker-compose.yml', 'docker-compose.staging.yml', 'docker-compose.prod.yml']) {
        const policy = composeFindings(readFileSync(path.join(sourceRoot, name), 'utf8'), name);
        report.checks += policy.checks; report.findings.push(...policy.findings);
      }
      const ignore = readFileSync(path.join(sourceRoot, '.dockerignore'), 'utf8').split(/\r?\n/);
      for (const required of ['.git', '.env', '.env.*', '*.local.json', '.runtime']) {
        report.checks++;
        if (!ignore.includes(required)) report.findings.push({ file: '.dockerignore', rule: 'EXCLUDE_' + required, severity: 'HIGH' });
      }
    } else {
      if (!process.env.IMAGE_TAR) throw new Error('IMAGE_TAR_REQUIRED');
      const archive = realpathSync(path.resolve(root, process.env.IMAGE_TAR));
      const safe = path.relative(path.join(root, '.runtime', 'images'), archive);
      if (!safe || safe.startsWith('..') || path.isAbsolute(safe) || !archive.endsWith('.tar')) throw new Error('IMAGE_ARCHIVE_OUTSIDE_STORE');
      args = ['image', '--input', archive, '--scanners', 'vuln', '--list-all-pkgs'];
    }
    const execution = spawnSync(binary, [...args, '--quiet', '--format', 'json', '--output', rawFile, '--cache-dir', path.join(root, '.tools', 'trivy', 'cache'), '--timeout', '8m'], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 510_000 });
    if (execution.status !== 0 || execution.error || execution.signal) throw new Error('TRIVY_EXECUTION_ERROR');
    const result = trivyFindings(JSON.parse(readFileSync(rawFile, 'utf8')), mode);
    report.checks += result.checks; report.findings.push(...result.findings);
    report.exitCode = report.findings.some((item) => ['HIGH', 'CRITICAL', 'UNKNOWN'].includes(item.severity)) ? 1 : 0;
    report.status = report.exitCode ? 'blocked' : 'passed';
  } catch (error) { report.code = /^[A-Z_]+$/.test(error.message) ? error.message : 'INFRA_SCAN_ERROR'; }
  finally {
    const relative = path.relative(directory, scratch);
    if (!relative.startsWith('private-') || relative.includes(path.sep)) throw new Error('INVALID_INFRA_SCRATCH');
    rmSync(scratch, { recursive: true, force: true }); save();
  }
  console.log(`Infrastructure ${mode}: ${report.status}; checks=${report.checks}; findings=${report.findings.length}; exit=${report.exitCode}. Reports: ${path.relative(root, directory)}`);
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = runInfra(process.argv[2]).exitCode;
