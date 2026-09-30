import {
  API_KEY_EXPIRY_DAY_CHOICES,
  API_KEY_SCOPES,
  MCP_SERVER_URL,
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

export const KEY_PLACEHOLDER = '<YOUR_KEY>';

export const EXPIRY_CHOICES = API_KEY_EXPIRY_DAY_CHOICES;

export const ORDERED_SCOPES = API_KEY_SCOPES;

const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

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

export function claudeCodeSnippet(key: string): string {
  return `claude mcp add seald --transport http ${MCP_SERVER_URL} --header "Authorization: Bearer ${key}"`;
}

export function cursorSnippet(key: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        seald: {
          url: MCP_SERVER_URL,
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  );
}

export { MCP_SERVER_URL };
