import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preflightSql, setupSql, scenarios } from './scenarios.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const names = ['user_a', 'user_b', 'admin', 'room', 'booking_a', 'booking_b', 'case_booking', 'case_room'];

const configError = (code, message) => Object.assign(new Error(message), { code });

export function connectionConfig(env) {
  if (env.STRIDE_ALLOW_TEST_WRITES !== 'rollback-only') {
    throw configError('APPROVAL_REQUIRED', 'Set STRIDE_ALLOW_TEST_WRITES=rollback-only only after approving a development database.');
  }
  let url;
  try { url = new URL(env.STRIDE_DATABASE_URL); }
  catch { throw configError('DATABASE_URL_REQUIRED', 'Set STRIDE_DATABASE_URL to a private PostgreSQL connection string.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || url.pathname.length < 2) {
    throw configError('INVALID_DATABASE_URL', 'Invalid PostgreSQL connection string.');
  }
  if (!env.STRIDE_DB_HOST || url.hostname.toLowerCase() !== env.STRIDE_DB_HOST.trim().toLowerCase()) {
    throw configError('HOST_MISMATCH', 'Database host does not match the explicitly approved STRIDE_DB_HOST.');
  }
  if (url.port === '6543') throw configError('POOLER_UNSUPPORTED', 'Use a direct or session-pooler connection, not transaction pooler port 6543.');
  if ([...url.searchParams.keys()].some((key) => key.startsWith('ssl') || key === 'options')) {
    throw configError('URL_OPTIONS_FORBIDDEN', 'Remove SSL/options parameters from the URL; TLS verification is enforced by the runner.');
  }
  return {
    connectionString: url.href,
    ssl: { rejectUnauthorized: true, ...(env.STRIDE_CA_FILE ? { ca: readFileSync(env.STRIDE_CA_FILE, 'utf8') } : {}) },
    connectionTimeoutMillis: 10_000, query_timeout: 15_000,
    application_name: 'reservasi-stride-rollback-tests',
  };
}

async function connect(config) {
  const { Client } = await import('pg');
  return new Client(config);
}

function safeCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_]{1,30}$/.test(error.code) ? error.code : 'UNSPECIFIED';
}

const escapeXml = (value) => String(value).replace(/[<>&"']/g, (character) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
}[character]));

function saveReport(directory, report) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  const lines = [
    `STRIDE database tests: ${report.status}; exit=${report.exitCode}`,
    `Rollback: ${report.rollback}; schema changes: none`,
    ...report.tests.map((item) => `${item.id}: ${item.status}${item.code ? ` (${item.code})` : ''}`),
    ...report.errors.map((item) => `Infrastructure error: ${item.phase} (${item.code})`),
    'Scope: SQL role/RLS/trigger/constraint checks; not JWT/Auth API, rate limit, or all STRIDE threats.',
  ];
  writeFileSync(path.join(directory, 'summary.txt'), lines.join('\n') + '\n');
  const cases = report.tests.map((item) => {
    const outcome = item.status === 'failed' ? `<failure message="Expected security behavior not met (${escapeXml(item.code)})"/>`
      : item.status === 'error' ? `<error message="Database test error (${escapeXml(item.code)})"/>`
        : item.status === 'not_run' ? '<skipped message="Not executed; not a pass"/>' : '';
    return `<testcase classname="STRIDE.${escapeXml(item.category)}" name="${escapeXml(item.id)}: ${escapeXml(item.name)}">${outcome}</testcase>`;
  });
  for (const error of report.errors) {
    cases.push(`<testcase classname="STRIDE.infrastructure" name="${escapeXml(error.phase)}"><error message="${escapeXml(error.code)}"/></testcase>`);
  }
  const failures = report.tests.filter((item) => item.status === 'failed').length;
  const errors = report.tests.filter((item) => item.status === 'error').length + report.errors.length;
  const skipped = report.tests.filter((item) => item.status === 'not_run').length;
  writeFileSync(path.join(directory, 'junit.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuite name="STRIDE database" tests="${cases.length}" failures="${failures}" errors="${errors}" skipped="${skipped}">${cases.join('')}</testsuite>\n`);
}

// One interface owns configuration, fixture scope, savepoints, rollback, and sanitized reports.
export async function runStride({ env = process.env, reportDir = path.join(root, 'reports', 'stride'), clientFactory = connect } = {}) {
  const report = {
    status: 'error', exitCode: 2, rollback: 'not_started',
    commit: /^[0-9a-f]{7,40}$/i.test(env.GIT_COMMIT || '') ? env.GIT_COMMIT : null,
    scope: 'database role/RLS/trigger/constraint checks only',
    tests: scenarios.map(({ id, category, name }) => ({ id, category, name, status: 'not_run' })), errors: [],
  };
  saveReport(reportDir, report); // Invalidate an older success before validation or connection.
  let client;
  let transaction = false;
  let phase = 'configuration';
  try {
    const config = connectionConfig(env);
    phase = 'connection';
    client = await clientFactory(config);
    // pg emits connection errors independently of query rejections; never log raw error details.
    client.on?.('error', () => {});
    await client.connect();
    phase = 'begin';
    await client.query('BEGIN');
    transaction = true;
    report.rollback = 'pending';
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
    phase = 'rls_preflight';
    await client.query(preflightSql);
    phase = 'fixtures';
    for (const name of names) await client.query('SELECT set_config($1, $2, true)', [`stride.${name}`, randomUUID()]);
    await client.query(setupSql);

    for (const [index, scenario] of scenarios.entries()) {
      phase = scenario.id;
      await client.query('SAVEPOINT stride_case');
      try {
        await client.query(scenario.sql);
        report.tests[index].status = 'passed';
      } catch (error) {
        const code = safeCode(error);
        Object.assign(report.tests[index], { status: code === 'P7501' ? 'failed' : 'error', code });
      } finally {
        // Success also rolls back each case so later cases start from the same fixtures/roles.
        phase = 'savepoint_rollback';
        await client.query('ROLLBACK TO SAVEPOINT stride_case');
        await client.query('RELEASE SAVEPOINT stride_case');
      }
    }
  } catch (error) {
    report.errors.push({ phase, code: safeCode(error) });
  } finally {
    if (transaction) {
      try {
        await client.query('ROLLBACK');
        report.rollback = 'confirmed';
      } catch (error) {
        report.rollback = 'unconfirmed';
        report.errors.push({ phase: 'rollback', code: safeCode(error) });
      }
    }
    if (client) {
      try { await client.end(); }
      catch (error) { report.errors.push({ phase: 'disconnect', code: safeCode(error) }); }
    }
    const errors = report.errors.length || report.tests.some((item) => item.status === 'error' || item.status === 'not_run');
    report.exitCode = errors ? 2 : report.tests.some((item) => item.status === 'failed') ? 1 : 0;
    report.status = report.exitCode === 0 ? 'passed' : report.exitCode === 1 ? 'failed' : 'error';
    saveReport(reportDir, report);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await runStride();
  for (const item of report.tests) console.log(`${item.id}: ${item.status}${item.code ? ` (${item.code})` : ''}`);
  for (const item of report.errors) console.error(`STRIDE ${item.phase}: ${item.code}. See the setup guide; raw database errors are not logged.`);
  console.log(`STRIDE database: ${report.status}; rollback=${report.rollback}; reports/stride/`);
  process.exitCode = report.exitCode;
}
