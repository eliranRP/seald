import type { ConnectedApp } from 'shared';
import type { ApiKeysService } from '../../../../api-keys/api-keys.service';
import type { ApprovalExecuteContext } from '../../../../approvals/kinds/approval-kind';
import { apiKeyCreateHandler } from '../../api-keys/api-key-approval-kinds';
import { oauthGrantRevokeHandler } from '../connected-app-approval-kind';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const GRANT = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2026-10-23T12:00:00.000Z');

function app(over: Partial<ConnectedApp> = {}): ConnectedApp {
  return {
    id: GRANT,
    client_name: 'Claude',
    client_host: 'claude.ai',
    unverified: false,
    scopes: ['envelopes:read', 'keys:admin'],
    created_at: '2026-10-01T00:00:00.000Z',
    last_used_at: null,
    ...over,
  };
}

const ctx = {
  ownerId: OWNER,
  ownerEmail: 'owner@example.com',
  now: NOW,
  apiKeyId: null,
  oauthGrantId: GRANT,
};

describe('WP-45 kinds with an OAuth grant (WP-27)', () => {
  it('oauth_grant_revoke: describes the app, revokes only on execute', async () => {
    const calls: string[] = [];
    const handler = oauthGrantRevokeHandler({
      findLive: async (_o, id) => (id === GRANT ? app() : null),
      revokeForOwner: async (_o, id) => {
        calls.push(id);
        return { revoked: true };
      },
    });
    const d = await handler.describe({ connected_app_id: GRANT }, ctx);
    expect(d.facts).toEqual([
      { label: 'App', value: 'Claude' },
      { label: 'Website', value: 'claude.ai' },
      { label: 'Scopes', value: 'envelopes:read, keys:admin' },
    ]);
    expect(handler.highRisk({ connected_app_id: GRANT })).toBe(true);
    expect(calls).toEqual([]);
    await expect(
      handler.describe({ connected_app_id: '66666666-6666-4666-8666-666666666666' }, ctx),
    ).rejects.toThrow('connected_app_not_found');
    await handler.execute({ connected_app_id: GRANT }, {
      ...ctx,
      approvalId: 'a',
      audit: { ip: null, user_agent: null },
    } as ApprovalExecuteContext);
    expect(calls).toEqual([GRANT]);
  });

  it('api_key_create: the ceiling for an OAuth caller is the grant scopes', async () => {
    let current: ConnectedApp | null = app();
    const keys = { listForOwner: async () => [] } as unknown as ApiKeysService;
    const handler = apiKeyCreateHandler(keys, { findLive: async () => current });
    await expect(
      handler.describe({ scopes: ['envelopes:read'], expires_in_days: 90 }, ctx),
    ).resolves.toMatchObject({ envelopeId: null });
    await expect(
      handler.describe({ scopes: ['envelopes:send'], expires_in_days: 90 }, ctx),
    ).rejects.toThrow('scope_exceeds_key');
    current = null;
    await expect(
      handler.describe({ scopes: ['envelopes:read'], expires_in_days: 90 }, ctx),
    ).rejects.toThrow('oauth_grant_revoked');
  });
});
