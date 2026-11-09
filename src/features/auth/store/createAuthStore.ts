import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';
import type { AuthResult, AuthService, SignUpData, SignUpResult } from '../types';

interface AuthState {
  user: Profile | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  passwordRecovery: boolean;
  sessionError: string | null;
  initialize(): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(data: SignUpData): Promise<SignUpResult>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
  completePasswordRecovery(): Promise<AuthResult>;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Autentikasi gagal. Silakan coba kembali.';
}

function isRecoveryRedirect() {
  if (typeof window === 'undefined') return false;
  const { search, hash } = window.location;
  return [new URLSearchParams(search), new URLSearchParams(hash.slice(1))]
    .some((params) => params.get('type') === 'recovery');
}

export function createAuthStore(service: AuthService) {
  let generation = 0;
  let unsubscribe: (() => void) | undefined;
  const pendingProfiles = new Map<string, Promise<Profile>>();

  return create<AuthState>((set, get) => {
    const clearSession = () => set({ user: null, session: null, passwordRecovery: false, sessionError: null });

    async function fetchProfile(userId: string, expectedGeneration = generation): Promise<AuthResult> {
      const key = `${expectedGeneration}:${userId}`;
      let request = pendingProfiles.get(key);
      if (!request) {
        request = service.getProfile(userId);
        pendingProfiles.set(key, request);
      }
      try {
        const user = await request;
        // Late responses must not restore a user after logout or replace a newer account.
        if (generation === expectedGeneration && get().session?.user.id === userId) {
          set({ user, sessionError: null });
        }
        return { error: null };
      } catch (error) {
        const errorMessage = message(error);
        if (generation === expectedGeneration && get().session?.user.id === userId) {
          set({ sessionError: errorMessage });
        }
        return { error: errorMessage };
      } finally {
        if (pendingProfiles.get(key) === request) pendingProfiles.delete(key);
      }
    }

    async function applySession(session: Session | null, expectedGeneration: number, recovery = false) {
      if (generation !== expectedGeneration) return;
      if (!session) { clearSession(); return; }
      set({
        session,
        user: get().user?.id === session.user.id ? get().user : null,
        passwordRecovery: recovery || get().passwordRecovery,
      });
      if (!get().passwordRecovery) await fetchProfile(session.user.id, expectedGeneration);
    }

    async function runAction<T extends object>(action: () => Promise<T>): Promise<T & AuthResult | AuthResult> {
      set({ loading: true });
      try { return { ...await action(), error: null }; }
      catch (error) { return { error: message(error) }; }
      finally { set({ loading: false }); }
    }

    const signOut = () => runAction(async () => {
      await service.signOut();
      clearSession();
      return {};
    });

    return {
      user: null, session: null, loading: false, initialized: false,
      passwordRecovery: false, sessionError: null,

      initialize() {
        unsubscribe?.();
        const currentGeneration = ++generation;
        let events = 0;
        set({ initialized: false, passwordRecovery: isRecoveryRedirect(), sessionError: null });
        unsubscribe = service.subscribe((event, session) => {
          if (currentGeneration !== generation) return;
          events++;
          void applySession(session, currentGeneration, event === 'PASSWORD_RECOVERY')
            .finally(() => { if (currentGeneration === generation) set({ initialized: true }); });
        });
        void (async () => {
          try {
            const session = await service.getSession();
            // A live auth event takes precedence over an older session snapshot.
            if (events === 0) await applySession(session, currentGeneration);
          } catch (error) {
            if (currentGeneration === generation && events === 0) set({ sessionError: message(error) });
          } finally {
            if (currentGeneration === generation && events === 0) set({ initialized: true });
          }
        })();
        return () => {
          if (currentGeneration !== generation) return;
          generation++;
          unsubscribe?.();
          unsubscribe = undefined;
        };
      },

      signIn: (email, password) => runAction(async () => {
        const session = await service.signIn(email, password);
        set({ session, user: get().user?.id === session.user.id ? get().user : null, passwordRecovery: false });
        const result = await fetchProfile(session.user.id);
        if (result.error) throw new Error(`Login berhasil, tetapi profil gagal dimuat: ${result.error}`);
        return {};
      }),
      signUp: (data) => runAction(() => service.signUp(data)),
      requestPasswordReset: (email) => runAction(async () => { await service.requestPasswordReset(email); return {}; }),
      updatePassword: (password) => runAction(async () => { await service.updatePassword(password); return {}; }),
      signOut,
      completePasswordRecovery: signOut,
    };
  });
}
