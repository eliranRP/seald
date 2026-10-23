import type { ApiKey, ConnectedApp } from 'shared';

/**
 * Obviously fake fixtures. The secret is one repeated character so it can
 * never be mistaken for, or flagged as, a real key.
 */
export const FAKE_SECRET = `seald_live_${'x'.repeat(43)}`;

export function fakeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Key 1',
    prefix: 'seald_live_xxxxxxxx',
    scopes: ['envelopes:read'],
    status: 'active',
    require_owner_approval: true,
    allow_new_recipients: false,
    always_require_signin: false,
    created_at: '2026-10-01T00:00:00.000Z',
    last_used_at: null,
    expires_at: '2099-12-31T00:00:00.000Z',
    revoked_at: null,
    ...overrides,
  };
}

export function fakeKeys(count: number): ApiKey[] {
  return Array.from({ length: count }, (_, i) =>
    fakeKey({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      name: `Key ${String(i + 1)}`,
      prefix: `seald_live_xxxxxxx${String(i)}`,
    }),
  );
}

export function fakeConnectedApp(overrides: Partial<ConnectedApp> = {}): ConnectedApp {
  return {
    id: '00000000-0000-4000-8000-0000000000c1',
    client_name: 'Claude',
    client_host: 'claude.example',
    unverified: false,
    scopes: ['envelopes:read', 'envelopes:send'],
    created_at: '2026-10-01T00:00:00.000Z',
    last_used_at: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}
