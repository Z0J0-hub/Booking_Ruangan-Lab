import path from 'node:path';
import { pathToFileURL } from 'node:url';

// PR source is untrusted. A pinned runner may test the approved development DB;
// PR code, SQL and build processes must never receive its credentials.
export function validatePipelinePolicy(env = process.env) {
  const changeRequest = env.CI_RUN_MODE === 'pr' || Boolean(env.CHANGE_ID) || /^PR-/i.test(env.BRANCH_NAME || '');
  if (changeRequest && env.CHANGE_TARGET !== 'development') {
    throw new Error('This pipeline accepts pull requests targeting development only.');
  }
  const databaseRequested = env.RUN_STRIDE_DATABASE === 'true';
  const proof = env.PROOF_GATE || 'none';
  if (!['none', 'secret', 'sast', 'owasp'].includes(proof)) throw new Error('Unknown fail-fast proof mode.');
  if (proof !== 'none' && (changeRequest || databaseRequested)) {
    throw new Error('Synthetic fail-fast proofs are manual source-only runs, without database tests or PR context.');
  }
  const trustedPrDatabase = changeRequest && env.STRIDE_RUNNER_TRUSTED === 'true' && env.STRIDE_ALLOW_TEST_WRITES === 'rollback-only' &&
    env.STRIDE_DB_HOST === 'aws-0-ap-southeast-1.pooler.supabase.com';
  if (databaseRequested && (changeRequest ? !trustedPrDatabase : env.BRANCH_NAME !== 'development')) {
    throw new Error('Database tests require the approved trusted rollback-only runner; PR code must never execute with DB credentials.');
  }
  return { changeRequest, databaseRequested };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const policy = validatePipelinePolicy();
    console.log(`CI policy passed; context=${policy.changeRequest ? 'PR to development' : 'branch/manual'}; database=${policy.databaseRequested ? 'requested' : 'not run'}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
