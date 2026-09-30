import { API_KEY_SCOPES, type ApiKeyExpiryDays, type ApiKeyScope } from 'shared';

export const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  'envelopes:read': 'Read envelopes',
  'envelopes:write': 'Prepare envelopes',
  'documents:write': 'Upload documents',
  'contacts:read': 'Read contacts',
  'contacts:write': 'Edit contacts',
  'templates:read': 'Read templates',
  'templates:write': 'Edit templates',
  'gdrive:read': 'Read Drive',
  'gdrive:write': 'Write Drive',
  'automations:read': 'Read automations',
  'automations:write': 'Edit automations',
};

/** Same list the API accepts. Send is not in it until step 10. */
export const CREATABLE_SCOPES = API_KEY_SCOPES;

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
  if (!expiresAt) return '';
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
