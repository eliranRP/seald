const ALLOWED = new Set(['/settings/developers', '/m/settings/developers']);
const STORAGE_KEY = 'seald.postSignInPath';

/** Remember an allowlisted return path. Sign-in has no `?next=` query. */
export function rememberPostSignInPath(path: string): void {
  if (!ALLOWED.has(path)) return;
  sessionStorage.setItem(STORAGE_KEY, path);
}

/** Read and clear the path. Anything outside the allowlist is dropped. */
export function consumePostSignInPath(): string | null {
  const value = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  if (value && ALLOWED.has(value)) return value;
  return null;
}
