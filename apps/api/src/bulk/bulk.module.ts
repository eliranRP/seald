import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { TemplatesModule } from '../templates/templates.module';
import { BulkController } from './bulk.controller';
import { BulkRepository } from './bulk.repository';
import { BulkPgRepository } from './bulk.repository.pg';
import { BulkRowProcessor } from './bulk-row-processor.service';
import { BulkSummaryService } from './bulk-summary.service';
import { BulkWorkerService } from './bulk-worker.service';
import { BulkService } from './bulk.service';

/**
 * Bulk send from a template (WP-36, migration 0032, flag `bulkSend`).
 * `SigningOrderService` comes from the global `SigningModule`, and
 * `StorageService` from the global `StorageModule`, the email outbox from the
 * global `EmailModule`. The worker starts only
 * with `WORKER_ENABLED=true` and the flag on.
 */
@Module({
  imports: [AuthModule, EnvelopesModule, TemplatesModule],
  controllers: [BulkController],
  providers: [
    BulkService,
    BulkRowProcessor,
    BulkSummaryService,
    BulkWorkerService,
    { provide: BulkRepository, useClass: BulkPgRepository },
  ],
  exports: [BulkService, BulkRepository, BulkWorkerService],
})
export class BulkModule {}
