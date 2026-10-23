import type { AgentActivityItem, AgentActivityResponse } from 'shared';

export const ACTIVITY_ENVELOPE_ID = '22222222-2222-4222-8222-222222222222';

let seq = 0;

/** One list row. Override per case; ids are unique within a test run. */
export function fakeActivity(overrides: Partial<AgentActivityItem> = {}): AgentActivityItem {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    source: 'event',
    at: '2026-10-02T12:00:00.123456Z',
    key_name: 'Key 2',
    key_prefix: 'seald_live_xxxxxxxx',
    tool: 'envelopes_send',
    outcome: 'done',
    envelope_id: ACTIVITY_ENVELOPE_ID,
    title: 'Services agreement',
    approved_by_session: true,
    ...overrides,
  };
}

export function fakePage(
  items: ReadonlyArray<AgentActivityItem>,
  nextCursor: string | null = null,
): AgentActivityResponse {
  return { items: [...items], next_cursor: nextCursor };
}

/** A realistic mix: a waiting ask, a send, a denied ask, a failed fix and a bulk batch. */
export function sampleActivity(): AgentActivityItem[] {
  return [
    fakeActivity({
      at: '2026-10-02T12:05:00.000000Z',
      source: 'approval',
      outcome: 'waiting',
      tool: 'envelopes_change_expiry',
      approved_by_session: null,
      title: 'Lease renewal',
    }),
    fakeActivity(),
    fakeActivity({
      at: '2026-10-02T11:00:00.000000Z',
      source: 'approval',
      outcome: 'denied',
      tool: 'envelopes_remind',
      approved_by_session: null,
    }),
    fakeActivity({
      at: '2026-10-02T10:30:00.000000Z',
      source: 'approval',
      outcome: 'failed',
      tool: 'envelopes_fix_signer',
      approved_by_session: null,
      title: 'NDA',
    }),
    fakeActivity({
      at: '2026-10-01T09:00:00.000000Z',
      source: 'approval',
      tool: 'envelopes_bulk_send_from_template',
      envelope_id: null,
      title: 'Lease',
      approved_by_session: false,
    }),
  ];
}
