import { isFeatureEnabled, type ApiKey, type ApiKeyScope } from 'shared';

/** The Developers page is on when either flag is on (parity plan D1). */
export function isDevelopersEnabled(): boolean {
  return isFeatureEnabled('mcpServer') || isFeatureEnabled('publicApi');
}

/** Short plain label per scope. The scope id stays visible as the hint. */
export const SCOPE_LABELS: Readonly<Record<ApiKeyScope, string>> = {
  'envelopes:read': 'Read documents',
  'envelopes:write': 'Prepare documents',
  'documents:write': 'Upload files',
  'envelopes:send': 'Send and remind',
  'contacts:read': 'Read contacts',
  'contacts:write': 'Edit contacts',
  'templates:read': 'Read templates',
  'templates:write': 'Edit templates',
  'gdrive:read': 'Read Drive',
  'gdrive:write': 'Save to Drive',
  'automations:read': 'Read automations',
  'automations:write': 'Edit automations',
  'account:admin': 'Account changes',
  'keys:admin': 'Key changes',
  'envelopes:sign': 'Sign requests',
};

/** Expired when the server says so, or when the key has no expiry at all. */
export function isExpired(key: ApiKey, now: Date = new Date()): boolean {
  if (key.status === 'expired') return true;
  if (key.expires_at === null) return true;
  return new Date(key.expires_at).getTime() <= now.getTime();
}

export function expiryFromDays(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** The MCP endpoint shown under "Connect a client". */
export function mcpServerUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return `${base.replace(/\/+$/, '')}/mcp`;
}

export const KEY_PLACEHOLDER = '<YOUR_KEY>';

export function claudeCodeCommand(url: string, key: string): string {
  return `claude mcp add --transport http seald ${url} --header "Authorization: Bearer ${key}"`;
}

export function cursorConfig(url: string, key: string): string {
  return JSON.stringify(
    { mcpServers: { seald: { url, headers: { Authorization: `Bearer ${key}` } } } },
    null,
    2,
  );
}
