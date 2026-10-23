import { Module } from '@nestjs/common';
import { ScanSessionsController } from './scan-sessions.controller';
import { ScanSessionsRepository } from './scan-sessions.repository';
import { ScanSessionsPgRepository } from './scan-sessions.repository.pg';
import { ScanSessionsService } from './scan-sessions.service';

/**
 * Scan with phone (redesign v2 WS-J). `StorageService` comes from the
 * global StorageModule. Not flag-gated: the upload screen's "Scan with
 * phone" tile ships with the redesign.
 */
@Module({
  controllers: [ScanSessionsController],
  providers: [
    ScanSessionsService,
    { provide: ScanSessionsRepository, useClass: ScanSessionsPgRepository },
  ],
})
export class ScanSessionsModule {}
