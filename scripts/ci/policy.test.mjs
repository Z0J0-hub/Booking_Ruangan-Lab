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

test('database tests reject all PRs, other branches, and classic jobs', () => {
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
