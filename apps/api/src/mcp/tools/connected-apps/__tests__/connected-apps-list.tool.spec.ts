import { ConnectedAppsListOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import { resetFlags, setFlags } from '../../__tests__/write-harness';
import { call, errorOf, gatedWorld, ok, principal } from '../../account/__tests__/gated-harness';

const GRANT = '77777777-7777-4777-8777-777777777777';
const OTHER = '66666666-6666-4666-8666-666666666666';

function app(id: string) {
  return {
    id,
    client_name: 'Claude',
    client_host: 'claude.ai',
    unverified: false,
    scopes: ['envelopes:read'],
    created_at: '2026-10-01T00:00:00.000Z',
    last_used_at: null,
  };
}

describe('connected_apps_list (WP-45)', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('lists the connected apps and marks the calling app', async () => {
    const w = gatedWorld();
    w.answers.set('connectedApps.listForOwner', { items: [app(GRANT), app(OTHER)] });
    const p = principal(['keys:admin'], {
      keyId: GRANT,
      oauth: { grantId: GRANT, clientId: OTHER },
    });
    const out = ok(await call(w, 'connected_apps_list', {}, p));
    expect(ConnectedAppsListOutputSchema.safeParse(out).success).toBe(true);
    expect(findTokenShapedStrings(out)).toEqual([]);
    expect(
      (out['items'] as Array<Record<string, unknown>>).map((i) => [
        i['connected_app_id'],
        i['is_this_app'],
      ]),
    ).toEqual([
      [GRANT, true],
      [OTHER, false],
    ]);
  });

  it('a key never reads as the calling app; keys:admin is required', async () => {
    const w = gatedWorld();
    w.answers.set('connectedApps.listForOwner', { items: [app(GRANT)] });
    const out = ok(await call(w, 'connected_apps_list', {}, principal(['keys:admin'])));
    expect((out['items'] as Array<Record<string, unknown>>)[0]?.['is_this_app']).toBe(false);
    expect(
      errorOf(await call(w, 'connected_apps_list', {}, principal(['envelopes:read']))).slug,
    ).toBe('insufficient_scope');
  });

  it('is hidden while mcpOauth is off', async () => {
    setFlags({ mcpOauth: false });
    const w = gatedWorld();
    await expect(call(w, 'connected_apps_list', {}, principal(['keys:admin']))).rejects.toThrow(
      'Tool not found',
    );
  });
});
