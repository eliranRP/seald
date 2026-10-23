import { Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes.module';
import { EnvelopeQueriesRepository } from './envelope-queries.repository';
import { EnvelopeQueriesPgRepository } from './envelope-queries.repository.pg';
import { EnvelopeQueriesService } from './envelope-queries.service';

/**
 * Read-side envelope queries for the MCP read tools (WP-17). Its own
 * module so EnvelopesModule and the legacy repository stay untouched.
 * `OutboundEmailsRepository` comes from the global EmailModule.
 */
@Module({
  imports: [EnvelopesModule],
  providers: [
    EnvelopeQueriesService,
    { provide: EnvelopeQueriesRepository, useClass: EnvelopeQueriesPgRepository },
  ],
  exports: [EnvelopeQueriesService],
})
export class EnvelopeQueriesModule {}
