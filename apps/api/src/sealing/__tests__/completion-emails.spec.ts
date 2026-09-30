import type { AppEnv } from '../../config/env.schema';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import { makeEnvelope, makeEvent, makeSigner } from '../../../test/factories';
import type { EnvelopeEvent, EventInput } from '../../envelopes/envelopes.repository';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import type { StorageService } from '../../storage/storage.service';
import { NoopPadesSigner } from '../pades-signer';
import { SealingService } from '../sealing.service';

/**
 * Completion fan-out without the PDF pipeline. A `completed` envelope
 * re-enters only the email step, which is also the worker-retry path.
 */

const ENV_ID = '00000000-0000-0000-0000-0000000000c1';

function serviceFor(
  envelope: ReturnType<typeof makeEnvelope>,
  outbound: InMemoryOutboundEmailsRepository,
  events: EnvelopeEvent[],
): SealingService {
  const repo = {
    async findByIdWithAll() {
      return envelope;
    },
    async listEventsForEnvelope() {
      return events;
    },
    async appendEvent(input: EventInput) {
      const event = makeEvent({
        id: `sealed-${events.length + 1}`,
        envelope_id: input.envelope_id,
        signer_id: input.signer_id ?? null,
        actor_kind: input.actor_kind,
        event_type: input.event_type,
        metadata: input.metadata ?? {},
      });
      events.push(event);
      return event;
    },
  };
  const storage: Pick<StorageService, 'download' | 'upload'> = {
    async download() {
      throw new Error('should_not_reseal');
    },
    async upload() {
      throw new Error('should_not_reseal');
    },
  };
  return new SealingService(
    repo as unknown as EnvelopesRepository,
    storage as unknown as StorageService,
    outbound,
    new NoopPadesSigner(),
    {
      upgradeToBLt: async (bytes: Buffer) => bytes,
    } as unknown as import('../dss-injector').DssInjector,
    { APP_PUBLIC_URL: 'https://seald.example/' } as AppEnv,
  );
}

describe('SealingService completion emails', () => {
  it('emails the sender and every signer once, then ignores a worker retry', async () => {
    const envelope = makeEnvelope({
      id: ENV_ID,
      status: 'completed',
      title: 'Lease',
      short_code: 'SHORTCODE0001',
      sender_email: 'sender@example.com',
      sender_name: 'Sender',
      sealed_sha256: 'ab'.repeat(32),
      signers: [
        makeSigner({
          id: '00000000-0000-0000-0000-0000000000a1',
          name: 'Ada',
          email: 'ada@example.com',
          signed_at: '2026-04-26T10:00:00.000Z',
        }),
        makeSigner({
          id: '00000000-0000-0000-0000-0000000000a2',
          name: 'Bea',
          email: 'bea@example.com',
          signed_at: '2026-04-26T11:00:00.000Z',
        }),
      ],
    });
    const outbound = new InMemoryOutboundEmailsRepository();
    const events: EnvelopeEvent[] = [];
    const svc = serviceFor(envelope, outbound, events);

    await svc.processSealJob(ENV_ID);
    await svc.processSealJob(ENV_ID);

    const completed = outbound.rows.filter((row) => row.kind === 'completed');
    expect(completed.map((row) => row.to_email).sort()).toEqual([
      'ada@example.com',
      'bea@example.com',
      'sender@example.com',
    ]);
    expect(events.filter((event) => event.event_type === 'sealed')).toHaveLength(1);
    for (const row of completed) {
      expect(row.dedupe_key).toBe(`completed:${ENV_ID}:${row.to_email}`);
      expect(row.source_event_id).toBe(events[0]?.id);
      expect(JSON.stringify(row.payload)).not.toMatch(/\?t=/);
      expect(row.payload.verify_url).toBe('https://seald.example/verify/SHORTCODE0001');
      expect(row.payload.sealed_url).toBe('https://seald.example/verify/SHORTCODE0001#sealed');
    }
    const sender = completed.find((row) => row.to_email === 'sender@example.com');
    expect(sender?.signer_id).toBeNull();
    // The sealed line uses the sealed event's created_at (factory default),
    // not the clock at fan-out time.
    expect(String(sender?.payload.timeline_html)).toContain('Apr 25, 2026 · 10:00 AM UTC');
  });

  it('sends the sender a single completion email when they are also a signer', async () => {
    const envelope = makeEnvelope({
      id: ENV_ID,
      status: 'completed',
      sender_email: 'Sender@Example.com',
      sender_name: 'Ada',
      sealed_sha256: 'cd'.repeat(32),
      signers: [
        makeSigner({
          id: '00000000-0000-0000-0000-0000000000a1',
          name: 'Ada',
          email: 'sender@example.com',
          signed_at: '2026-04-26T10:00:00.000Z',
        }),
        makeSigner({
          id: '00000000-0000-0000-0000-0000000000a2',
          name: 'Bea',
          email: 'bea@example.com',
          signed_at: '2026-04-26T11:00:00.000Z',
        }),
      ],
    });
    const outbound = new InMemoryOutboundEmailsRepository();
    const svc = serviceFor(envelope, outbound, []);

    await svc.processSealJob(ENV_ID);

    const completed = outbound.rows.filter((row) => row.kind === 'completed');
    expect(completed.map((row) => row.to_email).sort()).toEqual([
      'bea@example.com',
      'sender@example.com',
    ]);
    expect(
      completed.filter((row) => row.to_email.toLowerCase() === 'sender@example.com'),
    ).toHaveLength(1);
  });
});
