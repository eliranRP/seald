import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AutomationsModule } from './automations/automations.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConfigModule } from './config/config.module';
import { ContactsModule } from './contacts/contacts.module';
import { DbModule } from './db/db.module';
import { DirectLinksModule } from './direct-links/direct-links.module';
import { GDriveModule } from './integrations/gdrive/gdrive.module';
import { ConversionModule } from './integrations/gdrive/conversion/conversion.module';
import { EmailModule } from './email/email.module';
import { CronModule } from './cron/cron.module';
import { EnvelopesModule } from './envelopes/envelopes.module';
import { HealthModule } from './health/health.module';
import { McpModule } from './mcp/mcp.module';
import { MeModule } from './me/me.module';
import { SealingModule } from './sealing/sealing.module';
import { BulkModule } from './bulk/bulk.module';
import { TemplatesModule } from './templates/templates.module';
import { VerifyModule } from './verify/verify.module';
import { SigningModule } from './signing/signing.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    // Global rate limiting: three buckets layered together.
    //   short  — burst protection (5 req / sec)
    //   medium — sustained per-minute ceiling (60 req / min)
    //   long   — hourly ceiling (1000 req / hr)
    // Per-route `@Throttle({ short: { limit, ttl } })` overrides any bucket
    // for that endpoint (used to tighten auth-sensitive routes).
    // `skipIf` disables the global guard during jest runs (NODE_ENV=test).
    // Without it, e2e specs exhaust the 5 req/sec "short" bucket within the
    // first describe block and every subsequent assertion fails with 429.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1000, limit: 5 },
        { name: 'medium', ttl: 60_000, limit: 60 },
        { name: 'long', ttl: 3600_000, limit: 1000 },
      ],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    DbModule,
    StorageModule,
    SigningModule,
    EmailModule,
    AuthModule,
    HealthModule,
    ContactsModule,
    EnvelopesModule,
    TemplatesModule,
    // WP-36: bulk CSV send from a template, dark behind `bulkSend`.
    BulkModule,
    MeModule,
    SealingModule,
    VerifyModule,
    CronModule,
    GDriveModule,
    ConversionModule,
    AutomationsModule,
    // WP-17: POST /mcp, dark behind `mcpServer` + MCP_DISABLED.
    McpModule,
    // WP-37: /templates/:id/direct-link and /direct-links/:token, dark behind `directLinks`.
    DirectLinksModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
