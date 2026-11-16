import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSemgrep, categories, rules } from './semgrep.mjs';

test('real Semgrep detects representative fixtures for every OWASP 2025 category and accepts the negative control', (t) => {
  // Nested in the real Git checkout, matching the PR snapshot layout. Project-root
  // scoping must keep browser-only rules active rather than use an ancestor .git.
  const runtime = fileURLToPath(new URL('../../.runtime/', import.meta.url)); mkdirSync(runtime, { recursive: true });
  const root = mkdtempSync(path.join(runtime, 'reservasi-owasp-'));
  t.after(() => { const relative = path.relative(runtime, root); assert.match(relative, /^reservasi-owasp-[^\\/]+$/); rmSync(root, { recursive: true, force: true }); });
  mkdirSync(path.join(root, 'src'));
  const file = path.join(root, 'src', 'fixture.mjs');
  writeFileSync(file, readFileSync(new URL('../../security/semgrep/fixtures/vulnerable.txt', import.meta.url)));
  const blocked = runSemgrep({ root });
  assert.equal(blocked.exitCode, 1, JSON.stringify(blocked));
  assert.deepEqual([...new Set(blocked.findings.flatMap((finding) => finding.owasp))].sort(), categories);
  assert.deepEqual([...new Set(blocked.findings.map((finding) => finding.rule))].sort(), rules.map((rule) => rule.id).sort());
  assert.equal(categories.length, 10);
  writeFileSync(file, readFileSync(new URL('../../security/semgrep/fixtures/safe.txt', import.meta.url)));
  const safe = runSemgrep({ root }); assert.equal(safe.exitCode, 0, JSON.stringify(safe));
});
