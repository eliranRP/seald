import { describe, it, expect } from 'vitest';
import { parseFilters, serializeFilters } from './parseFilters';

describe('parseFilters', () => {
  it('applies no filters when there are no params (fresh visit shows everything)', () => {
    expect(parseFilters(new URLSearchParams())).toMatchObject({
      q: '',
      status: [],
      date: { kind: 'preset', preset: 'all' },
      signer: [],
      tags: [],
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

  it('treats the legacy `?status=all` alias as "no status filter"', () => {
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

  it('parses comma-separated tags and lower-cases them', () => {
    expect(parseFilters(new URLSearchParams('tags=Urgent,Tax-2026')).tags).toEqual([
      'urgent',
      'tax-2026',
    ]);
  });

  it('returns an empty tag list when the param is empty', () => {
    expect(parseFilters(new URLSearchParams('tags=')).tags).toEqual([]);
  });

  it('leaves the status filter empty when only other params are present', () => {
    const f = parseFilters(new URLSearchParams('q=acme'));
    expect(f.status).toEqual([]);
  });
});

describe('serializeFilters', () => {
  it('emits an empty string when nothing is filtered (empty status, all-time date, no signer/tags/search)', () => {
    expect(
      serializeFilters({
        q: '',
        status: [],
        date: { kind: 'preset', preset: 'all' },
        signer: [],
        tags: [],
      }),
    ).toBe('');
  });

  it('round-trips through parseFilters when explicitly set', () => {
    const original = {
      q: 'waiver',
      status: ['draft', 'sealed'] as const,
      date: { kind: 'preset' as const, preset: '7d' as const },
      signer: ['alice@example.com'] as ReadonlyArray<string>,
      tags: ['urgent', 'tax-2026'] as ReadonlyArray<string>,
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
        tags: [],
      }),
    );
    expect(parseFilters(params).date).toEqual({
      kind: 'custom',
      range: { from: '2026-04-01', to: '2026-05-10' },
    });
  });

  it('omits the status param entirely when the status filter is empty', () => {
    const serialized = serializeFilters({
      q: 'x',
      status: [],
      date: { kind: 'preset', preset: 'all' },
      signer: [],
      tags: [],
    });
    expect(new URLSearchParams(serialized).has('status')).toBe(false);
  });
});
