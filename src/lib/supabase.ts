import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY. Lihat .env.example.');
}

if (supabaseAnonKey.startsWith('sb_secret_')) {
  throw new Error('Frontend hanya boleh menggunakan publishable/anon key, bukan secret key.');
}
if (supabaseAnonKey.split('.').length === 3) {
  try {
    const payload = supabaseAnonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    if (JSON.parse(atob(payload)).role !== 'anon') {
      throw new Error('privileged key');
    }
  } catch {
    throw new Error('Gunakan anon/publishable key publik; service_role tidak boleh di frontend.');
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
