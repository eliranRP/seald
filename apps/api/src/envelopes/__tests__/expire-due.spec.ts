import type { EnvelopesRepository } from '../envelopes.repository';
import { EnvelopesService } from '../envelopes.service';

describe('EnvelopesService.expireDue', () => {
  it('expires, enqueues an audit job, and appends an expired event per id', async () => {
    const repo = {
      expireEnvelopes: jest.fn().mockResolvedValue(['e1', 'e2']),
      enqueueJob: jest.fn().mockResolvedValue('job'),
      appendEvent: jest.fn().mockResolvedValue({ id: 'ev' }),
    };
    const svc = new EnvelopesService(
      repo as unknown as EnvelopesRepository,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    const now = new Date('2026-09-30T00:00:00.000Z');

    const ids = await svc.expireDue(now, 100);

    expect(ids).toEqual(['e1', 'e2']);
    expect(repo.expireEnvelopes).toHaveBeenCalledWith(now, 100);
    expect(repo.enqueueJob).toHaveBeenNthCalledWith(1, 'e1', 'audit_only');
    expect(repo.enqueueJob).toHaveBeenNthCalledWith(2, 'e2', 'audit_only');
    expect(repo.appendEvent).toHaveBeenNthCalledWith(1, {
      envelope_id: 'e1',
      actor_kind: 'system',
      event_type: 'expired',
      metadata: {},
    });
    expect(repo.appendEvent).toHaveBeenNthCalledWith(2, {
      envelope_id: 'e2',
      actor_kind: 'system',
      event_type: 'expired',
      metadata: {},
    });
  });

  it('returns an empty list without writing when nothing is due', async () => {
    const repo = {
      expireEnvelopes: jest.fn().mockResolvedValue([]),
      enqueueJob: jest.fn(),
      appendEvent: jest.fn(),
    };
    const svc = new EnvelopesService(
      repo as unknown as EnvelopesRepository,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );

    await expect(svc.expireDue(new Date(), 100)).resolves.toEqual([]);
    expect(repo.enqueueJob).not.toHaveBeenCalled();
    expect(repo.appendEvent).not.toHaveBeenCalled();
  });
});
