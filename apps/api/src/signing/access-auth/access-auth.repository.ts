import type { AccessCodePurpose, SignerAuthMethod } from 'shared';

/**
 * Port for the signer access code (WP-10, migration 0026). The pg adapter
 * is `AccessAuthPgRepository`; e2e specs use the in-memory one.
 */

export interface StoredAccessAuthSettings {
  readonly access_auth: SignerAuthMethod;
  readonly action_auth: SignerAuthMethod;
  readonly signers: ReadonlyArray<{
    readonly signer_id: string;
    readonly access_auth: SignerAuthMethod | null;
    readonly action_auth: SignerAuthMethod | null;
  }>;
}

export interface AccessAuthSettingsPatch {
  readonly access_auth?: SignerAuthMethod;
  readonly action_auth?: SignerAuthMethod;
  readonly signers?: ReadonlyArray<{
    readonly signer_id: string;
    readonly access_auth?: SignerAuthMethod | null;
    readonly action_auth?: SignerAuthMethod | null;
  }>;
}

export interface OtpChallenge {
  readonly id: string;
  readonly envelope_id: string;
  readonly signer_id: string;
  readonly purpose: AccessCodePurpose;
  readonly code_hash: string | null;
  readonly attempts: number;
  readonly expires_at: Date;
  readonly sent_at: Date | null;
  readonly consumed_at: Date | null;
  readonly locked_at: Date | null;
  readonly superseded_at: Date | null;
  readonly created_at: Date;
}

/** Result of {@link AccessAuthRepository.createChallenge}. */
export type CreateChallengeResult =
  | { readonly ok: true; readonly challenge: OtpChallenge }
  | {
      readonly ok: false;
      readonly reason: 'cooldown' | 'rate_limited';
      readonly retry_after_seconds: number;
    };

/**
 * Outcome of one code attempt, decided under the challenge row lock.
 * `mismatch` and `locked_now` consumed an attempt.
 */
export type AttemptOutcome =
  | { readonly kind: 'verified'; readonly challenge: OtpChallenge }
  | { readonly kind: 'mismatch'; readonly challenge: OtpChallenge }
  | { readonly kind: 'locked_now'; readonly challenge: OtpChallenge }
  | { readonly kind: 'not_requested' | 'expired' | 'locked' };

export abstract class AccessAuthRepository {
  /** Envelope defaults and signer overrides, or null if the envelope is missing. */
  abstract getSettings(envelope_id: string): Promise<StoredAccessAuthSettings | null>;

  /**
   * Apply `patch` to a draft, under the envelope row lock. Returns false
   * when the envelope is missing or no longer a draft. Unknown signer ids
   * are rejected by the service before this is called.
   */
  abstract setSettings(envelope_id: string, patch: AccessAuthSettingsPatch): Promise<boolean>;

  /**
   * Start a challenge for this signer and purpose, serialized per signer
   * (row lock on the signer). Refuses inside the resend cooldown or past
   * the hourly cap (counted over every purpose). On success every older
   * open challenge for the same purpose is superseded, so only the newest
   * code can work. `code_hash` stays null until {@link armChallenge}.
   */
  abstract createChallenge(input: {
    readonly envelope_id: string;
    readonly signer_id: string;
    readonly purpose: AccessCodePurpose;
    readonly now: Date;
    readonly ttl_seconds: number;
  }): Promise<CreateChallengeResult>;

  /** Mark a challenge superseded (cleanup when queueing its email failed). */
  abstract supersede(challenge_id: string): Promise<void>;

  /**
   * At dispatch: store the hash of the code this attempt emails and restart
   * the expiry clock. Only while the challenge is open (not superseded,
   * consumed or locked) and the signer can still sign: envelope
   * `awaiting_others`, not expired, signer not signed or declined. Returns
   * the challenge, or null when that guard refuses.
   */
  abstract armChallenge(input: {
    readonly challenge_id: string;
    readonly signer_id: string;
    readonly purpose: AccessCodePurpose;
    readonly code_hash: string;
    readonly now: Date;
    readonly ttl_seconds: number;
  }): Promise<OtpChallenge | null>;

  /**
   * One attempt against the newest challenge for this signer and purpose,
   * decided under its row lock so concurrent attempts are counted exactly
   * and at most one can succeed. `matches` runs inside the lock. On
   * success the challenge is consumed and, for `access`, `email_otp` is
   * added to the signer's `verification_checks`. The wrong guess that
   * reaches `max_attempts` sets `locked_at`.
   */
  abstract attempt(input: {
    readonly signer_id: string;
    readonly purpose: AccessCodePurpose;
    readonly now: Date;
    readonly max_attempts: number;
    readonly verification_check: string;
    readonly matches: (challenge: OtpChallenge) => boolean;
  }): Promise<AttemptOutcome>;
}
