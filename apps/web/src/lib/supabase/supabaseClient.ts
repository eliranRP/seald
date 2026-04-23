import { createClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client.
 *
 * Uses the MODERN publishable key (`sb_publishable_…`) from Vite env. The key
 * is safe to ship to the browser, but is still env-sourced so different
 * deploys can target different Supabase projects.
 *
 * "Keep me signed in" is implemented as a storage adapter: when the user
 * ticks the box at sign-in time we persist to `localStorage` (session
 * survives tab close); when they untick it we persist to `sessionStorage`
 * (session cleared when the tab closes). The flag itself lives in
 * `localStorage` under `KEEP_SIGNED_IN_STORAGE_KEY` so it survives even when
 * the session doesn't.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
}

export const KEEP_SIGNED_IN_STORAGE_KEY = 'sealed.keepSignedIn';

interface SupabaseStorage {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
}

/**
 * Picks localStorage when the "keep signed in" flag is on, sessionStorage
 * otherwise. We resolve the target fresh on every call so a late
 * `setKeepSignedIn(false)` from a signed-in user immediately routes
 * subsequent token refreshes to sessionStorage.
 */
function resolveTarget(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const pref = window.localStorage.getItem(KEEP_SIGNED_IN_STORAGE_KEY);
  // Default to persistent storage so first-time users have the usual
  // "stay signed in" behaviour.
  const keep = pref === null ? true : pref === '1';
  return keep ? window.localStorage : window.sessionStorage;
}

const dualStorage: SupabaseStorage = {
  getItem(name) {
    if (typeof window === 'undefined') return null;
    const target = resolveTarget();
    const primary = target?.getItem(name) ?? null;
    if (primary !== null) return primary;
    // Fall back to the other store so a session written under a different
    // preference still hydrates on page load.
    const other = target === window.localStorage ? window.sessionStorage : window.localStorage;
    return other.getItem(name);
  },
  setItem(name, value) {
    const target = resolveTarget();
    target?.setItem(name, value);
  },
  removeItem(name) {
    if (typeof window === 'undefined') return;
    // Clear both so stale tokens don't linger after a preference flip.
    window.localStorage.removeItem(name);
    window.sessionStorage.removeItem(name);
  },
};

export function setKeepSignedIn(keep: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEEP_SIGNED_IN_STORAGE_KEY, keep ? '1' : '0');
}

export function getKeepSignedIn(): boolean {
  if (typeof window === 'undefined') return true;
  const pref = window.localStorage.getItem(KEEP_SIGNED_IN_STORAGE_KEY);
  return pref === null ? true : pref === '1';
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: dualStorage,
  },
});
