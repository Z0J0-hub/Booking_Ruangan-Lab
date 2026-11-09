import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from './services/authService.ts';
import { createAuthStore } from './store/createAuthStore.ts';

const session = (id) => ({ user: { id } });
const profile = (id) => ({ id, full_name: id, role: 'student' });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fixture(overrides = {}) {
  return {
    getSession: async () => null,
    getProfile: async (id) => profile(id),
    subscribe: () => () => {},
    signIn: async () => session('a'),
    signUp: async () => ({ requiresEmailConfirmation: true }),
    requestPasswordReset: async () => {},
    updatePassword: async () => {},
    signOut: async () => {},
    ...overrides,
  };
}

test('SDK failures are exposed and loading is cleared on failed login/reset', async () => {
  const store = createAuthStore(fixture({
    signIn: async () => { throw new Error('Invalid credentials'); },
    requestPasswordReset: async () => { throw new Error('Email unavailable'); },
  }));
  assert.equal((await store.getState().signIn('test@example.invalid', 'invalid')).error, 'Invalid credentials');
  assert.equal((await store.getState().requestPasswordReset('test@example.invalid')).error, 'Email unavailable');
  assert.equal(store.getState().loading, false);
  assert.equal(store.getState().user, null);
});

test('profile response after logout cannot restore the previous user', async () => {
  let resolveProfile;
  const store = createAuthStore(fixture({ getProfile: () => new Promise((resolve) => { resolveProfile = resolve; }) }));
  const login = store.getState().signIn('test@example.invalid', 'password');
  await flush();
  await store.getState().signOut();
  resolveProfile(profile('a'));
  await login;
  assert.equal(store.getState().session, null);
  assert.equal(store.getState().user, null);
});

test('reinitialization cleans up listener and ignores a stale session snapshot', async () => {
  const pending = [];
  let active = 0;
  const store = createAuthStore(fixture({
    getSession: () => new Promise((resolve) => pending.push(resolve)),
    subscribe: () => { active++; return () => { active--; }; },
  }));
  const firstCleanup = store.getState().initialize();
  firstCleanup();
  const cleanup = store.getState().initialize();
  assert.equal(active, 1);
  pending[1](null);
  await flush();
  pending[0](session('stale'));
  await flush();
  assert.equal(store.getState().session, null);
  assert.equal(store.getState().initialized, true);
  cleanup();
  assert.equal(active, 0);
});

test('login and auth event share one pending profile request', async () => {
  let listener;
  let resolveProfile;
  let requests = 0;
  const store = createAuthStore(fixture({
    subscribe: (callback) => { listener = callback; return () => {}; },
    getProfile: () => { requests++; return new Promise((resolve) => { resolveProfile = resolve; }); },
  }));
  const cleanup = store.getState().initialize();
  await flush();
  const login = store.getState().signIn('test@example.invalid', 'password');
  await flush();
  listener('SIGNED_IN', session('a'));
  assert.equal(requests, 1);
  resolveProfile(profile('a'));
  await login;
  await flush();
  assert.equal(store.getState().user?.id, 'a');
  cleanup();
});

test('recovery session opens recovery state and failed logout preserves it', async () => {
  let listener;
  const store = createAuthStore(fixture({
    subscribe: (callback) => { listener = callback; return () => {}; },
    signOut: async () => { throw new Error('Logout failed'); },
  }));
  const cleanup = store.getState().initialize();
  await flush();
  listener('PASSWORD_RECOVERY', session('a'));
  await flush();
  assert.equal(store.getState().passwordRecovery, true);
  assert.equal(store.getState().user, null);
  assert.equal((await store.getState().completePasswordRecovery()).error, 'Logout failed');
  assert.equal(store.getState().session?.user.id, 'a');
  assert.equal(store.getState().passwordRecovery, true);
  cleanup();
});

test('signup metadata excludes role and preserves confirmation requirement', async () => {
  let sent;
  const client = { auth: { signUp: async (input) => {
    sent = input;
    return { data: { session: null }, error: null };
  } } };
  const service = createAuthService(client);
  const result = await service.signUp({
    email: 'test@example.invalid', password: 'test-password', username: 'test', full_name: 'Test',
    ...{ role: 'admin' },
  });
  assert.equal(result.requiresEmailConfirmation, true);
  assert.equal(Object.hasOwn(sent.options.data, 'role'), false);
});

test('SDK subscription defers handlers and cancels pending work on cleanup', async () => {
  let callback;
  let unsubscribed = 0;
  const client = { auth: { onAuthStateChange: (listener) => {
    callback = listener;
    return { data: { subscription: { unsubscribe: () => { unsubscribed++; } } } };
  } } };
  let received = 0;
  const stop = createAuthService(client).subscribe(() => { received++; });
  callback('SIGNED_IN', session('a'));
  assert.equal(received, 0);
  await flush();
  assert.equal(received, 1);
  callback('SIGNED_OUT', null);
  stop();
  await flush();
  assert.equal(received, 1);
  assert.equal(unsubscribed, 1);
});
