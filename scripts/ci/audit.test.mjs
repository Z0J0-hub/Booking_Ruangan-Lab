import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAudits } from './audit.mjs';

function response({ high = 0, critical = 0, moderate = 0, low = 0 } = {}) {
  return {
    status: high + critical > 0 ? 1 : 0,
    stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low, moderate, high, critical } } }),
    stderr: '',
  };
}

function workspace(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reservasi-audit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('frontend findings still allow backend audit and both reports before failing', (t) => {
  const root = workspace(t);
  const visited = [];
  const result = runAudits({ root, runner(cwd) {
    visited.push(cwd);
    return cwd === root ? response({ high: 13 }) : response();
  } });
  assert.deepEqual(visited, [root, path.join(root, 'backend')]);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.results.map((item) => item.status), ['blocked', 'passed']);
  for (const target of ['frontend', 'backend']) {
    assert.ok(readFileSync(path.join(root, 'reports/audit', `${target}.txt`), 'utf8'));
  }
});

test('low and moderate findings pass the high/critical gate', (t) => {
  const result = runAudits({ root: workspace(t), runner: () => response({ low: 2, moderate: 6 }) });
  assert.equal(result.exitCode, 0);
});

test('backend critical finding blocks even when frontend passes', (t) => {
  const root = workspace(t);
  const result = runAudits({ root, runner: (cwd) => cwd === root ? response() : response({ critical: 1 }) });
  assert.equal(result.exitCode, 1);
  assert.equal(result.results[1].status, 'blocked');
});

test('network error and malformed output are errors, not clean audits; summaries replace old results', (t) => {
  const root = workspace(t);
  runAudits({ root, runner: () => response() });
  const result = runAudits({ root, runner(cwd) {
    if (cwd === root) throw new Error('network unavailable');
    return { status: 1, stdout: 'not JSON', stderr: 'audit failed' };
  } });
  assert.equal(result.exitCode, 2);
  const saved = JSON.parse(readFileSync(path.join(root, 'reports/audit/summary.json'), 'utf8'));
  assert.deepEqual(saved.results.map((item) => item.status), ['error', 'error']);
});
