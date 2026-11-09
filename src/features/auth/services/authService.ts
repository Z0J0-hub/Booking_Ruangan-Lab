import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';
import type { AuthService } from '../types';

export function createAuthService(client: SupabaseClient): AuthService {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },

    async getProfile(userId) {
      // The signup trigger can take a moment to make the profile available.
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (error) throw error;
        if (data) return data as Profile;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error('Profil belum tersedia. Silakan hubungi administrator.');
    },

    subscribe(listener) {
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        // Work runs after the SDK callback, avoiding awaited SDK calls under its auth lock.
        const timer = setTimeout(() => {
          timers.delete(timer);
          listener(event, session);
        }, 0);
        timers.add(timer);
      });
      return () => {
        subscription.unsubscribe();
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
      };
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('Login tidak menghasilkan sesi. Silakan coba kembali.');
      return data.session;
    },

    async signUp({ email, password, username, full_name, phone, student_id }) {
      const { data, error } = await client.auth.signUp({
        email, password,
        options: { data: { username, full_name, phone, student_id } },
      });
      if (error) throw error;
      return { requiresEmailConfirmation: !data.session };
    },

    async requestPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (error) throw error;
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
  };
}
