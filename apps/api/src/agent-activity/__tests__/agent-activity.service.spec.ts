import type { AgentActivityItem } from 'shared';
import { AgentActivityRepository, type ActivityCursor } from '../agent-activity.repository';
import {
  AgentActivityService,
  decodeActivityCursor,
  encodeActivityCursor,
} from '../agent-activity.service';

const OWNER = '00000000-0000-4000-8000-0000000000a1';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (second: number, micros = 0) =>
  `2026-10-02T12:00:${String(second).padStart(2, '0')}.${String(micros).padStart(6, '0')}Z`;

function item(n: number, source: AgentActivityItem['source'], time: string): AgentActivityItem {
  return {
    id: id(n),
    source,
    at: time,
    key_name: 'Key 2',
    key_prefix: 'seald_live_abcd',
    tool: 'envelopes_send',
    outcome: source === 'event' ? 'done' : 'waiting',
    envelope_id: null,
    title: null,
    approved_by_session: null,
  };
}

class FakeRepo extends AgentActivityRepository {
  readonly seen: Array<{ source: string; before: ActivityCursor | null; limit: number }> = [];
  constructor(
    private readonly events: AgentActivityItem[],
    private readonly approvals: AgentActivityItem[],
  ) {
    super();
  }
  private slice(list: AgentActivityItem[], before: ActivityCursor | null, limit: number) {
    return list
      .filter((i) => !before || i.at < before.at || (i.at === before.at && i.id < before.id))
      .sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1))
      .slice(0, limit);
  }
  async listEvents(_o: string, before: ActivityCursor | null, limit: number) {
    this.seen.push({ source: 'events', before, limit });
    return this.slice(this.events, before, limit);
  }
  async listApprovals(_o: string, before: ActivityCursor | null, limit: number) {
    this.seen.push({ source: 'approvals', before, limit });
    return this.slice(this.approvals, before, limit);
  }
}

describe('AgentActivityService', () => {
  const events = [item(1, 'event', at(10)), item(2, 'event', at(8)), item(3, 'event', at(5))];
  const approvals = [
    item(4, 'approval', at(9)),
    item(5, 'approval', at(5)),
    item(6, 'approval', at(1)),
  ];

  it('merges events and approvals newest first, breaking a tie on the larger id', async () => {
    const svc = new AgentActivityService(new FakeRepo(events, approvals));
    const out = await svc.list(OWNER, { limit: 50 });
    expect(out.items.map((i) => i.id)).toEqual([id(1), id(4), id(2), id(5), id(3), id(6)]);
    expect(out.next_cursor).toBeNull();
  });

  it('pages without gaps or repeats, across both sources', async () => {
    const svc = new AgentActivityService(new FakeRepo(events, approvals));
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await svc.list(OWNER, { limit: 2, ...(cursor ? { cursor } : {}) });
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((i) => i.id));
      if (!page.next_cursor) break;
      cursor = page.next_cursor;
    }
    expect(seen).toEqual([id(1), id(4), id(2), id(5), id(3), id(6)]);
  });

  it('asks each source for one more than a page and clamps the limit', async () => {
    const repo = new FakeRepo(events, approvals);
    const svc = new AgentActivityService(repo);
    await svc.list(OWNER, {});
    expect(repo.seen.map((s) => s.limit)).toEqual([21, 21]);
    await svc.list(OWNER, { limit: 500 });
    expect(repo.seen.at(-1)?.limit).toBe(51);
    await svc.list(OWNER, { limit: 0 });
    expect(repo.seen.at(-1)?.limit).toBe(2);
  });

  it('keeps microsecond order inside one millisecond', async () => {
    const a = item(7, 'event', at(3, 100));
    const b = item(8, 'approval', at(3, 900));
    const svc = new AgentActivityService(new FakeRepo([a], [b]));
    expect((await svc.list(OWNER, {})).items.map((i) => i.id)).toEqual([id(8), id(7)]);
  });

  it('round-trips a cursor and refuses a malformed one', () => {
    const c = { at: at(3, 123456), id: id(9) };
    expect(decodeActivityCursor(encodeActivityCursor(c))).toEqual(c);
    for (const bad of [
      'abc',
      Buffer.from('nope|nope').toString('base64url'),
      Buffer.from(`${at(1)}|${id(1)}|x`).toString('base64url'),
      Buffer.from(`${at(1)}`).toString('base64url'),
    ]) {
      expect(() => decodeActivityCursor(bad)).toThrow('invalid_cursor');
    }
  });
});
