import { createClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client.
 *
 * Uses the MODERN publishable key (`sb_publishable_…`) from Vite env. The key
 * is safe to ship to the browser, but is still env-sourced so different
 * deploys can target different Supabase projects.
 *
 * We keep a single module-level instance — `createClient` is cheap but sets
 * up internal storage listeners, so callers should import this singleton
 * rather than constructing their own.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
