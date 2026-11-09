import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';

export interface AuthResult {
  error: string | null;
}

export interface SignUpData {
  email: string;
  password: string;
  username: string;
  full_name: string;
  phone?: string;
  student_id?: string;
}

export interface SignUpResult extends AuthResult {
  requiresEmailConfirmation?: boolean;
}

// Internal contract: pages and other features use the store, not this adapter.
export interface AuthService {
  getSession(): Promise<Session | null>;
  getProfile(userId: string): Promise<Profile>;
  subscribe(listener: (event: AuthChangeEvent, session: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<Session>;
  signUp(data: SignUpData): Promise<{ requiresEmailConfirmation: boolean }>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
}
