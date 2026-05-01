import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContactsModule } from '../contacts/contacts.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { TemplatesModule } from '../templates/templates.module';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyPgRepository } from './idempotency.repository.pg';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { SupabaseAdminClient } from './supabase-admin.client';
import { SupabaseAdminHttpClient } from './supabase-admin.client.http';

/**
 * Mounts T-19 / T-20 — DSAR export and account deletion. Pulls in the
 * other feature modules' repository ports so the service can read
 * across all user-owned tables. `EmailModule` is `@Global()` so we
 * don't need to import it explicitly to inject `OutboundEmailsRepository`.
 */
@Module({
  imports: [AuthModule, ContactsModule, EnvelopesModule, TemplatesModule],
  controllers: [MeController],
  providers: [
    MeService,
    { provide: IdempotencyRepository, useClass: IdempotencyPgRepository },
    { provide: SupabaseAdminClient, useClass: SupabaseAdminHttpClient },
  ],
})
export class MeModule {}
