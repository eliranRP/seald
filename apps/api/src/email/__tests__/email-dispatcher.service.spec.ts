import { Test } from '@nestjs/testing';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
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

const env: AppEnv = {
  EMAIL_FROM_ADDRESS: 'no-reply@test.seald',
  EMAIL_FROM_NAME: 'Seald Test',
  EMAIL_LEGAL_ENTITY: 'Seald, Inc.',
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
      sign_url: 'http://localhost:5173/sign/env-1?t=abc',
      verify_url: 'http://localhost:5173/verify/ABC123',
      short_code: 'ABC123',
      public_url: 'http://localhost:5173',
    },
    ...overrides,
  };
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
    expect(sender.calls[0]!.text).toContain('http://localhost:5173/sign/env-1?t=abc');

    const row = repo.rows[0]!;
    expect(row.status).toBe('sent');
    expect(row.provider_id).toBe('prv_test');
    expect(row.sent_at).toBeTruthy();
    expect(row.attempts).toBe(1);
  });

  it('injects legal-footer vars (legal_entity, legal_postal, privacy_url, preferences_url) into every render', async () => {
    await repo.insert(inviteRow());
    await dispatcher.dispatchOne();

    const html = sender.calls[0]!.html;
    expect(html).toContain('>Seald, Inc.</strong>');
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
});

describe('backoffMs', () => {
  it('is 2 minutes on first attempt, doubles each time, caps at 6h', () => {
    expect(backoffMs(1)).toBe(2 * 60 * 1000);
    expect(backoffMs(2)).toBe(4 * 60 * 1000);
    expect(backoffMs(3)).toBe(8 * 60 * 1000);
    expect(backoffMs(10)).toBe(6 * 60 * 60 * 1000); // capped
  });
});
