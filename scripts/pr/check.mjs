import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectRoot, planFile, github, validatePr, scanKey } from './plan.mjs';
import { preparePrSource } from './source.mjs';
import { runSast } from '../ci/sast.mjs';
import { runPrAudit } from './audit.mjs';
import { runInfra } from '../infra/scan.mjs';
import { runPrBuild } from './build.mjs';
import { runStride } from '../stride/run.mjs';
import { cleanupPr } from './cleanup.mjs';
import { auditConsole, sastConsole } from './console.mjs';

const runtime = path.join(projectRoot, '.runtime', 'pr');
const contextFile = path.join(runtime, 'active.local.json');
const reportFile = path.join(projectRoot, 'reports', 'pr', 'summary.json');
export const checks = ['infra', 'audit', 'sast', 'build', 'stride'];
export const checksComplete = results => checks.every(name => results[name]?.status === 'passed' && results[name]?.exitCode === 0);
const save = report => writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
function context() {
  const state = JSON.parse(readFileSync(contextFile, 'utf8'));
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  if (plan.status !== 'ready' || plan.key !== scanKey(plan, process.env.GIT_COMMIT) || state.key !== plan.key || state.scannerRevision !== process.env.GIT_COMMIT ||
      path.dirname(state.work) !== runtime || !/^work-[a-zA-Z0-9]+$/.test(path.basename(state.work)) || path.dirname(state.source) !== state.work || !path.basename(state.source).startsWith('private-source-')) throw new Error('INVALID_PR_CONTEXT');
  return state;
}
function publish(state, category) {
  const source = path.join(state.source, 'reports', category);
  const destination = path.join(projectRoot, 'reports', category); mkdirSync(destination, { recursive: true });
  const allowed = { infra: ['summary.json'], audit: ['summary.json', 'summary.txt', 'summary.html', 'frontend.txt', 'ringkasan.txt'],
    sast: ['summary.json', 'summary.txt', 'summary.html', 'findings.json', 'coverage.json', 'semgrep.json', 'ringkasan.txt'], build: ['summary.json', 'summary.txt'], stride: ['summary.json', 'summary.txt', 'junit.xml'] };
  for (const name of allowed[category]) {
    const file = path.join(source, name);
    if (existsSync(file) && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink()) cpSync(file, path.join(destination, name));
  }
}
export async function executeCheck(command) {
  if (command === 'prepare') {
    mkdirSync(runtime, { recursive: true });
    const plan = JSON.parse(readFileSync(planFile, 'utf8'));
    if (plan.status !== 'ready' || plan.target !== 'development' || plan.scannerRevision !== process.env.GIT_COMMIT || plan.key !== scanKey(plan, process.env.GIT_COMMIT)) throw new Error('INVALID_PR_PLAN');
    const work = mkdtempSync(path.join(runtime, 'work-'));
    try {
      const snapshot = preparePrSource(plan, work);
      const state = { ...plan, branch: plan.source, work, source: snapshot.source, files: snapshot.files, merge: snapshot.merge };
      writeFileSync(contextFile, JSON.stringify(state));
      save({ status: 'running', exitCode: 2, number: plan.number, source: plan.source, target: plan.target, head: plan.head, base: plan.base,
        merge: snapshot.merge, scannerRevision: plan.scannerRevision, checks: {}, sourceFiles: snapshot.files.length,
        scope: 'Actual PR merge files; trusted static scanners, reviewed frontend build, and rollback-only tests of the approved development database. No PR SQL migrations or deployment.' });
    } catch (error) { rmSync(work, { recursive: true, force: true }); throw error; }
    return 0;
  }
  if (command === 'cleanup') {
    cleanupPr();
    return 0;
  }
  const state = context(); const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  const provenance = { number: state.number, source: state.branch, target: state.target, head: state.head, base: state.base, merge: state.merge, scannerRevision: state.scannerRevision };
  if (command === 'complete') {
    const latest = validatePr(await github(`/pulls/${state.number}`));
    if (latest.head !== state.head || latest.base !== state.base || latest.source !== provenance.source) throw new Error('PR_CHANGED_DURING_CHECKS');
    if (!checksComplete(report.checks)) throw new Error('INCOMPLETE_PR_CHECKS');
    report.status = 'passed'; report.exitCode = 0; save(report); return 0;
  }
  if (!checks.includes(command)) throw new Error('UNKNOWN_PR_CHECK');
  let result;
  if (command === 'audit' || command === 'sast') console.log(`Mulai ${command === 'audit' ? 'Dependency Audit' : 'SAST'}: PR #${state.number}, ${state.branch} -> development, versi gabungan ${state.merge.slice(0, 8)}.`);
  if (command === 'infra') result = runInfra('config', { sourceRoot: state.source });
  if (command === 'audit') result = runPrAudit({ source: state.source, provenance });
  if (command === 'sast') result = await runSast({ root: state.source });
  if (command === 'build') result = runPrBuild({ source: state.source, files: state.files, provenance });
  if (command === 'stride') result = await runStride({ env: { ...process.env, GIT_COMMIT: state.merge }, reportDir: path.join(state.source, 'reports', 'stride') });
  if (command === 'audit' || command === 'sast') {
    const summary = command === 'audit' ? auditConsole(result) : sastConsole(result);
    console.log(summary);
    writeFileSync(path.join(state.source, 'reports', command, 'ringkasan.txt'), summary + '\n');
  }
  publish(state, command);
  report.checks[command] = { status: result.status, exitCode: result.exitCode, code: result.code || null,
    ...(command === 'audit' ? { vulnerabilities: result.vulnerabilities } : {}), ...(command === 'sast' ? { findings: result.findings.length } : {}) };
  if (result.exitCode !== 0) { report.status = result.exitCode === 1 ? 'blocked' : 'error'; report.exitCode = result.exitCode; }
  save(report);
  console.log(`PR ${command}: ${result.status}; exit=${result.exitCode}; merge=${state.merge.slice(0, 8)}`);
  if (result.exitCode === 0 && command === 'build') {
    const destination = path.join(projectRoot, 'reports', 'build', 'dist');
    cpSync(path.join(state.source, 'dist'), destination, { recursive: true, dereference: false });
  }
  return result.exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = await executeCheck(process.argv[2]); }
  catch (error) {
    const code = /^[A-Z_]+$/.test(error.message) ? error.message : 'PR_CHECK_ERROR';
    if (existsSync(reportFile)) { const report = JSON.parse(readFileSync(reportFile, 'utf8')); report.status = 'error'; report.exitCode = 2; report.code = code; save(report); }
    console.error(code); process.exitCode = 2;
  }
}
