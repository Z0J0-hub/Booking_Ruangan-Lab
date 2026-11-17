import { validateSnapshotPath } from './source.mjs';
export { verifyMerge } from './source.mjs';
// Shared assertions retained for the scanner tests; active checks use check.mjs.
export function combinePrChecks(checks) {
  const names = ['sast', 'audit'];
  if (!names.every(name => ['passed', 'blocked', 'error'].includes(checks[name]?.status) && ({ passed: 0, blocked: 1, error: 2 })[checks[name].status] === checks[name].exitCode)) return { status: 'error', exitCode: 2 };
  const exitCode = names.some(name => checks[name].exitCode === 2) ? 2 : names.some(name => checks[name].exitCode === 1) ? 1 : 0;
  return { status: exitCode === 2 ? 'error' : exitCode === 1 ? 'blocked' : 'passed', exitCode };
}
export function validateSourcePath(name) {
  validateSnapshotPath(name);
  if (!/\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(name)) throw new Error('UNSAFE_PR_SOURCE_PATH');
  return name;
}
