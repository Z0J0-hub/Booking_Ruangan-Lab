import { ESLint } from 'eslint';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { securityConfig } from '../../eslint.security.config.js';
import { runSemgrep, coverage } from '../sast/semgrep.mjs';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const patterns = [
  'src/**/*.{js,jsx,mjs,cjs,ts,tsx}', 'scripts/**/*.{js,jsx,mjs,cjs,ts,tsx}',
  'backend/**/*.{js,jsx,mjs,cjs,ts,tsx}', '*.config.{js,ts}',
];

export async function runSast({ root = projectRoot, files = patterns, semgrep = true } = {}) {
  const directory = path.join(root, 'reports', 'sast');
  mkdirSync(directory, { recursive: true });
  const report = {
    status: 'error', exitCode: 2, tool: semgrep ? 'Semgrep CE 1.185.0 + ESLint security' : 'ESLint security',
    standard: 'OWASP Top 10:2025',
    scope: 'Selected JS/TS patterns and Semgrep intrafile taint rules mapped to OWASP 2025; partial coverage, no SQL/RLS or whole-application assurance',
    scannedFiles: 0, findings: [],
  };
  const save = () => {
    writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(path.join(directory, 'findings.json'), JSON.stringify(report.findings, null, 2) + '\n');
    writeFileSync(path.join(directory, 'coverage.json'), JSON.stringify(coverage(report.findings), null, 2) + '\n');
    const mapping = coverage(report.findings);
    writeFileSync(path.join(directory, 'summary.html'), '<!doctype html><meta charset="utf-8"><title>SAST OWASP 2025</title>' +
      `<h1>SAST: ${escape(report.status)}</h1><p>${escape(report.tool)}; ${report.scannedFiles} files; ${report.findings.length} findings.</p>` +
      '<h2>OWASP Top 10:2025 mapping</h2><p>Partial coverage in every category. A passing scan does not prove the application free of OWASP Top 10 risks.</p>' +
      '<table border="1"><tr><th>Category</th><th>Selected rules</th><th>Findings</th></tr>' +
      mapping.categories.map((entry) => `<tr><td>${escape(entry.category)}</td><td>${entry.rules.length}</td><td>${entry.findings}</td></tr>`).join('') + '</table>' +
      '<h2>Findings (sanitized)</h2><table border="1"><tr><th>Rule</th><th>File</th><th>Line</th></tr>' +
      report.findings.map((finding) => `<tr><td>${escape(finding.rule)}</td><td>${escape(finding.file)}</td><td>${finding.line}</td></tr>`).join('') + '</table>' +
      `<p>${escape(report.scope)}</p>`);
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
      engine: 'ESLint security',
      file: path.relative(root, result.filePath).replaceAll('\\', '/'),
      rule: finding.ruleId || 'parse-error', line: finding.line || 1,
      severity: finding.severity === 2 ? 'error' : 'warning',
    })));
    // No raw source, message text, or matched credential is written to artifacts.
    report.exitCode = parseError ? 2 : report.findings.length ? 1 : 0;
    report.status = report.exitCode === 2 ? 'error' : report.exitCode === 1 ? 'blocked' : 'passed';
    if (semgrep && !parseError) {
      const additional = runSemgrep({ root, files });
      report.engines = { semgrep: { status: additional.status, scannedFiles: additional.scannedFiles, version: additional.version } };
      report.findings.push(...additional.findings);
      report.exitCode = additional.exitCode === 2 ? 2 : report.findings.length ? 1 : 0;
      report.status = report.exitCode === 2 ? 'error' : report.exitCode === 1 ? 'blocked' : 'passed';
      if (additional.code) report.code = additional.code;
    }
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
