import { EnvelopesListEventsOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../leak-scan';
import {
  ENVELOPE_ID,
  EVENT_1,
  EVENT_2,
  OTHER_ENVELOPE_ID,
  OTHER_OWNER,
  READ_METHODS,
  call,
  envelopeFixture,
  errorOf,
  okOf,
  world,
} from './harness';

describe('envelopes_list_events', () => {
  it('lists events without IP or user agent', async () => {
    const w = world();
    const out = okOf(await call(w, 'envelopes_list_events', { envelope_id: ENVELOPE_ID }));
    expect(EnvelopesListEventsOutputSchema.safeParse(out).success).toBe(true);
    const events = out['events'] as Array<Record<string, unknown>>;
    expect(events.map((e) => e['id'])).toEqual([EVENT_1, EVENT_2]);
    for (const e of events) {
      expect(e).not.toHaveProperty('ip');
      expect(e).not.toHaveProperty('user_agent');
    }
    expect(JSON.stringify(out)).not.toContain('203.0.113');
    expect(findTokenShapedStrings(out)).toEqual([]);
  });

  it('rejects a missing required field and an unknown field', async () => {
    const w = world();
    expect(errorOf(await call(w, 'envelopes_list_events', {})).slug).toBe('validation_error');
    expect(
      errorOf(await call(w, 'envelopes_list_events', { envelope_id: ENVELOPE_ID, since: 'x' }))
        .slug,
    ).toBe('validation_error');
  });

  it('is insufficient_scope without envelopes:read', async () => {
    const w = world();
    expect(
      errorOf(await call(w, 'envelopes_list_events', { envelope_id: ENVELOPE_ID }, [])).slug,
    ).toBe('insufficient_scope');
  });

  it("answers another owner's envelope as not found", async () => {
    const w = world();
    w.envelopes.push(envelopeFixture({ id: OTHER_ENVELOPE_ID, owner_id: OTHER_OWNER }));
    const err = errorOf(await call(w, 'envelopes_list_events', { envelope_id: OTHER_ENVELOPE_ID }));
    expect(err.slug).toBe('envelope_not_found');
  });

  it('only calls read methods', async () => {
    const w = world();
    await call(w, 'envelopes_list_events', { envelope_id: ENVELOPE_ID });
    expect(w.calls).toEqual(['queries.listEvents']);
    for (const c of w.calls) expect(READ_METHODS).toContain(c);
  });
});
