import type { AppEnv } from '../../config/env.schema';
import {
  SEAL_SWEEP_INTERVAL_MS,
  SEAL_SWEEP_MAX_AGE_MS,
  SEAL_SWEEP_MIN_AGE_MS,
  SEAL_SWEEP_STALE_RUNNING_MS,
  SealSweepRepository,
  SealSweepService,
  type FindSealSweepCandidatesInput,
  type SealSweepCandidate,
  type SealSweepReason,
} from '../seal-sweep.service';

const NOW = new Date('2026-10-22T12:00:00.000Z');

function candidate(
  id: string,
  reason: SealSweepReason,
  ageMs: number,
  envelopeStatus: SealSweepCandidate['envelopeStatus'] = 'sealing',
): SealSweepCandidate {
  return {
    envelopeId: id,
    envelopeStatus,
    allSignedAt: new Date(NOW.getTime() - ageMs),
    reason,
  };
}

/**
 * Fake that applies the window the service passes in, so the tests check the
 * service's policy (windows, exhausted, poison) rather than SQL.
 */
class FakeRepo extends SealSweepRepository {
  readonly requeueCalls: string[] = [];
  readonly findCalls: FindSealSweepCandidatesInput[] = [];
  /** Envelope ids whose requeue loses the race to another instance. */
  readonly lostRace = new Set<string>();

  constructor(private readonly rows: SealSweepCandidate[]) {
    super();
  }

  async findCandidates(input: FindSealSweepCandidatesInput): Promise<SealSweepCandidate[]> {
    this.findCalls.push(input);
    return this.rows.filter(
      (r) =>
        r.allSignedAt.getTime() <= input.signedBefore.getTime() &&
        (input.signedAfter === null || r.allSignedAt.getTime() > input.signedAfter.getTime()),
    );
  }

  async requeue(c: SealSweepCandidate): Promise<boolean> {
    this.requeueCalls.push(c.envelopeId);
    return !this.lostRace.has(c.envelopeId);
  }

  readonly auditCalls: Date[] = [];
  auditResult: Array<{ envelopeId: string; requeued: boolean }> = [];

  async reclaimStaleAuditJobs(runningStartedBefore: Date) {
    this.auditCalls.push(runningStartedBefore);
    return this.auditResult;
  }
}

function service(repo: SealSweepRepository, workerEnabled = false): SealSweepService {
  return new SealSweepService(repo, { WORKER_ENABLED: workerEnabled } as unknown as AppEnv);
}

const MIN = 60_000;

describe('SealSweepService.sweep', () => {
  it('re-queues an envelope with no job row', async () => {
    const repo = new FakeRepo([candidate('e-nojob', 'no_job', 20 * MIN)]);
    const res = await service(repo).sweep(NOW);
    expect(repo.requeueCalls).toEqual(['e-nojob']);
    expect(res).toMatchObject({ requeued: 1, requeued_envelope_ids: ['e-nojob'], poison: 0 });
  });

  it('re-queues a failed job that still has attempts left', async () => {
    const repo = new FakeRepo([candidate('e-failed', 'failed_retryable', 30 * MIN)]);
    const res = await service(repo).sweep(NOW);
    expect(repo.requeueCalls).toEqual(['e-failed']);
    expect(res.requeued).toBe(1);
  });

  it('reclaims a job stuck running past the stale threshold', async () => {
    const repo = new FakeRepo([candidate('e-stale', 'stale_running', 45 * MIN)]);
    const res = await service(repo).sweep(NOW);
    expect(repo.requeueCalls).toEqual(['e-stale']);
    expect(res.requeued).toBe(1);
    expect(repo.findCalls[0]?.runningStartedBefore.getTime()).toBe(
      NOW.getTime() - SEAL_SWEEP_STALE_RUNNING_MS,
    );
  });

  it('re-queues a fully signed envelope still in awaiting_others', async () => {
    const repo = new FakeRepo([candidate('e-await', 'no_job', 20 * MIN, 'awaiting_others')]);
    const res = await service(repo).sweep(NOW);
    expect(res.requeued_envelope_ids).toEqual(['e-await']);
  });

  it('leaves envelopes younger than 15 minutes alone', async () => {
    const repo = new FakeRepo([candidate('e-fresh', 'no_job', 14 * MIN)]);
    const res = await service(repo).sweep(NOW);
    expect(repo.requeueCalls).toEqual([]);
    expect(res).toMatchObject({ scanned: 0, requeued: 0, poison: 0 });
    expect(repo.findCalls[0]?.signedBefore.getTime()).toBe(NOW.getTime() - SEAL_SWEEP_MIN_AGE_MS);
  });

  it('logs poison envelopes older than 6 hours and never re-queues them', async () => {
    const repo = new FakeRepo([
      candidate('e-poison', 'no_job', 7 * 60 * MIN),
      candidate('e-ok', 'no_job', 60 * MIN),
    ]);
    const svc = service(repo);
    const warn = jest.spyOn(
      (svc as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn',
    );
    const res = await svc.sweep(NOW);
    expect(repo.requeueCalls).toEqual(['e-ok']);
    expect(res).toMatchObject({ requeued: 1, poison: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('poison envelope e-poison'));
    expect(repo.findCalls[1]?.signedBefore.getTime()).toBe(NOW.getTime() - SEAL_SWEEP_MAX_AGE_MS);
    expect(repo.findCalls[1]?.signedAfter).toBeNull();
  });

  it('does not re-queue an exhausted job inside the window', async () => {
    const repo = new FakeRepo([candidate('e-dead', 'exhausted', 60 * MIN)]);
    const res = await service(repo).sweep(NOW);
    expect(repo.requeueCalls).toEqual([]);
    expect(res).toMatchObject({ requeued: 0, skipped: 1 });
  });

  it('counts a lost race as skipped, not requeued (multi-instance idempotency)', async () => {
    const repo = new FakeRepo([
      candidate('e-a', 'no_job', 20 * MIN),
      candidate('e-b', 'no_job', 25 * MIN),
    ]);
    repo.lostRace.add('e-a');
    const res = await service(repo).sweep(NOW);
    expect(res).toMatchObject({ requeued: 1, skipped: 1, requeued_envelope_ids: ['e-b'] });
  });

  it('reclaims stale audit_only jobs with the same 15 minute staleness window', async () => {
    const repo = new FakeRepo([]);
    repo.auditResult = [
      { envelopeId: 'e-declined', requeued: true },
      { envelopeId: 'e-expired', requeued: false },
    ];
    const res = await service(repo).sweep(NOW);
    expect(repo.auditCalls).toEqual([new Date(NOW.getTime() - 15 * MIN)]);
    expect(res).toMatchObject({ audit_requeued: 1, audit_failed: 1, requeued: 0 });
  });
});

describe('SealSweepService tick', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not schedule a tick when WORKER_ENABLED=false', async () => {
    const repo = new FakeRepo([]);
    const svc = service(repo, false);
    svc.onModuleInit();
    await jest.advanceTimersByTimeAsync(SEAL_SWEEP_INTERVAL_MS * 2);
    expect(repo.findCalls).toHaveLength(0);
    svc.onModuleDestroy();
  });

  it('sweeps every 15 minutes when WORKER_ENABLED=true and stops on destroy', async () => {
    const repo = new FakeRepo([]);
    const svc = service(repo, true);
    svc.onModuleInit();
    await jest.advanceTimersByTimeAsync(SEAL_SWEEP_INTERVAL_MS);
    // One sweep = one actionable lookup + one poison lookup.
    expect(repo.findCalls).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(SEAL_SWEEP_INTERVAL_MS);
    expect(repo.findCalls).toHaveLength(4);
    svc.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(SEAL_SWEEP_INTERVAL_MS * 3);
    expect(repo.findCalls).toHaveLength(4);
  });

  it('survives a repository failure and keeps ticking', async () => {
    const repo = new FakeRepo([]);
    const spy = jest
      .spyOn(repo, 'findCandidates')
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue([]);
    const svc = service(repo, true);
    svc.onModuleInit();
    await jest.advanceTimersByTimeAsync(SEAL_SWEEP_INTERVAL_MS * 2);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
    svc.onModuleDestroy();
  });
});
