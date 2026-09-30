import {
  API_KEY_EXPIRY_DAY_CHOICES,
  API_KEY_SCOPES,
  type ApiKeyExpiryDays,
  type ApiKeyScope,
} from 'shared';

export const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  'envelopes:read': 'Read envelopes',
  'envelopes:write': 'Prepare envelopes',
  'documents:write': 'Upload documents',
  'envelopes:send': 'Send',
  'contacts:read': 'Read contacts',
  'contacts:write': 'Edit contacts',
  'templates:read': 'Read templates',
  'templates:write': 'Edit templates',
  'gdrive:read': 'Read Drive',
  'gdrive:write': 'Write Drive',
  'automations:read': 'Read automations',
  'automations:write': 'Edit automations',
};

/** Send stays off this screen until the sign-in handoff exists. */
export const CREATABLE_SCOPES = API_KEY_SCOPES.filter(
  (scope): scope is Exclude<ApiKeyScope, 'envelopes:send'> => scope !== 'envelopes:send',
);

export const EXPIRY_CHOICES = API_KEY_EXPIRY_DAY_CHOICES;

const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function expiryChoiceLabel(days: ApiKeyExpiryDays): string {
  if (days === 365) return '1 yr';
  return `${days} d`;
}

export function formatDay(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return dayFormat.format(new Date(parsed));
}

export function keyIsExpired(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  return !Number.isNaN(parsed) && parsed <= now;
}

export function expiryLine(expiresAt: string | null, now: number): string {
  if (!expiresAt) return 'Expires';
  const day = formatDay(expiresAt);
  return keyIsExpired(expiresAt, now) ? `Expired ${day}` : `Expires ${day}`;
}

export function keyMetaLine(item: {
  readonly last_used_at: string | null;
  readonly scopes: readonly ApiKeyScope[];
}): string {
  const used = item.last_used_at ? `Last used ${formatDay(item.last_used_at)}` : 'Not used yet';
  const scopes = item.scopes.map((scope) => SCOPE_LABEL[scope]).join(', ');
  return `${used} · ${scopes}`;
}
