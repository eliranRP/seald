import {
  SealSweepRepository,
  type FindSealSweepCandidatesInput,
  type SealSweepCandidate,
  type SealSweepReason,
} from '../src/sealing/seal-sweep.service';
import type { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';

/**
 * Test double for the pg SealSweepRepository, built over the in-memory
 * envelopes repository so e2e tests can drive the real worker + sealing
 * path. Mirrors the SQL semantics. The in-memory job rows carry no
 * `started_at`, so tests set it through `runningSince`.
 */
export class InMemorySealSweepRepository extends SealSweepRepository {
  /** job id -> instant the job was claimed (test-controlled). */
  readonly runningSince = new Map<string, Date>();

  constructor(private readonly envelopes: InMemoryEnvelopesRepository) {
    super();
  }

  async findCandidates(input: FindSealSweepCandidatesInput): Promise<SealSweepCandidate[]> {
    const out: SealSweepCandidate[] = [];
    for (const env of this.envelopes.envelopes.values()) {
      if (env.status !== 'sealing' && env.status !== 'awaiting_others') continue;
      if (env.status === 'awaiting_others' && env.signers.some((s) => !s.signed_at)) {
        continue;
      }
      const signedEvents = this.envelopes.events.filter(
        (e) => e.envelope_id === env.id && e.event_type === 'all_signed',
      );
      if (signedEvents.length === 0) continue;
      const signedAt = new Date(Math.max(...signedEvents.map((e) => Date.parse(e.created_at))));
      if (signedAt.getTime() > input.signedBefore.getTime()) continue;
      if (input.signedAfter && signedAt.getTime() <= input.signedAfter.getTime()) continue;

      const job = this.envelopes.jobs.find((j) => j.envelope_id === env.id);
      let reason: SealSweepReason | null = null;
      if (!job) reason = 'no_job';
      else if (job.status === 'failed') {
        reason = job.attempts < job.max_attempts ? 'failed_retryable' : 'exhausted';
      } else if (job.status === 'running') {
        const since = this.runningSince.get(job.id);
        if (since && since.getTime() < input.runningStartedBefore.getTime()) {
          reason = job.attempts < job.max_attempts ? 'stale_running' : 'exhausted';
        }
      }
      if (!reason) continue;
      out.push({
        envelopeId: env.id,
        envelopeStatus: env.status,
        allSignedAt: signedAt,
        reason,
      });
    }
    out.sort((a, b) => b.allSignedAt.getTime() - a.allSignedAt.getTime());
    return out.slice(0, input.limit);
  }

  async requeue(candidate: SealSweepCandidate, runningStartedBefore: Date): Promise<boolean> {
    const job = this.envelopes.jobs.find((j) => j.envelope_id === candidate.envelopeId);
    let acted = false;
    if (candidate.reason === 'no_job') {
      if (!job) {
        await this.envelopes.enqueueJob(candidate.envelopeId, 'seal');
        acted = true;
      }
    } else if (job && job.attempts < job.max_attempts) {
      const since = this.runningSince.get(job.id);
      const stale =
        candidate.reason === 'stale_running' &&
        job.status === 'running' &&
        since !== undefined &&
        since.getTime() < runningStartedBefore.getTime();
      const failed = candidate.reason === 'failed_retryable' && job.status === 'failed';
      if (stale || failed) {
        job.status = 'pending';
        job.scheduled_for = new Date().toISOString();
        this.runningSince.delete(job.id);
        acted = true;
      }
    }
    if (acted && candidate.envelopeStatus === 'awaiting_others') {
      const env = this.envelopes.envelopes.get(candidate.envelopeId);
      if (env?.status === 'awaiting_others') {
        this.envelopes.envelopes.set(env.id, { ...env, status: 'sealing' });
      }
    }
    return acted;
  }

  async reclaimStaleAuditJobs(
    runningStartedBefore: Date,
    limit: number,
  ): Promise<ReadonlyArray<{ readonly envelopeId: string; readonly requeued: boolean }>> {
    const out: Array<{ envelopeId: string; requeued: boolean }> = [];
    for (const job of this.envelopes.jobs) {
      if (out.length >= limit) break;
      if (job.kind !== 'audit_only' || job.status !== 'running') continue;
      const since = this.runningSince.get(job.id);
      if (!since || since.getTime() >= runningStartedBefore.getTime()) continue;
      const requeued = job.attempts < job.max_attempts;
      job.status = requeued ? 'pending' : 'failed';
      job.scheduled_for = new Date().toISOString();
      this.runningSince.delete(job.id);
      out.push({ envelopeId: job.envelope_id, requeued });
    }
    return out;
  }
}
