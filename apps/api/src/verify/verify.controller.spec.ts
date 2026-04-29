import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VerifyController } from './verify.controller';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { StorageService } from '../storage/storage.service';
import type { Envelope, EnvelopeEvent } from '../envelopes/envelope.entity';

/**
 * Unit-level coverage of the public verify surface. We assert:
 *  1. The route is *not* guarded — `Reflect.getMetadata` shows no
 *     `__guards__` on either the controller class or the handler.
 *  2. A happy path returns the envelope + signers + redacted events +
 *     pre-signed URLs (sealed envelope).
 *  3. An unknown short_code raises 404.
 *  4. The redaction strips `ip`, `user_agent`, `envelope_id`, and `metadata`
 *     so we never leak PII into the public response.
 *
 * We deliberately do NOT spin up a Nest HTTP server here; that's covered
 * by `apps/api/test/verify.e2e-spec.ts`. Pure controller-level tests are
 * faster and let us assert the no-auth contract via metadata.
 */

const ENVELOPE: Envelope = {
  id: '00000000-0000-0000-0000-000000000001',
  owner_id: '00000000-0000-0000-0000-0000000000aa',
  title: 'Sealed waiver',
  short_code: 'u82ZmvdxwG3CU',
  status: 'completed',
  delivery_mode: 'parallel',
  original_pages: 4,
  original_sha256: 'a'.repeat(64),
  sealed_sha256: 'b'.repeat(64),
  sender_email: 'sender@example.com',
  sender_name: 'Sender Display',
  sent_at: '2026-04-25T20:00:00.000Z',
  completed_at: '2026-04-25T21:21:08.000Z',
  expires_at: '2026-05-25T21:20:50.000Z',
  tc_version: '1',
  privacy_version: '1',
  signers: [
    {
      id: '00000000-0000-0000-0000-0000000000s1',
      email: 'ops@nromomentum.com',
      name: 'Ops Ops',
      color: '#4F46E5',
      role: 'signatory',
      signing_order: 1,
      status: 'completed',
      viewed_at: '2026-04-25T20:30:00.000Z',
      tc_accepted_at: '2026-04-25T20:31:00.000Z',
      signed_at: '2026-04-25T21:00:00.000Z',
      declined_at: null,
    },
  ],
  fields: [],
  created_at: '2026-04-25T19:59:00.000Z',
  updated_at: '2026-04-25T21:21:08.000Z',
};

const EVENT_RAW: EnvelopeEvent = {
  id: '00000000-0000-0000-0000-0000000000e1',
  envelope_id: ENVELOPE.id,
  signer_id: null,
  actor_kind: 'sender',
  event_type: 'created',
  ip: '203.0.113.7', // PII — must be redacted
  user_agent: 'Mozilla/5.0 (secret browser)', // PII — must be redacted
  metadata: { secret: 'do_not_leak' },
  created_at: '2026-04-25T19:59:00.000Z',
};

describe('VerifyController', () => {
  let controller: VerifyController;
  const repo = {
    findByShortCode: jest.fn(),
    listEventsForEnvelope: jest.fn(),
    verifyEventChain: jest.fn(),
  };
  const storage = {
    createSignedUrl: jest.fn(),
    exists: jest.fn(),
  };

  beforeEach(async () => {
    repo.findByShortCode.mockReset();
    repo.listEventsForEnvelope.mockReset();
    repo.verifyEventChain.mockReset();
    repo.verifyEventChain.mockResolvedValue({ chain_intact: true });
    storage.createSignedUrl.mockReset();
    storage.exists.mockReset();

    const moduleRef = await Test.createTestingModule({
      controllers: [VerifyController],
      providers: [
        { provide: EnvelopesRepository, useValue: repo },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    controller = moduleRef.get(VerifyController);
  });

  it('has no auth guard metadata on the controller (public route)', () => {
    const guards =
      (Reflect.getMetadata('__guards__', VerifyController) as unknown) ??
      (Reflect.getMetadata('__guards__', VerifyController.prototype.verify) as unknown);
    // Either undefined or an empty array — either is fine. The contract is
    // "no AuthGuard mounted here", which is what blocks the test from
    // breaking if anyone bolts auth onto the verify surface in the future.
    if (guards) {
      expect(Array.isArray(guards) ? guards.length : 0).toBe(0);
    }
  });

  it('returns the envelope + signers + redacted events + signed URLs on success', async () => {
    repo.findByShortCode.mockResolvedValueOnce(ENVELOPE);
    repo.listEventsForEnvelope.mockResolvedValueOnce([EVENT_RAW]);
    storage.createSignedUrl
      .mockResolvedValueOnce('https://signed.example/sealed.pdf')
      .mockResolvedValueOnce('https://signed.example/audit.pdf');

    const res = await controller.verify('u82ZmvdxwG3CU');

    expect(repo.findByShortCode).toHaveBeenCalledWith('u82ZmvdxwG3CU');
    expect(res.envelope.id).toBe(ENVELOPE.id);
    expect(res.envelope.title).toBe('Sealed waiver');
    expect(res.envelope.original_sha256).toBe('a'.repeat(64));
    expect(res.envelope.sealed_sha256).toBe('b'.repeat(64));
    expect(res.signers).toHaveLength(1);
    expect(res.signers[0]?.name).toBe('Ops Ops');
    expect(res.events).toHaveLength(1);

    // Redaction: no ip, user_agent, envelope_id, or metadata in the
    // serialized event.
    const ev = res.events[0]!;
    expect(Object.keys(ev).sort()).toEqual(
      ['actor_kind', 'created_at', 'event_type', 'id', 'signer_id'].sort(),
    );
    expect((ev as { readonly ip?: unknown }).ip).toBeUndefined();
    expect((ev as { readonly user_agent?: unknown }).user_agent).toBeUndefined();
    expect((ev as { readonly metadata?: unknown }).metadata).toBeUndefined();

    expect(res.sealed_url).toBe('https://signed.example/sealed.pdf');
    expect(res.audit_url).toBe('https://signed.example/audit.pdf');
    expect(res.chain_intact).toBe(true);
  });

  it('surfaces chain_intact=false when the audit-event chain is broken', async () => {
    repo.findByShortCode.mockResolvedValueOnce(ENVELOPE);
    repo.listEventsForEnvelope.mockResolvedValueOnce([EVENT_RAW]);
    repo.verifyEventChain.mockResolvedValueOnce({ chain_intact: false });
    storage.createSignedUrl
      .mockResolvedValueOnce('https://signed.example/sealed.pdf')
      .mockResolvedValueOnce('https://signed.example/audit.pdf');
    const res = await controller.verify('u82ZmvdxwG3CU');
    expect(res.chain_intact).toBe(false);
  });

  it('does not include sender_email or owner_id in the response (PII redaction)', async () => {
    repo.findByShortCode.mockResolvedValueOnce(ENVELOPE);
    repo.listEventsForEnvelope.mockResolvedValueOnce([]);
    storage.createSignedUrl
      .mockResolvedValueOnce('https://signed.example/sealed.pdf')
      .mockResolvedValueOnce('https://signed.example/audit.pdf');
    const res = await controller.verify('u82ZmvdxwG3CU');
    expect((res.envelope as { readonly owner_id?: unknown }).owner_id).toBeUndefined();
    expect((res.envelope as { readonly sender_email?: unknown }).sender_email).toBeUndefined();
  });

  it('throws 404 NotFoundException when the short_code is unknown', async () => {
    repo.findByShortCode.mockResolvedValueOnce(null);
    await expect(controller.verify('does_not_exist')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.listEventsForEnvelope).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it('omits sealed_url for non-completed envelopes and only conditionally returns audit_url', async () => {
    const declined: Envelope = { ...ENVELOPE, status: 'declined', completed_at: null };
    repo.findByShortCode.mockResolvedValueOnce(declined);
    repo.listEventsForEnvelope.mockResolvedValueOnce([]);
    storage.exists.mockResolvedValueOnce(true);
    storage.createSignedUrl.mockResolvedValueOnce('https://signed.example/audit.pdf');
    const res = await controller.verify('u82ZmvdxwG3CU');
    expect(res.sealed_url).toBeNull();
    expect(res.audit_url).toBe('https://signed.example/audit.pdf');
  });

  it('returns null URLs when the envelope is still in draft / sent', async () => {
    const sent: Envelope = { ...ENVELOPE, status: 'awaiting_others', completed_at: null };
    repo.findByShortCode.mockResolvedValueOnce(sent);
    repo.listEventsForEnvelope.mockResolvedValueOnce([]);
    const res = await controller.verify('u82ZmvdxwG3CU');
    expect(res.sealed_url).toBeNull();
    expect(res.audit_url).toBeNull();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });
});
