import type { AuthFormMode } from '../components/AuthForm/AuthForm.types';

/**
 * Central resolver from an `AuthForm` mode string to the concrete route path.
 * Lives in `layout/` so every auth-surface page can avoid repeating the same
 * signin/signup/forgot-password conditional.
 */
export function pathForAuthMode(mode: AuthFormMode): string {
  if (mode === 'signin') return '/signin';
  if (mode === 'signup') return '/signup';
  return '/forgot-password';
}
