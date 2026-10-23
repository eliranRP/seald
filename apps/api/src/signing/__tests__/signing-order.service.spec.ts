import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AppEnv } from '../../config/env.schema';
import {
  DuplicateOutboundEmailError,
  type InsertOutboundEmailInput,
  type OutboundEmailsRepository,
} from '../../email/outbound-emails.repository';
import type {
  Envelope,
  EnvelopesRepository,
  EventInput,
  SetSigningOrderInput,
} from '../../envelopes/envelopes.repository';
import { makeEnvelope, makeSigner } from '../../../test/factories';
import { SigningOrderService, inviteEmailPayload } from '../signing-order.service';

const OWNER = '00000000-0000-0000-0000-00000000000a';
const ENV_ID = '00000000-0000-0000-0000-0000000000e1';
const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b1';
const C = '00000000-0000-0000-0000-0000000000c1';

function draft(overrides: Partial<Envelope> = {}): Envelope {
  return makeEnvelope({
    id: ENV_ID,
    owner_id: OWNER,
    status: 'draft',
    signers: [
      makeSigner({ id: A, email: 'a@example.com', name: 'A' }),
      makeSigner({ id: B, email: 'b@example.com', name: 'B' }),
      makeSigner({ id: C, email: 'c@example.com', name: 'C' }),
    ],
    ...overrides,
  });
}

function build(envelope: Envelope | null, opts: { setResult?: Envelope | null } = {}) {
  const events: EventInput[] = [];
  const inserts: InsertOutboundEmailInput[] = [];
  const setCalls: SetSigningOrderInput[] = [];
  const keys = new Set<string>();
  const repo = {
    async findByIdForOwner(owner: string, id: string) {
      return envelope && owner === OWNER && id === envelope.id ? envelope : null;
    },
    async setSigningOrder(_id: string, input: SetSigningOrderInput) {
      setCalls.push(input);
      return opts.setResult === undefined ? envelope : opts.setResult;
    },
    async appendEvent(input: EventInput) {
      events.push(input);
      return { id: `ev-${events.length}`, ...input };
    },
    async listEventsForEnvelope() {
      return events.map((e, i) => ({ id: `ev-${i + 1}`, metadata: {}, ...e }));
    },
  } as unknown as EnvelopesRepository;
  const outbound = {
    async insert(input: InsertOutboundEmailInput) {
      if (input.dedupe_key && keys.has(input.dedupe_key)) throw new DuplicateOutboundEmailError();
      if (input.dedupe_key) keys.add(input.dedupe_key);
      inserts.push(input);
      return input;
    },
  } as unknown as OutboundEmailsRepository;
  const svc = new SigningOrderService(repo, outbound, {
    APP_PUBLIC_URL: 'https://seald.example/',
  } as AppEnv);
  return { svc, events, inserts, setCalls };
}

describe('SigningOrderService.setOrder', () => {
  it('passes the mode and every signer order through', async () => {
    const { svc, setCalls } = build(draft());
    await svc.setOrder(OWNER, ENV_ID, {
      delivery_mode: 'sequential',
      signers: [
        { signer_id: A, signing_order: 1 },
        { signer_id: B, signing_order: 1 },
        { signer_id: C, signing_order: 2 },
      ],
    });
    expect(setCalls).toEqual([
      {
        delivery_mode: 'sequential',
        orders: [
          { signer_id: A, signing_order: 1 },
          { signer_id: B, signing_order: 1 },
          { signer_id: C, signing_order: 2 },
        ],
      },
    ]);
  });

  it('accepts a mode-only change', async () => {
    const { svc, setCalls } = build(draft());
    await svc.setOrder(OWNER, ENV_ID, { delivery_mode: 'parallel' });
    expect(setCalls).toEqual([{ delivery_mode: 'parallel', orders: [] }]);
  });

  it.each([
    ['a missing signer', [A, B]],
    ['a duplicate signer', [A, B, B]],
    ['an unknown signer', [A, B, '00000000-0000-0000-0000-0000000000ff']],
  ])('rejects %s with 400 signing_order_invalid', async (_label, ids) => {
    const { svc, setCalls } = build(draft());
    await expect(
      svc.setOrder(OWNER, ENV_ID, {
        delivery_mode: 'sequential',
        signers: ids.map((id) => ({ signer_id: id, signing_order: 1 })),
      }),
    ).rejects.toEqual(new BadRequestException('signing_order_invalid'));
    expect(setCalls).toHaveLength(0);
  });

  it('404 for another owner, 409 once sent or when the write loses the race', async () => {
    await expect(
      build(draft()).svc.setOrder('someone-else', ENV_ID, { delivery_mode: 'parallel' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      build(draft({ status: 'awaiting_others' })).svc.setOrder(OWNER, ENV_ID, {
        delivery_mode: 'parallel',
      }),
    ).rejects.toEqual(new ConflictException('envelope_not_draft'));
    await expect(
      build(draft(), { setResult: null }).svc.setOrder(OWNER, ENV_ID, {
        delivery_mode: 'parallel',
      }),
    ).rejects.toEqual(new ConflictException('envelope_not_draft'));
  });
});

describe('SigningOrderService.startStep', () => {
  const sent = draft({
    status: 'awaiting_others',
    delivery_mode: 'sequential',
    sender_email: 'owner@example.com',
    sender_name: 'Owner',
  });

  it('appends one chained step_started event and one invite per step signer', async () => {
    const { svc, events, inserts } = build(sent);
    await svc.startStep(sent, { step: 2, signing_order: 5, signer_ids: [B, C] });
    expect(events).toEqual([
      {
        envelope_id: ENV_ID,
        actor_kind: 'system',
        event_type: 'step_started',
        metadata: { step: 2, signing_order: 5, signer_ids: [B, C] },
      },
    ]);
    expect(inserts.map((i) => [i.kind, i.signer_id, i.to_email, i.source_event_id])).toEqual([
      ['invite', B, 'b@example.com', 'ev-1'],
      ['invite', C, 'c@example.com', 'ev-1'],
    ]);
    // Insert A: the payload never carries a link; the dispatcher mints it.
    expect(inserts[0]?.payload).toEqual(
      inviteEmailPayload(
        sent,
        { email: 'owner@example.com', name: 'Owner' },
        'https://seald.example',
      ),
    );
    expect(JSON.stringify(inserts)).not.toMatch(/[?&]t=|sign_url/);
  });

  it('is idempotent per signer: a repeated start queues nothing new', async () => {
    const { svc, inserts } = build(sent);
    await svc.startStep(sent, { step: 2, signing_order: 2, signer_ids: [C] });
    await svc.startStep(sent, { step: 2, signing_order: 2, signer_ids: [C] });
    expect(inserts).toHaveLength(1);
  });
});

describe('SigningOrderService.resumeStep (step sweep)', () => {
  const sent = draft({
    status: 'awaiting_others',
    delivery_mode: 'sequential',
    sender_email: 'owner@example.com',
    sender_name: 'Owner',
    signers: [
      makeSigner({
        id: A,
        email: 'a@example.com',
        signing_order: 1,
        signed_at: '2026-10-22T09:00:00.000Z',
      }),
      makeSigner({ id: B, email: 'b@example.com', signing_order: 2, signed_at: null }),
      makeSigner({ id: C, email: 'c@example.com', signing_order: 2, signed_at: null }),
    ],
  });

  it('appends step_started when the chain lacks it, then queues the invites', async () => {
    const { svc, events, inserts } = build(sent);
    await svc.resumeStep(sent, 2, [B, C]);
    expect(events).toEqual([
      expect.objectContaining({
        event_type: 'step_started',
        metadata: { step: 2, signing_order: 2, signer_ids: [B, C], resumed: true },
      }),
    ]);
    expect(inserts.map((i) => [i.to_email, i.source_event_id, i.dedupe_key])).toEqual([
      ['b@example.com', 'ev-1', `invite_step:${ENV_ID}:${B}`],
      ['c@example.com', 'ev-1', `invite_step:${ENV_ID}:${C}`],
    ]);
  });

  it('reuses an existing step_started and never appends it twice', async () => {
    const { svc, events, inserts } = build(sent);
    // A submit appended the event, then failed before queuing the invites.
    await svc.startStep(sent, { step: 2, signing_order: 2, signer_ids: [] });
    await svc.resumeStep(sent, 2, [B, C]);
    await svc.resumeStep(sent, 2, [B, C]);
    expect(events.filter((e) => e.event_type === 'step_started')).toHaveLength(1);
    expect(inserts.map((i) => [i.to_email, i.source_event_id])).toEqual([
      ['b@example.com', 'ev-1'],
      ['c@example.com', 'ev-1'],
    ]);
  });
});
