import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectionConfig, runStride } from './run.mjs';
import { scenarios, setupSql, preflightSql } from './scenarios.mjs';

const env = {
  STRIDE_ALLOW_TEST_WRITES: 'rollback-only', STRIDE_DB_HOST: 'db.test.invalid',
  STRIDE_DATABASE_URL: `postgresql://test:${['fixture', 'password'].join('-')}@db.test.invalid/postgres`,
};

function directory(t) {
  const result = mkdtempSync(path.join(os.tmpdir(), 'reservasi-stride-'));
  t.after(() => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(result));
    assert.ok(relative.startsWith('reservasi-stride-') && !relative.includes(path.sep));
    rmSync(result, { recursive: true, force: true });
  });
  return result;
}

function database(failure) {
  const commands = [];
  let closed = false;
  const client = {
    on() {},
    async connect() {},
    async query(sql, values) {
      commands.push({ sql, values });
      if (failure) await failure(sql);
      return { rows: [] };
    },
    async end() { closed = true; },
  };
  return { client, commands, isClosed: () => closed };
}

test('configuration requires explicit approval, an exact host, and verified TLS before connecting', async (t) => {
  for (const candidate of [
    {}, { ...env, STRIDE_ALLOW_TEST_WRITES: '' }, { ...env, STRIDE_DB_HOST: 'wrong.invalid' },
    { ...env, STRIDE_DATABASE_URL: env.STRIDE_DATABASE_URL + '?sslmode=no-verify' },
    { ...env, STRIDE_DATABASE_URL: env.STRIDE_DATABASE_URL.replace('db.test.invalid', 'db.test.invalid:6543') },
  ]) {
    let created = false;
    const result = await runStride({ env: candidate, reportDir: directory(t), clientFactory: async () => { created = true; } });
    assert.equal(created, false);
    assert.equal(result.exitCode, 2);
    assert.ok(result.tests.every((item) => item.status === 'not_run'));
  }
  assert.equal(connectionConfig(env).ssl.rejectUnauthorized, true);
});

test('runner uses one client and always rolls back rather than committing successful cases', async (t) => {
  const db = database();
  const result = await runStride({ env, reportDir: directory(t), clientFactory: async () => db.client });
  assert.equal(result.exitCode, 0);
  assert.equal(result.rollback, 'confirmed');
  assert.equal(result.tests.length, scenarios.length);
  assert.equal(db.commands.filter(({ sql }) => sql === 'ROLLBACK TO SAVEPOINT stride_case').length, scenarios.length);
  assert.equal(db.commands.at(-1).sql, 'ROLLBACK');
  assert.equal(db.commands.some(({ sql }) => /^COMMIT\b/i.test(sql)), false);
  assert.equal(db.isClosed(), true);
  const fixtureValues = db.commands.filter(({ sql }) => sql.startsWith('SELECT set_config($1')).map(({ values }) => values[1]);
  assert.equal(new Set(fixtureValues).size, 8);
});

test('a failed security expectation is reported while later cases still execute', async (t) => {
  const db = database((sql) => {
    if (sql === scenarios[1].sql) throw Object.assign(new Error('private diagnostic'), { code: 'P7501' });
  });
  const result = await runStride({ env, reportDir: directory(t), clientFactory: async () => db.client });
  assert.equal(result.exitCode, 1);
  assert.equal(result.tests[1].status, 'failed');
  assert.equal(result.tests.at(-1).status, 'passed');
  assert.equal(result.rollback, 'confirmed');
});

test('query errors are infrastructure errors, not security passes', async (t) => {
  const db = database((sql) => {
    if (sql === scenarios[0].sql) throw Object.assign(new Error('private SQL detail'), { code: '42P01' });
  });
  const result = await runStride({ env, reportDir: directory(t), clientFactory: async () => db.client });
  assert.equal(result.exitCode, 2);
  assert.equal(result.tests[0].status, 'error');
  assert.equal(result.tests[1].status, 'passed');
});

test('fixture setup failure rolls back and leaves scenarios not_run', async (t) => {
  const db = database((sql) => {
    if (sql === setupSql) throw Object.assign(new Error('setup failure'), { code: '42501' });
  });
  const result = await runStride({ env, reportDir: directory(t), clientFactory: async () => db.client });
  assert.equal(result.exitCode, 2);
  assert.ok(result.tests.every((item) => item.status === 'not_run'));
  assert.equal(result.rollback, 'confirmed');
  assert.equal(db.isClosed(), true);
});

test('preflight failure creates no fixture users', async (t) => {
  const db = database((sql) => {
    if (sql === preflightSql) throw Object.assign(new Error('RLS disabled'), { code: 'P7501' });
  });
  const result = await runStride({ env, reportDir: directory(t), clientFactory: async () => db.client });
  assert.equal(result.exitCode, 2);
  assert.equal(db.commands.some(({ sql }) => sql === setupSql), false);
  assert.equal(result.rollback, 'confirmed');
});

test('connection diagnostics and credentials are never copied into reports', async (t) => {
  const reportDir = directory(t);
  const db = database();
  db.client.connect = async () => { throw Object.assign(new Error(`Could not connect: ${env.STRIDE_DATABASE_URL}`), { code: 'ENOTFOUND' }); };
  const result = await runStride({ env, reportDir, clientFactory: async () => db.client });
  assert.equal(result.exitCode, 2);
  assert.equal(result.rollback, 'not_started');
  for (const name of ['summary.json', 'summary.txt', 'junit.xml']) {
    const saved = readFileSync(path.join(reportDir, name), 'utf8');
    assert.equal(saved.includes(env.STRIDE_DATABASE_URL), false);
    assert.equal(saved.includes('fixture-password'), false);
  }
  assert.equal(db.isClosed(), true);
});

test('rollback or savepoint recovery failure prevents a green result', async (t) => {
  for (const command of ['ROLLBACK', 'ROLLBACK TO SAVEPOINT stride_case']) {
    const db = database((sql) => {
      if (sql === command) throw Object.assign(new Error('connection lost'), { code: '08006' });
    });
    const result = await runStride({ env, reportDir: directory(t), clientFactory: async () => db.client });
    assert.equal(result.exitCode, 2);
    if (command === 'ROLLBACK') assert.equal(result.rollback, 'unconfirmed');
    assert.equal(db.isClosed(), true);
  }
});

test('missing config replaces previous success and JUnit marks unexecuted scenarios as skipped', async (t) => {
  const reportDir = directory(t);
  await runStride({ env, reportDir, clientFactory: async () => database().client });
  const result = await runStride({ env: {}, reportDir });
  const saved = JSON.parse(readFileSync(path.join(reportDir, 'summary.json'), 'utf8'));
  assert.equal(saved.exitCode, 2);
  assert.equal(result.tests.filter((item) => item.status === 'passed').length, 0);
  assert.match(readFileSync(path.join(reportDir, 'junit.xml'), 'utf8'), /<skipped /);
});
