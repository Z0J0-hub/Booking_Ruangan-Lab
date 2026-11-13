import path from 'node:path';
import { pathToFileURL } from 'node:url';

// PR source is untrusted, including same-repository PRs. Database credentials
// belong only to the reviewed development branch, never to a change request.
export function validatePipelinePolicy(env = process.env) {
  const changeRequest = Boolean(env.CHANGE_ID) || /^PR-/i.test(env.BRANCH_NAME || '');
  if (changeRequest && env.CHANGE_TARGET !== 'development') {
    throw new Error('This pipeline accepts pull requests targeting development only.');
  }
  const databaseRequested = env.RUN_STRIDE_DATABASE === 'true';
  if (databaseRequested && (changeRequest || env.BRANCH_NAME !== 'development')) {
    throw new Error('Database tests require the trusted development branch, not a PR or a classic job without branch identity.');
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
