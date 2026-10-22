import { MeGetOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../leak-scan';
import { OWNER, READ_METHODS, call, errorOf, okOf, world } from './harness';

describe('me_get', () => {
  it('returns the account, the key scopes, approval mode and the daily allowance', async () => {
    const w = world();
    const out = okOf(await call(w, 'me_get', {}, ['envelopes:read', 'contacts:read']));
    expect(MeGetOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toEqual({
      id: OWNER,
      email: 'owner@example.com',
      scopes: ['envelopes:read', 'contacts:read'],
      require_owner_approval: true,
      quotas: { sends_remaining: 20, new_recipients_remaining: 25, email_copies_remaining: 50 },
    });
    expect(findTokenShapedStrings(out)).toEqual([]);
  });

  it('needs no scope beyond a valid credential', async () => {
    const w = world();
    const out = okOf(await call(w, 'me_get', {}, []));
    expect(out['scopes']).toEqual([]);
  });

  it('reports a null email when the account has none', async () => {
    const w = world();
    w.email = null;
    expect(okOf(await call(w, 'me_get', {}))['email']).toBeNull();
  });

  it('rejects an unknown field (there is no required field to miss)', async () => {
    const w = world();
    expect(errorOf(await call(w, 'me_get', { owner_id: OWNER })).slug).toBe('validation_error');
    expect(w.calls).toEqual([]);
  });

  it('only calls read methods, and never takes the owner from arguments', async () => {
    const w = world();
    await call(w, 'me_get', {});
    expect(w.calls).toEqual(['accounts.email']);
    for (const c of w.calls) expect(READ_METHODS).toContain(c);
  });
});
