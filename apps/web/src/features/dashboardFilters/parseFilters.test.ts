import { describe, it, expect } from 'vitest';
import { parseFilters, serializeFilters } from './parseFilters';
import { ACTIONABLE_INBOX } from './types';

describe('parseFilters', () => {
  it('returns the actionable-inbox default when there are no params', () => {
    expect(parseFilters(new URLSearchParams())).toMatchObject({
      q: '',
      status: ACTIONABLE_INBOX,
      date: { kind: 'preset', preset: 'all' },
      signer: [],
    });
  });

  it('lower-cases the search string and respects URL encoding', () => {
    const f = parseFilters(new URLSearchParams('q=Acme%20Waiver'));
    expect(f.q).toBe('acme waiver');
  });

  it('parses comma-separated status values and ignores unknown tokens', () => {
    const f = parseFilters(new URLSearchParams('status=draft,sealed,bogus'));
    expect(f.status).toEqual(['draft', 'sealed']);
  });

  it('honors the `status=all` sentinel as "no status filter"', () => {
    const f = parseFilters(new URLSearchParams('status=all'));
    expect(f.status).toEqual([]);
  });

  it('parses preset date filters', () => {
    expect(parseFilters(new URLSearchParams('date=7d')).date).toEqual({
      kind: 'preset',
      preset: '7d',
    });
  });

  it('parses custom date ranges with from:to', () => {
    const f = parseFilters(new URLSearchParams('date=custom:2026-04-01:2026-05-10'));
    expect(f.date).toEqual({
      kind: 'custom',
      range: { from: '2026-04-01', to: '2026-05-10' },
    });
  });

  it('ignores malformed custom date ranges (falls back to all-time)', () => {
    expect(parseFilters(new URLSearchParams('date=custom:nope')).date).toEqual({
      kind: 'preset',
      preset: 'all',
    });
  });

  it('ignores unknown date preset tokens', () => {
    expect(parseFilters(new URLSearchParams('date=garbage')).date).toEqual({
      kind: 'preset',
      preset: 'all',
    });
  });

  it('parses comma-separated signer emails and lower-cases them', () => {
    expect(parseFilters(new URLSearchParams('signer=Alice@Example.com,Bob@x.com')).signer).toEqual([
      'alice@example.com',
      'bob@x.com',
    ]);
  });

  it('returns an empty signer list when the param is empty', () => {
    expect(parseFilters(new URLSearchParams('signer=')).signer).toEqual([]);
  });

  it('does NOT apply the actionable-inbox default once any other param is present', () => {
    // User searched but didn't touch status — they want to search across
    // every envelope, not just the actionable subset.
    const f = parseFilters(new URLSearchParams('q=acme'));
    expect(f.status).toEqual([]);
  });
});

describe('serializeFilters', () => {
  it('emits an empty string when filters match the no-op state (no q, status=all, date=all, no signer)', () => {
    expect(
      serializeFilters({
        q: '',
        status: [],
        date: { kind: 'preset', preset: 'all' },
        signer: [],
      }),
    ).toBe('');
  });

  it('round-trips through parseFilters when explicitly set', () => {
    const original = {
      q: 'waiver',
      status: ['draft', 'sealed'] as const,
      date: { kind: 'preset' as const, preset: '7d' as const },
      signer: ['alice@example.com'] as ReadonlyArray<string>,
    };
    const serialized = serializeFilters(original);
    const params = new URLSearchParams(serialized);
    const parsed = parseFilters(params);
    expect(parsed).toMatchObject(original);
  });

  it('round-trips a custom date range', () => {
    const params = new URLSearchParams(
      serializeFilters({
        q: '',
        status: [],
        date: { kind: 'custom', range: { from: '2026-04-01', to: '2026-05-10' } },
        signer: [],
      }),
    );
    expect(parseFilters(params).date).toEqual({
      kind: 'custom',
      range: { from: '2026-04-01', to: '2026-05-10' },
    });
  });

  it('uses the all-status sentinel when the user has explicitly opted into "everything"', () => {
    // Distinguishes "user cleared the chip" from "first visit". Without
    // the sentinel, both would be empty status arrays — and the next
    // page load would re-apply the actionable-inbox default.
    const serialized = serializeFilters({
      q: '',
      status: [],
      date: { kind: 'preset', preset: 'all' },
      signer: [],
      // The sentinel is signaled by an opt-in flag at the call site —
      // see the toolbar test for the integration assertion.
      explicitAllStatus: true,
    });
    expect(new URLSearchParams(serialized).get('status')).toBe('all');
  });
});
