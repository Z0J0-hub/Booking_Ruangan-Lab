import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

function executeAudit(cwd) {
  if (!process.env.npm_execpath) {
    throw new Error('Run this module using npm run ci:audit.');
  }

  // Run npm's JS entry point directly: no Windows .cmd or shell escaping needed.
  return spawnSync(process.execPath, [
    process.env.npm_execpath, 'audit', '--json', '--audit-level=high',
  ], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function inspectResult(result) {
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Audit terminated: ${result.signal}`);
  const report = JSON.parse(result.stdout);
  if (report.error) throw new Error('npm reported an audit service or configuration error.');
  const counts = report.metadata?.vulnerabilities;
  for (const level of ['info', 'low', 'moderate', 'high', 'critical']) {
    if (!Number.isInteger(counts?.[level]) || counts[level] < 0) {
      throw new Error('Audit response has no valid vulnerability summary.');
    }
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`Unexpected npm exit code: ${result.status}`);
  }
  const blocked = counts.high + counts.critical > 0;
  if (result.status !== 0 && !blocked) {
    throw new Error('npm failed without a high/critical finding; inspect the raw output.');
  }
  return { status: blocked ? 'blocked' : 'passed', vulnerabilities: counts };
}

// One interface owns both audits, reporting, and the final gate decision.
export function runAudits({ root = projectRoot, runner = executeAudit, projects = ['frontend'] } = {}) {
  const reportDir = path.join(root, 'reports', 'audit');
  mkdirSync(reportDir, { recursive: true });
  const results = [];

  // Backend MySQL is inactive on the Supabase architecture; do not publish old reports.
  if (!projects.includes('backend')) rmSync(path.join(reportDir, 'backend.txt'), { force: true });

  for (const target of projects) {
    const cwd = target === 'frontend' ? root : path.join(root, target);
    let output;
    let outcome;
    try {
      output = runner(cwd);
      outcome = inspectResult(output);
    } catch (error) {
      outcome = { status: 'error', message: error.message };
    }

    writeFileSync(path.join(reportDir, `${target}.txt`), [
      output?.stdout || '', output?.stderr || '',
      outcome.status === 'error' ? outcome.message : '',
    ].filter(Boolean).join('\n'), 'utf8');
    results.push({ target, ...outcome });
  }

  const exitCode = results.some((item) => item.status === 'error') ? 2
    : results.some((item) => item.status === 'blocked') ? 1 : 0;
  const lines = results.map((item) => {
    const counts = item.vulnerabilities;
    return counts
      ? `${item.target}: ${item.status} (high=${counts.high}, critical=${counts.critical}, moderate=${counts.moderate}, low=${counts.low})`
      : `${item.target}: error (${item.message})`;
  });
  lines.push(`Exit code: ${exitCode}. Reports: reports/audit/`);
  writeFileSync(path.join(reportDir, 'summary.json'), JSON.stringify({ exitCode, results }, null, 2) + '\n');
  writeFileSync(path.join(reportDir, 'summary.txt'), lines.join('\n') + '\n');
  return { exitCode, summary: lines.join('\n'), results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = runAudits();
  console.log(result.summary);
  process.exitCode = result.exitCode;
}
