import { spawnSync } from 'node:child_process';
import { globSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const project = fileURLToPath(new URL('../../', import.meta.url));
export const configFile = path.join(project, 'security', 'semgrep', 'owasp-2025.yaml');
export const rules = parse(readFileSync(configFile, 'utf8')).rules;
export const categories = [...new Set(rules.flatMap((rule) => rule.metadata.owasp))].sort();
const defaultPatterns = ['src/**/*.{js,jsx,mjs,cjs,ts,tsx}', 'scripts/**/*.{js,jsx,mjs,cjs,ts,tsx}', 'backend/**/*.{js,jsx,mjs,cjs,ts,tsx}', '*.config.{js,ts}'];
const excluded = ['node_modules', '.git', '.tools', '.runtime', 'reports', 'dist'];
export function runSemgrep({ root = project, files } = {}) {
  const directory = path.join(root, 'reports', 'sast'); mkdirSync(directory, { recursive: true });
  const scratch = mkdtempSync(path.join(directory, 'private-semgrep-'));
  const result = { engine: 'Semgrep CE', version: '1.185.0', status: 'error', exitCode: 2, scannedFiles: 0, findings: [] };
  try {
    const patterns = files || defaultPatterns;
    const names = [...new Set(patterns.flatMap((pattern) => [...globSync(pattern, { cwd: root, exclude: excluded.map((part) => `**/${part}/**`) })]))]
      .filter((name) => !name.split(/[\\/]/).some((part) => excluded.includes(part)));
    if (!names.length) throw new Error('EMPTY_SEMGREP_SCAN');
    // Never enumerate cached dependencies into the Windows command line. Source
    // files are explicit so a PR's ignore files cannot hide security findings.
    if (names.reduce((sum, name) => sum + name.length + 3, 0) > 24_000) throw new Error('SEMGREP_SOURCE_ARGUMENT_LIMIT');
    const raw = path.join(scratch, 'raw.json');
    const executable = path.join(project, '.tools', 'semgrep', 'venv', 'Scripts', 'semgrep.exe');
    const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', SEMGREP_SEND_METRICS: 'off', SEMGREP_ENABLE_VERSION_CHECK: '0' };
    for (const key of Object.keys(env)) if (/TOKEN|PASSWORD|SECRET|STRIDE_DATABASE_URL|JENKINS_AUTH/i.test(key)) delete env[key];
    const execution = spawnSync(executable, ['scan', '--config', configFile, '--json', '--output', raw, '--error', '--strict',
      '--metrics', 'off', '--disable-version-check', '--disable-nosem', '--no-rewrite-rule-ids', '--no-git-ignore', '--project-root', root, '--novcs', '--jobs', '2', '--timeout', '20', '--max-target-bytes', '2000000', ...names.map((name) => './' + name.replaceAll('\\', '/'))],
    { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 240_000, maxBuffer: 8 * 1024 * 1024 });
    writeFileSync(path.join(project, '.tools', 'semgrep', 'last-run.local.log'), JSON.stringify({ exit: execution.status, signal: execution.signal, error: execution.error?.code }) + '\n' +
      ((execution.stdout || '') + '\n' + (execution.stderr || '')).slice(-50_000));
    if (existsSync(raw)) copyFileSync(raw, path.join(project, '.tools', 'semgrep', 'last-result.local.json'));
    result.scannerExit = execution.status;
    if (execution.error?.code) result.processCode = execution.error.code;
    if (execution.error || execution.signal || ![0, 1].includes(execution.status)) throw new Error('SEMGREP_EXECUTION_ERROR');
    const report = JSON.parse(readFileSync(raw, 'utf8'));
    if (!Array.isArray(report.results) || !Array.isArray(report.errors) || report.errors.length || !report.paths?.scanned?.length) throw new Error('INVALID_OR_INCOMPLETE_SEMGREP_SCAN');
    result.scannedFiles = report.paths.scanned.length;
    result.findings = report.results.map((finding) => {
      const rule = rules.find((entry) => finding.check_id === entry.id);
      const file = path.relative(root, path.resolve(root, finding.path)).replaceAll('\\', '/');
      if (!rule || !file || file.startsWith('../') || path.isAbsolute(file) || !Number.isInteger(finding.start?.line)) throw new Error('INVALID_SEMGREP_FINDING');
      return { engine: 'Semgrep CE', rule: rule.id, file, line: finding.start.line, severity: 'error', owasp: rule.metadata.owasp, cwe: rule.metadata.cwe };
    });
    if ((execution.status === 0) !== (result.findings.length === 0)) throw new Error('SEMGREP_EXIT_REPORT_MISMATCH');
    result.status = result.findings.length ? 'blocked' : 'passed'; result.exitCode = result.findings.length ? 1 : 0;
  } catch (error) { result.code = /^[A-Z_]+$/.test(error.message) ? error.message : 'SEMGREP_REPORT_ERROR'; }
  finally {
    const relative = path.relative(directory, scratch);
    if (!relative.startsWith('private-semgrep-') || relative.includes(path.sep)) throw new Error('INVALID_SEMGREP_SCRATCH');
    rmSync(scratch, { recursive: true, force: true });
    writeFileSync(path.join(directory, 'semgrep.json'), JSON.stringify(result, null, 2) + '\n');
  }
  return result;
}

export function coverage(findings = []) {
  return { standard: 'OWASP Top 10:2025', source: 'https://top10.owasp.org/2025/',
    limitation: 'Representative rules per category. No complete Top 10 coverage, certification, SQL/RLS validation, or cross-file proof.',
    categories: categories.map((name) => ({ category: name, coverage: 'partial',
      rules: rules.filter((rule) => rule.metadata.owasp.includes(name)).map((rule) => rule.id),
      findings: findings.filter((finding) => finding.owasp?.includes(name)).length })) };
}
