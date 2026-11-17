import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { planFile, stateFile } from './plan.mjs';

const plan = JSON.parse(readFileSync(planFile, 'utf8'));
if (plan.status !== 'ready' || !/^[a-f0-9]{64}$/.test(plan.key)) throw new Error('INVALID_PR_FINALIZATION_PLAN');
let report = { status: 'error' };
try { report = JSON.parse(readFileSync(path.join(path.dirname(planFile), 'summary.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('INVALID_PR_REPORT'); }
let completed = {};
try { completed = JSON.parse(readFileSync(stateFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('INVALID_PR_STATE'); }
const status = ['passed', 'blocked'].includes(report.status) && report.head === plan.head && report.base === plan.base && report.source === plan.source && report.target === plan.target && report.scannerRevision === plan.scannerRevision
  ? report.status : 'error';
completed[plan.key] = { number: plan.number, source: plan.source, target: plan.target, head: plan.head, base: plan.base, scannerRevision: plan.scannerRevision,
  status, buildUrl: process.env.BUILD_URL || null, timestamp: new Date().toISOString() };
// Bound state growth; errors are eligible for automatic retry on the next poll.
completed = Object.fromEntries(Object.entries(completed).slice(-100));
mkdirSync(path.dirname(stateFile), { recursive: true });
writeFileSync(stateFile + '.tmp', JSON.stringify(completed, null, 2) + '\n'); renameSync(stateFile + '.tmp', stateFile);
console.log(`PR #${plan.number}: result ${status} recorded. GitHub required checks are not configured by this runner.`);
