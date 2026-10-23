export interface EmailCopyContext {
  readonly envelope: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly shortCode: string;
    readonly senderEmail: string | null;
    readonly senderName: string | null;
  };
  readonly signerName: string | null;
}

export type ReserveSendsResult = 'reserved' | 'capped';

export type ConsumeStopResult =
  | { readonly kind: 'stopped'; readonly email: string }
  | { readonly kind: 'invalid' };

/**
 * Port for the email-copy action (migration 0034). Implemented over
 * Postgres by `EmailCopyPgRepository`; unit and in-memory e2e specs use a
 * fake. Nothing here ever sees a raw stop token: callers pass the hash.
 */
export abstract class EmailCopyRepository {
  /** Envelope and signer fields for one run; null when the envelope is gone or not the owner's. */
  abstract loadContext(input: {
    readonly ownerId: string;
    readonly envelopeId: string | null;
    readonly signerId: string | null;
  }): Promise<EmailCopyContext | null>;

  /** Which of `emails` this owner has stopped. */
  abstract suppressedAmong(
    ownerId: string,
    emails: readonly string[],
  ): Promise<ReadonlySet<string>>;

  /**
   * Spend quota for one run, all or nothing. Under a per-owner advisory
   * lock: addresses this run already reserved cost nothing (a retry), and
   * if the rest would take the owner past `cap` for `day`, nothing is
   * written and the result is `capped`.
   */
  abstract reserveSends(input: {
    readonly ownerId: string;
    readonly runId: string;
    readonly emails: readonly string[];
    readonly day: string;
    readonly cap: number;
  }): Promise<ReserveSendsResult>;

  abstract isSuppressed(ownerId: string, email: string): Promise<boolean>;

  /** Store the hash of a stop link about to be mailed. */
  abstract putStopToken(input: {
    readonly tokenHash: string;
    readonly ownerId: string;
    readonly email: string;
  }): Promise<void>;

  /** The address a still-unused token would stop, without spending it. */
  abstract peekStopToken(tokenHash: string): Promise<{ readonly email: string } | null>;

  /**
   * Spend the token (single use), suppress that address for the owner and
   * remove it from every one of that owner's recipes. A recipe left with no
   * address is turned off.
   */
  abstract consumeStopToken(tokenHash: string): Promise<ConsumeStopResult>;
}
