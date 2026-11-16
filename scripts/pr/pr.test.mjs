import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, validatePr, scanKey, makePlan, repository } from './plan.mjs';
import { validateSourcePath, verifyMerge } from './scan.mjs';

const sample = (source = 'ilyas') => ({ number: 9001, state: 'open', base: { ref: 'development', sha: 'a'.repeat(40), repo: { full_name: repository } },
  head: { ref: source, sha: 'b'.repeat(40), repo: { full_name: repository } } });
test('all same-repository source branches may target development; main and forks are rejected', async () => {
  const pr = sample(); assert.ok(eligible(pr)); assert.equal(validatePr(pr).target, 'development');
  for (const source of ['fitur/login', 'anggota-kelompok', 'perbaikan-booking']) {
    assert.ok(eligible(sample(source)));
    assert.equal(validatePr(sample(source)).source, source);
  }
  const main = sample(); main.base.ref = 'main'; assert.equal(eligible(main), false); assert.throws(() => validatePr(main));
  const fork = sample(); fork.head.repo.full_name = 'other/fork'; assert.equal(eligible(fork), false);
  const fake = async () => ({ ok: true, json: async () => [main, fork, pr] });
  const result = await makePlan({ request: fake, force: true, revision: 'c'.repeat(40) });
  assert.equal(result.number, 9001); assert.equal(result.status, 'ready');
});
test('automatic discovery searches development without an ilyas filter and includes later pages', async () => {
  const calls = []; const closed = sample(); closed.state = 'closed';
  const team = sample('fitur/anggota-kelompok'); team.number = 9002;
  const fake = async url => {
    calls.push(url);
    const page = new URL(url).searchParams.get('page');
    return { ok: true, json: async () => page === '1' ? Array.from({ length: 100 }, () => closed) : [team] };
  };
  const result = await makePlan({ request: fake, force: true, revision: 'c'.repeat(40) });
  assert.equal(result.source, 'fitur/anggota-kelompok');
  assert.equal(result.number, 9002); assert.equal(calls.length, 2);
  for (const url of calls) {
    assert.equal(new URL(url).searchParams.get('base'), 'development');
    assert.equal(new URL(url).searchParams.has('head'), false);
  }
});
test('a manually selected team PR is accepted but closed, fork and main PRs are rejected', async () => {
  const team = sample('fitur/login');
  const response = pr => async () => ({ ok: true, json: async () => pr });
  assert.equal((await makePlan({ request: response(team), force: true, prNumber: '9001', revision: 'c'.repeat(40) })).source, 'fitur/login');
  for (const invalid of [sample(''), sample('branch\ninvalid'), { ...sample(), state: 'closed' }]) {
    await assert.rejects(makePlan({ request: response(invalid), force: true, prNumber: '9001', revision: 'c'.repeat(40) }));
  }
  const main = sample(); main.base.ref = 'main';
  const fork = sample(); fork.head.repo.full_name = 'other/fork';
  for (const invalid of [main, fork]) await assert.rejects(makePlan({ request: response(invalid), force: true, prNumber: '9001', revision: 'c'.repeat(40) }));
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
