import { NotFoundException } from '@nestjs/common';
import { ApiKeysRevokeOutputSchema } from 'shared';
import {
  OTHER_KEY_ID,
  call,
  dryRun,
  errorOf,
  gatedWorld,
  ok,
  principal,
  write,
} from '../../account/__tests__/gated-harness';

describe('api_keys_revoke (WP-45)', () => {
  it('returns approval_pending and revokes nothing', async () => {
    const w = gatedWorld();
    const out = ok(await call(w, 'api_keys_revoke', write({ api_key_id: OTHER_KEY_ID })));
    expect(ApiKeysRevokeOutputSchema.safeParse(out).success).toBe(true);
    expect(w.requests.map((r) => [r.kind, r.args])).toEqual([
      ['api_key_revoke', { api_key_id: OTHER_KEY_ID }],
    ]);
    expect(w.actions()).toEqual([]);
  });

  it('an unknown key is api_key_not_found from the approval checks', async () => {
    const w = gatedWorld();
    w.answers.set('approvals.request', new NotFoundException('api_key_not_found'));
    expect(
      errorOf(await call(w, 'api_keys_revoke', write({ api_key_id: OTHER_KEY_ID }))).slug,
    ).toBe('api_key_not_found');
  });

  it('dry_run opens nothing; keys:admin is required', async () => {
    const w = gatedWorld();
    ok(await call(w, 'api_keys_revoke', dryRun({ api_key_id: OTHER_KEY_ID })));
    expect(w.requests).toEqual([]);
    expect(
      errorOf(
        await call(
          w,
          'api_keys_revoke',
          write({ api_key_id: OTHER_KEY_ID }),
          principal(['account:admin']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
