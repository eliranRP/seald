import { canonicalJson, eventHash, type CanonicalEventInput } from '../event-hash';

const fixture = (over: Partial<CanonicalEventInput> = {}): CanonicalEventInput => ({
  id: '11111111-1111-1111-1111-111111111111',
  envelope_id: '22222222-2222-2222-2222-222222222222',
  signer_id: null,
  actor_kind: 'system',
  event_type: 'created',
  ip: null,
  user_agent: null,
  metadata: {},
  created_at: '2026-04-29T00:00:00.000Z',
  ...over,
});

describe('canonicalJson', () => {
  it('emits keys in the fixed top-level order regardless of input order', () => {
    const a = canonicalJson(fixture({ ip: '1.2.3.4', user_agent: 'UA' }));
    const b = canonicalJson(fixture({ user_agent: 'UA', ip: '1.2.3.4' }));
    expect(a).toBe(b);
    // The fixed order is: id, envelope_id, signer_id, actor_kind,
    // event_type, ip, user_agent, metadata, created_at — verify by checking
    // that `id` precedes `envelope_id` in the output string.
    expect(a.indexOf('"id"')).toBeLessThan(a.indexOf('"envelope_id"'));
    expect(a.indexOf('"envelope_id"')).toBeLessThan(a.indexOf('"signer_id"'));
    expect(a.indexOf('"event_type"')).toBeLessThan(a.indexOf('"ip"'));
  });

  it('sorts metadata keys recursively', () => {
    const a = canonicalJson(fixture({ metadata: { b: 1, a: 2, c: { y: 1, x: 2 } } }));
    const b = canonicalJson(fixture({ metadata: { c: { x: 2, y: 1 }, a: 2, b: 1 } }));
    expect(a).toBe(b);
  });

  it('does not sort array elements', () => {
    const a = canonicalJson(fixture({ metadata: { arr: [3, 1, 2] } }));
    expect(a).toContain('"arr":[3,1,2]');
  });
});

describe('eventHash', () => {
  it('returns a 32-byte SHA-256 digest', () => {
    const h = eventHash(fixture());
    expect(h).toHaveLength(32);
  });

  it('changes when any hashed field changes', () => {
    const base = eventHash(fixture());
    expect(eventHash(fixture({ id: '99999999-9999-9999-9999-999999999999' }))).not.toEqual(base);
    expect(eventHash(fixture({ event_type: 'sent' }))).not.toEqual(base);
    expect(eventHash(fixture({ ip: '8.8.8.8' }))).not.toEqual(base);
    expect(eventHash(fixture({ metadata: { foo: 'bar' } }))).not.toEqual(base);
    expect(eventHash(fixture({ created_at: '2026-04-29T00:00:00.001Z' }))).not.toEqual(base);
  });

  it('is stable across equivalent metadata orderings', () => {
    const a = eventHash(fixture({ metadata: { a: 1, b: 2 } }));
    const b = eventHash(fixture({ metadata: { b: 2, a: 1 } }));
    expect(a.equals(b)).toBe(true);
  });
});
