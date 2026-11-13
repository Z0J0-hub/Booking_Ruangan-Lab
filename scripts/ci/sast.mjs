import { ESLint } from 'eslint';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { securityConfig } from '../../eslint.security.config.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const patterns = [
  'src/**/*.{js,jsx,mjs,cjs,ts,tsx}', 'scripts/**/*.{js,jsx,mjs,cjs,ts,tsx}',
  'backend/**/*.{js,jsx,mjs,cjs,ts,tsx}', '*.config.{js,ts}',
];

export async function runSast({ root = projectRoot, files = patterns } = {}) {
  const directory = path.join(root, 'reports', 'sast');
  mkdirSync(directory, { recursive: true });
  const report = {
    status: 'error', exitCode: 2, tool: 'ESLint + eslint-plugin-security',
    scope: 'selected JS/TS security rules; active source, CI scripts, and legacy backend; no SQL or taint analysis',
    scannedFiles: 0, findings: [],
  };
  const save = () => {
    writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(path.join(directory, 'findings.json'), JSON.stringify(report.findings, null, 2) + '\n');
    writeFileSync(path.join(directory, 'summary.txt'),
      `SAST: ${report.status}; files=${report.scannedFiles}; findings=${report.findings.length}; exit=${report.exitCode}\n${report.scope}\n`);
  };
  save(); // Never leave an earlier success after a scanner/configuration error.
  try {
    const scanner = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: securityConfig });
    const results = await scanner.lintFiles(files);
    if (results.length === 0) throw new Error('EMPTY_SCAN');
    report.scannedFiles = results.length;
    const parseError = results.some((result) => result.fatalErrorCount > 0);
    report.findings = results.flatMap((result) => result.messages.map((finding) => ({
      file: path.relative(root, result.filePath).replaceAll('\\', '/'),
      rule: finding.ruleId || 'parse-error', line: finding.line || 1,
      severity: finding.severity === 2 ? 'error' : 'warning',
    })));
    // No raw source, message text, or matched credential is written to artifacts.
    report.exitCode = parseError ? 2 : report.findings.length ? 1 : 0;
    report.status = report.exitCode === 2 ? 'error' : report.exitCode === 1 ? 'blocked' : 'passed';
  } catch {
    report.status = 'error';
    report.exitCode = 2;
    report.code = 'SCANNER_OR_CONFIG_ERROR';
  }
  save();
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runSast();
  console.log(`SAST: ${result.status}; files=${result.scannedFiles}; findings=${result.findings.length}; exit=${result.exitCode}. Reports: reports/sast/`);
  process.exitCode = result.exitCode;
}
