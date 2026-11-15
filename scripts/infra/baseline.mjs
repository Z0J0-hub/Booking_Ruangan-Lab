import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeFindings, trivyFindings } from './scan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'reports', 'infra'); mkdirSync(directory, { recursive: true });
const scratch = mkdtempSync(path.join(directory, 'private-before-'));
const before = { scope: 'Committed HEAD configuration before local hardening', checks: 0, findings: [] };
try {
  const git = (file) => {
    const result = spawnSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error('BASELINE_SOURCE_UNAVAILABLE'); return result.stdout;
  };
  for (const file of ['docker-compose.yml', 'docker-compose.staging.yml', 'docker-compose.prod.yml']) {
    const result = composeFindings(git(file), file); before.checks += result.checks; before.findings.push(...result.findings);
  }
  writeFileSync(path.join(scratch, 'Dockerfile'), git('frontend/Dockerfile'));
  const raw = path.join(scratch, 'raw.json');
  const result = spawnSync(path.join(root, '.tools', 'trivy', '0.76.2', 'trivy.exe'), ['config', '--skip-check-update', '--include-non-failures', '--misconfig-scanners', 'dockerfile', '--quiet', '--format', 'json', '--output', raw, scratch], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60_000 });
  if (result.status !== 0) throw new Error('BASELINE_SCAN_FAILED');
  const scan = trivyFindings(JSON.parse(readFileSync(raw, 'utf8')), 'config');
  before.checks += scan.checks; before.findings.push(...scan.findings);
  writeFileSync(path.join(directory, 'before.json'), JSON.stringify(before, null, 2) + '\n');
  console.log(`Baseline: ${before.findings.length} findings. Before/after: reports/infra/before.json and summary.json.`);
} finally {
  const relative = path.relative(directory, scratch);
  if (!relative.startsWith('private-before-') || relative.includes(path.sep)) throw new Error('INVALID_BASELINE_SCRATCH');
  rmSync(scratch, { recursive: true, force: true });
}
