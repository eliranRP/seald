import { Test } from '@nestjs/testing';
import type { FeatureFlag } from 'shared';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import type { Envelope } from '../../envelopes/envelope.entity';
import { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import { SigningTokenService } from '../../signing/signing-token.service';
import { EmailDispatcherService } from '../email-dispatcher.service';
import { EmailSender, type EmailMessage } from '../email-sender';
import { OutboundEmailsRepository } from '../outbound-emails.repository';
import { TemplateService } from '../template.service';

/**
 * WP-38: the dispatcher resolves a locale per row and hands it to the
 * template service. English is the only supported locale today, so these
 * tests pin the plumbing: when the lookup happens and what is passed.
 */

function setFlag(flag: FeatureFlag, on: boolean | undefined): void {
  const host = globalThis as unknown as {
    __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>>;
  };
  const next = { ...host.__SEALD_FEATURE_OVERRIDES__ };
  if (on === undefined) delete next[flag];
  else next[flag] = on;
  host.__SEALD_FEATURE_OVERRIDES__ = next;
}

const env = {
  APP_PUBLIC_URL: 'http://localhost:5173/',
  EMAIL_FROM_ADDRESS: 'no-reply@test.seald',
  EMAIL_FROM_NAME: 'Seald Test',
} as unknown as AppEnv;

describe('EmailDispatcherService locale (WP-38)', () => {
  const lookups: string[] = [];
  const renderLocales: string[] = [];
  let repo: InMemoryOutboundEmailsRepository;
  let dispatcher: EmailDispatcherService;

  beforeEach(async () => {
    lookups.length = 0;
    renderLocales.length = 0;
    repo = new InMemoryOutboundEmailsRepository();
    const envelopes = {
      findByIdWithAll: async (id: string) => {
        lookups.push(id);
        return {
          id,
          locale: 'en',
          signers: [{ id: 's-1', locale: 'en' }],
        } as unknown as Envelope;
      },
    } as unknown as EnvelopesRepository;
    const templates = {
      render: (_kind: string, _vars: unknown, locale?: string) => {
        renderLocales.push(locale ?? '(default)');
        return { html: '<p>x</p>', text: 'x', subject: 's' };
      },
    } as unknown as TemplateService;
    const sender = {
      send: async (_msg: EmailMessage) => ({ providerId: 'prv' }),
    } as unknown as EmailSender;
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailDispatcherService,
        SigningTokenService,
        { provide: TemplateService, useValue: templates },
        { provide: OutboundEmailsRepository, useValue: repo },
        { provide: EmailSender, useValue: sender },
        { provide: EnvelopesRepository, useValue: envelopes },
        { provide: APP_ENV, useValue: env },
      ],
    }).compile();
    await moduleRef.init();
    dispatcher = moduleRef.get(EmailDispatcherService);
  });

  afterEach(() => setFlag('i18n', undefined));

  const senderRow = {
    envelope_id: 'env-1',
    signer_id: 's-1',
    kind: 'signed_to_sender' as const,
    to_email: 'owner@example.com',
    to_name: 'Owner',
    payload: { envelope_title: 'MSA' },
  };

  it('flag off: renders in en without reading the envelope', async () => {
    setFlag('i18n', false);
    await repo.insert(senderRow);
    expect((await dispatcher.dispatchOne())?.status).toBe('sent');
    expect(renderLocales).toEqual(['en']);
    expect(lookups).toEqual([]);
  });

  it('flag on: sender-facing mail resolves from the envelope', async () => {
    setFlag('i18n', true);
    await repo.insert(senderRow);
    expect((await dispatcher.dispatchOne())?.status).toBe('sent');
    expect(renderLocales).toEqual(['en']);
    expect(lookups).toEqual(['env-1']);
  });

  it('flag on: mail with no envelope falls back to en', async () => {
    setFlag('i18n', true);
    await repo.insert({
      ...senderRow,
      envelope_id: null,
      signer_id: null,
      kind: 'api_key_created',
    });
    expect((await dispatcher.dispatchOne())?.status).toBe('sent');
    expect(renderLocales).toEqual(['en']);
    expect(lookups).toEqual([]);
  });
});
