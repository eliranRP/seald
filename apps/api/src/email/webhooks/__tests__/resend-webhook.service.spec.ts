import { InMemoryEnvelopesRepository } from '../../../../test/in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from '../../../../test/in-memory-outbound-emails-repository';
import { makeEnvelope, makeSigner } from '../../../../test/factories';
import type { AppEnv } from '../../../config/env.schema';
import { ResendWebhookService } from '../resend-webhook.service';

const ENV_ID = '00000000-0000-0000-0000-0000000000e1';
const ALEX = '00000000-0000-0000-0000-0000000000a1';
const HANNAH = '00000000-0000-0000-0000-0000000000a2';
const APP = { APP_PUBLIC_URL: 'https://seald.example/' } as unknown as AppEnv;

function bounce(providerId: string, type = 'Permanent', message = 'Mailbox does not exist') {
  return { type: 'email.bounced', data: { email_id: providerId, bounce: { type, message } } };
}

describe('ResendWebhookService', () => {
  let envelopes: InMemoryEnvelopesRepository;
  let outbound: InMemoryOutboundEmailsRepository;
  let service: ResendWebhookService;

  beforeEach(async () => {
    envelopes = new InMemoryEnvelopesRepository();
    outbound = new InMemoryOutboundEmailsRepository();
    envelopes.envelopes.set(
      ENV_ID,
      makeEnvelope({
        id: ENV_ID,
        title: 'NDA',
        status: 'awaiting_others',
        sender_email: 'owner@example.com',
        sender_name: 'Owner',
        signers: [
          makeSigner({ id: ALEX, email: 'alex@quil.vc', name: 'Alex', status: 'awaiting' }),
          makeSigner({ id: HANNAH, email: 'hannah@quil.vc', name: 'Hannah', status: 'awaiting' }),
        ],
      }),
    );
    service = new ResendWebhookService(outbound, envelopes, APP);
  });

  async function sentInvite(signerId: string, to: string, providerId: string): Promise<string> {
    const row = await outbound.insert({
      envelope_id: ENV_ID,
      signer_id: signerId,
      kind: 'invite',
      to_email: to,
      to_name: 'x',
      payload: {},
    });
    await outbound.markSent(row.id, providerId, new Date());
    return row.id;
  }

  it('records a hard bounce: signer flagged, event appended, sender mailed once', async () => {
    const rowId = await sentInvite(ALEX, 'alex@quil.vc', 'prv_alex');

    await expect(service.handle(bounce('prv_alex'))).resolves.toBe('bounce_recorded');

    const signer = envelopes.envelopes.get(ENV_ID)?.signers.find((s) => s.id === ALEX);
    expect(signer?.delivery_status).toBe('bounced');
    expect(signer?.status).toBe('bounced');
    const event = envelopes.events.find((e) => e.event_type === 'email_bounced');
    expect(event).toMatchObject({
      envelope_id: ENV_ID,
      signer_id: ALEX,
      actor_kind: 'system',
      metadata: {
        email: 'alex@quil.vc',
        reason: 'Mailbox does not exist',
        outbound_email_id: rowId,
      },
    });

    const mails = (await outbound.listByEnvelope(ENV_ID)).filter(
      (r) => r.kind === 'bounced_to_sender',
    );
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({
      to_email: 'owner@example.com',
      signer_id: null,
      payload: {
        signer_name: 'Alex',
        bounced_email: 'alex@quil.vc',
        bounce_reason: 'Mailbox does not exist',
        envelope_title: 'NDA',
        dashboard_url: `https://seald.example/document/${ENV_ID}`,
        public_url: 'https://seald.example',
      },
    });
  });

  it('a replayed delivery records nothing twice', async () => {
    await sentInvite(ALEX, 'alex@quil.vc', 'prv_alex');
    await service.handle(bounce('prv_alex'));
    await expect(service.handle(bounce('prv_alex'))).resolves.toBe('ignored_already_handled');
    expect(envelopes.events.filter((e) => e.event_type === 'email_bounced')).toHaveLength(1);
    expect(
      (await outbound.listByEnvelope(ENV_ID)).filter((r) => r.kind === 'bounced_to_sender'),
    ).toHaveLength(1);
  });

  it('keeps every event as provider telemetry, bounce or not', async () => {
    await service.handle({ type: 'email.delivered', data: { email_id: 'prv_1' } });
    await service.handle(bounce('prv_1', 'Transient'));
    expect(outbound.providerEvents.map((e) => [e.provider, e.event_type, e.provider_id])).toEqual([
      ['resend', 'email.delivered', 'prv_1'],
      ['resend', 'email.bounced', 'prv_1'],
    ]);
  });

  it('ignores other events and soft bounces', async () => {
    await sentInvite(ALEX, 'alex@quil.vc', 'prv_alex');
    await expect(
      service.handle({ type: 'email.delivered', data: { email_id: 'prv_alex' } }),
    ).resolves.toBe('ignored_event');
    await expect(service.handle(bounce('prv_alex', 'Transient'))).resolves.toBe(
      'ignored_soft_bounce',
    );
    expect(envelopes.envelopes.get(ENV_ID)?.signers[0]?.delivery_status).not.toBe('bounced');
  });

  it('ignores a provider id that matches no outbox row', async () => {
    await expect(service.handle(bounce('prv_unknown'))).resolves.toBe('ignored_unknown_email');
    await expect(service.handle({ type: 'email.bounced', data: {} })).resolves.toBe(
      'ignored_unknown_email',
    );
  });

  it('ignores a bounce on mail addressed to the sender', async () => {
    const row = await outbound.insert({
      envelope_id: ENV_ID,
      signer_id: null,
      kind: 'signed_to_sender',
      to_email: 'owner@example.com',
      to_name: 'Owner',
      payload: {},
    });
    await outbound.markSent(row.id, 'prv_owner', new Date());
    await expect(service.handle(bounce('prv_owner'))).resolves.toBe('ignored_not_signer_mail');
  });

  it('ignores a bounce of an address the sender already fixed', async () => {
    await sentInvite(ALEX, 'typo@quil.vc', 'prv_old');
    await expect(service.handle(bounce('prv_old'))).resolves.toBe('ignored_address_changed');
    expect(envelopes.envelopes.get(ENV_ID)?.signers[0]?.delivery_status).not.toBe('bounced');
  });

  it('ignores a signer who already signed', async () => {
    await sentInvite(ALEX, 'alex@quil.vc', 'prv_alex');
    const env = envelopes.envelopes.get(ENV_ID)!;
    envelopes.envelopes.set(ENV_ID, {
      ...env,
      signers: env.signers.map((s) =>
        s.id === ALEX ? { ...s, status: 'completed', signed_at: '2026-04-26T10:00:00.000Z' } : s,
      ),
    });
    await expect(service.handle(bounce('prv_alex'))).resolves.toBe('ignored_already_handled');
  });

  it('marks the signer but does not mail the sender once the envelope is closed', async () => {
    await sentInvite(ALEX, 'alex@quil.vc', 'prv_alex');
    const env = envelopes.envelopes.get(ENV_ID)!;
    envelopes.envelopes.set(ENV_ID, { ...env, status: 'canceled' });
    await expect(service.handle(bounce('prv_alex'))).resolves.toBe('bounce_recorded');
    expect(
      (await outbound.listByEnvelope(ENV_ID)).filter((r) => r.kind === 'bounced_to_sender'),
    ).toHaveLength(0);
  });

  it('a corrected address clears the bounce', async () => {
    await sentInvite(ALEX, 'alex@quil.vc', 'prv_alex');
    await service.handle(bounce('prv_alex'));
    const fixed = await envelopes.correctSigner(
      ENV_ID,
      ALEX,
      { email: 'alex@quill.vc' },
      new Date(),
    );
    expect(fixed?.signer.status).toBe('awaiting');
    expect(
      envelopes.envelopes.get(ENV_ID)?.signers.find((s) => s.id === ALEX)?.delivery_status,
    ).toBe('delivered');
  });
});
