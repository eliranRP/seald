import { Injectable } from '@nestjs/common';

/**
 * Port for outbound transactional email. Implementations render the final
 * HTML + text from template data and hand off to the provider.
 *
 * The contract is deliberately narrow: idempotency is expected to be driven
 * by `idempotencyKey` (the provider should dedupe if the same key is seen
 * twice within a rolling window — Resend supports this natively). The worker
 * passes the `outbound_emails.id` UUID as the key, so retries are safe.
 */
export interface EmailAddress {
  readonly email: string;
  readonly name: string;
}

export interface EmailMessage {
  readonly to: EmailAddress;
  readonly from: EmailAddress;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly idempotencyKey: string;
}

export interface EmailSendResult {
  /** Provider-assigned id for later correlation (webhook bounce tracking etc). */
  readonly providerId: string;
}

@Injectable()
export abstract class EmailSender {
  abstract send(msg: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Domain error surfaced by provider adapters. Worker translates to
 * `outbound_emails.status = 'failed'` with exponential-backoff retry.
 * Distinguishes between transient (retry) and permanent (don't retry).
 */
export class EmailSendError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    public readonly transient: boolean,
    body: string,
  ) {
    super(`email_send_${provider}_${status}${transient ? '_transient' : '_permanent'}: ${body}`);
    this.name = 'EmailSendError';
  }
}
