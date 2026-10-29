import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

// Public health endpoint: no song reads, session refresh or workspace mutation.
export async function checkSupabaseConnection(signal: AbortSignal): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
    signal, cache: 'no-store', credentials: 'omit', headers: { apikey: supabaseAnonKey }
  });
  if (!response.ok) throw new Error(`Service unavailable (${response.status})`);
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
      }
    })
  : null;
