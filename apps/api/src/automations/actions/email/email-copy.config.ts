import { createHash, randomBytes } from 'node:crypto';
import { isEmail } from 'class-validator';

/** Design doc § Email copy: at most 10 addresses on one recipe. */
export const EMAIL_COPY_MAX_RECIPIENTS = 10;
/** Recipient-messages one owner may queue per UTC day. */
export const EMAIL_COPY_DAILY_CAP = 50;
/** Slug for a run held until the next UTC day because the owner hit the cap. */
export const EMAIL_COPY_DAILY_CAP_SLUG = 'email_copy_daily_cap';

/** Trim, lower-case, max 320, valid mailbox: the `CreateContactDto` rule. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 320) return null;
  return isEmail(value) ? value : null;
}

export type EmailCopyConfigResult =
  | { readonly ok: true; readonly to: readonly string[] }
  | { readonly ok: false; readonly slug: 'bad_config' | 'too_many_recipients' };

/**
 * Reads `config.to`. A missing or empty list is valid and means "the
 * sender's own mailbox" (the `*_notify_me` recipes); the executor resolves
 * it. Duplicates collapse. Any invalid address makes the whole config bad:
 * recipe save (a later step) uses the same function.
 */
export function parseEmailCopyConfig(config: Record<string, unknown>): EmailCopyConfigResult {
  const raw = config.to;
  if (raw === undefined || raw === null) return { ok: true, to: [] };
  if (!Array.isArray(raw)) return { ok: false, slug: 'bad_config' };
  const seen = new Set<string>();
  for (const item of raw) {
    const email = normalizeEmail(item);
    if (!email) return { ok: false, slug: 'bad_config' };
    seen.add(email);
  }
  if (seen.size > EMAIL_COPY_MAX_RECIPIENTS) return { ok: false, slug: 'too_many_recipients' };
  return { ok: true, to: [...seen] };
}

/** UTC calendar day, `YYYY-MM-DD`: the cap's bucket. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Start of the next UTC day: when a capped run becomes due again. */
export function nextUtcMidnight(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1));
}

export interface MintedStopToken {
  readonly token: string;
  readonly hash: string;
}

export function hashStopToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 32 random bytes, base64url: 43 characters. Only the hash is stored. */
export function generateStopToken(): MintedStopToken {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashStopToken(token) };
}

export function looksLikeStopToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
