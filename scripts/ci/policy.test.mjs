import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePipelinePolicy } from './policy.mjs';

test('PRs to development run without database credentials, including fork PRs', () => {
  for (const source of ['feature/security', 'fork:feature/security']) {
    assert.deepEqual(validatePipelinePolicy({ CHANGE_ID: '8', CHANGE_TARGET: 'development', CHANGE_BRANCH: source }),
      { changeRequest: true, databaseRequested: false });
  }
});

test('PRs to other branches and PR jobs missing target metadata are rejected', () => {
  assert.throws(() => validatePipelinePolicy({ CHANGE_ID: '8', CHANGE_TARGET: 'main' }));
  assert.throws(() => validatePipelinePolicy({ BRANCH_NAME: 'PR-8' }));
});

test('database tests reject PRs without trusted-runner approval, other branches, and classic jobs', () => {
  for (const env of [
    { CHANGE_ID: '8', CHANGE_TARGET: 'development', BRANCH_NAME: 'development' },
    { BRANCH_NAME: 'PR-8', CHANGE_TARGET: 'development' },
    { BRANCH_NAME: 'ilyas' }, {},
  ]) assert.throws(() => validatePipelinePolicy({ ...env, RUN_STRIDE_DATABASE: 'true' }));
  assert.deepEqual(validatePipelinePolicy({ BRANCH_NAME: 'development', RUN_STRIDE_DATABASE: 'true' }),
    { changeRequest: false, databaseRequested: true });
});

test('manual source-only checks remain available on the existing development branch', () => {
  assert.deepEqual(validatePipelinePolicy({ BRANCH_NAME: 'ilyas' }), { changeRequest: false, databaseRequested: false });
});

test('PR database checks require the pinned trusted runner, rollback approval and exact approved host', () => {
  const approved = { CI_RUN_MODE: 'pr', CHANGE_TARGET: 'development', RUN_STRIDE_DATABASE: 'true', STRIDE_RUNNER_TRUSTED: 'true',
    STRIDE_ALLOW_TEST_WRITES: 'rollback-only', STRIDE_DB_HOST: 'aws-0-ap-southeast-1.pooler.supabase.com' };
  assert.deepEqual(validatePipelinePolicy(approved), { changeRequest: true, databaseRequested: true });
  for (const field of ['STRIDE_RUNNER_TRUSTED', 'STRIDE_ALLOW_TEST_WRITES', 'STRIDE_DB_HOST']) assert.throws(() => validatePipelinePolicy({ ...approved, [field]: '' }));
  assert.throws(() => validatePipelinePolicy({ ...approved, STRIDE_DB_HOST: 'other.example' }));
});

test('proof mode rejects unknown values, PRs, and database access', () => {
  for (const proof of ['secret', 'sast', 'owasp']) {
    assert.deepEqual(validatePipelinePolicy({ PROOF_GATE: proof }), { changeRequest: false, databaseRequested: false });
    assert.throws(() => validatePipelinePolicy({ PROOF_GATE: proof, CHANGE_ID: '8', CHANGE_TARGET: 'development' }));
    assert.throws(() => validatePipelinePolicy({ PROOF_GATE: proof, BRANCH_NAME: 'development', RUN_STRIDE_DATABASE: 'true' }));
  }
  assert.throws(() => validatePipelinePolicy({ PROOF_GATE: 'invalid' }));
});
