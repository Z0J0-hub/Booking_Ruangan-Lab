import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function validateConfig(env) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env or build environment.');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('VITE_SUPABASE_URL is not a valid URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((!local && parsed.protocol !== 'https:') || (local && !['http:', 'https:'].includes(parsed.protocol)) ||
      parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Use an HTTPS Supabase project origin (HTTP allowed only for localhost).');
  }
  if (parsed.hostname === 'your-project.supabase.co' || key.includes('your_public_')) {
    throw new Error('Replace the example Supabase settings before running the app.');
  }
  if (key.startsWith('sb_publishable_') && key.length > 20) return { url: parsed.origin, key };
  if (key.startsWith('sb_secret_')) throw new Error('Secret keys must never be used in the frontend.');
  let claims;
  try { claims = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8')); }
  catch { throw new Error('Use a public publishable key or legacy anon key.'); }
  if (key.split('.').length !== 3 || claims.role !== 'anon') {
    throw new Error('Only public anon/publishable keys may be used; service_role is forbidden.');
  }
  // Shape validation does not verify the token signature; optional remote check tests acceptance.
  return { url: parsed.origin, key };
}

export async function checkRemote(config, request = fetch) {
  const response = await request(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.key }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Supabase Auth settings check failed (HTTP ${response.status}).`);
  const settings = await response.json();
  if (settings.external?.email !== true) throw new Error('Email authentication is not enabled for this project.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const mode = process.argv.find((arg) => arg.startsWith('--mode='))?.slice(7) || 'development';
    const config = validateConfig(loadEnv(mode, root, 'VITE_'));
    console.log('Supabase public configuration: valid shape (key value hidden).');
    if (process.argv.includes('--remote')) {
      await checkRemote(config);
      console.log('Supabase Auth reachable; email authentication enabled. No users or data changed.');
    }
    console.log('Schema, RLS, signup/login, and recovery still require separate verification.');
  } catch (error) {
    console.error(error.name === 'TimeoutError' ? 'Supabase check timed out.' : error.message);
    process.exitCode = 1;
  }
}
