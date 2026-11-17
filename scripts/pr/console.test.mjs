import test from 'node:test';
import assert from 'node:assert/strict';
import { auditConsole, sastConsole } from './console.mjs';

test('audit console explains low/moderate findings despite a passing gate and identifies the affected packages', () => {
  const text = auditConsole({ status: 'passed', lockfilePackages: 42, vulnerabilities: { critical: 0, high: 0, moderate: 1, low: 0, info: 0 },
    findings: [{ package: 'example-package', severity: 'moderate', direct: false, fixAvailable: true, titles: ['Advisory title'] }] });
  assert.ok(text.includes('42')); assert.ok(text.includes('sedang=1')); assert.ok(text.includes('example-package'));
  assert.ok(text.includes('Lolos tidak berarti nol masalah')); assert.ok(text.includes('tinggi/kritis'));
  assert.ok(text.includes('package-lock.json')); assert.ok(text.includes('tidak memasang paket'));
});
test('error and blocked reports cannot be described as passing; incomplete Semgrep results do not show clean category counts', () => {
  const audit = auditConsole({ status: 'error', code: 'PR_AUDIT_SERVICE_ERROR', vulnerabilities: {}, findings: [] });
  assert.ok(audit.includes('ERROR:')); assert.equal(audit.includes('Hasil: LOLOS'), false);
  assert.ok(auditConsole({ status: 'blocked', findings: [], vulnerabilities: { high: 1 } }).includes('Hasil: DITOLAK'));
  const sast = sastConsole({ status: 'error', tool: 'Semgrep + ESLint', findings: [], scannedFiles: 0 });
  assert.ok(sast.includes('belum dapat disimpulkan')); assert.equal(sast.includes('temuan Semgrep: 0'), false);
});
test('SAST reports the actual file/line/rule and clearly states partial OWASP coverage', () => {
  const text = sastConsole({ status: 'blocked', tool: 'Semgrep + ESLint', scannedFiles: 7, engines: { semgrep: { status: 'blocked' } },
    findings: [{ file: 'src/page.tsx', line: 9, engine: 'Semgrep CE', rule: 'owasp2025-injection', owasp: ['A05:2025 - Injection'], cwe: ['CWE-79'] }] });
  assert.ok(text.includes('src/page.tsx:9')); assert.ok(text.includes('CWE-79')); assert.ok(text.includes('cakupan sebagian'));
  assert.ok(text.includes('total temuan SAST: 1')); assert.ok(text.includes('A05'));
});
test('console summaries omit raw source/secret fields and strip control characters that could forge log lines', () => {
  const secret = 'private-source-marker';
  const text = sastConsole({ status: 'blocked', tool: 'Semgrep', scannedFiles: 1, rawOutput: secret,
    findings: [{ file: 'src/file.ts\nFORGED', line: 1, rule: 'rule\x1b', engine: 'Semgrep', sourceLine: secret, secret }] });
  assert.equal(text.includes(secret), false); assert.equal(text.includes('\nFORGED'), false); assert.equal(text.includes('\x1b'), false);
  const many = auditConsole({ status: 'blocked', vulnerabilities: {}, findings: Array.from({ length: 25 }, (_, i) => ({ package: 'pkg-' + i, severity: 'high' })) });
  assert.ok(many.includes('Ada 5 paket lain')); assert.ok(many.includes('laporan lengkap'));
});

test('audit timeout console explains the cause and records attempts without raw error details', () => {
  const text = auditConsole({ status: 'error', code: 'PR_AUDIT_TIMEOUT', limits: { maxAttempts: 2 },
    attempts: [{ attempt: 1, status: 'error', code: 'PR_AUDIT_TIMEOUT', elapsedMs: 90000 }, { attempt: 2, status: 'error', code: 'PR_AUDIT_TIMEOUT', elapsedMs: 90000 }],
    vulnerabilities: {}, findings: [], stderr: 'private stderr' });
  assert.ok(text.includes('Batas waktu audit tercapai')); assert.ok(text.includes('2/2'));
  assert.ok(text.includes('Percobaan 2')); assert.equal(text.includes('private stderr'), false);
});
