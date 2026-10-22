import { randomUUID } from 'node:crypto';
import type { SignerAuthMethod } from 'shared';
import {
  AccessAuthRepository,
  type AccessAuthSettingsPatch,
  type AttemptOutcome,
  type CreateChallengeResult,
  type OtpChallenge,
  type StoredAccessAuthSettings,
} from '../src/signing/access-auth/access-auth.repository';
import { challengeState, sendWaitSeconds } from '../src/signing/access-auth/access-code';
import type { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Test double for AccessAuthPgRepository (WP-10). Same rules as the SQL;
 * JS is single-threaded between awaits, so each method body is atomic.
 */
export class InMemoryAccessAuthRepository extends AccessAuthRepository {
  readonly envelopeAuth = new Map<string, { access: SignerAuthMethod; action: SignerAuthMethod }>();
  readonly signerAuth = new Map<
    string,
    { access: SignerAuthMethod | null; action: SignerAuthMethod | null }
  >();
  readonly challenges: Array<Mutable<OtpChallenge>> = [];
  readonly verificationChecks = new Map<string, string[]>();

  constructor(private readonly envelopes: InMemoryEnvelopesRepository) {
    super();
  }

  async getSettings(envelope_id: string): Promise<StoredAccessAuthSettings | null> {
    const env = this.envelopes.envelopes.get(envelope_id);
    if (!env) return null;
    const own = this.envelopeAuth.get(envelope_id) ?? { access: 'none', action: 'none' };
    return {
      access_auth: own.access,
      action_auth: own.action,
      signers: [...env.signers]
        .sort((a, b) => a.signing_order - b.signing_order)
        .map((s) => {
          const o = this.signerAuth.get(s.id);
          return {
            signer_id: s.id,
            access_auth: o?.access ?? null,
            action_auth: o?.action ?? null,
          };
        }),
    };
  }

  async setSettings(envelope_id: string, patch: AccessAuthSettingsPatch): Promise<boolean> {
    const env = this.envelopes.envelopes.get(envelope_id);
    if (!env || env.status !== 'draft') return false;
    const cur = this.envelopeAuth.get(envelope_id) ?? { access: 'none', action: 'none' };
    this.envelopeAuth.set(envelope_id, {
      access: patch.access_auth ?? cur.access,
      action: patch.action_auth ?? cur.action,
    });
    for (const s of patch.signers ?? []) {
      const o = this.signerAuth.get(s.signer_id) ?? { access: null, action: null };
      this.signerAuth.set(s.signer_id, {
        access: s.access_auth !== undefined ? s.access_auth : o.access,
        action: s.action_auth !== undefined ? s.action_auth : o.action,
      });
    }
    return true;
  }

  async createChallenge(input: {
    readonly envelope_id: string;
    readonly signer_id: string;
    readonly purpose: OtpChallenge['purpose'];
    readonly now: Date;
    readonly ttl_seconds: number;
  }): Promise<CreateChallengeResult> {
    const recent = this.challenges
      .filter((c) => c.signer_id === input.signer_id)
      .map((c) => c.created_at);
    const wait = sendWaitSeconds(recent, input.now);
    if (wait) return { ok: false, reason: wait.reason, retry_after_seconds: wait.seconds };
    for (const c of this.challenges) {
      if (
        c.signer_id === input.signer_id &&
        c.purpose === input.purpose &&
        c.superseded_at === null &&
        c.consumed_at === null
      ) {
        c.superseded_at = input.now;
      }
    }
    const challenge: Mutable<OtpChallenge> = {
      id: randomUUID(),
      envelope_id: input.envelope_id,
      signer_id: input.signer_id,
      purpose: input.purpose,
      code_hash: null,
      attempts: 0,
      expires_at: new Date(input.now.getTime() + input.ttl_seconds * 1000),
      sent_at: null,
      consumed_at: null,
      locked_at: null,
      superseded_at: null,
      created_at: input.now,
    };
    this.challenges.push(challenge);
    return { ok: true, challenge: { ...challenge } };
  }

  async supersede(challenge_id: string): Promise<void> {
    const c = this.challenges.find((x) => x.id === challenge_id);
    if (c && c.superseded_at === null) c.superseded_at = new Date();
  }

  async armChallenge(input: {
    readonly challenge_id: string;
    readonly signer_id: string;
    readonly purpose: OtpChallenge['purpose'];
    readonly code_hash: string;
    readonly now: Date;
    readonly ttl_seconds: number;
  }): Promise<OtpChallenge | null> {
    const c = this.challenges.find(
      (x) =>
        x.id === input.challenge_id &&
        x.signer_id === input.signer_id &&
        x.purpose === input.purpose,
    );
    if (!c || c.superseded_at !== null || c.consumed_at !== null || c.locked_at !== null) {
      return null;
    }
    const env = this.envelopes.envelopes.get(c.envelope_id);
    const signer = env?.signers.find((s) => s.id === c.signer_id);
    if (!env || !signer || env.status !== 'awaiting_others') return null;
    if (Date.parse(env.expires_at) <= input.now.getTime()) return null;
    if (signer.signed_at !== null || signer.declined_at !== null) return null;
    c.code_hash = input.code_hash;
    c.sent_at = input.now;
    c.expires_at = new Date(input.now.getTime() + input.ttl_seconds * 1000);
    return { ...c };
  }

  async attempt(input: {
    readonly signer_id: string;
    readonly purpose: OtpChallenge['purpose'];
    readonly now: Date;
    readonly max_attempts: number;
    readonly verification_check: string;
    readonly matches: (challenge: OtpChallenge) => boolean;
  }): Promise<AttemptOutcome> {
    const open = this.challenges
      .filter(
        (c) =>
          c.signer_id === input.signer_id &&
          c.purpose === input.purpose &&
          c.superseded_at === null,
      )
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    const c = open[0] ?? null;
    const state = challengeState(c, input.now);
    if (state !== null || c === null) return { kind: state ?? 'not_requested' };
    if (input.matches({ ...c })) {
      c.consumed_at = input.now;
      const checks = this.verificationChecks.get(input.signer_id) ?? [];
      if (!checks.includes(input.verification_check)) checks.push(input.verification_check);
      this.verificationChecks.set(input.signer_id, checks);
      return { kind: 'verified', challenge: { ...c } };
    }
    c.attempts += 1;
    const lockNow = c.attempts >= input.max_attempts;
    if (lockNow) c.locked_at = input.now;
    return { kind: lockNow ? 'locked_now' : 'mismatch', challenge: { ...c } };
  }

  /** Test helper: move every challenge of a signer back in time. */
  age(signer_id: string, ms: number): void {
    for (const c of this.challenges) {
      if (c.signer_id !== signer_id) continue;
      c.created_at = new Date(c.created_at.getTime() - ms);
      c.expires_at = new Date(c.expires_at.getTime() - ms);
    }
  }
}
