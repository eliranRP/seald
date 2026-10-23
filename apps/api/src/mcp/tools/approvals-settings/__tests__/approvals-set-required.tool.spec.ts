import { ApprovalsSetRequiredOutputSchema } from 'shared';
import {
  KEY_ID,
  OTHER_KEY_ID,
  OWNER,
  call,
  dryRun,
  errorOf,
  gatedWorld,
  ok,
  principal,
  write,
} from '../../account/__tests__/gated-harness';

describe('approvals_set_required (WP-45)', () => {
  it('turning approval off always waits on the owner and changes nothing', async () => {
    const w = gatedWorld();
    const out = ok(
      await call(w, 'approvals_set_required', write({ require_owner_approval: false })),
    );
    expect(ApprovalsSetRequiredOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ status: 'approval_pending' });
    // Defaults to the calling key.
    expect(w.requests.map((r) => [r.kind, r.args])).toEqual([
      ['approval_required_toggle', { api_key_id: KEY_ID, require_owner_approval: false }],
    ]);
    expect(w.actions()).toEqual([]);
  });

  it('turning approval on applies at once, with no approval', async () => {
    const w = gatedWorld();
    const out = ok(
      await call(
        w,
        'approvals_set_required',
        write({ api_key_id: OTHER_KEY_ID, require_owner_approval: true }),
      ),
    );
    expect(out).toEqual({
      status: 'applied',
      api_key_id: OTHER_KEY_ID,
      require_owner_approval: true,
    });
    expect(w.requests).toEqual([]);
    expect(w.actions().map((c) => [c.method, c.args])).toEqual([
      ['setRequireOwnerApproval', [OWNER, OTHER_KEY_ID, true]],
    ]);
  });

  it('dry_run of off previews the approval; dry_run of on writes nothing', async () => {
    const w = gatedWorld();
    ok(await call(w, 'approvals_set_required', dryRun({ require_owner_approval: false })));
    const on = ok(
      await call(w, 'approvals_set_required', dryRun({ require_owner_approval: true })),
    );
    expect(on).toMatchObject({ dry_run: true, would: { applies_at_once: true, found: true } });
    expect(w.previews.map((p) => p.kind)).toEqual(['approval_required_toggle']);
    expect(w.requests).toEqual([]);
    expect(w.actions()).toEqual([]);
  });

  it('an OAuth app has no key of its own: api_key_id is required, and it asks as its grant', async () => {
    const w = gatedWorld();
    const p = principal(['keys:admin'], {
      keyId: OTHER_KEY_ID,
      oauth: { grantId: OTHER_KEY_ID, clientId: KEY_ID },
    });
    expect(
      errorOf(await call(w, 'approvals_set_required', write({ require_owner_approval: false }), p))
        .slug,
    ).toBe('api_key_id_required');
    ok(
      await call(
        w,
        'approvals_set_required',
        write({ api_key_id: KEY_ID, require_owner_approval: false }),
        p,
      ),
    );
    expect(w.requests[0]?.requester).toEqual({
      ownerId: OWNER,
      apiKeyId: null,
      oauthGrantId: OTHER_KEY_ID,
    });
  });

  it('needs keys:admin', async () => {
    const w = gatedWorld();
    expect(
      errorOf(
        await call(
          w,
          'approvals_set_required',
          write({ require_owner_approval: true }),
          principal(['envelopes:send']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
    expect(w.actions()).toEqual([]);
  });
});
