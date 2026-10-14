import { createClient } from "@supabase/supabase-js";

// The Supabase publishable key is designed for browser use.
// Database security must be enforced by Postgres RLS, never by relying on this key being secret.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://zdvmlgioavvpraqzfeam.supabase.co";
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  "sb_publishable_dseAaFc0eC_U5x1tOjWqAg_cv8TN2kq";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
