import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ConversionJobStatus, ConversionJobView } from './dto/conversion.dto';

/**
 * In-memory job map for Drive doc → PDF conversions. Each job carries an
 * AbortController; the DELETE route fires `controller.abort()` so both the
 * in-flight Drive `export` fetch and the Gotenberg POST cancel cleanly.
 *
 * Watchpoint #3 (Phase 3): the manager preferred this lightweight gateway
 * over a `gdrive_conversion_jobs` table. Justification:
 *   - jobs are short-lived (Drive export is a few seconds, Gotenberg
 *     usually under 10s) — durability across pod restarts is not worth
 *     a table + migration round trip;
 *   - cancellation is purely an AbortSignal concern; nothing downstream
 *     observes the row;
 *   - LOC budget for WT-D is tight and a table + repository would consume
 *     ~80 LOC with little real benefit.
 *
 * Multi-instance: the `jobId` is a uuid that only the originating Node
 * process can satisfy. The SPA polls the same instance because the
 * jobId opaque token is meaningless to any other pod — a 404 from a
 * different pod is the correct contract (the SPA should treat it as a
 * dropped job and retry from scratch). For multi-pod deployments we'd
 * encode the instance id into the jobId or pin via sticky sessions; the
 * single-EC2 production target makes this academic for v1.
 */

interface JobEntry {
  readonly userId: string;
  readonly controller: AbortController;
  status: ConversionJobStatus;
  assetUrl?: string;
  errorCode?: ConversionJobView['errorCode'];
}

const TERMINAL: ReadonlySet<ConversionJobStatus> = new Set(['done', 'failed', 'cancelled']);

@Injectable()
export class ConversionGateway {
  private readonly jobs = new Map<string, JobEntry>();

  start(userId: string): { jobId: string; signal: AbortSignal } {
    const jobId = randomUUID();
    const controller = new AbortController();
    this.jobs.set(jobId, { userId, controller, status: 'pending' });
    return { jobId, signal: controller.signal };
  }

  /**
   * Test-helper / internal accessor. Routes use {@link view} which is
   * sanitized; this method exposes the raw entry for the service layer.
   */
  get(jobId: string): JobEntry | undefined {
    return this.jobs.get(jobId);
  }

  setStatus(jobId: string, status: ConversionJobStatus): void {
    const job = this.jobs.get(jobId);
    if (!job || TERMINAL.has(job.status)) return;
    job.status = status;
  }

  markDone(jobId: string, assetUrl: string): void {
    const job = this.jobs.get(jobId);
    if (!job || TERMINAL.has(job.status)) return;
    job.status = 'done';
    job.assetUrl = assetUrl;
  }

  markFailed(jobId: string, errorCode: NonNullable<ConversionJobView['errorCode']>): void {
    const job = this.jobs.get(jobId);
    if (!job || TERMINAL.has(job.status)) return;
    job.status = 'failed';
    job.errorCode = errorCode;
  }

  /**
   * Cancel returns true iff the caller owns the job AND the job is not
   * already terminal. Aborts the controller so any in-flight Drive +
   * Gotenberg fetches that received `signal` will reject with AbortError.
   */
  cancel(jobId: string, userId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) return false;
    if (TERMINAL.has(job.status)) return false;
    job.status = 'cancelled';
    job.controller.abort();
    return true;
  }

  /**
   * Sanitized view for the controller. Returns null when the job does
   * not exist OR is owned by another user (NotFound on either branch
   * preserves the no-existence-leak contract from WT-A-2).
   */
  view(jobId: string, userId: string): ConversionJobView | null {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) return null;
    const view: ConversionJobView = {
      jobId,
      status: job.status,
      ...(job.assetUrl !== undefined ? { assetUrl: job.assetUrl } : {}),
      ...(job.errorCode !== undefined ? { errorCode: job.errorCode } : {}),
    };
    return view;
  }
}
