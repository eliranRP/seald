import { Module } from '@nestjs/common';
import { IdempotencyRecordsRepository } from './idempotency-records.repository';
import { IdempotencyRecordsPgRepository } from './idempotency-records.repository.pg';
import { IdempotencyService } from './idempotency.service';

/** MCP idempotency keys over `idempotency_records` (WP-19, step 8a). */
@Module({
  providers: [
    IdempotencyService,
    { provide: IdempotencyRecordsRepository, useClass: IdempotencyRecordsPgRepository },
  ],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
