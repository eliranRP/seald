import { ConnectedAppsRevokeOutputSchema } from 'shared';
import { resetFlags, setFlags } from '../../__tests__/write-harness';
import {
  OWNER,
  call,
  dryRun,
  errorOf,
  gatedWorld,
  ok,
  principal,
  write,
} from '../../account/__tests__/gated-harness';

const GRANT = '77777777-7777-4777-8777-777777777777';
const CLIENT = '66666666-6666-4666-8666-666666666666';

describe('connected_apps_revoke (WP-45)', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('returns approval_pending and disconnects nothing', async () => {
    const w = gatedWorld();
    const out = ok(
      await call(w, 'connected_apps_revoke', write({ connected_app_id: GRANT }), principal()),
    );
    expect(ConnectedAppsRevokeOutputSchema.safeParse(out).success).toBe(true);
    expect(w.requests.map((r) => [r.kind, r.args])).toEqual([
      ['oauth_grant_revoke', { connected_app_id: GRANT }],
    ]);
    expect(w.actions()).toEqual([]);
  });

  it('an OAuth caller asks as its grant, never as a key', async () => {
    const w = gatedWorld();
    const p = principal(['keys:admin'], {
      keyId: GRANT,
      keyPrefix: '',
      oauth: { grantId: GRANT, clientId: CLIENT },
    });
    ok(await call(w, 'connected_apps_revoke', write({ connected_app_id: GRANT }), p));
    expect(w.requests[0]?.requester).toEqual({
      ownerId: OWNER,
      apiKeyId: null,
      oauthGrantId: GRANT,
    });
  });

  it('dry_run opens nothing; keys:admin is required', async () => {
    const w = gatedWorld();
    ok(await call(w, 'connected_apps_revoke', dryRun({ connected_app_id: GRANT })));
    expect(w.requests).toEqual([]);
    expect(
      errorOf(
        await call(
          w,
          'connected_apps_revoke',
          write({ connected_app_id: GRANT }),
          principal(['envelopes:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
