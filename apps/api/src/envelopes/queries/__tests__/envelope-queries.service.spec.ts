import { BadRequestException } from '@nestjs/common';
import type { EnvelopeEvent } from 'shared';
import type { OutboundEmailsRepository } from '../../../email/outbound-emails.repository';
import type { EnvelopesService } from '../../envelopes.service';
import type {
  EnvelopeQueriesRepository,
  PendingPage,
  SearchEnvelopeRow,
  SearchFilters,
  SearchPage,
} from '../envelope-queries.repository';
import { likeContains as likeContainsForTest } from '../envelope-queries.repository.pg';
import { EnvelopeQueriesService, mcpSignerStatus } from '../envelope-queries.service';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const ENV = '11111111-1111-4111-8111-111111111111';
const SIGNER = '33333333-3333-4333-8333-333333333333';

function row(id: string, updated: string): SearchEnvelopeRow {
  return {
    id,
    title: 't',
    status: 'draft',
    short_code: 'ABCDEFGHJKMNP',
    sent_at: null,
    updated_at: updated.replace(/\.\d+Z$/, '.000Z'),
    archived_at: null,
    cursor_updated_at: updated,
    signers: [],
    documents: [],
  };
}

function setup(overrides: { search?: SearchPage; pending?: PendingPage } = {}) {
  const searchCalls: SearchFilters[] = [];
  const repo = {
    search: jest.fn(async (_o: string, f: SearchFilters) => {
      searchCalls.push(f);
      return overrides.search ?? { rows: [], has_more: false };
    }),
    listPendingSigners: jest.fn(async () => overrides.pending ?? { rows: [], has_more: false }),
  } as unknown as EnvelopeQueriesRepository;
  const events: EnvelopeEvent[] = [1, 2, 3].map((n) => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    envelope_id: ENV,
    signer_id: null,
    actor_kind: 'sender',
    event_type: 'created',
    ip: null,
    user_agent: null,
    metadata: {},
    created_at: '2026-10-01T10:00:00.000Z',
  }));
  const envelopes = {
    listEvents: jest.fn(async () => events),
  } as unknown as EnvelopesService;
  const lastInvite = jest.fn();
  const outbound = { findLastInviteOrReminder: lastInvite } as unknown as OutboundEmailsRepository;
  return {
    svc: new EnvelopeQueriesService(repo, envelopes, outbound),
    repo,
    searchCalls,
    events,
    lastInvite,
  };
}

describe('EnvelopeQueriesService.search', () => {
  it('lower-cases needles, splits tags, clamps the limit to 1..50 (default 20)', async () => {
    const { svc, searchCalls } = setup();
    await svc.search(OWNER, { title: 'NDA', signer: 'Bob@X', tags: ' A, b ,', limit: 500 });
    await svc.search(OWNER, {});
    expect(searchCalls[0]).toMatchObject({
      title: 'nda',
      signer: 'bob@x',
      tags: ['a', 'b'],
      limit: 50,
    });
    expect(searchCalls[1]).toEqual({ limit: 20, cursor: null });
  });

  it('passes drive_file_name to the repository, lower-cased (WP-19 records it on import)', async () => {
    const { svc, searchCalls } = setup();
    await svc.search(OWNER, { drive_file_name: 'Q3 Contract' });
    expect(searchCalls[0]).toEqual({ drive_file_name: 'q3 contract', limit: 20, cursor: null });
  });

  it('rejects an empty date window', async () => {
    const { svc } = setup();
    await expect(
      svc.search(OWNER, { date_from: '2026-10-02T00:00:00Z', date_to: '2026-10-01T00:00:00Z' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('round-trips an opaque cursor that keeps microseconds', async () => {
    const last = row(ENV, '2026-10-01T10:00:00.123456Z');
    const { svc, searchCalls } = setup({ search: { rows: [last], has_more: true } });
    const page = await svc.search(OWNER, { limit: 1 });
    expect(page.next_cursor).toEqual(expect.any(String));
    await svc.search(OWNER, { cursor: page.next_cursor ?? '' });
    expect(searchCalls[1]?.cursor).toEqual({ updated_at: '2026-10-01T10:00:00.123456Z', id: ENV });
  });

  it('has no next_cursor on the last page', async () => {
    const { svc } = setup({
      search: { rows: [row(ENV, '2026-10-01T10:00:00.000001Z')], has_more: false },
    });
    expect((await svc.search(OWNER, {})).next_cursor).toBeNull();
  });

  it.each([
    'not-base64-json',
    Buffer.from('{"u":"x","i":"y"}').toString('base64url'),
    Buffer.from(`{"u":"2026-10-01T10:00:00Z","i":"${ENV}","s":"${SIGNER}"}`).toString('base64url'),
  ])('rejects a bad cursor %s as invalid_cursor', async (cursor) => {
    const { svc } = setup();
    await expect(svc.search(OWNER, { cursor })).rejects.toThrow('invalid_cursor');
  });
});

describe('EnvelopeQueriesService.listPendingSigners', () => {
  it('builds a three-part cursor and refuses a two-part one', async () => {
    const pendingRow = {
      envelope_id: ENV,
      title: 't',
      envelope_status: 'awaiting_others' as const,
      signer_id: SIGNER,
      name: 'n',
      email: 'e@x.test',
      sent_at: null,
      viewed_at: null,
      cursor_updated_at: '2026-10-01T10:00:00.5Z',
    };
    const { svc, repo } = setup({ pending: { rows: [pendingRow], has_more: true } });
    const page = await svc.listPendingSigners(OWNER, { limit: 1 });
    await svc.listPendingSigners(OWNER, { cursor: page.next_cursor ?? '' });
    expect(repo.listPendingSigners).toHaveBeenLastCalledWith(OWNER, {
      limit: 20,
      cursor: { updated_at: '2026-10-01T10:00:00.5Z', id: ENV, signer_id: SIGNER },
    });
    const twoPart = Buffer.from(`{"u":"2026-10-01T10:00:00Z","i":"${ENV}"}`).toString('base64url');
    await expect(svc.listPendingSigners(OWNER, { cursor: twoPart })).rejects.toThrow(
      'invalid_cursor',
    );
  });
});

describe('EnvelopeQueriesService.remindAvailableAt', () => {
  it('uses the same one-hour rule and row as remindSigner', async () => {
    const { svc, lastInvite } = setup();
    const now = new Date('2026-10-02T12:00:00.000Z');
    lastInvite.mockImplementation(async (_e: string, signer: string) =>
      signer === 'recent'
        ? { created_at: '2026-10-02T11:30:00.000Z' }
        : signer === 'old'
          ? { created_at: '2026-10-02T10:00:00.000Z' }
          : null,
    );
    const out = await svc.remindAvailableAt(ENV, ['recent', 'old', 'never'], now);
    expect([...out.entries()]).toEqual([
      ['recent', '2026-10-02T12:30:00.000Z'],
      ['old', null],
      ['never', null],
    ]);
    expect(lastInvite).toHaveBeenCalledWith(ENV, 'recent', { excludeAutomated: true });
  });
});

describe('EnvelopeQueriesService.listEvents', () => {
  it('pages after the event the cursor names, even when timestamps tie', async () => {
    const { svc, events } = setup();
    const first = await svc.listEvents(OWNER, ENV, { limit: 2 });
    expect(first.events.map((e) => e.id)).toEqual([events[0]?.id, events[1]?.id]);
    const second = await svc.listEvents(OWNER, ENV, { cursor: first.next_cursor ?? '' });
    expect(second.events.map((e) => e.id)).toEqual([events[2]?.id]);
    expect(second.next_cursor).toBeNull();
  });

  it('rejects a cursor that names no event', async () => {
    const { svc } = setup();
    const foreign = Buffer.from(`{"u":"2026-10-01T10:00:00.000Z","i":"${SIGNER}"}`).toString(
      'base64url',
    );
    await expect(svc.listEvents(OWNER, ENV, { cursor: foreign })).rejects.toThrow('invalid_cursor');
  });
});

describe('mcpSignerStatus', () => {
  const blank = { viewed_at: null, signed_at: null, declined_at: null };
  it('orders declined, signed, viewed, sent, not_sent', () => {
    const t = '2026-10-01T10:00:00.000Z';
    expect(mcpSignerStatus({ ...blank, declined_at: t, signed_at: t }, t)).toBe('declined');
    expect(mcpSignerStatus({ ...blank, signed_at: t, viewed_at: t }, t)).toBe('signed');
    expect(mcpSignerStatus({ ...blank, viewed_at: t }, t)).toBe('viewed');
    expect(mcpSignerStatus(blank, t)).toBe('sent');
    expect(mcpSignerStatus(blank, null)).toBe('not_sent');
  });
});

describe('likeContains', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(likeContainsForTest('50%_off\\')).toBe('%50\\%\\_off\\\\%');
  });
});
