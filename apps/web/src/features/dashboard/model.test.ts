import { describe, expect, it } from 'vitest';
import type { EnvelopeListItem } from 'shared';
import {
  EMPTY_VIEW,
  applyView,
  formatAge,
  formatTurnaround,
  formatUpdated,
  groupByRecency,
  needsYouCards,
  rowStatus,
  statusReason,
  tabCounts,
  tabOf,
} from './model';

const NOW = new Date(2026, 3, 21, 14, 0, 0); // Tue Apr 21, 14:00 local
const ME = 'me@seald.app';

function iso(daysAgo: number, hour = 9): string {
  return new Date(2026, 3, 21 - daysAgo, hour, 0, 0).toISOString();
}

type Signer = EnvelopeListItem['signers'][number];

function signer(name: string, email: string, status: Signer['status']): Signer {
  return {
    id: `s-${email}`,
    name,
    email,
    color: '#000000',
    status,
    signed_at: status === 'completed' ? iso(1) : null,
  } as Signer;
}

function env(over: Partial<EnvelopeListItem> & { id: string }): EnvelopeListItem {
  return {
    title: over.id,
    short_code: `${over.id.toUpperCase()}-1`,
    status: 'awaiting_others',
    original_pages: 1,
    sent_at: iso(1),
    completed_at: null,
    expires_at: iso(-30),
    tags: [],
    created_at: iso(1),
    updated_at: iso(1),
    signers: [],
    ...over,
  } as EnvelopeListItem;
}

const DOCS: EnvelopeListItem[] = [
  env({
    id: 'a',
    title: 'NDA',
    updated_at: iso(0, 12),
    signers: [signer('Jonah Park', 'jp@x.co', 'completed'), signer('Me', ME, 'awaiting')],
  }),
  env({
    id: 'b',
    title: 'Advisory',
    tags: ['Client'],
    sent_at: iso(5),
    updated_at: iso(0, 9),
    signers: [signer('Me', ME, 'completed'), signer('Hannah Wills', 'hw@x.co', 'awaiting')],
  }),
  env({
    id: 'd',
    title: 'Offer',
    status: 'completed',
    completed_at: iso(7),
    sent_at: iso(8),
    updated_at: iso(7),
    signers: [signer('Meilin Chen', 'mc@x.co', 'completed')],
  }),
  env({ id: 'g', title: 'Vendor', status: 'draft', sent_at: null, updated_at: iso(13) }),
  env({
    id: 'f',
    title: 'Lease',
    status: 'declined',
    updated_at: iso(12),
    signers: [signer('Carmen Ortiz', 'co@x.co', 'declined')],
  }),
  env({ id: 'h', title: 'Photo', status: 'expired', updated_at: iso(22) }),
];

describe('rowStatus / tabOf', () => {
  it('flags documents waiting on the viewer as "you"', () => {
    expect(rowStatus(DOCS[0] as EnvelopeListItem, ME)).toBe('you');
    expect(rowStatus(DOCS[1] as EnvelopeListItem, ME)).toBe('others');
  });

  it('puts declined, expired and canceled under Stopped', () => {
    expect(tabOf('declined')).toBe('stopped');
    expect(tabOf('expired')).toBe('stopped');
    expect(tabOf('canceled')).toBe('stopped');
    expect(tabOf('sealing')).toBe('others');
  });
});

describe('tabCounts', () => {
  it('counts every tab from the full list', () => {
    expect(tabCounts(DOCS, ME)).toEqual({
      all: 6,
      you: 1,
      others: 1,
      sealed: 1,
      drafts: 1,
      stopped: 2,
      archived: 0,
    });
  });

  it('counts an archived document only under Archived', () => {
    const [first, ...rest] = DOCS;
    const items = [{ ...first!, archived_at: '2026-01-01T00:00:00.000Z' }, ...rest];
    const counts = tabCounts(items, ME);
    expect(counts.archived).toBe(1);
    expect(counts.all).toBe(5);
    expect(applyView(items, { ...EMPTY_VIEW, tab: 'archived' }, ME, NOW).map((e) => e.id)).toEqual([
      first!.id,
    ]);
    expect(applyView(items, EMPTY_VIEW, ME, NOW).map((e) => e.id)).not.toContain(first!.id);
  });
});

describe('applyView', () => {
  it('filters by tab and search together', () => {
    const view = { ...EMPTY_VIEW, tab: 'stopped' as const, query: 'lease' };
    expect(applyView(DOCS, view, ME, NOW).map((e) => e.id)).toEqual(['f']);
  });

  it('filters by tag and by date window', () => {
    expect(applyView(DOCS, { ...EMPTY_VIEW, tags: ['client'] }, ME, NOW).map((e) => e.id)).toEqual([
      'b',
    ]);
    const week = applyView(DOCS, { ...EMPTY_VIEW, date: '7d' }, ME, NOW).map((e) => e.id);
    expect(week).toEqual(['a', 'b']);
  });

  it('filters by person and sorts by title', () => {
    const view = { ...EMPTY_VIEW, people: ['hw@x.co'] };
    expect(applyView(DOCS, view, ME, NOW).map((e) => e.id)).toEqual(['b']);
    const byTitle = applyView(DOCS, { ...EMPTY_VIEW, sort: 'title' }, ME, NOW).map((e) => e.title);
    expect(byTitle[0]).toBe('Advisory');
  });
});

describe('groupByRecency', () => {
  it('groups into Today / This week / Earlier and drops empty groups', () => {
    const groups = groupByRecency(applyView(DOCS, EMPTY_VIEW, ME, NOW), NOW);
    expect(groups.map((g) => [g.label, g.items.map((e) => e.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['This week', ['d']],
      ['Earlier', ['f', 'g', 'h']],
    ]);
    expect(groupByRecency([DOCS[2] as EnvelopeListItem], NOW).map((g) => g.key)).toEqual(['week']);
  });
});

describe('needsYouCards', () => {
  it('lists documents waiting on you, declined ones, and long waits', () => {
    const cards = needsYouCards(DOCS, ME, NOW);
    expect(cards.map((c) => [c.id, c.kind])).toEqual([
      ['a', 'you'],
      ['f', 'declined'],
      ['b', 'others'],
    ]);
    expect(cards[2]?.reason).toBe('Hannah');
  });

  it('puts a bounced address first, with the signer to fix', () => {
    const bounced = env({
      id: 'z',
      updated_at: iso(0, 13),
      signers: [signer('Hannah Wills', 'hannah@farow.co', 'bounced' as Signer['status'])],
    });
    const cards = needsYouCards([...DOCS, bounced], ME, NOW);
    expect(cards[0]).toMatchObject({ kind: 'bounced', reason: 'hannah@farow.co' });
    expect(cards[0]?.signer?.id).toBe('s-hannah@farow.co');
  });
});

describe('formatting', () => {
  it('formats the Updated column', () => {
    expect(formatUpdated(iso(0, 9), NOW)).toBe('9:00');
    expect(formatUpdated(iso(1), NOW)).toBe('Mon');
    expect(formatUpdated(iso(7), NOW)).toBe('Apr 14');
    expect(formatUpdated(NOW.toISOString(), NOW)).toBe('now');
  });

  it('formats card ages', () => {
    expect(formatAge(new Date(NOW.getTime() - 2 * 3600_000).toISOString(), NOW)).toBe('2h');
    expect(formatAge(iso(5), NOW)).toBe('5d');
    expect(formatAge(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe('5m');
  });

  it('names who a document is waiting on', () => {
    const doc = DOCS[1] as EnvelopeListItem;
    expect(statusReason(doc, 'others', ME, NOW)).toBe('Hannah');
    expect(statusReason(DOCS[2] as EnvelopeListItem, 'sealed', ME, NOW)).toBe('Apr 14');
    expect(statusReason(DOCS[3] as EnvelopeListItem, 'draft', ME, NOW)).toBe('Not sent');
  });

  it('computes the median turnaround', () => {
    expect(formatTurnaround(DOCS)).toBe('1.0d');
    expect(formatTurnaround([])).toBeNull();
    const slow = env({
      id: 's',
      status: 'completed',
      sent_at: iso(4),
      completed_at: iso(2),
    });
    expect(formatTurnaround([slow])).toBe('2.0d');
  });
});
