import { Logger } from '@nestjs/common';
import type { AppEnv } from '../../config/env.schema';
import {
  DuplicateOutboundEmailError,
  type InsertOutboundEmailInput,
  OutboundEmailsRepository,
  type OutboundEmailRow,
} from '../../email/outbound-emails.repository';
import type { Envelope, EnvelopeEvent } from '../../envelopes/envelope.entity';
import { EnvelopesRepository, type ReminderCandidate } from '../../envelopes/envelopes.repository';
import { makeEnvelope } from '../../../test/factories';
import { makeSigner } from '../../../test/factories/signer.factory';
import { MAX_AUTOMATED_REMINDERS } from '../reminder-eligibility';
import { ReminderSchedulerService } from '../reminder-scheduler.service';

const NOW = new Date('2026-05-02T12:00:00.000Z');
const INVITED = '2026-05-01T12:00:00.000Z';

function dueEnvelope(overrides: Partial<Envelope> = {}): Envelope {
  return makeEnvelope({
    status: 'awaiting_others',
    reminders_enabled: true,
    expires_at: '2026-06-01T00:00:00.000Z',
    sender_email: 'sender@example.com',
    sender_name: 'Sender',
    signers: [makeSigner({ signed_at: null, declined_at: null, status: 'awaiting' })],
    ...overrides,
  });
}

function candidateFor(envelope: Envelope): ReminderCandidate {
  const signer = envelope.signers[0]!;
  return {
    envelopeId: envelope.id,
    signerId: signer.id,
    invitedAt: INVITED,
    lastRemindedAt: null,
  };
}

describe('ReminderSchedulerService', () => {
  const env = { APP_PUBLIC_URL: 'https://seald.example' } as AppEnv;
  let envelopes: Envelope[];
  let claimed: string[];
  let events: EnvelopeEvent[];
  let emails: InsertOutboundEmailInput[];
  let lastMailAt: string | null;
  let mailAtFor: (envelopeId: string) => string | null;
  let signUrl: string | null;
  let scheduler: ReminderSchedulerService;

  beforeEach(() => {
    envelopes = [];
    claimed = [];
    events = [];
    emails = [];
    lastMailAt = INVITED;
    mailAtFor = () => lastMailAt;
    signUrl = 'https://seald.example/sign/x?t=token';
    const repo = {
      listReminderCandidates: async (_now: Date, limit: number, offset = 0) =>
        envelopes.map(candidateFor).slice(offset, offset + limit),
      findByIdWithAll: async (id: string) => envelopes.find((e) => e.id === id) ?? null,
      tryClaimReminder: async (signerId: string) => {
        claimed.push(signerId);
        return true;
      },
      listEventsForEnvelope: async (id: string) =>
        events.filter((event) => event.envelope_id === id),
      appendEvent: async (input: { envelope_id: string; signer_id?: string | null }) => {
        const event = {
          id: `evt-${events.length + 1}`,
          envelope_id: input.envelope_id,
          signer_id: input.signer_id ?? null,
          actor_kind: 'system',
          event_type: 'reminder_sent',
          ip: null,
          user_agent: null,
          metadata: { automated: true },
          created_at: NOW.toISOString(),
        } as EnvelopeEvent;
        events.push(event);
        return event;
      },
    } as unknown as EnvelopesRepository;
    const outbound = {
      findLastInviteOrReminder: async (envelopeId: string) => {
        const at = mailAtFor(envelopeId);
        return at ? ({ created_at: at, kind: 'invite' } as OutboundEmailRow) : null;
      },
      findLatestSignUrl: async () => signUrl,
      listByEnvelope: async (envelopeId: string) =>
        emails
          .filter((row) => row.envelope_id === envelopeId)
          .map(
            (row) =>
              ({
                kind: row.kind,
                signer_id: row.signer_id ?? null,
                payload: row.payload,
              }) as OutboundEmailRow,
          ),
      insert: async (input: InsertOutboundEmailInput) => {
        if (emails.some((row) => row.dedupe_key === input.dedupe_key)) {
          throw new DuplicateOutboundEmailError();
        }
        emails.push(input);
        return { id: 'mail' } as OutboundEmailRow;
      },
    } as unknown as OutboundEmailsRepository;
    scheduler = new ReminderSchedulerService(repo, outbound, env);
  });

  it('queues a reminder with no signing token for an unsigned signer', async () => {
    envelopes = [dueEnvelope()];
    const result = await scheduler.enqueueDue(NOW, 50);
    expect(result.queued).toBe(1);
    expect(claimed).toEqual([envelopes[0]!.signers[0]!.id]);
    expect(events).toHaveLength(0);
    const payload = emails[0]?.payload ?? {};
    expect(payload).not.toHaveProperty('sign_url');
    expect(payload['automated']).toBe(true);
    expect(payload['reminder_cadence']).toContain(
      `up to ${MAX_AUTOMATED_REMINDERS} automatic daily reminders`,
    );
    expect(JSON.stringify(payload)).not.toMatch(/[?&]t=/);
    expect(payload['envelope_title']).toBe('Spec Envelope');
    expect(payload['verify_url']).toBe(`https://seald.example/verify/${envelopes[0]!.short_code}`);
    expect(emails[0]?.kind).toBe('reminder');
    expect(emails[0]?.dedupe_key).toContain(`automated_reminder:${envelopes[0]!.id}:`);
  });

  it('lists a co-signer by name and omits their email', async () => {
    const ada = makeSigner({ signed_at: null, declined_at: null, status: 'awaiting' });
    const bea = makeSigner({
      id: '00000000-0000-0000-0000-0000000000bb',
      email: 'bea@example.com',
      name: 'Bea Bee',
      signed_at: null,
      declined_at: null,
      status: 'awaiting',
    });
    envelopes = [dueEnvelope({ signers: [ada, bea] })];
    const result = await scheduler.enqueueDue(NOW, 50);
    expect(result.queued).toBe(1);
    const html = String(emails[0]?.payload['signer_list_html'] ?? '');
    expect(html).toContain('Bea Bee');
    expect(html).not.toContain('bea@example.com');
  });

  it('stops after seven automated reminders for one signer', async () => {
    envelopes = [dueEnvelope()];
    const signerId = envelopes[0]!.signers[0]!.id;
    for (let i = 0; i < MAX_AUTOMATED_REMINDERS; i += 1) {
      emails.push({
        envelope_id: envelopes[0]!.id,
        signer_id: signerId,
        kind: 'reminder',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: { automated: true },
        dedupe_key: `prior-${i}`,
      });
    }
    const result = await scheduler.enqueueDue(NOW, 50);
    expect(result.queued).toBe(0);
    expect(emails).toHaveLength(MAX_AUTOMATED_REMINDERS);
    expect(claimed).toHaveLength(0);
  });

  it('does not claim when no signing link can be resolved', async () => {
    envelopes = [dueEnvelope()];
    signUrl = null;
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const result = await scheduler.enqueueDue(NOW, 50);
    expect(result.queued).toBe(0);
    expect(claimed).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('missing_sign_url');
  });

  it('scans past signers who were skipped so they cannot fill the batch', async () => {
    const blocked = ['b1', 'b2', 'b3'].map((id) =>
      dueEnvelope({
        id,
        signers: [
          makeSigner({
            id: `${id}-signer`,
            signed_at: null,
            declined_at: null,
            status: 'awaiting',
          }),
        ],
      }),
    );
    const open = dueEnvelope({
      id: 'open',
      signers: [
        makeSigner({
          id: 'open-signer',
          signed_at: null,
          declined_at: null,
          status: 'awaiting',
        }),
      ],
    });
    envelopes = [...blocked, open];
    mailAtFor = (id) => (id === open.id ? INVITED : '2026-05-02T11:00:00.000Z');
    const result = await scheduler.enqueueDue(NOW, 2);
    expect(result.queued).toBe(1);
    expect(emails.map((row) => row.envelope_id)).toEqual(['open']);
  });

  it('does not queue when reminders are disabled', async () => {
    envelopes = [dueEnvelope({ reminders_enabled: false })];
    const result = await scheduler.enqueueDue(NOW, 50);
    expect(result.queued).toBe(0);
    expect(emails).toHaveLength(0);
    expect(claimed).toHaveLength(0);
  });

  it('does not queue for a signer who already signed', async () => {
    envelopes = [
      dueEnvelope({
        signers: [makeSigner({ signed_at: '2026-05-02T01:00:00.000Z', status: 'completed' })],
      }),
    ];
    const result = await scheduler.enqueueDue(NOW, 50);
    expect(result.queued).toBe(0);
    expect(emails).toHaveLength(0);
  });

  it('does not queue a completed envelope', async () => {
    envelopes = [dueEnvelope({ status: 'completed' })];
    const result = await scheduler.enqueueDue(NOW, 50);
    expect(result.queued).toBe(0);
  });

  it('does not queue a second reminder inside 24 hours of the last mail', async () => {
    envelopes = [dueEnvelope()];
    lastMailAt = '2026-05-02T11:00:00.000Z';
    const result = await scheduler.enqueueDue(NOW, 50);
    expect(result.queued).toBe(0);
    expect(claimed).toHaveLength(0);
  });

  it('treats a duplicate dedupe key as a skip so a twin sweep cannot spam', async () => {
    envelopes = [dueEnvelope()];
    emails.push({
      kind: 'reminder',
      to_email: 'ada@example.com',
      to_name: 'Ada',
      payload: {},
      dedupe_key: `automated_reminder:${envelopes[0]!.id}:${envelopes[0]!.signers[0]!.id}:${INVITED}`,
    });
    const result = await scheduler.enqueueDue(NOW, 50);
    expect(result.queued).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
