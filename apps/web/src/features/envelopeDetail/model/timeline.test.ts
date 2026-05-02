import { describe, expect, it } from 'vitest';
import type {
  Envelope,
  EnvelopeEvent,
  EnvelopeEventType,
  EnvelopeSigner,
  EnvelopeStatus,
} from '@/features/envelopes';
import { eventsToTimeline } from './timeline';

function signer(overrides: Partial<EnvelopeSigner> = {}): EnvelopeSigner {
  return {
    id: 's1',
    email: 'maya@example.com',
    name: 'Maya Raskin',
    color: '#10B981',
    role: 'signatory',
    signing_order: 1,
    status: 'awaiting',
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
    ...overrides,
  };
}

function envelope(overrides: Partial<Envelope> = {}): Envelope {
  return {
    id: 'env-1',
    owner_id: 'u',
    title: 'NDA',
    short_code: 'NDA-1234',
    status: 'awaiting_others',
    original_pages: 4,
    expires_at: '2030-01-01T00:00:00Z',
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-01T00:00:00Z',
    completed_at: null,
    signers: [signer()],
    fields: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function ev(type: EnvelopeEventType, overrides: Partial<EnvelopeEvent> = {}): EnvelopeEvent {
  return {
    id: `ev-${type}`,
    envelope_id: 'env-1',
    signer_id: null,
    actor_kind: 'sender',
    event_type: type,
    ip: null,
    user_agent: null,
    metadata: {},
    created_at: '2026-04-01T12:00:00Z',
    ...overrides,
  };
}

describe('eventsToTimeline — known event types', () => {
  it('renders the canonical "created" entry from a created event', () => {
    // Use a terminal envelope so the timeline doesn't append synthetic
    // pending rows on top of our single event under test.
    const out = eventsToTimeline(envelope({ status: 'completed' }), [ev('created')]);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('created');
    expect(out[0]?.text).toMatch(/created from PDF upload/i);
    expect(out[0]?.tone).toBe('indigo');
  });

  it('singular vs plural copy for the "sent" entry follows the signer count', () => {
    const oneSigner = eventsToTimeline(envelope(), [ev('sent')]);
    expect(oneSigner[0]?.text).toBe('Sent to 1 signer');

    const twoSigners = eventsToTimeline(
      envelope({
        signers: [signer({ id: 's1' }), signer({ id: 's2', name: 'Liam' })],
      }),
      [ev('sent')],
    );
    expect(twoSigners[0]?.text).toBe('Sent to 2 signers');
  });

  it('attributes signer-bound events to the matching signer name', () => {
    const env = envelope();
    const out = eventsToTimeline(env, [ev('signed', { signer_id: 's1', actor_kind: 'signer' })]);
    expect(out[0]?.by).toBe('Maya Raskin');
    expect(out[0]?.kind).toBe('signed');
  });

  it('falls back to "System" for system-actor events with no signer link', () => {
    const out = eventsToTimeline(envelope(), [ev('sealed', { actor_kind: 'system' })]);
    expect(out[0]?.by).toBe('System');
    expect(out[0]?.tone).toBe('success');
  });

  it('falls back to "You" for sender-actor events with no signer link', () => {
    const out = eventsToTimeline(envelope(), [ev('reminder_sent', { actor_kind: 'sender' })]);
    expect(out[0]?.by).toBe('You');
    expect(out[0]?.kind).toBe('reminder');
  });

  it('renders the full known set: viewed/declined/all_signed/expired/canceled', () => {
    const types: ReadonlyArray<EnvelopeEventType> = [
      'viewed',
      'declined',
      'all_signed',
      'expired',
      'canceled',
    ];
    // Terminal envelope keeps the timeline from appending pending rows that
    // would dilute the assertion on event ordering.
    const out = eventsToTimeline(
      envelope({ status: 'completed' }),
      types.map((t) => ev(t)),
    );
    expect(out.map((e) => e.kind)).toEqual([
      'viewed',
      'declined',
      'complete',
      'expired',
      'canceled',
    ]);
  });
});

describe('eventsToTimeline — quiet & unknown events', () => {
  it('drops the documented "quiet" event types entirely (tested on a terminal envelope so no synthetic pending rows are appended)', () => {
    const quiet: ReadonlyArray<EnvelopeEventType> = [
      'tc_accepted',
      'field_filled',
      'session_invalidated_by_decline',
      'job_failed',
      'retention_deleted',
    ];
    const out = eventsToTimeline(
      envelope({ status: 'completed' }),
      quiet.map((t) => ev(t)),
    );
    expect(out).toEqual([]);
  });

  it('renders an unknown-but-not-quiet event with the raw type as its label', () => {
    const out = eventsToTimeline(envelope({ status: 'completed' }), [
      ev('session_invalidated_by_cancel'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe('session_invalidated_by_cancel');
    expect(out[0]?.tone).toBe('slate');
  });
});

describe('eventsToTimeline — synthetic pending rows', () => {
  it('appends a pending row for each unsigned signer when the envelope is awaiting_others', () => {
    const env = envelope({
      status: 'awaiting_others',
      signers: [
        signer({ id: 's1', name: 'Alice' }),
        signer({ id: 's2', name: 'Bob', signed_at: '2026-04-01T01:00:00Z', status: 'completed' }),
        signer({ id: 's3', name: 'Carol' }),
      ],
    });
    const out = eventsToTimeline(env, []);
    const pending = out.filter((e) => e.kind === 'pending');
    expect(pending).toHaveLength(2);
    expect(pending.map((p) => p.by)).toEqual(['Alice', 'Carol']);
    expect(pending.every((p) => p.pending === true)).toBe(true);
  });

  it('also appends pending rows during the sealing phase (envelope still in flight)', () => {
    const env = envelope({ status: 'sealing', signers: [signer({ id: 's1' })] });
    const out = eventsToTimeline(env, []);
    expect(out.some((e) => e.kind === 'pending')).toBe(true);
  });

  it('does NOT append pending rows on terminal envelopes — the timeline is closed', () => {
    const terminals: ReadonlyArray<EnvelopeStatus> = [
      'completed',
      'declined',
      'expired',
      'canceled',
    ];
    for (const status of terminals) {
      const env = envelope({ status, signers: [signer()] });
      const out = eventsToTimeline(env, []);
      expect(out.some((e) => e.kind === 'pending')).toBe(false);
    }
  });
});
