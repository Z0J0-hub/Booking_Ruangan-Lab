import { supabase } from '@/lib/supabase';
import { createAuthService } from '../services/authService';
import { createAuthStore } from './createAuthStore';

// Reuse the existing client shared with room/booking queries; create no second SDK instance.
export const useAuthStore = createAuthStore(createAuthService(supabase));
