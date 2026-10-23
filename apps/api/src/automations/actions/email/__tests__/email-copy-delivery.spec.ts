import { Test } from '@nestjs/testing';
import { InMemoryOutboundEmailsRepository } from '../../../../../test/in-memory-outbound-emails-repository';
import { APP_ENV } from '../../../../config/config.module';
import type { AppEnv } from '../../../../config/env.schema';
import { EmailDispatcherService } from '../../../../email/email-dispatcher.service';
import { EmailSender, type EmailMessage } from '../../../../email/email-sender';
import { OutboundEmailsRepository } from '../../../../email/outbound-emails.repository';
import { TemplateService } from '../../../../email/template.service';
import { EnvelopesRepository } from '../../../../envelopes/envelopes.repository';
import { SigningTokenService } from '../../../../signing/signing-token.service';
import { hashStopToken } from '../email-copy.config';
import { EmailCopyLinkMinter } from '../email-copy-link-minter.service';
import { EmailCopyRepository } from '../email-copy.repository';
import { apiPublicUrl } from '../email-copy.urls';
import { buildEmailCopyPayload } from '../email-copy-vars';
import { FakeEmailCopyRepo } from './fake-email-copy-repo';

const ENV = {
  NODE_ENV: 'test',
  PORT: 3000,
  APP_PUBLIC_URL: 'https://seald.nromomentum.com',
  EMAIL_FROM_ADDRESS: 'no-reply@test.seald',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Chlenov 24, Tel Aviv-Yafo 6604806, Israel',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com',
} as unknown as AppEnv;

describe('automation_copy delivery (dispatcher, template, stop link)', () => {
  let repo: FakeEmailCopyRepo;
  let outbound: InMemoryOutboundEmailsRepository;
  let dispatcher: EmailDispatcherService;
  const sent: EmailMessage[] = [];

  beforeEach(async () => {
    sent.length = 0;
    repo = new FakeEmailCopyRepo();
    outbound = new InMemoryOutboundEmailsRepository();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailDispatcherService,
        SigningTokenService,
        TemplateService,
        EmailCopyLinkMinter,
        { provide: EmailCopyRepository, useValue: repo },
        { provide: OutboundEmailsRepository, useValue: outbound },
        {
          provide: EmailSender,
          useValue: {
            send: async (m: EmailMessage) => {
              sent.push(m);
              return { providerId: 'prv' };
            },
          },
        },
        { provide: EnvelopesRepository, useValue: { findByIdWithAll: async () => null } },
        { provide: APP_ENV, useValue: ENV },
      ],
    }).compile();
    await moduleRef.init();
    dispatcher = moduleRef.get(EmailDispatcherService);
  });

  async function enqueue(recipient: string, title = 'Lease <script>x</script>'): Promise<void> {
    await outbound.insert({
      envelope_id: 'env-1',
      kind: 'automation_copy',
      to_email: recipient,
      to_name: recipient,
      dedupe_key: `automation_copy:run-1:${recipient}`,
      payload: buildEmailCopyPayload({
        automationId: 'auto-1',
        ownerId: 'owner-1',
        trigger: 'envelope_sealed',
        envelopeId: 'env-1',
        envelopeTitle: title,
        envelopeStatus: 'completed',
        shortCode: 'AB12CD34EF56G',
        signerName: null,
        senderEmail: 'owner@example.com',
        senderName: 'Olive Owner',
        recipient,
        appPublicUrl: ENV.APP_PUBLIC_URL,
      }),
    });
  }

  it('renders the notice with the footer, a working stop link and no signing link', async () => {
    await enqueue('ada@example.com');
    expect((await dispatcher.dispatchOne())?.status).toBe('sent');
    const msg = sent[0]!;
    expect(msg.subject).toBe('Seald notice for Olive Owner: "Lease <script>x</script>" was sealed');
    expect(msg.subject).not.toMatch(/[\r\n]/);
    // Escaped in HTML, verbatim in text.
    expect(msg.html).not.toContain('<script>');
    expect(msg.html).toContain('Lease &lt;script&gt;x&lt;/script&gt;');
    expect(msg.html).toContain('Seald</strong> · Chlenov 24, Tel Aviv-Yafo 6604806, Israel');
    expect(msg.html.replace(/\s+/g, ' ')).toContain('added you to a Seald automation');
    expect(msg.text).toContain('Seald · Chlenov 24');
    expect(msg.html).toContain('https://seald.nromomentum.com/verify/AB12CD34EF56G');
    expect(msg.html + msg.text).not.toMatch(/\/sign\/|download|attachment/i);
    // The recipient is not the owner: no in-app link.
    expect(msg.html + msg.text).not.toContain('/document/env-1');

    const url =
      /https:\/\/api\.seald\.nromomentum\.com\/automations\/stop\?t=([A-Za-z0-9_-]{43})/.exec(
        msg.text,
      );
    expect(url).not.toBeNull();
    const token = url![1]!;
    expect(msg.html).toContain(`automations/stop?t=${token}`);
    // Only the hash is stored, and it is bound to that owner and address.
    expect([...repo.tokens.keys()]).toEqual([hashStopToken(token)]);
    expect(repo.tokens.get(hashStopToken(token))).toMatchObject({
      ownerId: 'owner-1',
      email: 'ada@example.com',
    });
    expect(JSON.stringify([...outbound.rows])).not.toContain(token);
  });

  it('links the dashboard only when the recipient is the owner mailbox', async () => {
    await enqueue('Owner@Example.com');
    await dispatcher.dispatchOne();
    expect(sent[0]!.html).toContain('https://seald.nromomentum.com/document/env-1');
  });

  it('skips a row whose address already stopped these notices', async () => {
    repo.suppressions.add('owner-1|ada@example.com');
    await enqueue('ada@example.com');
    expect(await dispatcher.dispatchOne()).toMatchObject({
      status: 'skipped',
      error: 'recipient_stopped',
    });
    expect(sent).toHaveLength(0);
  });

  it('derives the API origin for the stop link', () => {
    expect(
      apiPublicUrl({ APP_PUBLIC_URL: 'https://seald.nromomentum.com', PORT: 3000 } as AppEnv),
    ).toBe('https://api.seald.nromomentum.com');
    expect(apiPublicUrl({ APP_PUBLIC_URL: 'http://localhost:5173', PORT: 4000 } as AppEnv)).toBe(
      'http://localhost:4000',
    );
    expect(
      apiPublicUrl({
        API_PUBLIC_URL: 'https://api.example.test/',
        APP_PUBLIC_URL: 'https://x.test',
        PORT: 1,
      } as AppEnv),
    ).toBe('https://api.example.test');
  });
});
