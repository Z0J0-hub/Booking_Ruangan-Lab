import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, checkRemote } from './check.mjs';

const settings = { VITE_SUPABASE_URL: 'https://test-project.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_fixture_only' };
const legacy = (role) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('accepts public keys but rejects privileged keys, missing configuration, and remote HTTP', () => {
  assert.equal(validateConfig(settings).url, settings.VITE_SUPABASE_URL);
  assert.ok(validateConfig({ ...settings, VITE_SUPABASE_ANON_KEY: legacy('anon') }));
  for (const key of ['sb_secret_fixture', legacy('service_role'), legacy('admin')]) {
    assert.throws(() => validateConfig({ ...settings, VITE_SUPABASE_ANON_KEY: key }));
  }
  assert.throws(() => validateConfig({}));
  assert.throws(() => validateConfig({ ...settings, VITE_SUPABASE_URL: 'http://test-project.supabase.co' }));
});

test('remote check is read-only and propagates denied keys and disabled email authentication', async () => {
  const config = validateConfig(settings);
  await checkRemote(config, async (url, options) => {
    assert.equal(url, `${config.url}/auth/v1/settings`);
    assert.equal(options.method, undefined);
    assert.equal(options.headers.apikey, config.key);
    return { ok: true, json: async () => ({ external: { email: true } }) };
  });
  await assert.rejects(checkRemote(config, async () => ({ ok: false, status: 401 })), /HTTP 401/);
  await assert.rejects(checkRemote(config, async () => ({ ok: true, json: async () => ({ external: { email: false } }) })), /not enabled/);
});
