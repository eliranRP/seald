import type { PasswordStrength } from '../PasswordStrengthMeter';

/**
 * Heuristic strength score used by the signup form. Returns 0 when the
 * password is too short to bother scoring, then 1–4 as length and class
 * diversity increase. Matches the scoring rules in the design spec so the
 * strength meter's colour and label stay in sync with what the user sees.
 */
export function scorePassword(password: string): PasswordStrength {
  if (password.length < 8) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score > 4) score = 4;
  return score as PasswordStrength;
}
