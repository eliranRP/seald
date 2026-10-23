import { APPROVAL_POLICY, type ApprovalRecipient, type ApprovalStatus } from 'shared';
import { isDevelopersEnabled } from '@/features/developers';
import { validateNextPath } from '@/layout/nextPath';

/**
 * The approval surfaces ride the same flags as API keys: the WP-21 API
 * answers 404 for every approval route unless `mcpServer` or `publicApi` is
 * on (`ApiKeysFlagMiddleware`). Off means no bell, no queue and routes that
 * read as not found.
 */
export function isApprovalsEnabled(): boolean {
  return isDevelopersEnabled();
}

/** Short word for each status. The words are the same on every surface. */
export const STATUS_LABELS: Readonly<Record<ApprovalStatus, string>> = {
  pending: 'Waiting for you',
  done: 'Approved',
  denied: 'Denied',
  expired: 'Expired',
  failed: 'Failed',
};

/** Plain sentence for each `result_slug` the server may store on a Failed row. */
const FAILURE_COPY: Readonly<Record<string, string>> = {
  api_key_revoked: 'The key that asked was revoked, so nothing was sent.',
  api_key_expired: 'The key that asked has expired, so nothing was sent.',
  // WP-27: an OAuth connected app that was disconnected before the decision.
  oauth_grant_revoked: 'The app that asked was disconnected, so nothing was sent.',
  execution_interrupted: 'The request was interrupted before it finished. Nothing was sent.',
  send_daily_cap: 'The daily send limit was reached, so nothing was sent.',
  recipient_cap: 'Too many new recipients for one day, so nothing was sent.',
};

const FAILURE_FALLBACK = 'The request was approved but did not go through. Nothing was sent.';

export function failureCopy(slug: string | null | undefined): string {
  if (!slug) return FAILURE_FALLBACK;
  return FAILURE_COPY[slug] ?? FAILURE_FALLBACK;
}

/** New addresses first, otherwise the server's order. */
export function sortRecipients(
  recipients: ReadonlyArray<ApprovalRecipient>,
): ReadonlyArray<ApprovalRecipient> {
  return [...recipients].sort((a, b) => Number(b.is_new) - Number(a.is_new));
}

export interface RecipientSplit {
  readonly shown: ReadonlyArray<ApprovalRecipient>;
  readonly hidden: ReadonlyArray<ApprovalRecipient>;
}

/** The card shows 3 recipients, then "+N more" (design: Owner approval). */
export function splitRecipients(recipients: ReadonlyArray<ApprovalRecipient>): RecipientSplit {
  const sorted = sortRecipients(recipients);
  return {
    shown: sorted.slice(0, APPROVAL_POLICY.recipientsShown),
    hidden: sorted.slice(APPROVAL_POLICY.recipientsShown),
  };
}

/** "Expires in 23h", "Expires in 40m" or "Expired". */
export function expiresInLabel(expiresAt: string, now: Date = new Date()): string {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 'Expired';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes >= 60) return `Expires in ${Math.floor(minutes / 60)}h`;
  return `Expires in ${minutes}m`;
}

/** "Fields updated · 12:21 IDT" from the owner-edit timestamp. */
export function fieldsUpdatedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Fields updated';
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
  return `Fields updated · ${time}`;
}

export function approvalPath(id: string): string {
  return `/approve/${id}`;
}

export function reviewPath(id: string): string {
  return `/approve/${id}/review`;
}

/**
 * The server sends `review_url` as an absolute URL on the app origin. Only
 * its path is used, and only when it is an approval path the sign-in
 * `?next=` rule would also accept, so a tampered value cannot send the
 * owner anywhere else.
 */
export function reviewPathFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    return validateNextPath(parsed.pathname);
  } catch {
    return null;
  }
}

/** `/signin?next=<path>` when the path is a valid approval path, else `/signin`. */
export function signInPathFor(path: string): string {
  const next = validateNextPath(path);
  return next ? `/signin?next=${encodeURIComponent(next)}` : '/signin';
}

/** "Sent via Key 2". The server sends "Sent via API key" whole when the key has no name. */
export function keyLine(keyName: string): string {
  return keyName.startsWith('Sent via ') ? keyName : `Sent via ${keyName}`;
}
