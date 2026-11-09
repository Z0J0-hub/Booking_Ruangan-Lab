import { create } from 'zustand';
import { apiRequest, clearAuthToken, getAuthToken, setAuthToken } from '@/lib/api';
import type { Profile } from '@/lib/types';
import type { MemberType } from '@/lib/types';

interface AuthState {
  user: Profile | null;
  loading: boolean;
  initialized: boolean;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (data: SignUpData) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  completePasswordRecovery: () => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

interface AuthResponse {
  token: string;
  user: Profile;
}

interface SignUpData {
  email: string;
  password: string;
  username: string;
  full_name: string;
  phone?: string;
  student_id?: string;
  employee_id?: string;
  member_type: MemberType;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  passwordRecovery: false,

  initialize: async () => {
    const queryParams = new URLSearchParams(window.location.search);
    const isPasswordRecovery = queryParams.get('type') === 'recovery';
    const recoveryToken = isPasswordRecovery ? queryParams.get('token') : null;
    if (recoveryToken) {
      setAuthToken(recoveryToken);
      set({ passwordRecovery: true });
    }

    if (getAuthToken() && !isPasswordRecovery) {
      try {
        const result = await apiRequest<{ user: Profile }>('/auth/me');
        set({ user: result.user });
      } catch (error) {
        clearAuthToken();
        console.error(
          'Unable to restore the current session:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    set({ initialized: true });
  },

  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const result = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(result.token);
      set({ user: result.user });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign-in failed.' };
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (data) => {
    set({ loading: true });
    try {
      await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign-up failed.' };
    } finally {
      set({ loading: false });
    }
  },

  requestPasswordReset: async (email) => {
    set({ loading: true });
    try {
      await apiRequest('/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Password reset failed.' };
    } finally {
      set({ loading: false });
    }
  },

  updatePassword: async (password) => {
    set({ loading: true });
    try {
      await apiRequest('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Password update failed.' };
    } finally {
      set({ loading: false });
    }
  },

  completePasswordRecovery: () => {
    clearAuthToken();
    set({ user: null, passwordRecovery: false });
  },

  signOut: async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error(
        'Unable to invalidate the server session:',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearAuthToken();
      set({ user: null, passwordRecovery: false });
    }
  },
}));
