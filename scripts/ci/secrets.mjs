import { spawnSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureGitleaks, GITLEAKS_VERSION } from './gitleaks-tool.mjs';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

function within(directory, file) {
  const relative = path.relative(directory, file);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Scan path is outside the expected directory.');
  }
  return relative;
}

function collectFiles(root) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('Cannot enumerate Git files for secret scanning.');
  return [...new Set(result.stdout.split('\0').filter(Boolean))];
}

function prepareSnapshot(root, snapshot) {
  let scannedFiles = 0;
  for (const name of collectFiles(root)) {
    const source = path.resolve(root, name);
    within(root, source);
    let stat;
    try { stat = lstatSync(source); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Scan includes an unsupported symlink, directory, or submodule.');
    let parent = path.dirname(source);
    while (parent !== path.resolve(root)) {
      if (lstatSync(parent).isSymbolicLink()) throw new Error('Scan includes a symbolic link in a source directory.');
      parent = path.dirname(parent);
    }
    const destination = path.resolve(snapshot, name);
    within(snapshot, destination);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    scannedFiles++;
  }
  if (scannedFiles === 0) throw new Error('No source files found; empty scan is not accepted.');
  return scannedFiles;
}

// Only location/type metadata is published. Never forward raw findings or scanner output.
function sanitizeFinding(finding, snapshot) {
  if (typeof finding.RuleID !== 'string' || typeof finding.File !== 'string' ||
      !Number.isInteger(finding.StartLine) || finding.StartLine < 1) {
    throw new Error('Scanner returned an invalid finding.');
  }
  const file = path.isAbsolute(finding.File) ? within(snapshot, finding.File) : finding.File;
  within(snapshot, path.resolve(snapshot, file));
  return { rule: finding.RuleID, file: file.replaceAll('\\', '/'), line: finding.StartLine };
}

export async function runSecretScan({ root = projectRoot, tool = ensureGitleaks, runner = spawnSync } = {}) {
  const reportDir = path.join(root, 'reports', 'secrets');
  mkdirSync(reportDir, { recursive: true });
  // Replace old results before any operation that can fail.
  const result = {
    status: 'error', exitCode: 2, tool: 'gitleaks', version: GITLEAKS_VERSION,
    scope: 'working-tree tracked and non-ignored new files; no Git history',
    scannedFiles: 0, findings: [],
  };
  const save = () => {
    writeFileSync(path.join(reportDir, 'findings.json'), JSON.stringify(result.findings, null, 2) + '\n');
    writeFileSync(path.join(reportDir, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
    writeFileSync(path.join(reportDir, 'summary.txt'),
      `Secret scan: ${result.status}; findings=${result.findings.length}; files=${result.scannedFiles}; exit=${result.exitCode}\n` +
      (result.message ? `${result.message}\n` : '') +
      `Gitleaks ${GITLEAKS_VERSION}. Reports: reports/secrets/\n`);
  };
  save();
  let scratch;
  try {
    const binary = await tool();
    scratch = mkdtempSync(path.join(os.tmpdir(), 'reservasi-secrets-'));
    const snapshot = path.join(scratch, 'source');
    mkdirSync(snapshot);
    result.scannedFiles = prepareSnapshot(root, snapshot);
    const rawReport = path.join(scratch, 'raw.json');
    const ignoreFile = path.join(scratch, 'empty.gitleaksignore');
    writeFileSync(ignoreFile, '');
    const execution = runner(binary, [
      'dir', snapshot, '--config', path.join(root, '.gitleaks.toml'),
      '--report-format=json', '--report-path', rawReport,
      '--redact=100', '--exit-code=10', '--no-banner', '--no-color',
      '--ignore-gitleaks-allow', '--gitleaks-ignore-path', ignoreFile,
      '--log-level=error', '--timeout=120',
    ], { cwd: snapshot, encoding: 'utf8', windowsHide: true, timeout: 130_000, maxBuffer: 8 * 1024 * 1024 });
    if (execution.error || execution.signal || ![0, 10].includes(execution.status)) {
      throw new Error('Scanner execution failed; no clean result is available. Check tool access/configuration.');
    }
    let raw;
    try { raw = JSON.parse(readFileSync(rawReport, 'utf8')); }
    catch { throw new Error('Scanner did not produce a valid JSON report.'); }
    if (!Array.isArray(raw)) throw new Error('Scanner report must be a findings array.');
    if ((execution.status === 0) !== (raw.length === 0)) throw new Error('Scanner exit code and report disagree.');
    result.findings = raw.map((finding) => sanitizeFinding(finding, snapshot));
    result.status = result.findings.length ? 'blocked' : 'passed';
    result.exitCode = result.findings.length ? 1 : 0;
  } catch (error) {
    // All messages above are controlled text; installation errors also exclude file contents.
    result.message = error.message;
    result.findings = [];
    result.status = 'error';
    result.exitCode = 2;
  } finally {
    if (scratch) {
      within(path.resolve(os.tmpdir()), path.resolve(scratch));
      rmSync(scratch, { recursive: true, force: true });
    }
    save();
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runSecretScan();
  console.log(`Secret scan: ${result.status}; findings=${result.findings.length}; files=${result.scannedFiles}.`);
  if (result.message) console.error(result.message);
  console.log('Reports: reports/secrets/ (values and matched source lines are not published).');
  process.exitCode = result.exitCode;
}
