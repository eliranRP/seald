import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import type { Envelope } from '../../envelopes/envelope.entity';
import { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import { SigningTokenService } from '../../signing/signing-token.service';
import { EmailDispatcherService, backoffMs } from '../email-dispatcher.service';
import {
  EmailSendError,
  EmailSender,
  type EmailMessage,
  type EmailSendResult,
} from '../email-sender';
import {
  OutboundEmailsRepository,
  type InsertOutboundEmailInput,
} from '../outbound-emails.repository';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import { TemplateService } from '../template.service';

class FakeSender extends EmailSender {
  readonly calls: EmailMessage[] = [];
  result: EmailSendResult = { providerId: 'prv_test' };
  error: Error | null = null;

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    this.calls.push(msg);
    if (this.error) throw this.error;
    return this.result;
  }
}

function awaitingEnvelope(overrides: Partial<Envelope> = {}): Envelope {
  return {
    id: 'env-1',
    status: 'awaiting_others',
    reminders_enabled: true,
    expires_at: '2099-01-01T00:00:00.000Z',
    signers: [
      { id: 's-1', signed_at: null, declined_at: null },
      { id: 's-2', signed_at: null, declined_at: null },
      { id: 's-3', signed_at: null, declined_at: null },
    ],
    ...overrides,
  } as Envelope;
}

const appendedEvents: Array<{ event_type: string; metadata: Readonly<Record<string, unknown>> }> =
  [];
let appendEventError: Error | null = null;
/** Hashes the dispatcher stored, in order, as `signer_id -> hash`. */
const mintedHashes: Array<{ signer_id: string; hash: string }> = [];

function envelopeRepo(current: () => Envelope | null): EnvelopesRepository {
  appendedEvents.length = 0;
  appendEventError = null;
  mintedHashes.length = 0;
  return {
    findByIdWithAll: async () => current(),
    // Same guard as the PG adapter: awaiting envelope, signer still pending.
    rotateSignerAccessToken: async (signer_id: string, hash: string) => {
      const envelope = current();
      const signer = envelope?.signers.find((item) => item.id === signer_id);
      if (!envelope || envelope.status !== 'awaiting_others' || !signer) return false;
      if (signer.signed_at !== null || signer.declined_at !== null) return false;
      mintedHashes.push({ signer_id, hash });
      return true;
    },
    appendEvent: async (input: { event_type: string; metadata?: Record<string, unknown> }) => {
      if (appendEventError) throw appendEventError;
      appendedEvents.push({
        event_type: input.event_type,
        metadata: input.metadata ?? {},
      });
      return { id: 'evt-reminder' };
    },
  } as unknown as EnvelopesRepository;
}

const env: AppEnv = {
  APP_PUBLIC_URL: 'http://localhost:5173/',
  EMAIL_FROM_ADDRESS: 'no-reply@test.seald',
  EMAIL_FROM_NAME: 'Seald Test',
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Postal address available on request — write to legal@seald.test.',
  EMAIL_PRIVACY_URL: 'https://seald.test/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.test?subject=Email%20preferences',
} as unknown as AppEnv;

function inviteRow(overrides: Partial<InsertOutboundEmailInput> = {}): InsertOutboundEmailInput {
  return {
    envelope_id: 'env-1',
    signer_id: 's-1',
    kind: 'invite',
    to_email: 'maya@example.com',
    to_name: 'Maya Raskin',
    payload: {
      sender_name: 'Eliran Azulay',
      sender_email: 'eliran@seald.app',
      envelope_title: 'MSA',
      verify_url: 'http://localhost:5173/verify/ABC123',
      short_code: 'ABC123',
      public_url: 'http://localhost:5173',
    },
    ...overrides,
  };
}

const tokens = new SigningTokenService();
const SIGN_LINK = /http:\/\/localhost:5173\/sign\/env-1\?t=([A-Za-z0-9_-]{43})/;

/** The token in the signing link of a sent message. */
function tokenIn(msg: EmailMessage | undefined): string {
  const match = SIGN_LINK.exec(msg?.text ?? '');
  if (!match?.[1]) throw new Error('no signing link in message');
  return match[1];
}

describe('EmailDispatcherService', () => {
  let repo: InMemoryOutboundEmailsRepository;
  let sender: FakeSender;
  let dispatcher: EmailDispatcherService;

  beforeEach(async () => {
    repo = new InMemoryOutboundEmailsRepository();
    sender = new FakeSender();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailDispatcherService,
        TemplateService,
        { provide: OutboundEmailsRepository, useValue: repo },
        { provide: EmailSender, useValue: sender },
        { provide: EnvelopesRepository, useValue: envelopeRepo(() => awaitingEnvelope()) },
        SigningTokenService,
        { provide: APP_ENV, useValue: env },
      ],
    }).compile();
    await moduleRef.init();
    dispatcher = moduleRef.get(EmailDispatcherService);
  });

  it('returns null when the queue is empty', async () => {
    const outcome = await dispatcher.dispatchOne();
    expect(outcome).toBeNull();
    expect(sender.calls).toHaveLength(0);
  });

  it('renders the template and marks the row sent', async () => {
    await repo.insert(inviteRow());

    const outcome = await dispatcher.dispatchOne();
    expect(outcome).toMatchObject({ status: 'sent', provider_id: 'prv_test' });
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0]!.to).toEqual({ email: 'maya@example.com', name: 'Maya Raskin' });
    expect(sender.calls[0]!.from).toEqual({ email: 'no-reply@test.seald', name: 'Seald Test' });
    expect(sender.calls[0]!.subject).toContain('MSA');

    const row = repo.rows[0]!;
    expect(row.status).toBe('sent');
    expect(row.provider_id).toBe('prv_test');
    expect(row.sent_at).toBeTruthy();
    expect(row.attempts).toBe(1);
  });

  it('mints the invite token at dispatch, stores only its hash, and keeps the payload token-free', async () => {
    await repo.insert(inviteRow());

    await dispatcher.dispatchOne();

    const token = tokenIn(sender.calls[0]);
    expect(sender.calls[0]!.html).toContain(`/sign/env-1?t=${token}`);
    expect(mintedHashes).toEqual([{ signer_id: 's-1', hash: tokens.hash(token) }]);
    const stored = repo.rows[0]!;
    expect(stored.payload).not.toHaveProperty('sign_url');
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(JSON.stringify(stored)).not.toMatch(/[?&]t=/);
  });

  it('your_turn mints its own link like an invite and says who signed before', async () => {
    await repo.insert(
      inviteRow({
        kind: 'your_turn',
        payload: { ...inviteRow().payload, previous_signer_name: 'Hannah Wills' },
      }),
    );

    expect((await dispatcher.dispatchOne())?.status).toBe('sent');

    const token = tokenIn(sender.calls[0]);
    expect(sender.calls[0]!.subject).toBe('Your turn to sign "MSA"');
    expect(sender.calls[0]!.text).toContain('Hannah Wills just signed.');
    expect(mintedHashes).toEqual([{ signer_id: 's-1', hash: tokens.hash(token) }]);
    expect(sender.calls[0]!.idempotencyKey).toBe(`${repo.rows[0]!.id}:1`);
    expect(JSON.stringify(repo.rows[0])).not.toContain(token);
  });

  it('fills the card from the envelope: progress dots and doc meta, payload first', async () => {
    await repo.insert(inviteRow());

    await dispatcher.dispatchOne();

    const html = sender.calls[0]!.html;
    // awaitingEnvelope(): three signers, none signed, the recipient is s-1.
    expect(html).toContain('aria-label="0 of 3 signed"');
    expect(html.match(/width="8" height="8"/g)).toHaveLength(3);
    expect(html).toContain('bgcolor="#4F46E5"');
    expect(html).toContain('from Eliran Azulay');
  });

  it('re-mints on retry, so the link from a failed attempt is already dead', async () => {
    sender.error = new Error('network_flap');
    await repo.insert(inviteRow());
    expect((await dispatcher.dispatchOne())?.status).toBe('retry');

    sender.error = null;
    repo.rows[0] = { ...repo.rows[0]!, scheduled_for: new Date(0).toISOString() };
    expect((await dispatcher.dispatchOne())?.status).toBe('sent');

    const first = tokenIn(sender.calls[0]);
    const second = tokenIn(sender.calls[1]);
    expect(first).not.toBe(second);
    expect(mintedHashes.map((m) => m.hash)).toEqual([tokens.hash(first), tokens.hash(second)]);
    // Each attempt carries a different body, so a different provider key.
    expect(sender.calls[0]!.idempotencyKey).toBe(`${repo.rows[0]!.id}:1`);
    expect(sender.calls[1]!.idempotencyKey).toBe(`${repo.rows[0]!.id}:2`);
  });

  it('ignores a plaintext link left on a row queued before migration 0027', async () => {
    const row = await repo.insert(inviteRow());
    // Bypass the insert guard, as a pre-0027 row would.
    repo.rows[0] = { ...row, payload: { ...row.payload, sign_url: 'http://old/sign/env-1?t=old' } };

    await dispatcher.dispatchOne();

    expect(sender.calls[0]!.text).not.toContain('?t=old');
    expect(mintedHashes).toEqual([
      { signer_id: 's-1', hash: tokens.hash(tokenIn(sender.calls[0])) },
    ]);
  });

  it('refuses to store a payload that carries a signing token', async () => {
    await expect(
      repo.insert(
        inviteRow({ payload: { ...inviteRow().payload, sign_url: 'http://x/sign/env-1' } }),
      ),
    ).rejects.toThrow(/signer_token_in_outbound_payload/);
    await expect(
      repo.insert(
        inviteRow({
          payload: {
            cta: 'http://x/sign/3f0c2a9e-5b1d-4c7e-9a2b-1d2e3f4a5b6c?t=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          },
        }),
      ),
    ).rejects.toThrow(/signer_token_in_outbound_payload/);
    // User text that merely looks like a query parameter is fine.
    await expect(
      repo.insert(
        inviteRow({ payload: { ...inviteRow().payload, envelope_title: 'Lease?t=final' } }),
      ),
    ).resolves.toMatchObject({ payload: { envelope_title: 'Lease?t=final' } });
  });

  it('keeps the row id as the provider key for mails without a signing link', async () => {
    await repo.insert(
      inviteRow({
        kind: 'completed',
        signer_id: null,
        payload: { envelope_title: 'MSA', public_url: 'http://localhost:5173' },
      }),
    );
    await dispatcher.dispatchOne();
    expect(sender.calls[0]!.idempotencyKey).toBe(repo.rows[0]!.id);
    expect(mintedHashes).toHaveLength(0);
  });

  it('injects legal-footer vars (legal_entity, legal_postal, privacy_url, preferences_url) into every render', async () => {
    await repo.insert(inviteRow());
    await dispatcher.dispatchOne();

    const html = sender.calls[0]!.html;
    expect(html).toContain('>Seald</strong>');
    expect(html).toContain('Postal address available on request');
    expect(html).toContain('https://seald.test/legal/privacy');
    expect(html).toContain('mailto:privacy@seald.test?subject=Email%20preferences');
  });

  it('per-row payload overrides the global legal-footer defaults', async () => {
    await repo.insert(
      inviteRow({
        payload: {
          ...inviteRow().payload,
          legal_entity: 'Acme Corp',
          legal_postal: '1 Loop Way, Cupertino CA 95014, USA',
        },
      }),
    );
    await dispatcher.dispatchOne();

    const html = sender.calls[0]!.html;
    expect(html).toContain('>Acme Corp</strong>');
    expect(html).toContain('1 Loop Way, Cupertino CA 95014, USA');
  });

  it('retries with backoff on a transient failure (no status => transient)', async () => {
    sender.error = new Error('network_flap');
    await repo.insert(inviteRow());

    const outcome = await dispatcher.dispatchOne();
    expect(outcome?.status).toBe('retry');

    const row = repo.rows[0]!;
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toContain('network_flap');
    const scheduledFor = new Date(row.scheduled_for).getTime();
    expect(scheduledFor).toBeGreaterThan(Date.now());
  });

  it('marks the row permanently failed on a non-transient provider error', async () => {
    sender.error = new EmailSendError('resend', 400, false, 'bad_address');
    await repo.insert(inviteRow());

    const outcome = await dispatcher.dispatchOne();
    expect(outcome?.status).toBe('failed');
    const row = repo.rows[0]!;
    expect(row.status).toBe('failed');
    expect(row.last_error).toContain('bad_address');
  });

  it('gives up after max_attempts attempts even for transient failures', async () => {
    sender.error = new Error('still_failing');
    await repo.insert(inviteRow({ max_attempts: 2 }));

    const first = await dispatcher.dispatchOne();
    expect(first?.status).toBe('retry');

    // Second attempt — now attempts_so_far equals max_attempts → final.
    // Force the row back to `pending` with a scheduled_for in the past so
    // `claimNext` will pick it up again without waiting for real backoff.
    repo.rows[0] = { ...repo.rows[0]!, scheduled_for: new Date(0).toISOString() };
    const second = await dispatcher.dispatchOne();
    expect(second?.status).toBe('failed');
    expect(repo.rows[0]!.status).toBe('failed');
  });

  it('flushOnce drains multiple rows and reports a summary', async () => {
    await repo.insert(inviteRow({ signer_id: 's-1' }));
    await repo.insert(inviteRow({ signer_id: 's-2', to_email: 'ada@example.com' }));
    await repo.insert(inviteRow({ signer_id: 's-3', to_email: 'alan@example.com' }));

    const result = await dispatcher.flushOnce();
    expect(result.claimed).toBe(3);
    expect(result.sent).toBe(3);
    expect(result.failed + result.retried + result.skipped).toBe(0);
    expect(sender.calls).toHaveLength(3);
  });

  it('flushOnce leaves pending rows for other envelopes alone', async () => {
    await repo.insert(inviteRow({ envelope_id: 'env-1', signer_id: 's-1' }));
    await repo.insert(
      inviteRow({ envelope_id: 'env-other', signer_id: 's-2', to_email: 'other@example.com' }),
    );

    const result = await dispatcher.flushOnce(50, { envelopeIds: ['env-1'] });
    expect(result.claimed).toBe(1);
    expect(result.sent).toBe(1);
    expect(repo.rows.find((row) => row.envelope_id === 'env-other')?.status).toBe('pending');
    expect(sender.calls).toHaveLength(1);
  });
});

describe('EmailDispatcherService — automated reminder sign link', () => {
  let repo: InMemoryOutboundEmailsRepository;
  let sender: FakeSender;
  let dispatcher: EmailDispatcherService;
  let current: Envelope;

  beforeEach(async () => {
    repo = new InMemoryOutboundEmailsRepository();
    sender = new FakeSender();
    current = awaitingEnvelope();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailDispatcherService,
        TemplateService,
        { provide: OutboundEmailsRepository, useValue: repo },
        { provide: EmailSender, useValue: sender },
        { provide: EnvelopesRepository, useValue: envelopeRepo(() => current) },
        SigningTokenService,
        { provide: APP_ENV, useValue: env },
      ],
    }).compile();
    await moduleRef.init();
    dispatcher = moduleRef.get(EmailDispatcherService);
  });

  it('mints a fresh link for the reminder and never writes the token onto the row', async () => {
    const invite = await repo.insert(inviteRow());
    const inviteIdx = repo.rows.findIndex((row) => row.id === invite.id);
    repo.rows[inviteIdx] = { ...repo.rows[inviteIdx]!, status: 'sent' };

    const reminder = await repo.insert(
      inviteRow({
        kind: 'reminder',
        source_event_id: '00000000-0000-0000-0000-0000000000e1',
        payload: {
          sender_name: 'Eliran Azulay',
          sender_email: 'eliran@seald.app',
          envelope_title: 'MSA',
          verify_url: 'http://localhost:5173/verify/ABC123',
          short_code: 'ABC123',
          expires_at_readable: '2026-05-24 00:00 UTC',
          public_url: 'http://localhost:5173',
        },
      }),
    );

    const outcome = await dispatcher.dispatchOne();
    expect(outcome?.status).toBe('sent');
    const token = tokenIn(sender.calls[0]);
    expect(sender.calls[0]?.html).toContain(`/sign/env-1?t=${token}`);
    expect(mintedHashes).toEqual([{ signer_id: 's-1', hash: tokens.hash(token) }]);
    const stored = repo.rows.find((row) => row.id === reminder.id);
    expect(stored?.payload).not.toHaveProperty('sign_url');
    expect(JSON.stringify(stored?.payload)).not.toContain('?t=');
    expect(appendedEvents).toHaveLength(0);
  });

  it('skips an invite whose envelope was canceled before dispatch, without minting', async () => {
    await repo.insert(inviteRow());
    current = awaitingEnvelope({ status: 'canceled' });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const outcome = await dispatcher.dispatchOne();
    expect(outcome).toMatchObject({ status: 'skipped', error: 'signer_not_pending' });
    expect(sender.calls).toHaveLength(0);
    expect(mintedHashes).toHaveLength(0);
    expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      'signer_not_pending',
    );
  });

  async function queueReminder(automated = true): Promise<void> {
    const invite = await repo.insert(inviteRow());
    const inviteIdx = repo.rows.findIndex((row) => row.id === invite.id);
    repo.rows[inviteIdx] = { ...repo.rows[inviteIdx]!, status: 'sent' };
    await repo.insert(
      inviteRow({
        kind: 'reminder',
        source_event_id: '00000000-0000-0000-0000-0000000000e1',
        payload: {
          sender_name: 'Eliran Azulay',
          sender_email: 'eliran@seald.app',
          envelope_title: 'MSA',
          verify_url: 'http://localhost:5173/verify/ABC123',
          short_code: 'ABC123',
          public_url: 'http://localhost:5173',
          ...(automated ? { automated: true } : {}),
        },
      }),
    );
  }

  it('sends nothing after the signer signs', async () => {
    await queueReminder();
    current = awaitingEnvelope({
      signers: [
        { id: 's-1', signed_at: '2026-05-02T01:00:00.000Z', declined_at: null },
      ] as Envelope['signers'],
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const outcome = await dispatcher.dispatchOne();
    expect(outcome).toMatchObject({ status: 'skipped', error: 'reminder_no_longer_due' });
    expect(sender.calls).toHaveLength(0);
    expect(appendedEvents).toHaveLength(0);
    // A skipped reminder must not rotate the live link away.
    expect(mintedHashes).toHaveLength(0);
    expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      'reminder_no_longer_due',
    );
  });

  it('records reminder_sent only after an automated reminder is sent', async () => {
    await queueReminder(true);
    const outcome = await dispatcher.dispatchOne();
    expect(outcome?.status).toBe('sent');
    expect(appendedEvents).toEqual([
      { event_type: 'reminder_sent', metadata: { automated: true } },
    ]);
  });

  it('stays sent and does not resend when the reminder_sent event write throws', async () => {
    await queueReminder(true);
    appendEventError = new Error('audit_chain_broken');
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const outcome = await dispatcher.dispatchOne();

    expect(outcome?.status).toBe('sent');
    expect(sender.calls).toHaveLength(1);
    expect(repo.rows.find((row) => row.kind === 'reminder')?.status).toBe('sent');
    expect(appendedEvents).toHaveLength(0);
    expect(error.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      'reminder_sent event failed after send',
    );

    const again = await dispatcher.dispatchOne();
    expect(again).toBeNull();
    expect(sender.calls).toHaveLength(1);
  });

  it('sends nothing after automated reminders are turned off', async () => {
    await queueReminder();
    current = awaitingEnvelope({ reminders_enabled: false });
    const outcome = await dispatcher.dispatchOne();
    expect(outcome).toMatchObject({ status: 'skipped', error: 'reminder_no_longer_due' });
    expect(sender.calls).toHaveLength(0);
  });

  it('WP-05: sends nothing, and mints nothing, for a later sequential step', async () => {
    await queueReminder();
    current = awaitingEnvelope({
      delivery_mode: 'sequential',
      signers: [
        { id: 's-0', signing_order: 1, signed_at: null, declined_at: null },
        { id: 's-1', signing_order: 2, signed_at: null, declined_at: null },
      ] as Envelope['signers'],
    });
    const outcome = await dispatcher.dispatchOne();
    expect(outcome).toMatchObject({ status: 'skipped', error: 'reminder_no_longer_due' });
    expect(sender.calls).toHaveLength(0);
    expect(mintedHashes).toHaveLength(0);
  });

  it('sends no reminder to a signer whose address bounced', async () => {
    await queueReminder();
    current = awaitingEnvelope({
      signers: [
        { id: 's-1', signed_at: null, declined_at: null, delivery_status: 'bounced' },
      ] as Envelope['signers'],
    });
    const outcome = await dispatcher.dispatchOne();
    expect(outcome).toMatchObject({ status: 'skipped', error: 'reminder_no_longer_due' });
    expect(sender.calls).toHaveLength(0);
    expect(mintedHashes).toHaveLength(0);
  });

  it('sends nothing after the envelope is canceled', async () => {
    await queueReminder();
    current = awaitingEnvelope({ status: 'canceled' });
    const outcome = await dispatcher.dispatchOne();
    expect(outcome).toMatchObject({ status: 'skipped', error: 'reminder_no_longer_due' });
    expect(sender.calls).toHaveLength(0);
  });
});

describe('backoffMs', () => {
  it('is 2 minutes on first attempt, doubles each time, caps at 6h', () => {
    expect(backoffMs(1)).toBe(2 * 60 * 1000);
    expect(backoffMs(2)).toBe(4 * 60 * 1000);
    expect(backoffMs(3)).toBe(8 * 60 * 1000);
    expect(backoffMs(10)).toBe(6 * 60 * 60 * 1000); // capped
  });
});
