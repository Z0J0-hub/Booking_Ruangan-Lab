import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, repository } from './plan.mjs';

export function validateSnapshotPath(name) {
  if (typeof name !== 'string' || name.length > 220 || !/^[A-Za-z0-9_. /-]+$/.test(name) || name.split('/').some(part =>
    !part || ['.', '..', '.git'].includes(part.toLowerCase()) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('UNSAFE_PR_SOURCE_PATH');
  if (['node_modules', '.tools', '.runtime', 'reports', 'dist'].includes(name.split('/')[0].toLowerCase())) throw new Error('GENERATED_PR_SOURCE_PATH');
  return name;
}
export function verifyMerge(parents, plan) {
  const actual = parents.trim().split(/\s+/);
  if (actual.length !== 2 || actual[0] !== plan.base || actual[1] !== plan.head) throw new Error('STALE_OR_INVALID_PR_MERGE');
}
export function preparePrSource(plan, parent) {
  const store = path.join(projectRoot, '.runtime', 'pr', 'source.git'); mkdirSync(store, { recursive: true });
  const noHooks = path.join(projectRoot, '.runtime', 'pr', 'no-hooks'); mkdirSync(noHooks, { recursive: true });
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  for (const key of Object.keys(env)) if (/TOKEN|PASSWORD|SECRET|STRIDE_DATABASE_URL|JENKINS_AUTH/i.test(key)) delete env[key];
  const git = (args, binary = false) => {
    const execution = spawnSync('git', ['-c', 'credential.helper=', '-c', `core.hooksPath=${noHooks}`, ...args], {
      cwd: store, env, encoding: binary ? undefined : 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
    });
    if (execution.status !== 0 || execution.error || execution.signal) throw new Error('PR_GIT_ERROR');
    return execution.stdout;
  };
  git(['init', '--bare', '--quiet', '.']);
  const ref = `refs/scan/pr-${plan.number}`;
  git(['fetch', '--no-tags', '--depth=2', `https://github.com/${repository}.git`, `+refs/pull/${plan.number}/merge:${ref}`]);
  const merge = git(['rev-parse', ref]).trim();
  if (!/^[a-f0-9]{40}$/.test(merge)) throw new Error('INVALID_MERGE_SHA');
  verifyMerge(git(['show', '-s', '--format=%P', ref]), plan);
  const source = mkdtempSync(path.join(parent, 'private-source-'));
  const files = []; const seen = new Set(); let bytes = 0;
  for (const entry of git(['ls-tree', '-rlz', '--full-tree', ref]).split('\0').filter(Boolean)) {
    const match = /^(\d+) (\w+) ([a-f0-9]{40})\s+(-|\d+)\t(.+)$/.exec(entry);
    if (!match) throw new Error('INVALID_GIT_TREE');
    const [, mode, type, sha, size, name] = match;
    validateSnapshotPath(name);
    if (!['100644', '100755'].includes(mode) || type !== 'blob' || !/^\d+$/.test(size)) throw new Error('UNSUPPORTED_PR_SOURCE_ENTRY');
    if (Number(size) > 5_000_000 || files.length >= 2000 || (bytes += Number(size)) > 50_000_000 || seen.has(name.toLowerCase())) throw new Error('PR_SOURCE_LIMIT_OR_COLLISION');
    seen.add(name.toLowerCase());
    const file = path.join(source, name); mkdirSync(path.dirname(file), { recursive: true });
    const contents = git(['cat-file', 'blob', sha], true);
    if (contents.length !== Number(size)) throw new Error('PR_SOURCE_SIZE_MISMATCH');
    writeFileSync(file, contents); files.push(name);
  }
  if (!files.length) throw new Error('EMPTY_PR_SOURCE');
  return { source, files, bytes, merge };
}
