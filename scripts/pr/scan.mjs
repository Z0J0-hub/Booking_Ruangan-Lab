import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectRoot, planFile, repository, github, validatePr, validSourceBranch, scanKey } from './plan.mjs';
import { runSast } from '../ci/sast.mjs';

export function validateSourcePath(name) {
  if (!/^[A-Za-z0-9_./ -]+\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(name) || name.split('/').some((part) =>
    !part || ['.', '..', '.git'].includes(part.toLowerCase()) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('UNSAFE_PR_SOURCE_PATH');
  return name;
}
export function verifyMerge(parents, plan) {
  const actual = parents.trim().split(/\s+/);
  if (actual.length !== 2 || actual[0] !== plan.base || actual[1] !== plan.head) throw new Error('STALE_OR_INVALID_PR_MERGE');
}
export async function scanPr() {
  const directory = path.join(projectRoot, 'reports', 'pr'); mkdirSync(directory, { recursive: true });
  const report = { status: 'error', exitCode: 2, scope: 'PR merge source scanned as data; no npm install, package scripts, imports, or Jenkinsfile from PR are executed.' };
  const scratch = mkdtempSync(path.join(directory, 'private-source-'));
  try {
    const plan = JSON.parse(readFileSync(planFile, 'utf8'));
    if (plan.status !== 'ready' || plan.target !== 'development' || !validSourceBranch(plan.source) ||
        !/^[a-f0-9]{40}$/.test(plan.head) || !/^[a-f0-9]{40}$/.test(plan.base) || !Number.isInteger(plan.number) || plan.number < 1 ||
        plan.scannerRevision !== process.env.GIT_COMMIT || plan.key !== scanKey(plan, plan.scannerRevision)) throw new Error('INVALID_PR_PLAN');
    Object.assign(report, { number: plan.number, url: plan.url, source: plan.source, target: plan.target, head: plan.head, base: plan.base, scannerRevision: plan.scannerRevision });
    const store = path.join(projectRoot, '.runtime', 'pr', 'source.git'); mkdirSync(store, { recursive: true });
    const noHooks = path.join(projectRoot, '.runtime', 'pr', 'no-hooks'); mkdirSync(noHooks, { recursive: true });
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    for (const key of Object.keys(env)) if (/TOKEN|PASSWORD|SECRET|STRIDE_DATABASE_URL|JENKINS_AUTH/i.test(key)) delete env[key];
    const git = (args, binary = false) => {
      const execution = spawnSync('git', ['-c', 'credential.helper=', '-c', `core.hooksPath=${noHooks}`, ...args], {
        cwd: store, env, encoding: binary ? undefined : 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 24 * 1024 * 1024,
      });
      if (execution.status !== 0 || execution.error || execution.signal) throw new Error('PR_GIT_ERROR');
      return execution.stdout;
    };
    git(['init', '--bare', '--quiet', '.']);
    const ref = `refs/scan/pr-${plan.number}`;
    git(['fetch', '--no-tags', '--depth=2', `https://github.com/${repository}.git`, `+refs/pull/${plan.number}/merge:${ref}`]);
    const merge = git(['rev-parse', ref]).trim();
    if (!/^[a-f0-9]{40}$/.test(merge)) throw new Error('INVALID_MERGE_SHA');
    verifyMerge(git(['show', '-s', '--format=%P', ref]), plan); report.merge = merge;
    const entries = git(['ls-tree', '-rlz', '--full-tree', ref]).split('\0').filter(Boolean);
    const source = path.join(scratch, 'source'); mkdirSync(source);
    let count = 0; let bytes = 0; const seen = new Set();
    for (const entry of entries) {
      const match = /^(\d+) (\w+) ([a-f0-9]{40})\s+(-|\d+)\t(.+)$/.exec(entry);
      if (!match) throw new Error('INVALID_GIT_TREE');
      const [, mode, type, sha, size, name] = match;
      if (!/^(?:src\/|scripts\/|backend\/|[^/]+\.config\.)/.test(name) || !/\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(name)) continue;
      validateSourcePath(name);
      if (!['100644', '100755'].includes(mode) || type !== 'blob' || !/^\d+$/.test(size)) throw new Error('UNSUPPORTED_PR_SOURCE_ENTRY');
      if (Number(size) > 2_000_000 || ++count > 1000 || (bytes += Number(size)) > 20_000_000 || seen.has(name.toLowerCase())) throw new Error('PR_SOURCE_LIMIT_OR_COLLISION');
      seen.add(name.toLowerCase());
      const file = path.join(source, name); mkdirSync(path.dirname(file), { recursive: true });
      const contents = git(['cat-file', 'blob', sha], true);
      if (contents.length !== Number(size)) throw new Error('PR_SOURCE_SIZE_MISMATCH');
      writeFileSync(file, contents);
    }
    if (!count) throw new Error('EMPTY_PR_SOURCE');
    const scan = await runSast({ root: source });
    const latest = validatePr(await github(`/pulls/${plan.number}`));
    if (latest.head !== plan.head || latest.base !== plan.base || latest.source !== plan.source) throw new Error('PR_CHANGED_DURING_SCAN');
    const destination = path.join(projectRoot, 'reports', 'sast'); mkdirSync(destination, { recursive: true });
    for (const name of ['summary.json', 'summary.txt', 'summary.html', 'findings.json', 'coverage.json', 'semgrep.json']) {
      copyFileSync(path.join(source, 'reports', 'sast', name), path.join(destination, name));
    }
    Object.assign(report, { status: scan.status, exitCode: scan.exitCode, scannedFiles: count, scannedBytes: bytes, findings: scan.findings.length, standard: 'OWASP Top 10:2025' });
  } catch (error) { report.code = /^[A-Z_]+$/.test(error.message) ? error.message : 'PR_SCAN_ERROR'; }
  finally {
    const relative = path.relative(directory, scratch);
    if (!relative.startsWith('private-source-') || relative.includes(path.sep)) throw new Error('INVALID_PR_SCRATCH');
    rmSync(scratch, { recursive: true, force: true });
    writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`PR SAST: ${report.status}; exit=${report.exitCode}; reports/pr/summary.json and reports/sast/.`);
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = (await scanPr()).exitCode;
