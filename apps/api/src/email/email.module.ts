import { Global, Module } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EmailSender } from './email-sender';
import { LoggingEmailSender } from './logging-email-sender';
import { ResendEmailSender } from './resend-email-sender';
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
  providers: [
    TemplateService,
    {
      provide: EmailSender,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): EmailSender => {
        if (env.EMAIL_PROVIDER === 'logging') return new LoggingEmailSender();
        if (env.EMAIL_PROVIDER === 'resend') return new ResendEmailSender(env);
        if (env.EMAIL_PROVIDER === 'smtp') {
          throw new Error(
            'EMAIL_PROVIDER=smtp is not wired yet — use logging or resend. See email.module.ts.',
          );
        }
        // Exhaustiveness guard — if the enum grows, TS tells us.
        const _exhaustive: never = env.EMAIL_PROVIDER;
        throw new Error(`EMAIL_PROVIDER unsupported: ${String(_exhaustive)}`);
      },
    },
  ],
  exports: [EmailSender, TemplateService],
})
export class EmailModule {}
