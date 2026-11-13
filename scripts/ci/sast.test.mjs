import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSast } from './sast.mjs';

function fixture(t, source, filename = 'fixture.tsx') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reservasi-sast-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, filename), source);
  return { root, files: [filename] };
}

test('real scanner rejects dynamic execution and raw JSX HTML, without publishing source', async (t) => {
  const input = ['/* eslint-disable */', 'const privateMarker = "fixture-sensitive-text";',
    'eval(privateMarker);', 'export const view = <div dangerouslySetInnerHTML={{ __html: privateMarker }} />;'].join('\n');
  const options = fixture(t, input);
  const result = await runSast(options);
  assert.equal(result.exitCode, 1);
  assert.ok(result.findings.some((item) => item.rule === 'no-eval'));
  assert.ok(result.findings.some((item) => item.rule === 'no-restricted-syntax'));
  const saved = readFileSync(path.join(options.root, 'reports/sast/summary.json'), 'utf8');
  assert.equal(saved.includes('fixture-sensitive-text'), false);
});

test('real scanner rejects shell execution with a variable command', async (t) => {
  const result = await runSast(fixture(t, 'import { exec } from "node:child_process"; export function run(command) { exec(command); }', 'fixture.mjs'));
  assert.equal(result.exitCode, 1);
  assert.ok(result.findings.some((item) => item.rule === 'security/detect-child-process'));
});

test('safe typed React source passes', async (t) => {
  const result = await runSast(fixture(t, 'export const view = (name: string) => <div>{name}</div>;'));
  assert.equal(result.exitCode, 0);
  assert.equal(result.scannedFiles, 1);
});

test('invalid syntax and missing input fail closed and overwrite previous success', async (t) => {
  const options = fixture(t, 'export const ok = true;');
  assert.equal((await runSast(options)).exitCode, 0);
  writeFileSync(path.join(options.root, options.files[0]), 'export const = ;');
  assert.equal((await runSast(options)).exitCode, 2);
  assert.equal((await runSast({ ...options, files: ['missing.ts'] })).exitCode, 2);
  assert.equal(JSON.parse(readFileSync(path.join(options.root, 'reports/sast/summary.json'), 'utf8')).status, 'error');
});
