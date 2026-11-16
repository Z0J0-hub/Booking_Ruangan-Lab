import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSecretScan } from './secrets.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reservasi-secret-test-'));
  t.after(() => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root));
    assert.ok(relative.startsWith('reservasi-secret-test-') && !relative.includes(path.sep));
    rmSync(root, { recursive: true, force: true });
  });
  const init = spawnSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
  assert.equal(init.status, 0);
  writeFileSync(path.join(root, '.gitignore'), '.env\nreports/\n');
  writeFileSync(path.join(root, '.gitleaks.toml'), '[extend]\nuseDefault = true\n');
  writeFileSync(path.join(root, 'app.js'), 'console.log("test");\n');
  return root;
}

const tool = async () => 'test-scanner';
function fakeScanner(inspect = () => {}, findings = []) {
  return (_binary, args, options) => {
    const source = args[1];
    const rawReport = args[args.indexOf('--report-path') + 1];
    inspect(source, args, options);
    writeFileSync(rawReport, JSON.stringify(findings));
    return { status: findings.length ? 10 : 0 };
  };
}

test('snapshot excludes ignored local files but includes newly added non-ignored source', async (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, '.env'), 'private local setting');
  const result = await runSecretScan({ root, tool, runner: fakeScanner((source) => {
    assert.equal(existsSync(path.join(source, '.env')), false);
    assert.equal(existsSync(path.join(source, 'app.js')), true);
  }) });
  assert.equal(result.status, 'passed');
  assert.equal(result.exitCode, 0);
});

test('an accidentally tracked env file is scanned despite ignore patterns', async (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, '.env'), 'test placeholder');
  assert.equal(spawnSync('git', ['add', '-f', '--', '.env'], { cwd: root, windowsHide: true }).status, 0);
  const result = await runSecretScan({ root, tool, runner: fakeScanner((source) => {
    assert.equal(existsSync(path.join(source, '.env')), true);
  }) });
  assert.equal(result.exitCode, 0);
});

test('findings block the gate and artifacts omit secret, match, and source line', async (t) => {
  const root = fixture(t);
  const privateValue = ['fake', 'value', 'must', 'stay', 'private'].join('-');
  const result = await runSecretScan({ root, tool, runner: fakeScanner((_source, args) => {
    assert.ok(args.includes('--redact=100'));
    assert.ok(args.includes('--ignore-gitleaks-allow'));
  }, [{ RuleID: 'test-rule', File: 'app.js', StartLine: 1, Secret: privateValue, Match: privateValue, Line: privateValue }]) });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.findings, [{ rule: 'test-rule', file: 'app.js', line: 1 }]);
  const artifacts = ['findings.json', 'summary.json', 'summary.txt'].map((name) => readFileSync(path.join(root, 'reports/secrets', name), 'utf8')).join('\n');
  assert.equal(artifacts.includes(privateValue), false);
});

test('missing scanner changes a previous pass into error rather than preserving stale success', async (t) => {
  const root = fixture(t);
  await runSecretScan({ root, tool, runner: fakeScanner() });
  const result = await runSecretScan({ root, tool: async () => { throw new Error('Tool unavailable'); } });
  assert.equal(result.exitCode, 2);
  const saved = JSON.parse(readFileSync(path.join(root, 'reports/secrets/summary.json'), 'utf8'));
  assert.equal(saved.status, 'error');
});

test('scanner errors, missing reports, and inconsistent exit codes cannot become a clean scan', async (t) => {
  const root = fixture(t);
  for (const runner of [
    () => ({ status: 1, stderr: 'private diagnostic not published' }),
    () => ({ status: 0 }),
    (_binary, args) => {
      writeFileSync(args[args.indexOf('--report-path') + 1], '[]');
      return { status: 10 };
    },
  ]) {
    const result = await runSecretScan({ root, tool, runner });
    assert.equal(result.exitCode, 2);
    assert.equal(readFileSync(path.join(root, 'reports/secrets/summary.txt'), 'utf8').includes('private diagnostic'), false);
  }
});

test('invalid JSON and finding paths outside the snapshot are rejected', async (t) => {
  const root = fixture(t);
  const malformed = await runSecretScan({ root, tool, runner: (_binary, args) => {
    writeFileSync(args[args.indexOf('--report-path') + 1], 'not JSON');
    return { status: 0 };
  } });
  assert.equal(malformed.exitCode, 2);
  const outside = await runSecretScan({ root, tool, runner: fakeScanner(() => {}, [
    { RuleID: 'test', File: '../outside.js', StartLine: 1 },
  ]) });
  assert.equal(outside.exitCode, 2);
});
