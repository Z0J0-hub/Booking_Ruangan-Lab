import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './plan.mjs';
import { validateConfig } from '../supabase/check.mjs';

export function isBuildInput(name) {
  return name.startsWith('src/') || name.startsWith('public/') || (!name.includes('/') && (/\.(?:json|js|mjs|cjs|ts|html|css)$/.test(name) || name.startsWith('.env')));
}
export function validateReviewedBuild(source, files, trustedRoot = projectRoot) {
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: trustedRoot, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  if (tracked.status !== 0) throw new Error('BUILD_REVIEW_BASELINE_UNAVAILABLE');
  const expected = tracked.stdout.split('\0').filter(Boolean).filter(isBuildInput).sort();
  const actual = files.filter(isBuildInput).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('BUILD_SOURCE_REVIEW_REQUIRED');
  for (const name of actual) {
    const input = path.join(source, name); const approved = path.join(trustedRoot, name);
    if (!lstatSync(input).isFile() || lstatSync(input).isSymbolicLink()) throw new Error('UNSAFE_BUILD_INPUT');
    const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
    if (hash(input) !== hash(approved)) throw new Error('BUILD_SOURCE_REVIEW_REQUIRED');
  }
}
export function runPrBuild({ source, files, provenance }) {
  const directory = path.join(source, 'reports', 'build'); mkdirSync(directory, { recursive: true });
  const report = { status: 'error', exitCode: 2, ...provenance, mode: 'development', deployment: false,
    scope: 'Actual PR frontend built with reviewed inputs/configuration/dependencies. Unreviewed build inputs fail; no PR lifecycle scripts or deployment.' };
  const modules = path.join(source, 'node_modules');
  try {
    validateReviewedBuild(source, files);
    const config = validateConfig(process.env);
    symlinkSync(path.join(projectRoot, 'node_modules'), modules, 'junction');
    const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH || process.env.Path,
      TEMP: process.env.TEMP, TMP: process.env.TMP, CI: 'true', NO_COLOR: '1',
      VITE_SUPABASE_URL: config.url, VITE_SUPABASE_ANON_KEY: config.key };
    const execution = spawnSync(process.execPath, [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', 'development'], {
      cwd: source, env, windowsHide: true, encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
    });
    if (execution.status !== 0 || execution.error || execution.signal || !existsSync(path.join(source, 'dist', 'index.html'))) throw new Error('PR_BUILD_FAILED');
    report.status = 'passed'; report.exitCode = 0;
  } catch (error) { report.code = /^[A-Z_]+$/.test(error.message) ? error.message : 'PR_BUILD_CONFIG_OR_TOOL_ERROR'; }
  finally {
    if (existsSync(modules) && lstatSync(modules).isSymbolicLink()) rmSync(modules, { recursive: true, force: true });
    writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(path.join(directory, 'summary.txt'), `Build PR: ${report.status}\nMode: development\nDeployment: tidak\nVersi PR: ${report.head}\n${report.code || ''}\nJika BUILD_SOURCE_REVIEW_REQUIRED: source/config/dependency belum sama dengan baseline yang disetujui; review dan perbarui pin pipeline terlebih dahulu.\n`);
  }
  return report;
}
