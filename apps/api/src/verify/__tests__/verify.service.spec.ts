import { NotFoundException } from '@nestjs/common';
import type { Envelope, EnvelopeEvent } from '../../envelopes/envelope.entity';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import type { StorageService } from '../../storage/storage.service';
import { VerifyService } from '../verify.service';

/**
 * Direct coverage of VerifyService. The controller spec mounts the same
 * class through Nest, so a mutation inside verify() can hide behind the
 * route. The 25 MB boundary (`>` vs `>=`) lives in pdf-inspection.spec.ts
 * because that check is inspectPdfBytes, not this service.
 */

const SHORT = 'u82ZmvdxwG3CU';

const ENVELOPE: Envelope = {
  id: '00000000-0000-0000-0000-000000000001',
  owner_id: '00000000-0000-0000-0000-0000000000aa',
  title: 'Sealed waiver',
  short_code: SHORT,
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
  tags: [],
  reminders_enabled: true,
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
  ip: '203.0.113.7',
  user_agent: 'Mozilla/5.0 (secret browser)',
  metadata: { secret: 'do_not_leak' },
  created_at: '2026-04-25T19:59:00.000Z',
};

describe('VerifyService', () => {
  const repo = {
    findByShortCode: jest.fn(),
    listEventsForEnvelope: jest.fn(),
    verifyEventChain: jest.fn(),
  };
  const storage = {
    createSignedUrl: jest.fn(),
    exists: jest.fn(),
  };
  const svc = new VerifyService(
    repo as unknown as EnvelopesRepository,
    storage as unknown as StorageService,
  );

  beforeEach(() => {
    repo.findByShortCode.mockReset();
    repo.listEventsForEnvelope.mockReset();
    repo.verifyEventChain.mockReset();
    repo.verifyEventChain.mockResolvedValue({ chain_intact: true });
    storage.createSignedUrl.mockReset();
    storage.exists.mockReset();
  });

  it('rejects an invalid short code before the repository', async () => {
    await expect(svc.verify('u82ZmvdxwG3C0')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findByShortCode).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it('404s a well-formed short code that has no envelope', async () => {
    repo.findByShortCode.mockResolvedValueOnce(null);
    await expect(svc.verify('aaaaaaaaaaaaa')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findByShortCode).toHaveBeenCalledWith('aaaaaaaaaaaaa');
    expect(repo.listEventsForEnvelope).not.toHaveBeenCalled();
    expect(storage.exists).not.toHaveBeenCalled();
  });

  it('returns sealed and audit URLs with a 300s TTL for a completed envelope', async () => {
    repo.findByShortCode.mockResolvedValueOnce(ENVELOPE);
    repo.listEventsForEnvelope.mockResolvedValueOnce([EVENT_RAW]);
    storage.createSignedUrl
      .mockResolvedValueOnce('https://signed.example/sealed.pdf')
      .mockResolvedValueOnce('https://signed.example/audit.pdf');

    const res = await svc.verify(SHORT);

    expect(storage.createSignedUrl.mock.calls).toEqual([
      [`${ENVELOPE.id}/sealed.pdf`, 300],
      [`${ENVELOPE.id}/audit.pdf`, 300],
    ]);
    expect(res.sealed_url).toBe('https://signed.example/sealed.pdf');
    expect(res.audit_url).toBe('https://signed.example/audit.pdf');
    expect(res.chain_intact).toBe(true);
    expect(storage.exists).not.toHaveBeenCalled();
  });

  it('returns only the audit URL when a declined envelope has an audit PDF', async () => {
    repo.findByShortCode.mockResolvedValueOnce({
      ...ENVELOPE,
      status: 'declined',
      completed_at: null,
    });
    repo.listEventsForEnvelope.mockResolvedValueOnce([]);
    storage.exists.mockResolvedValueOnce(true);
    storage.createSignedUrl.mockResolvedValueOnce('https://signed.example/audit.pdf');

    const res = await svc.verify(SHORT);

    expect(storage.exists).toHaveBeenCalledWith(`${ENVELOPE.id}/audit.pdf`);
    expect(storage.createSignedUrl).toHaveBeenCalledWith(`${ENVELOPE.id}/audit.pdf`, 300);
    expect(res.sealed_url).toBeNull();
    expect(res.audit_url).toBe('https://signed.example/audit.pdf');
  });

  it.each(['declined', 'expired', 'canceled'] as const)(
    'omits the audit URL when a %s envelope has no audit PDF',
    async (status) => {
      repo.findByShortCode.mockResolvedValueOnce({ ...ENVELOPE, status, completed_at: null });
      repo.listEventsForEnvelope.mockResolvedValueOnce([]);
      storage.exists.mockResolvedValueOnce(false);

      const res = await svc.verify(SHORT);

      expect(res.sealed_url).toBeNull();
      expect(res.audit_url).toBeNull();
      expect(storage.createSignedUrl).not.toHaveBeenCalled();
      expect(storage.exists).toHaveBeenCalledWith(`${ENVELOPE.id}/audit.pdf`);
    },
  );

  it('returns null URLs and does not touch storage for an in-progress envelope', async () => {
    repo.findByShortCode.mockResolvedValueOnce({
      ...ENVELOPE,
      status: 'awaiting_others',
      completed_at: null,
    });
    repo.listEventsForEnvelope.mockResolvedValueOnce([]);

    const res = await svc.verify(SHORT);

    expect(res.sealed_url).toBeNull();
    expect(res.audit_url).toBeNull();
    expect(storage.exists).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it('redacts owner, sender, event PII, and internal signer fields', async () => {
    repo.findByShortCode.mockResolvedValueOnce(ENVELOPE);
    repo.listEventsForEnvelope.mockResolvedValueOnce([EVENT_RAW]);
    storage.createSignedUrl.mockResolvedValue('https://signed.example/file.pdf');

    const res = await svc.verify(SHORT);

    expect((res.envelope as { owner_id?: unknown }).owner_id).toBeUndefined();
    expect((res.envelope as { sender_email?: unknown }).sender_email).toBeUndefined();
    const ev = res.events[0]!;
    expect(Object.keys(ev).sort()).toEqual(
      ['actor_kind', 'created_at', 'event_type', 'id', 'signer_id'].sort(),
    );
    expect((ev as { ip?: unknown }).ip).toBeUndefined();
    expect((ev as { user_agent?: unknown }).user_agent).toBeUndefined();
    expect((ev as { metadata?: unknown }).metadata).toBeUndefined();
    const signer = res.signers[0]!;
    expect((signer as { color?: unknown }).color).toBeUndefined();
    expect((signer as { signing_order?: unknown }).signing_order).toBeUndefined();
  });

  it('surfaces a broken audit chain', async () => {
    repo.findByShortCode.mockResolvedValueOnce(ENVELOPE);
    repo.listEventsForEnvelope.mockResolvedValueOnce([]);
    repo.verifyEventChain.mockResolvedValueOnce({ chain_intact: false });
    storage.createSignedUrl.mockResolvedValue('https://signed.example/file.pdf');

    const res = await svc.verify(SHORT);

    expect(res.chain_intact).toBe(false);
  });
});
