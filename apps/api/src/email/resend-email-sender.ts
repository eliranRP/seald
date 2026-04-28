import type { AppEnv } from '../config/env.schema';
import {
  EmailSender,
  EmailSendError,
  type EmailMessage,
  type EmailSendResult,
} from './email-sender';

/** Outbound timeout for Resend HTTP calls (rule 9.3). */
const RESEND_FETCH_TIMEOUT_MS = 15_000;

/**
 * Resend REST adapter. Uses the `POST /emails` endpoint with
 * `Idempotency-Key` so worker retries on the same outbound_emails row dedupe
 * at the provider, not just at our side.
 *
 * See docs: https://resend.com/docs/api-reference/emails/send-email
 */
export class ResendEmailSender extends EmailSender {
  private readonly apiKey: string;
  private readonly fromDefault: { email: string; name: string };

  constructor(env: AppEnv) {
    super();
    if (!env.RESEND_API_KEY) {
      throw new Error('ResendEmailSender: RESEND_API_KEY required when EMAIL_PROVIDER=resend');
    }
    this.apiKey = env.RESEND_API_KEY;
    this.fromDefault = {
      email: env.EMAIL_FROM_ADDRESS,
      name: env.EMAIL_FROM_NAME,
    };
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': msg.idempotencyKey,
        },
        body: JSON.stringify({
          from: `${msg.from.name ?? this.fromDefault.name} <${msg.from.email ?? this.fromDefault.email}>`,
          to: `${msg.to.name} <${msg.to.email}>`,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          headers: msg.headers,
        }),
        // Bounded by AbortSignal.timeout (rule 9.3) — a hung Resend node
        // would otherwise stall the email worker indefinitely.
        signal: AbortSignal.timeout(RESEND_FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        // Treat as transient (504) so the email worker retries with backoff.
        throw new EmailSendError('resend', 504, true, `fetch aborted: ${err.message}`);
      }
      throw err;
    }

    if (!res.ok) {
      const body = await res.text();
      // 429 + 5xx are transient; other 4xx are permanent (bad from, invalid to, …)
      const transient = res.status === 429 || res.status >= 500;
      throw new EmailSendError('resend', res.status, transient, body);
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) throw new EmailSendError('resend', 502, true, 'response missing id');
    return { providerId: json.id };
  }
}
