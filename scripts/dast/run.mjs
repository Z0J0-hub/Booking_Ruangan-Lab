import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startStaging } from './staging.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const ZAP_VERSION = '2.17.0';

export function summarizeZap(raw, origin) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.site)) throw new Error('Invalid ZAP JSON report.');
  if (raw.site.some((entry) => entry['@name'] !== origin)) throw new Error('ZAP reported a site outside staging scope.');
  const site = raw.site.find((entry) => entry['@name'] === origin);
  if (!site || !Array.isArray(site.alerts)) throw new Error('ZAP did not report the staging site.');
  const risks = { high: 0, medium: 0, low: 0, informational: 0 };
  const findings = site.alerts.map((alert) => {
    const risk = Number(alert.riskcode);
    if (!Number.isInteger(risk) || risk < 0 || risk > 3 || !Array.isArray(alert.instances)) throw new Error('Invalid ZAP alert.');
    const severity = ['informational', 'low', 'medium', 'high'][risk];
    risks[severity]++;
    // No response bodies, headers, tokens, or query strings in published evidence.
    return { rule: String(alert.pluginid), name: alert.name, severity,
      paths: [...new Set(alert.instances.map((instance) => {
        const url = new URL(instance.uri);
        if (url.origin !== origin) throw new Error('ZAP alert outside staging scope.');
        return url.pathname;
      }))] };
  });
  return { risks, findings, status: risks.high ? 'blocked' : 'passed', exitCode: risks.high ? 1 : 0 };
}

export function createPlan(origin, directory, assets) {
  const quote = JSON.stringify;
  const requests = ['/', '/health', ...assets].map((asset) => `      - url: ${quote(origin + asset)}\n        responseCode: 200`).join('\n');
  // No active scan, browser, authentication, external domains, or POST requests.
  return `env:
  contexts:
    - name: frontend-staging
      urls:
        - ${quote(origin)}
      includePaths:
        - ${quote(origin.replaceAll('.', '\\.') + '/.*')}
  parameters:
    failOnError: true
    failOnWarning: true
    progressToStdout: true
jobs:
  - type: passiveScan-config
    parameters:
      scanOnlyInScope: true
  - type: requestor
    requests:
${requests}
  - type: spider
    parameters:
      context: frontend-staging
      maxDuration: 1
      maxDepth: 3
  - type: passiveScan-wait
    parameters:
      maxDuration: 3
  - type: report
    parameters:
      template: traditional-json
      reportDir: ${quote(directory.replaceAll('\\', '/'))}
      reportFile: raw
      displayReport: false
  - type: exitStatus
    parameters:
      errorLevel: High
      errorExitValue: 1
      warnExitValue: 2
      okExitValue: 0
`;
}

function runJava(args, directory) {
  return new Promise((resolve, reject) => {
    const child = spawn('java', args, { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    // Keep raw ZAP logs private to scratch; print only controlled runner messages.
    let log = '';
    child.stdout.on('data', (chunk) => { if (log.length < 4_000_000) log += chunk; });
    child.stderr.on('data', (chunk) => { if (log.length < 4_000_000) log += chunk; });
    const timeout = setTimeout(() => { child.kill(); }, 8 * 60_000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, log }); });
  });
}

async function freeProxyPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return String(port);
}

export async function runDast() {
  const directory = path.join(root, 'reports', 'dast');
  mkdirSync(directory, { recursive: true });
  const started = Date.now();
  const report = { status: 'error', exitCode: 2, tool: 'OWASP ZAP', version: ZAP_VERSION,
    scope: 'Unauthenticated passive baseline of loopback production frontend and assets. No Supabase API, RLS, authenticated SPA navigation, or active attack coverage.',
    commit: process.env.GIT_COMMIT || null, buildUrl: process.env.BUILD_URL || null,
    sourceMode: process.env.CI_SOURCE_DIGEST ? 'local-snapshot' : 'checkout', sourceDigest: process.env.CI_SOURCE_DIGEST || null,
    requests: 0, risks: {}, findings: [] };
  const save = () => {
    report.durationSeconds = Math.round((Date.now() - started) / 1000);
    writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(path.join(directory, 'summary.txt'), `DAST: ${report.status}; exit=${report.exitCode}; duration=${report.durationSeconds}s\n${report.scope}\n${JSON.stringify(report.risks)}\n`);
  };
  save();
  let staging;
  let scratch;
  try {
    staging = await startStaging();
    const html = readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]);
    if (!assets.some((asset) => asset.endsWith('.js'))) throw new Error('NO_PRODUCTION_JS_ASSET');
    scratch = mkdtempSync(path.join(directory, 'private-'));
    const plan = path.join(scratch, 'plan.yaml');
    writeFileSync(plan, createPlan(staging.url, scratch, assets));
    console.log('DAST: isolated production frontend started; running pinned ZAP passive baseline.');
    const zapHome = path.join(root, '.tools', 'zap', `ZAP_${ZAP_VERSION}`);
    const proxyPort = await freeProxyPort();
    const execution = await runJava([
      '-Xmx512m', '-Djava.awt.headless=true', '-jar', path.join(zapHome, `zap-${ZAP_VERSION}.jar`),
      '-cmd', '-host', '127.0.0.1', '-port', proxyPort, '-dir', path.join(scratch, 'home'), '-config', 'autoupdate.checkOnStart=false',
      '-config', 'autoupdate.installAddonUpdates=false', '-config', 'autoupdate.installScannerRules=false',
      '-autorun', plan,
    ], zapHome);
    writeFileSync(path.join(root, '.tools', 'zap', 'last-run.local.log'), execution.log);
    if (execution.signal || ![0, 1].includes(execution.code)) throw new Error('ZAP_EXECUTION_ERROR');
    const raw = JSON.parse(readFileSync(path.join(scratch, 'raw.json'), 'utf8'));
    const result = summarizeZap(raw, staging.url);
    // An infrastructure/plan error cannot be converted into a passing scan.
    if (execution.code !== result.exitCode) throw new Error('ZAP_EXIT_REPORT_MISMATCH');
    if (staging.requestCount() < assets.length + 2) throw new Error('INCOMPLETE_STAGING_SCAN');
    Object.assign(report, result);
  } catch {
    report.status = 'error'; report.exitCode = 2; report.code = 'DAST_TOOL_PLAN_OR_REPORT_ERROR';
    console.error('DAST failed to complete. Check Java 17+, run npm run ci:dast:setup, and verify dist exists. No clean scan is claimed.');
  } finally {
    if (staging) { report.requests = staging.requestCount(); await staging.close(); }
    if (scratch) {
      const relative = path.relative(directory, scratch);
      if (!relative.startsWith('private-') || relative.includes(path.sep)) throw new Error('INVALID_DAST_SCRATCH');
      rmSync(scratch, { recursive: true, force: true });
    }
    save();
  }
  console.log(`DAST: ${report.status}; exit=${report.exitCode}. Sanitized reports: reports/dast/. Staging stopped.`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = (await runDast()).exitCode;
}
