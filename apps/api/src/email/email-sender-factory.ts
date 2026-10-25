import type { AppEnv } from '../config/env.schema';
import type { EmailSender } from './email-sender';
import { LoggingEmailSender } from './logging-email-sender';
import { ResendEmailSender } from './resend-email-sender';

/**
 * The EmailSender for this process. Its own file so the email-worker Edge
 * Function can use it without EmailModule's imports.
 */
export function selectEmailSender(env: AppEnv): EmailSender {
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
}
