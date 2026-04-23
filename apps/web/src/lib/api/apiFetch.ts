import { supabase } from '../supabase/supabaseClient';

/**
 * Thin `fetch` wrapper that attaches the current Supabase access token as a
 * Bearer Authorization header (when a session exists). Callers pass a path
 * like `/me`; the base URL comes from `VITE_API_BASE_URL`.
 *
 * Kept intentionally small — there's no response shape handling here: the
 * caller decides whether to `.json()`, `.text()`, check `res.ok`, etc.
 */
const BASE = import.meta.env.VITE_API_BASE_URL;

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  return fetch(`${BASE}${path}`, { ...init, headers });
}
