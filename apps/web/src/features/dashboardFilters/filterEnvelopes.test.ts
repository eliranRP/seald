import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EnvelopeListItem } from 'shared';
import { filterEnvelopes, isAwaitingYou } from './filterEnvelopes';
import { ACTIONABLE_INBOX, type EnvelopeFilters } from './types';

function envelope(over: Partial<EnvelopeListItem> = {}): EnvelopeListItem {
  return {
    id: over.id ?? 'env-1',
    title: over.title ?? 'Untitled',
    short_code: over.short_code ?? 'abc12345',
    status: over.status ?? 'draft',
    original_pages: over.original_pages ?? 1,
    sent_at: over.sent_at ?? null,
    completed_at: over.completed_at ?? null,
    expires_at: over.expires_at ?? null,
    created_at: over.created_at ?? '2026-05-01T00:00:00Z',
    updated_at: over.updated_at ?? '2026-05-01T00:00:00Z',
    signers: over.signers ?? [],
  } as EnvelopeListItem;
}

const NO_FILTER: EnvelopeFilters = {
  q: '',
  status: [],
  date: { kind: 'preset', preset: 'all' },
  signer: [],
};

describe('filterEnvelopes', () => {
  it('returns the input unchanged when every filter is in the no-op state', () => {
    const list = [envelope({ id: '1' }), envelope({ id: '2' })];
    expect(filterEnvelopes(list, NO_FILTER, null)).toEqual(list);
  });

  describe('search (q)', () => {
    it('matches a substring of the document title (case-insensitive)', () => {
      const list = [
        envelope({ id: '1', title: 'Acme Master Service Agreement' }),
        envelope({ id: '2', title: 'Other doc' }),
      ];
      const out = filterEnvelopes(list, { ...NO_FILTER, q: 'acme' }, null);
      expect(out.map((e) => e.id)).toEqual(['1']);
    });

    it('matches a substring of the envelope short code', () => {
      const list = [
        envelope({ id: '1', short_code: 'm6nHh9mL7jbvx' }),
        envelope({ id: '2', short_code: 'zzzzzz' }),
      ];
      const out = filterEnvelopes(list, { ...NO_FILTER, q: '7jbvx' }, null);
      expect(out.map((e) => e.id)).toEqual(['1']);
    });
  });

  describe('status filter', () => {
    it('does not filter when status is the empty array (caller "select all")', () => {
      const list = [
        envelope({ id: '1', status: 'draft' }),
        envelope({ id: '2', status: 'completed' }),
      ];
      expect(filterEnvelopes(list, { ...NO_FILTER, status: [] }, null)).toEqual(list);
    });

    it('keeps only envelopes whose status matches one of the selected options', () => {
      const list = [
        envelope({ id: '1', status: 'draft' }),
        envelope({ id: '2', status: 'completed' }),
        envelope({ id: '3', status: 'awaiting_others' }),
      ];
      const out = filterEnvelopes(list, { ...NO_FILTER, status: ['draft', 'sealed'] }, null);
      expect(out.map((e) => e.id)).toEqual(['1', '2']);
    });

    it('honors the actionable-inbox default (mutual-exclusion with awaiting-you)', () => {
      // Envelope 1: awaiting_others, viewer is a signer who hasn't acted → awaiting_you
      // Envelope 2: awaiting_others, viewer is NOT a signer → awaiting_others
      // Envelope 3: completed → out
      const list = [
        envelope({
          id: '1',
          status: 'awaiting_others',
          signers: [
            {
              id: 's1',
              name: 'You',
              email: 'you@example.com',
              status: 'awaiting',
            },
          ] as EnvelopeListItem['signers'],
        }),
        envelope({
          id: '2',
          status: 'awaiting_others',
          signers: [
            {
              id: 's2',
              name: 'Other',
              email: 'other@example.com',
              status: 'awaiting',
            },
          ] as EnvelopeListItem['signers'],
        }),
        envelope({ id: '3', status: 'completed' }),
      ];
      const out = filterEnvelopes(
        list,
        { ...NO_FILTER, status: [...ACTIONABLE_INBOX] },
        'you@example.com',
      );
      expect(out.map((e) => e.id)).toEqual(['1', '2']);
    });
  });

  describe('date filter (binds to updated_at)', () => {
    beforeEach(() => {
      // Pin "now" to 2026-05-10T12:00:00Z for predictable preset windows.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-10T12:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('preset "today" includes today and excludes yesterday', () => {
      const list = [
        envelope({ id: 'today', updated_at: '2026-05-10T03:00:00Z' }),
        envelope({ id: 'yesterday', updated_at: '2026-05-09T23:59:00Z' }),
      ];
      const out = filterEnvelopes(
        list,
        { ...NO_FILTER, date: { kind: 'preset', preset: 'today' } },
        null,
      );
      expect(out.map((e) => e.id)).toEqual(['today']);
    });

    it('preset "7d" includes the last 7 calendar days', () => {
      const list = [
        envelope({ id: 'fresh', updated_at: '2026-05-10T00:00:00Z' }),
        envelope({ id: 'edge', updated_at: '2026-05-04T00:00:00Z' }),
        envelope({ id: 'stale', updated_at: '2026-04-30T00:00:00Z' }),
      ];
      const out = filterEnvelopes(
        list,
        { ...NO_FILTER, date: { kind: 'preset', preset: '7d' } },
        null,
      );
      expect(out.map((e) => e.id).sort()).toEqual(['edge', 'fresh']);
    });

    it('custom range is inclusive on both ends', () => {
      const list = [
        envelope({ id: 'before', updated_at: '2026-04-30T23:59:00Z' }),
        envelope({ id: 'lower', updated_at: '2026-05-01T00:00:00Z' }),
        envelope({ id: 'inside', updated_at: '2026-05-05T12:00:00Z' }),
        envelope({ id: 'upper', updated_at: '2026-05-10T23:59:00Z' }),
        envelope({ id: 'after', updated_at: '2026-05-11T00:00:00Z' }),
      ];
      const out = filterEnvelopes(
        list,
        {
          ...NO_FILTER,
          date: { kind: 'custom', range: { from: '2026-05-01', to: '2026-05-10' } },
        },
        null,
      );
      expect(out.map((e) => e.id).sort()).toEqual(['inside', 'lower', 'upper']);
    });
  });

  describe('signer filter', () => {
    it('matches envelopes whose signer email is in the selected set', () => {
      const list = [
        envelope({
          id: '1',
          signers: [
            { id: 's1', name: 'Alice', email: 'alice@example.com', status: 'awaiting' },
          ] as EnvelopeListItem['signers'],
        }),
        envelope({
          id: '2',
          signers: [
            { id: 's2', name: 'Bob', email: 'bob@example.com', status: 'awaiting' },
          ] as EnvelopeListItem['signers'],
        }),
      ];
      const out = filterEnvelopes(list, { ...NO_FILTER, signer: ['alice@example.com'] }, null);
      expect(out.map((e) => e.id)).toEqual(['1']);
    });

    it('OR-matches multiple selected signers (returns envelopes containing ANY)', () => {
      const list = [
        envelope({
          id: '1',
          signers: [
            { id: 's1', name: 'Alice', email: 'alice@example.com', status: 'awaiting' },
          ] as EnvelopeListItem['signers'],
        }),
        envelope({
          id: '2',
          signers: [
            { id: 's2', name: 'Bob', email: 'bob@example.com', status: 'awaiting' },
          ] as EnvelopeListItem['signers'],
        }),
        envelope({
          id: '3',
          signers: [
            { id: 's3', name: 'Carol', email: 'carol@example.com', status: 'awaiting' },
          ] as EnvelopeListItem['signers'],
        }),
      ];
      const out = filterEnvelopes(
        list,
        { ...NO_FILTER, signer: ['alice@example.com', 'bob@example.com'] },
        null,
      );
      expect(out.map((e) => e.id).sort()).toEqual(['1', '2']);
    });
  });

  it('AND-combines every active filter', () => {
    const list = [
      envelope({
        id: '1',
        title: 'Acme Waiver',
        status: 'draft',
        updated_at: '2026-05-10T00:00:00Z',
        signers: [
          { id: 's1', name: 'Alice', email: 'alice@example.com', status: 'awaiting' },
        ] as EnvelopeListItem['signers'],
      }),
      // Same status + signer + date — but title misses the search.
      envelope({
        id: '2',
        title: 'Other',
        status: 'draft',
        updated_at: '2026-05-10T00:00:00Z',
        signers: [
          { id: 's2', name: 'Alice', email: 'alice@example.com', status: 'awaiting' },
        ] as EnvelopeListItem['signers'],
      }),
    ];
    const out = filterEnvelopes(
      list,
      {
        q: 'acme',
        status: ['draft'],
        date: { kind: 'preset', preset: 'all' },
        signer: ['alice@example.com'],
      },
      null,
    );
    expect(out.map((e) => e.id)).toEqual(['1']);
  });
});

describe('isAwaitingYou', () => {
  it('returns false when no viewer email is supplied', () => {
    expect(
      isAwaitingYou(
        envelope({
          status: 'awaiting_others',
          signers: [
            { id: 's', name: '', email: 'you@x', status: 'awaiting' },
          ] as EnvelopeListItem['signers'],
        }),
        null,
      ),
    ).toBe(false);
  });

  it('returns true when viewer is a signer that has not yet acted', () => {
    expect(
      isAwaitingYou(
        envelope({
          status: 'awaiting_others',
          signers: [
            { id: 's', name: 'You', email: 'you@example.com', status: 'awaiting' },
          ] as EnvelopeListItem['signers'],
        }),
        'you@example.com',
      ),
    ).toBe(true);
  });

  it('returns false once the viewer has signed', () => {
    expect(
      isAwaitingYou(
        envelope({
          status: 'awaiting_others',
          signers: [
            { id: 's', name: 'You', email: 'you@example.com', status: 'completed' },
          ] as EnvelopeListItem['signers'],
        }),
        'you@example.com',
      ),
    ).toBe(false);
  });
});
