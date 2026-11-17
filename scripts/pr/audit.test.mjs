import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPrAudit, validateAuditInput, auditOutcome, auditLimits } from './audit.mjs';
import { combinePrChecks } from './scan.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reservasi-pr-audit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifest = { name: 'test', dependencies: { lodash: '4.17.21' }, scripts: { preinstall: 'this must never run' } };
  const lock = { lockfileVersion: 3, packages: { '': { dependencies: manifest.dependencies }, 'node_modules/lodash': { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz' } } };
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  writeFileSync(path.join(root, '.npmrc'), 'registry=http://127.0.0.1:1/\n');
  return { root, manifest, lock };
}
function response(counts = {}) {
  const vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...counts };
  return { status: vulnerabilities.high + vulnerabilities.critical > 0 ? 1 : 0,
    stdout: JSON.stringify({ metadata: { vulnerabilities }, vulnerabilities: {} }) };
}

test('PR audit uses only package files, no lifecycle scripts/config/credentials, and removes its scratch', t => {
  const { root } = fixture(t); let cwd;
  const report = runPrAudit({ source: root, runner(executable, args, options) {
    assert.equal(executable, process.execPath); cwd = options.cwd;
    for (const flag of ['--ignore-scripts', '--package-lock-only', '--workspaces=false', '--include=dev', '--registry=https://registry.npmjs.org/']) assert.ok(args.includes(flag));
    assert.equal(JSON.parse(readFileSync(path.join(cwd, 'package.json'))).scripts, undefined);
    assert.equal(readdirSync(cwd).includes('.npmrc'), false);
    assert.equal(readdirSync(cwd).includes('node_modules'), false);
    assert.equal(Object.keys(options.env).some(key => /TOKEN|PASSWORD|SECRET|JENKINS|npm_config/i.test(key)), false);
    for (const name of ['user.npmrc', 'global.npmrc']) assert.equal(readFileSync(path.join(cwd, name), 'utf8'), '');
    return response({ moderate: 2, low: 1 });
  } });
  assert.equal(report.status, 'passed'); assert.equal(report.exitCode, 0);
  assert.equal(existsSync(cwd), false); assert.equal(existsSync(path.join(root, 'node_modules')), false);
});
test('high/critical dependency findings block a PR even when SAST passes', t => {
  const { root } = fixture(t);
  for (const counts of [{ high: 1 }, { critical: 1 }]) {
    const audit = runPrAudit({ source: root, runner: () => response(counts) });
    assert.equal(audit.status, 'blocked');
    assert.deepEqual(combinePrChecks({ sast: { status: 'passed', exitCode: 0 }, audit }), { status: 'blocked', exitCode: 1 });
  }
});
test('persistent cache survives scratch cleanup while every audit checks live results again', t => {
  const { root } = fixture(t); const caches = []; const scratches = []; let calls = 0;
  const runner = (_exe, args, options) => {
    calls++; caches.push(args.find(arg => arg.startsWith('--cache=')).slice(8)); scratches.push(options.cwd);
    assert.ok(args.includes('--prefer-online'));
    assert.equal(args.some(arg => /^--(?:offline|prefer-offline)(?:=|$)/.test(arg)), false);
    return response(calls === 1 ? {} : { high: 1 });
  };
  assert.equal(runPrAudit({ source: root, runner }).status, 'passed');
  assert.equal(runPrAudit({ source: root, runner }).status, 'blocked');
  assert.equal(calls, 2); assert.equal(caches[0], caches[1]);
  assert.ok(existsSync(caches[0]));
  for (const scratch of scratches) { assert.notEqual(caches[0], path.join(scratch, 'cache')); assert.equal(existsSync(scratch), false); }
});
test('missing files, stale lock, local dependencies and registry redirects fail before any audit process starts', t => {
  const { root, manifest, lock } = fixture(t); let calls = 0;
  const run = () => runPrAudit({ source: root, runner: () => { calls++; return response(); } });
  const mismatch = structuredClone(manifest); mismatch.dependencies.lodash = '4.17.20';
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(mismatch)); assert.equal(run().exitCode, 2);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  const badLock = structuredClone(lock); badLock.packages['node_modules/lodash'].resolved = 'http://127.0.0.1/x.tgz';
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(badLock)); assert.equal(run().exitCode, 2);
  rmSync(path.join(root, 'package-lock.json')); assert.equal(run().exitCode, 2);
  assert.equal(calls, 0);
  const linked = structuredClone(lock); linked.packages['node_modules/lodash'].link = true;
  assert.throws(() => validateAuditInput(manifest, linked));
});
test('network errors, malformed reports and inconsistent results replace a previous passing audit', t => {
  const { root } = fixture(t);
  assert.equal(runPrAudit({ source: root, runner: () => response() }).status, 'passed');
  for (const execution of [{ status: 1, stdout: 'not-json' }, { error: new Error('private-network-detail') }, { ...response(), status: 1 }, { ...response({ high: 1 }), status: 0 }]) {
    const report = runPrAudit({ source: root, runner: () => execution });
    assert.equal(report.status, 'error'); assert.equal(report.exitCode, 2);
    const saved = readFileSync(path.join(root, 'reports/audit/summary.json'), 'utf8');
    assert.equal(saved.includes('private-network-detail'), false);
  }
  assert.throws(() => auditOutcome({ status: 0, stdout: '{}' }));
});
test('PR aggregate cannot pass if either check is missing, blocked, errored, or inconsistent', () => {
  const passed = { status: 'passed', exitCode: 0 };
  assert.deepEqual(combinePrChecks({ sast: passed, audit: passed }), passed);
  for (const checks of [{}, { sast: passed }, { sast: {}, audit: {} }, { sast: passed, audit: { status: 'passed', exitCode: 1 } }, { sast: passed, audit: { status: 'error', exitCode: 2 } }]) assert.equal(combinePrChecks(checks).exitCode, 2);
});
test('published HTML escapes advisory text and omits arbitrary raw scanner fields', t => {
  const { root } = fixture(t);
  const payload = JSON.parse(response({ moderate: 1 }).stdout);
  payload.private = 'do-not-publish-this';
  payload.vulnerabilities.lodash = { severity: 'moderate', isDirect: true, fixAvailable: true, via: [{ title: '<script>alert(1)</script>' }] };
  runPrAudit({ source: root, runner: () => ({ status: 0, stdout: JSON.stringify(payload) }) });
  const html = readFileSync(path.join(root, 'reports/audit/summary.html'), 'utf8');
  assert.equal(html.includes('<script>'), false); assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(html.includes('do-not-publish-this'), false);
});

test('a process timeout retries once and can recover with a valid audit; safe network limits remain enforced', t => {
  const { root } = fixture(t); let calls = 0; const waits = [];
  const result = runPrAudit({ source: root, pause: ms => waits.push(ms), runner(_exe, args, options) {
    calls++;
    assert.ok(args.includes('--fetch-timeout=60000')); assert.ok(args.includes('--fetch-retries=0'));
    assert.ok(args.includes('--strict-ssl=true')); assert.ok(args.includes('--ignore-scripts'));
    assert.equal(options.timeout, 240000);
    return calls === 1 ? { error: Object.assign(new Error('private timeout details'), { code: 'ETIMEDOUT' }), signal: 'SIGTERM', status: null } : response({ moderate: 2 });
  } });
  assert.equal(calls, 2); assert.deepEqual(waits, [2000]);
  assert.equal(result.status, 'passed'); assert.equal(result.exitCode, 0); assert.equal(result.code, undefined);
  assert.deepEqual(result.attempts.map(attempt => attempt.status), ['error', 'passed']);
  assert.equal(result.attempts[0].code, 'PR_AUDIT_TIMEOUT');
  assert.equal(readFileSync(path.join(root, 'reports/audit/summary.json'), 'utf8').includes('private timeout details'), false);
});
test('persistent timeouts stop after two attempts and never become a clean audit', t => {
  const { root } = fixture(t); let calls = 0;
  const report = runPrAudit({ source: root, pause: () => {}, runner: () => { calls++; return { error: { code: 'ETIMEDOUT' }, status: null }; } });
  assert.equal(calls, auditLimits.maxAttempts); assert.equal(report.status, 'error'); assert.equal(report.exitCode, 2);
  assert.equal(report.code, 'PR_AUDIT_TIMEOUT'); assert.deepEqual(report.vulnerabilities, {});
});
test('transient npm network/registry errors retry but vulnerability findings, TLS errors and malformed reports do not', t => {
  const { root } = fixture(t);
  for (const error of [{ code: 'ECONNRESET' }, { code: 'EAI_AGAIN' }, { code: 'E503' }, { statusCode: 429 }]) {
    let calls = 0;
    const report = runPrAudit({ source: root, pause: () => {}, runner: () => ++calls === 1 ? { status: 1, stdout: JSON.stringify({ error }) } : response() });
    assert.equal(report.status, 'passed'); assert.equal(calls, 2);
  }
  for (const execution of [response({ high: 1 }), response({ critical: 1 }), { status: 1, stdout: 'invalid-json' },
    { status: 1, stdout: JSON.stringify({ error: { code: 'SELF_SIGNED_CERT_IN_CHAIN' } }) }, { signal: 'SIGTERM', status: null }]) {
    let calls = 0;
    const report = runPrAudit({ source: root, pause: () => assert.fail('Must not retry'), runner: () => { calls++; return execution; } });
    assert.equal(calls, 1); assert.notEqual(report.status, 'passed');
  }
});
