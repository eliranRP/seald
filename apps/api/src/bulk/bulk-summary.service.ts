import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { insertOutboundEmailIdempotent } from '../email/insert-idempotent';
import { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import { bulkCompleteEmail } from './bulk-complete-email';
import { BulkRepository, type BulkBatchRecord } from './bulk.repository';

/**
 * Closes a batch and emails the sender the summary. Used by the worker after
 * every row and by cancel. Safe to repeat: the email row has the dedupe key
 * `bulk_complete:<batch id>`, and `notified_at` is stamped only after the
 * insert, so a crash in between re-queues into the same dedupe key.
 */
@Injectable()
export class BulkSummaryService {
  private readonly log = new Logger(BulkSummaryService.name);
  private readonly publicUrl: string;

  constructor(
    private readonly repo: BulkRepository,
    private readonly outbound: OutboundEmailsRepository,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.publicUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
  }

  /** Finish the batch if no row is left, then send its summary. */
  async finishAndNotify(batch_id: string, now: Date = new Date()): Promise<void> {
    await this.repo.finishIfDone(batch_id, now);
    const batch = await this.repo.findBatch(batch_id);
    if (batch && batch.completed_at !== null && batch.notified_at === null) {
      await this.notify(batch, now);
    }
  }

  /** Recovery sweep: summaries a crash left unqueued. */
  async notifyFinished(limit = 20, now: Date = new Date()): Promise<number> {
    const batches = await this.repo.listFinishedWithoutSummary(limit);
    for (const batch of batches) await this.notify(batch, now);
    return batches.length;
  }

  private async notify(batch: BulkBatchRecord, now: Date): Promise<void> {
    try {
      const rows = await this.repo.listRows(batch.id);
      await insertOutboundEmailIdempotent(
        this.outbound,
        bulkCompleteEmail(batch, rows, this.publicUrl),
      );
      await this.repo.markNotified(batch.id, now);
    } catch (err) {
      // The sweep retries it; a failed summary must not fail a row.
      this.log.error(
        `bulk summary for ${batch.id} failed: ${err instanceof Error ? err.name : 'unknown'}`,
      );
    }
  }
}
