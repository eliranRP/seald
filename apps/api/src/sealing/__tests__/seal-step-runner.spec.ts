import { InMemoryEnvelopesRepository } from '../../../test/in-memory-envelopes-repository';
import { parseProgress, runOneSealStep } from '../seal-step-runner';
import { EMPTY_SEAL_PROGRESS, type SealProgress, type SealingService } from '../sealing.service';

/**
 * The edge worker runs one seal step per invocation and keeps progress on
 * the job row in between (docs/supabase-native-architecture.md).
 */

const ENV_ID = '00000000-0000-0000-0000-0000000000e1';
const quiet = { log: () => undefined, error: () => undefined };

function doc(ord: number): SealProgress['documents'][number] {
  return {
    ord,
    path: `${ENV_ID}/d${ord}.pdf`,
    sha256: 'a'.repeat(64),
    pages: 1,
    timestampApplied: true,
  };
}

/** A sealing stub that needs `steps` calls to finish and records what it was given. */
function scriptedSealing(steps: number): { svc: SealingService; seen: SealProgress[] } {
  const seen: SealProgress[] = [];
  const step = async (_id: string, progress: SealProgress) => {
    seen.push(progress);
    if (progress.documents.length + 1 >= steps) return { done: true as const };
    return {
      done: false as const,
      progress: {
        ...progress,
        documents: [...progress.documents, doc(progress.documents.length + 1)],
      },
    };
  };
  return {
    svc: { processSealStep: step, processAuditOnlyStep: step } as unknown as SealingService,
    seen,
  };
}

describe('runOneSealStep', () => {
  it('is idle when no job is due', async () => {
    const repo = new InMemoryEnvelopesRepository();
    const { svc } = scriptedSealing(1);
    await expect(runOneSealStep(repo, svc, quiet)).resolves.toEqual({ kind: 'idle' });
  });

  it('runs one step per call, carries progress, and gives back the attempt each step took', async () => {
    const repo = new InMemoryEnvelopesRepository();
    const jobId = await repo.enqueueJob(ENV_ID, 'seal');
    const { svc, seen } = scriptedSealing(3);

    expect(await runOneSealStep(repo, svc, quiet)).toEqual({ kind: 'yielded', jobId });
    let job = repo.jobs.find((j) => j.id === jobId)!;
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
    expect(parseProgress(job.progress).documents).toHaveLength(1);

    expect(await runOneSealStep(repo, svc, quiet)).toEqual({ kind: 'yielded', jobId });
    expect(await runOneSealStep(repo, svc, quiet)).toEqual({ kind: 'finished', jobId });
    job = repo.jobs.find((j) => j.id === jobId)!;
    expect(job.status).toBe('done');
    expect(seen.map((p) => p.documents.length)).toEqual([0, 1, 2]);
    await expect(runOneSealStep(repo, svc, quiet)).resolves.toEqual({ kind: 'idle' });
  });

  it('records a failure with backoff and keeps the progress of earlier steps', async () => {
    const repo = new InMemoryEnvelopesRepository();
    const jobId = await repo.enqueueJob(ENV_ID, 'seal');
    const { svc } = scriptedSealing(3);
    await runOneSealStep(repo, svc, quiet);
    const failing = {
      processSealStep: async () => {
        throw new Error('tsa down');
      },
    } as unknown as SealingService;

    const outcome = await runOneSealStep(repo, failing, quiet);
    expect(outcome).toEqual({ kind: 'failed', jobId, error: 'tsa down' });
    const job = repo.jobs.find((j) => j.id === jobId)!;
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(1);
    expect(job.last_error).toBe('tsa down');
    expect(Date.parse(job.scheduled_for)).toBeGreaterThan(Date.now());
    expect(parseProgress(job.progress).documents).toHaveLength(1);
  });

  it('a re-enqueue (seal replaced by audit_only) starts from no progress', async () => {
    const repo = new InMemoryEnvelopesRepository();
    await repo.enqueueJob(ENV_ID, 'seal');
    const { svc } = scriptedSealing(3);
    await runOneSealStep(repo, svc, quiet);
    await repo.enqueueJob(ENV_ID, 'audit_only');
    const claimed = await repo.claimNextJob();
    expect(parseProgress(claimed?.progress)).toEqual(EMPTY_SEAL_PROGRESS);
  });
});

describe('parseProgress', () => {
  it.each([null, undefined, 'x', 7, {}, { documents: 'nope' }])(
    'treats %p as a fresh start',
    (raw) => {
      expect(parseProgress(raw)).toEqual(EMPTY_SEAL_PROGRESS);
    },
  );

  it('passes a stored progress through', () => {
    const stored: SealProgress = { certificateReady: true, documents: [doc(1)], declined: [2] };
    expect(parseProgress(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });
});
