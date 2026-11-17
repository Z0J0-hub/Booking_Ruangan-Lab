import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateReviewedBuild } from './build.mjs';
import { validateSnapshotPath } from './source.mjs';
import { checks, checksComplete } from './check.mjs';

test('PR build accepts reviewed inputs but rejects modified code, configs, dependencies and added inputs', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reservasi-reviewed-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const trusted = path.join(root, 'trusted'); const source = path.join(root, 'source');
  const names = ['src/main.tsx', 'package.json', 'package-lock.json', 'vite.config.ts'];
  for (const directory of [trusted, source]) {
    mkdirSync(path.join(directory, 'src'), { recursive: true });
    for (const name of names) writeFileSync(path.join(directory, name), name.endsWith('.json') ? '{}' : 'export const approved = true;');
  }
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: trusted }).status, 0);
  assert.equal(spawnSync('git', ['add', '.'], { cwd: trusted }).status, 0);
  validateReviewedBuild(source, names, trusted);
  for (const name of ['src/main.tsx', 'package-lock.json', 'vite.config.ts']) {
    writeFileSync(path.join(source, name), 'unreviewed changes');
    assert.throws(() => validateReviewedBuild(source, names, trusted), /BUILD_SOURCE_REVIEW_REQUIRED/);
    writeFileSync(path.join(source, name), name.endsWith('.json') ? '{}' : 'export const approved = true;');
  }
  assert.throws(() => validateReviewedBuild(source, [...names, 'src/new.ts'], trusted), /BUILD_SOURCE_REVIEW_REQUIRED/);
});
test('whole PR snapshots allow real configuration/SQL files but reject Windows path escapes and generated source', () => {
  for (const name of ['frontend/Dockerfile', 'docker-compose.yml', 'package-lock.json', 'supabase/initial_schema.sql']) assert.equal(validateSnapshotPath(name), name);
  for (const name of ['../outside', 'C:/outside', 'src/NUL.txt', 'src/a:stream', 'NODE_MODULES/x.js', '.tools/x.js', 'src/.git/x']) assert.throws(() => validateSnapshotPath(name));
});
test('PR completion requires every real check including build and database; missing or failed checks cannot pass', () => {
  const complete = Object.fromEntries(checks.map(name => [name, { status: 'passed', exitCode: 0 }]));
  assert.equal(checksComplete(complete), true);
  const missing = structuredClone(complete); delete missing.stride; assert.equal(checksComplete(missing), false);
  for (const name of checks) {
    const failed = structuredClone(complete); failed[name] = { status: 'error', exitCode: 2 }; assert.equal(checksComplete(failed), false);
  }
});
