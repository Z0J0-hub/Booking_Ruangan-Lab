import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStaging } from './staging.mjs';
import { createPlan, summarizeZap } from './run.mjs';

test('staging binds loopback, serves real assets and SPA routes, blocks writes and hidden files', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'reservasi-staging-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, 'index.html'), '<h1>production fixture</h1>');
  mkdirSync(path.join(directory, 'assets'));
  writeFileSync(path.join(directory, 'assets', 'app.js'), 'export const production = true;');
  writeFileSync(path.join(directory, '.env'), 'never serve');
  const staging = await startStaging({ directory });
  t.after(() => staging.close());
  assert.match(staging.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const route = await fetch(`${staging.url}/booking`);
  assert.equal(route.status, 200);
  assert.match(await route.text(), /production fixture/);
  assert.equal(route.headers.get('x-content-type-options'), 'nosniff');
  assert.match(route.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${staging.url}/assets/app.js`)).status, 200);
  assert.equal((await fetch(`${staging.url}/assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${staging.url}/.env`)).status, 404);
  assert.equal((await fetch(`${staging.url}/assets/%2e%2e%5c.env`)).status, 404);
  assert.equal((await fetch(`${staging.url}/`, { method: 'POST' })).status, 405);
});

test('staging does not follow symlinks outside dist', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'reservasi-staging-link-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'dist'));
  writeFileSync(path.join(directory, 'dist', 'index.html'), 'build');
  mkdirSync(path.join(directory, 'outside'));
  writeFileSync(path.join(directory, 'outside', 'secret.js'), 'private');
  symlinkSync(path.join(directory, 'outside'), path.join(directory, 'dist', 'linked'), 'junction');
  const staging = await startStaging({ directory: path.join(directory, 'dist') });
  t.after(() => staging.close());
  assert.equal((await fetch(`${staging.url}/linked/secret.js`)).status, 404);
});

test('ZAP report gate blocks high, records lower findings, rejects missing or out-of-scope reports', () => {
  const origin = 'http://127.0.0.1:12345';
  const report = (riskcode) => ({ site: [{ '@name': origin, alerts: [{ pluginid: '1', name: 'fixture', riskcode,
    instances: [{ uri: `${origin}/?token=do-not-publish` }] }] }] });
  assert.equal(summarizeZap(report('3'), origin).exitCode, 1);
  const lower = summarizeZap(report('2'), origin);
  assert.equal(lower.exitCode, 0);
  assert.equal(lower.risks.medium, 1);
  assert.equal(JSON.stringify(lower).includes('do-not-publish'), false);
  assert.throws(() => summarizeZap({ site: [] }, origin));
  assert.throws(() => summarizeZap(report('invalid'), origin));
  const extra = report('1'); extra.site.push({ '@name': 'https://external.invalid', alerts: [] });
  assert.throws(() => summarizeZap(extra, origin));
  const foreign = report('3'); foreign.site[0].alerts[0].instances[0].uri = 'https://external.invalid/';
  assert.throws(() => summarizeZap(foreign, origin));
});

test('ZAP plan scopes the runtime frontend and assets, fails on errors, and has no active attack job', () => {
  const plan = createPlan('http://127.0.0.1:12345', 'C:\\reports', ['/assets/app.js']);
  assert.match(plan, /http:\/\/127\.0\.0\.1:12345\/assets\/app\.js/);
  assert.match(plan, /failOnWarning: true/);
  assert.match(plan, /errorLevel: High/);
  assert.match(plan, /scanOnlyInScope: true/);
  assert.doesNotMatch(plan, /type: activeScan/);
});
