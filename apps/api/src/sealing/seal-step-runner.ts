import { Logger } from '@nestjs/common';
import type { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { EMPTY_SEAL_PROGRESS, type SealProgress, type SealingService } from './sealing.service';

export type SealStepOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'yielded'; readonly jobId: string }
  | { readonly kind: 'finished'; readonly jobId: string }
  | { readonly kind: 'failed'; readonly jobId: string; readonly error: string };

/**
 * One unit of seal work for the Supabase edge worker
 * (docs/supabase-native-architecture.md). Claims the next job, runs exactly
 * one step of it and stops, so the next step lands on a fresh invocation
 * and its own CPU budget. The in-process `WorkerService` still runs whole
 * jobs; both use the same `envelope_jobs` claim, so they cannot collide.
 *
 * Failure handling matches `WorkerService`: `failJob` (backoff retry) and a
 * best-effort `job_failed` event. A worker killed mid-step leaves the job
 * `running`; the seal sweep re-queues it, and every step is idempotent.
 */
export async function runOneSealStep(
  repo: EnvelopesRepository,
  sealing: SealingService,
  logger: Pick<Logger, 'log' | 'error'> = new Logger('SealStepRunner'),
): Promise<SealStepOutcome> {
  const job = await repo.claimNextJob();
  if (!job) return { kind: 'idle' };
  const progress = parseProgress(job.progress);
  logger.log(
    `claimed job ${job.id} (${job.kind}) envelope=${job.envelope_id} step=${describe(progress)}`,
  );
  try {
    const step =
      job.kind === 'seal'
        ? await sealing.processSealStep(job.envelope_id, progress)
        : await sealing.processAuditOnlyStep(job.envelope_id, progress);
    if (!step.done) {
      await repo.yieldJob(job.id, step.progress);
      return { kind: 'yielded', jobId: job.id };
    }
    await repo.finishJob(job.id);
    logger.log(`finished job ${job.id}`);
    return { kind: 'finished', jobId: job.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`job ${job.id} failed: ${msg}`);
    await repo.failJob(job.id, msg);
    await repo
      .appendEvent({
        envelope_id: job.envelope_id,
        actor_kind: 'system',
        event_type: 'job_failed',
        metadata: { job_id: job.id, kind: job.kind, error: msg.slice(0, 500) },
      })
      .catch(() => {
        // Best-effort, as in WorkerService.
      });
    return { kind: 'failed', jobId: job.id, error: msg };
  }
}

/** Stored progress, or a fresh start when it is missing or not the expected shape. */
export function parseProgress(raw: unknown): SealProgress {
  if (typeof raw !== 'object' || raw === null) return EMPTY_SEAL_PROGRESS;
  const candidate = raw as Partial<SealProgress>;
  if (!Array.isArray(candidate.documents)) return EMPTY_SEAL_PROGRESS;
  return candidate as SealProgress;
}

function describe(progress: SealProgress): string {
  return `cert=${progress.certificateReady ? 'y' : 'n'} docs=${progress.documents.length} declined=${progress.declined?.length ?? 0}`;
}
