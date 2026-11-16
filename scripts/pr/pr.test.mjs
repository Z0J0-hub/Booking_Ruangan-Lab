import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, validatePr, scanKey, makePlan, repository } from './plan.mjs';
import { validateSourcePath, verifyMerge } from './scan.mjs';

const sample = () => ({ number: 9001, state: 'open', base: { ref: 'development', sha: 'a'.repeat(40), repo: { full_name: repository } },
  head: { ref: 'ilyas', sha: 'b'.repeat(40), repo: { full_name: repository } } });
test('only origin ilyas PRs targeting development are accepted; main and fork requests are rejected', async () => {
  const pr = sample(); assert.ok(eligible(pr)); assert.equal(validatePr(pr).target, 'development');
  const main = sample(); main.base.ref = 'main'; assert.equal(eligible(main), false); assert.throws(() => validatePr(main));
  const fork = sample(); fork.head.repo.full_name = 'other/fork'; assert.equal(eligible(fork), false);
  const fake = async () => ({ ok: true, json: async () => [main, fork, pr] });
  const result = await makePlan({ request: fake, force: true, revision: 'c'.repeat(40) });
  assert.equal(result.number, 9001); assert.equal(result.status, 'ready');
});
test('head/base/scanner updates change the scan identity and merge parents must match both refs', () => {
  const pr = validatePr(sample()); const key = scanKey(pr, 'c'.repeat(40));
  assert.notEqual(key, scanKey({ ...pr, base: 'd'.repeat(40) }, 'c'.repeat(40)));
  assert.notEqual(key, scanKey({ ...pr, head: 'd'.repeat(40) }, 'c'.repeat(40)));
  assert.notEqual(key, scanKey(pr, 'd'.repeat(40)));
  verifyMerge(`${pr.base} ${pr.head}`, pr);
  assert.throws(() => verifyMerge(`${pr.base} ${'e'.repeat(40)}`, pr));
});
test('PR snapshots reject traversal, NTFS aliases, hidden git folders, and reserved Windows files', () => {
  assert.equal(validateSourcePath('src/features/auth/page.tsx'), 'src/features/auth/page.tsx');
  for (const value of ['../secret.js', 'src/../../x.ts', 'src/.git/x.js', 'src/CON.js', 'src/file .js/../x.js', 'C:/x.js', 'src/x:stream.js']) assert.throws(() => validateSourcePath(value));
});
