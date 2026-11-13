import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runSecretScan } from './secrets.mjs';

test('real pinned Gitleaks accepts clean source and blocks a synthetic privileged key', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reservasi-real-secret-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true }).status, 0);
  writeFileSync(path.join(root, '.gitignore'), 'reports/\n');
  copyFileSync(fileURLToPath(new URL('../../.gitleaks.toml', import.meta.url)), path.join(root, '.gitleaks.toml'));
  const source = path.join(root, 'fixture.js');
  writeFileSync(source, 'export const mode = "test";\n');
  assert.equal((await runSecretScan({ root })).exitCode, 0);
  const synthetic = ['sb', 'secret', 'integrationFixtureOnlyNotACredential123456'].join('_');
  writeFileSync(source, `export const token = '${synthetic}';\n`);
  const result = await runSecretScan({ root });
  assert.equal(result.exitCode, 1);
  assert.ok(result.findings.some((finding) => finding.rule === 'supabase-secret-key'));
  const saved = readFileSync(path.join(root, 'reports/secrets/summary.json'), 'utf8');
  assert.equal(saved.includes(synthetic), false);
});
