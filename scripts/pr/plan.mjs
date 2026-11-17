import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repository = 'Z0J0-hub/Booking_Ruangan-Lab';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const stateFile = path.join(projectRoot, '.runtime', 'pr', 'completed.json');
export const planFile = path.join(projectRoot, 'reports', 'pr', 'plan.json');
export function validSourceBranch(ref) {
  return typeof ref === 'string' && ref.length > 0 && ref.length <= 255 && !/[\x00-\x20\x7f]/.test(ref);
}
export function eligible(pr) {
  return pr?.state === 'open' && pr.base?.ref === 'development' && validSourceBranch(pr.head?.ref) &&
    pr.base.repo?.full_name === repository && pr.head.repo?.full_name === repository;
}
export function validatePr(pr) {
  if (!eligible(pr) || !Number.isInteger(pr.number) || pr.number < 1 ||
      !/^[a-f0-9]{40}$/.test(pr.head.sha) || !/^[a-f0-9]{40}$/.test(pr.base.sha)) throw new Error('INELIGIBLE_OR_INVALID_PR');
  return { number: pr.number, head: pr.head.sha, base: pr.base.sha, target: 'development', source: pr.head.ref,
    url: `https://github.com/${repository}/pull/${pr.number}` };
}
export async function github(route, request = fetch) {
  const response = await request(`https://api.github.com/repos/${repository}${route}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'reservasi-pr-sast' }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}`);
  return response.json();
}
export function scanKey(pr, scannerRevision) {
  return createHash('sha256').update(`${pr.number}:${pr.head}:${pr.base}:${scannerRevision}`).digest('hex');
}
export async function makePlan({ request = fetch, force = false, prNumber = '', revision = process.env.GIT_COMMIT } = {}) {
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('TRUSTED_SCANNER_REVISION_REQUIRED');
  let candidates;
  if (prNumber) {
    if (!/^[1-9][0-9]*$/.test(prNumber)) throw new Error('INVALID_PR_NUMBER');
    candidates = [await github(`/pulls/${prNumber}`, request)];
    validatePr(candidates[0]);
  } else {
    candidates = [];
    for (let page = 1; ; page++) {
      if (page > 100) throw new Error('PR_DISCOVERY_PAGE_LIMIT');
      const list = await github(`/pulls?state=open&base=development&per_page=100&page=${page}`, request);
      if (!Array.isArray(list)) throw new Error('INVALID_GITHUB_PR_LIST');
      candidates.push(...list.filter(eligible));
      if (list.length < 100) break;
    }
  }
  let completed = {};
  try { completed = JSON.parse(readFileSync(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('INVALID_PR_STATE'); }
  for (const candidate of candidates) {
    const pr = validatePr(candidate); const key = scanKey(pr, revision);
    if (!force && completed[key] && ['passed', 'blocked'].includes(completed[key].status)) continue;
    return { status: 'ready', ...pr, scannerRevision: revision, key,
      scope: 'SAST of PR merge revision as data; no PR package scripts or Jenkinsfile execution' };
  }
  return { status: candidates.length ? 'unchanged' : 'no_eligible_pr', target: 'development', sourcePolicy: 'any branch in the same repository', scannerRevision: revision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  mkdirSync(path.dirname(planFile), { recursive: true });
  if (process.argv.includes('--describe')) {
    const plan = JSON.parse(readFileSync(planFile, 'utf8'));
    console.log(plan.status === 'ready' ? `PR #${plan.number} ${plan.source} -> development; kode ${plan.head.slice(0, 8)} + development ${plan.base.slice(0, 8)}` : plan.status === 'no_eligible_pr' ? 'Tidak diperiksa: tidak ada PR terbuka menuju development dari repo yang sama' : plan.status === 'unchanged' ? 'Tidak diperiksa ulang: kode PR menuju development belum berubah' : `PR tidak dapat diperiksa: ${plan.status}`);
  } else {
    try {
      const plan = await makePlan({ force: process.env.PR_FORCE_RESCAN === 'true', prNumber: process.env.PR_NUMBER || '' });
      writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n');
      console.log(`PR discovery: ${plan.status}; target=development; source=${plan.source || 'semua branch dalam repo yang sama'}.`);
      process.exitCode = plan.status === 'ready' ? 0 : 3;
    } catch (error) {
      writeFileSync(planFile, JSON.stringify({ status: 'error', code: /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'PR_DISCOVERY_ERROR',
        cause: /^[A-Z0-9_]+$/.test(error.cause?.code || '') ? error.cause.code : null }, null, 2) + '\n');
      console.error('PR discovery failed; no passing PR result is claimed.'); process.exitCode = 2;
    }
  }
}
