import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

interface AuthState {
  user: Profile | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (data: SignUpData) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  completePasswordRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<{ error: string | null }>;
  initialize: () => Promise<void>;
}

interface SignUpData {
  email: string;
  password: string;
  username: string;
  full_name: string;
  phone?: string;
  student_id?: string;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,
  passwordRecovery: false,

  initialize: async () => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);
    if (hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery') {
      set({ passwordRecovery: true });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      set({ session });
      const { error } = await get().fetchProfile(session.user.id);
      if (error) console.error('Init: profile fetch error:', error);
    }
    set({ initialized: true });

    let isFetchingProfile = false;

    supabase.auth.onAuthStateChange((event, newSession) => {
      (async () => {
        if (event === 'SIGNED_OUT' || !newSession) {
          set({ user: null, session: null, passwordRecovery: false });
          return;
        }
        if (event === 'PASSWORD_RECOVERY') {
          set({ session: newSession, passwordRecovery: true });
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          set({ session: newSession });
          if (!isFetchingProfile) {
            isFetchingProfile = true;
            const { error } = await get().fetchProfile(newSession.user.id);
            isFetchingProfile = false;
            if (error) console.error('Auth state change: profile fetch error:', error);
          }
        }
      })();
    });
  },

  fetchProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }
    if (!data) {
      // Profile might not be created yet if the trigger is slow.
      // Retry once after a short delay.
      await new Promise((r) => setTimeout(r, 1000));
      const { data: retryData, error: retryError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (retryError) return { error: retryError.message };
      if (!retryData) return { error: 'Profile not found. Please contact an administrator.' };
      set({ user: retryData as Profile });
      return { error: null };
    }
    set({ user: data as Profile });
    return { error: null };
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    set({ loading: false });

    if (error) return { error: error.message };
    if (!data.user) return { error: 'Sign-in failed: no user returned.' };

    set({ session: data.session });
    const { error: profileError } = await get().fetchProfile(data.user.id);
    if (profileError) {
      return { error: `Signed in but could not load profile: ${profileError}` };
    }
    return { error: null };
  },

  signUp: async (data) => {
    set({ loading: true });
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          username: data.username,
          full_name: data.full_name,
          role: 'student',
          phone: data.phone,
          student_id: data.student_id,
        },
      },
    });
    set({ loading: false });
    if (error) return { error: error.message };
    return { error: null };
  },

  requestPasswordReset: async (email) => {
    set({ loading: true });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    set({ loading: false });
    return { error: error?.message || null };
  },

  updatePassword: async (password) => {
    set({ loading: true });
    const { error } = await supabase.auth.updateUser({ password });
    set({ loading: false });
    return { error: error?.message || null };
  },

  completePasswordRecovery: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, passwordRecovery: false });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, passwordRecovery: false });
  },
}));
