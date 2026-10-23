import { ApiKeysCreateOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  call,
  dryRun,
  errorOf,
  gatedWorld,
  ok,
  principal,
  write,
} from '../../account/__tests__/gated-harness';

describe('api_keys_create (WP-45)', () => {
  it('returns approval_pending, mints nothing and never carries a secret', async () => {
    const w = gatedWorld();
    const out = ok(
      await call(w, 'api_keys_create', write({ name: 'Zapier', scopes: ['envelopes:read'] })),
    );
    expect(ApiKeysCreateOutputSchema.safeParse(out).success).toBe(true);
    expect(findTokenShapedStrings(out)).toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/secret/i);
    expect(w.requests.map((r) => [r.kind, r.tool, r.args])).toEqual([
      [
        'api_key_create',
        'api_keys_create',
        { name: 'Zapier', scopes: ['envelopes:read'], expires_in_days: 90 },
      ],
    ]);
    expect(w.actions()).toEqual([]);
  });

  it('keeps an explicit expiry choice and drops duplicate scopes', async () => {
    const w = gatedWorld();
    ok(
      await call(
        w,
        'api_keys_create',
        write({ scopes: ['envelopes:read', 'envelopes:read'], expires_in_days: 30 }),
      ),
    );
    expect(w.requests[0]?.args).toEqual({ scopes: ['envelopes:read'], expires_in_days: 30 });
  });

  it('refuses a scope the calling key does not hold (the ceiling), before asking', async () => {
    const w = gatedWorld();
    for (const scopes of [['envelopes:send'], ['envelopes:read', 'account:admin']]) {
      const res = await call(w, 'api_keys_create', write({ scopes }));
      expect(errorOf(res).slug).toBe('scope_exceeds_key');
    }
    // keys:admin itself is on this key, so asking for it is within the ceiling.
    ok(await call(w, 'api_keys_create', write({ scopes: ['keys:admin'] })));
    expect(w.requests).toHaveLength(1);
    expect(w.actions()).toEqual([]);
  });

  it('an OAuth app is capped by its grant scopes', async () => {
    const w = gatedWorld();
    const grant = '77777777-7777-4777-8777-777777777777';
    const p = principal(['keys:admin', 'envelopes:read'], {
      keyId: grant,
      keyPrefix: '',
      oauth: { grantId: grant, clientId: grant },
    });
    expect(
      errorOf(await call(w, 'api_keys_create', write({ scopes: ['envelopes:send'] }), p)).slug,
    ).toBe('scope_exceeds_key');
    ok(await call(w, 'api_keys_create', write({ scopes: ['envelopes:read'] }), p));
    expect(w.requests[0]?.requester).toMatchObject({ apiKeyId: null, oauthGrantId: grant });
  });

  it('dry_run checks the ceiling and the approval without opening one', async () => {
    const w = gatedWorld();
    expect(
      errorOf(await call(w, 'api_keys_create', dryRun({ scopes: ['envelopes:send'] }))).slug,
    ).toBe('scope_exceeds_key');
    ok(await call(w, 'api_keys_create', dryRun({ scopes: ['envelopes:read'] })));
    expect(w.previews.map((p) => p.args)).toEqual([
      { scopes: ['envelopes:read'], expires_in_days: 90 },
    ]);
    expect(w.requests).toEqual([]);
  });

  it('rejects an expiry outside 30, 90, 365 and needs keys:admin', async () => {
    const w = gatedWorld();
    expect(
      errorOf(
        await call(w, 'api_keys_create', write({ scopes: ['envelopes:read'], expires_in_days: 7 })),
      ).slug,
    ).toBe('validation_error');
    expect(
      errorOf(
        await call(
          w,
          'api_keys_create',
          write({ scopes: ['envelopes:read'] }),
          principal(['envelopes:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
    expect(w.requests).toEqual([]);
  });
});
