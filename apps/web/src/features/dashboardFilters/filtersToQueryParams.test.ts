import { describe, expect, it } from 'vitest';
import { filtersToQueryParams } from './filtersToQueryParams';
import type { EnvelopeFilters } from './types';

const NO_FILTER: EnvelopeFilters = {
  q: '',
  status: [],
  date: { kind: 'preset', preset: 'all' },
  signer: [],
  tags: [],
};

describe('filtersToQueryParams', () => {
  it('emits an empty object when nothing is filtered', () => {
    expect(filtersToQueryParams(NO_FILTER)).toEqual({});
  });

  it('passes the search string through as `q`', () => {
    expect(filtersToQueryParams({ ...NO_FILTER, q: 'acme' })).toEqual({ q: 'acme' });
  });

  it('maps the status options straight to `bucket` (same vocabulary)', () => {
    expect(filtersToQueryParams({ ...NO_FILTER, status: ['draft', 'awaiting_you'] })).toEqual({
      bucket: ['draft', 'awaiting_you'],
    });
  });

  it('serializes a preset date filter to the preset keyword', () => {
    expect(filtersToQueryParams({ ...NO_FILTER, date: { kind: 'preset', preset: '7d' } })).toEqual({
      date: '7d',
    });
  });

  it('omits the date when the preset is `all`', () => {
    expect(filtersToQueryParams({ ...NO_FILTER, date: { kind: 'preset', preset: 'all' } })).toEqual(
      {},
    );
  });

  it('serializes a custom date range to `custom:from:to`', () => {
    expect(
      filtersToQueryParams({
        ...NO_FILTER,
        date: { kind: 'custom', range: { from: '2026-04-01', to: '2026-05-10' } },
      }),
    ).toEqual({ date: 'custom:2026-04-01:2026-05-10' });
  });

  it('passes signer + tag selections through', () => {
    expect(
      filtersToQueryParams({
        ...NO_FILTER,
        signer: ['alice@example.com'],
        tags: ['urgent', 'tax-2026'],
      }),
    ).toEqual({ signer: ['alice@example.com'], tags: ['urgent', 'tax-2026'] });
  });

  it('combines several active filters', () => {
    expect(
      filtersToQueryParams({
        q: 'nda',
        status: ['sealed'],
        date: { kind: 'preset', preset: '30d' },
        signer: ['bob@x.test'],
        tags: ['legal'],
      }),
    ).toEqual({
      q: 'nda',
      bucket: ['sealed'],
      date: '30d',
      signer: ['bob@x.test'],
      tags: ['legal'],
    });
  });
});
