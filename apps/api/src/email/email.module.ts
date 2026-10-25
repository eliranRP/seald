import { forwardRef, Global, Module } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { EmailDispatcherService } from './email-dispatcher.service';
import { EmailSender } from './email-sender';
import { selectEmailSender } from './email-sender-factory';
import { EmailWorkerService } from './email-worker.service';
import { OutboundEmailsRepository } from './outbound-emails.repository';
import { OutboundEmailsPgRepository } from './outbound-emails.repository.pg';
import { ResendWebhookController } from './webhooks/resend-webhook.controller';
import { ResendWebhookService } from './webhooks/resend-webhook.service';
import { TemplateService } from './template.service';

/**
 * Global so the worker process + any future caller can inject EmailSender
 * without importing EmailModule. Adapter selection is env-driven so the same
 * codebase works in dev (`logging`), CI (`logging`), and prod (`resend`).
 *
 * `smtp` is listed in env.schema as a valid provider and will be wired in a
 * follow-up if anyone ever needs generic SMTP. MVP ships with logging +
 * Resend only.
 */
@Global()
@Module({
  imports: [forwardRef(() => EnvelopesModule)],
  controllers: [ResendWebhookController],
  providers: [
    TemplateService,
    ResendWebhookService,
    EmailDispatcherService,
    EmailWorkerService,
    { provide: OutboundEmailsRepository, useClass: OutboundEmailsPgRepository },
    {
      provide: EmailSender,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): EmailSender => selectEmailSender(env),
    },
  ],
  exports: [EmailSender, TemplateService, OutboundEmailsRepository, EmailDispatcherService],
})
export class EmailModule {}
