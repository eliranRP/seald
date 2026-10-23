import { ApiKeysListOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  KEY_ID,
  OTHER_KEY_ID,
  call,
  errorOf,
  gatedWorld,
  keyRecord,
  ok,
  principal,
} from '../../account/__tests__/gated-harness';

describe('api_keys_list (WP-45)', () => {
  it('lists keys without a secret, a hash or the seald_live_ prefix', async () => {
    const w = gatedWorld();
    w.keys.push(
      keyRecord({
        id: OTHER_KEY_ID,
        name: 'Zapier',
        prefix: 'seald_live_zzzzzzzz',
        scopes: ['envelopes:read', 'not:a-scope'],
        expiresAt: '2026-10-01T00:00:00.000Z',
      }),
    );
    const out = ok(await call(w, 'api_keys_list', {}));
    expect(ApiKeysListOutputSchema.safeParse(out).success).toBe(true);
    expect(findTokenShapedStrings(out)).toEqual([]);
    expect(JSON.stringify(out)).not.toContain('h'.repeat(64));
    const items = out['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => [i['name'], i['key_hint'], i['status'], i['is_this_key']])).toEqual([
      ['Key 1', 'abcdefgh', 'active', true],
      ['Zapier', 'zzzzzzzz', 'expired', false],
    ]);
    // An unknown scope string grants nothing and is not listed.
    expect(items[1]?.['scopes']).toEqual(['envelopes:read']);
    expect(w.calls.map((c) => c.method)).toEqual(['listForOwner']);
    expect(items[0]?.['api_key_id']).toBe(KEY_ID);
  });

  it('needs keys:admin', async () => {
    const w = gatedWorld();
    expect(errorOf(await call(w, 'api_keys_list', {}, principal(['envelopes:read']))).slug).toBe(
      'insufficient_scope',
    );
    expect(w.calls).toEqual([]);
  });
});
