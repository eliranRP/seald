import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ACCESS_CODE_POLICY,
  effectiveSignerAuth,
  isFeatureEnabled,
  maskEmail,
  VERIFICATION_CHECK_EMAIL_OTP,
  type AccessAuthSettings,
  type AccessCodePurpose,
  type AccessCodeSendResponse,
  type SignerAuthMethod,
} from 'shared';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { OutboundEmailsRepository } from '../../email/outbound-emails.repository';
import type { Envelope, EnvelopeSigner } from '../../envelopes/envelopes.repository';
import { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import {
  AccessAuthRepository,
  type AccessAuthSettingsPatch,
  type StoredAccessAuthSettings,
} from './access-auth.repository';
import { accessCodeMatches } from './access-code';

const METHOD = 'email_otp' as const;

/** 429 for a send inside the cooldown or over the hourly cap. */
export class AccessCodeThrottledException extends HttpException {
  constructor(
    slug: 'access_code_cooldown' | 'access_code_rate_limited',
    readonly retryAfterSeconds: number,
  ) {
    super(slug, 429);
  }
}

/**
 * Signer access code (WP-10, flag `signerAccessAuth`). Thin controllers
 * sit on top of it (MCP-first rule 2).
 *
 * Lifecycle of one code:
 *   1. `sendCode` opens a challenge (cooldown 60 s, at most 5 sends per
 *      signer per hour, older open codes of the same purpose superseded)
 *      and queues an `access_code` email that holds only the challenge
 *      id. Appends `access_code_sent`.
 *   2. The email worker mints the code at dispatch (`AccessCodeMinter`),
 *      stores its HMAC and starts the 10-minute clock.
 *   3. `verifyCode` checks the newest challenge under its row lock:
 *      constant-time compare, consumed on success (`access_code_verified`,
 *      `email_otp` added to `verification_checks`), one attempt spent on a
 *      miss (`access_code_failed`), locked on the 5th miss. A locked,
 *      expired, used or replaced code needs a new send.
 *
 * Every event goes through `appendEvent`, so it joins the hash chain.
 */
@Injectable()
export class AccessAuthService {
  private readonly logger = new Logger(AccessAuthService.name);

  constructor(
    private readonly repo: AccessAuthRepository,
    private readonly envelopes: EnvelopesRepository,
    private readonly outbound: OutboundEmailsRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  // ---- sender side -------------------------------------------------------

  async getSettings(owner_id: string, envelope_id: string): Promise<AccessAuthSettings> {
    const envelope = await this.envelopes.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    return this.loadSettings(envelope_id);
  }

  async patchSettings(
    owner_id: string,
    envelope_id: string,
    patch: AccessAuthSettingsPatch,
  ): Promise<AccessAuthSettings> {
    const envelope = await this.envelopes.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');
    const known = new Set(envelope.signers.map((s) => s.id));
    const seen = new Set<string>();
    for (const s of patch.signers ?? []) {
      if (!known.has(s.signer_id) || seen.has(s.signer_id)) {
        throw new BadRequestException('validation_error');
      }
      seen.add(s.signer_id);
    }
    const ok = await this.repo.setSettings(envelope_id, patch);
    if (!ok) throw new ConflictException('envelope_not_draft');
    return this.loadSettings(envelope_id);
  }

  private async loadSettings(envelope_id: string): Promise<AccessAuthSettings> {
    const stored = await this.repo.getSettings(envelope_id);
    if (!stored) throw new NotFoundException('envelope_not_found');
    return toWire(stored);
  }

  // ---- signer side -------------------------------------------------------

  /** What this signer faces. Both `none` while the flag is off. */
  async effectiveFor(
    envelope_id: string,
    signer_id: string,
  ): Promise<{ readonly access: SignerAuthMethod; readonly action: SignerAuthMethod }> {
    if (!isFeatureEnabled('signerAccessAuth')) return { access: 'none', action: 'none' };
    const stored = await this.repo.getSettings(envelope_id);
    if (!stored) return { access: 'none', action: 'none' };
    const own = stored.signers.find((s) => s.signer_id === signer_id);
    return {
      access: effectiveSignerAuth(stored.access_auth, own?.access_auth),
      action: effectiveSignerAuth(stored.action_auth, own?.action_auth),
    };
  }

  async requires(
    envelope: Envelope,
    signer: EnvelopeSigner,
    purpose: AccessCodePurpose,
  ): Promise<boolean> {
    const eff = await this.effectiveFor(envelope.id, signer.id);
    return (purpose === 'access' ? eff.access : eff.action) === METHOD;
  }

  async sendCode(
    envelope: Envelope,
    signer: EnvelopeSigner,
    purpose: AccessCodePurpose,
    ip: string | null,
    userAgent: string | null,
  ): Promise<AccessCodeSendResponse> {
    this.otpKey();
    if (!(await this.requires(envelope, signer, purpose))) {
      throw new ConflictException('access_auth_not_required');
    }
    const created = await this.repo.createChallenge({
      envelope_id: envelope.id,
      signer_id: signer.id,
      purpose,
      now: new Date(),
      ttl_seconds: ACCESS_CODE_POLICY.ttlSeconds,
    });
    if (!created.ok) {
      throw new AccessCodeThrottledException(
        created.reason === 'cooldown' ? 'access_code_cooldown' : 'access_code_rate_limited',
        created.retry_after_seconds,
      );
    }
    const challenge = created.challenge;
    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    const masked = maskEmail(signer.email);
    try {
      const sentEvent = await this.envelopes.appendEvent({
        envelope_id: envelope.id,
        signer_id: signer.id,
        actor_kind: 'signer',
        event_type: 'access_code_sent',
        ip,
        user_agent: userAgent,
        metadata: { method: METHOD, purpose, to_masked: masked },
      });
      // Ids and display text only. The code is minted at dispatch and the
      // signer's link token never appears here.
      await this.outbound.insert({
        envelope_id: envelope.id,
        signer_id: signer.id,
        kind: 'access_code',
        to_email: signer.email,
        to_name: signer.name,
        source_event_id: sentEvent.id,
        dedupe_key: `access_code:${challenge.id}`,
        // Fewer retries than the default: a code is useless after 10 min.
        max_attempts: 3,
        payload: {
          challenge_id: challenge.id,
          purpose,
          envelope_title: envelope.title,
          sender_name: envelope.sender_name ?? envelope.sender_email ?? 'The sender',
          public_url: publicUrl,
        },
      });
    } catch (err) {
      // The challenge has no mail behind it; close it so it cannot be armed.
      await this.repo.supersede(challenge.id).catch(() => undefined);
      throw err;
    }
    return {
      status: 'sent',
      purpose,
      email_masked: masked,
      expires_in_seconds: ACCESS_CODE_POLICY.ttlSeconds,
      resend_after_seconds: ACCESS_CODE_POLICY.resendCooldownSeconds,
    };
  }

  /** Resolves on a correct code, else throws the matching 4xx slug. */
  async verifyCode(
    envelope: Envelope,
    signer: EnvelopeSigner,
    purpose: AccessCodePurpose,
    code: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const key = this.otpKey();
    const outcome = await this.repo.attempt({
      signer_id: signer.id,
      purpose,
      now: new Date(),
      max_attempts: ACCESS_CODE_POLICY.maxAttempts,
      verification_check: VERIFICATION_CHECK_EMAIL_OTP,
      matches: (c) =>
        accessCodeMatches(
          key,
          { challenge_id: c.id, signer_id: signer.id, purpose },
          code,
          c.code_hash,
        ),
    });
    const base = {
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'signer' as const,
      ip,
      user_agent: userAgent,
    };
    switch (outcome.kind) {
      case 'verified':
        await this.envelopes.appendEvent({
          ...base,
          event_type: 'access_code_verified',
          metadata: { method: METHOD, purpose, to_masked: maskEmail(signer.email) },
        });
        return;
      case 'mismatch':
      case 'locked_now': {
        const locked = outcome.kind === 'locked_now';
        await this.envelopes.appendEvent({
          ...base,
          event_type: 'access_code_failed',
          metadata: {
            method: METHOD,
            purpose,
            reason: locked ? 'locked' : 'mismatch',
            attempts: outcome.challenge.attempts,
          },
        });
        if (locked) throw new HttpException('access_code_locked', 423);
        throw new UnprocessableEntityException('access_code_invalid');
      }
      case 'locked':
        throw new HttpException('access_code_locked', 423);
      case 'expired':
        throw new GoneException('access_code_expired');
      case 'not_requested':
        throw new ConflictException('access_code_not_requested');
    }
  }

  /**
   * `POST /sign/submit` gate. With `action_auth = email_otp` the submit
   * must carry a fresh code (purpose `action`); it covers the whole
   * submission, every field, not only signature fields.
   */
  async assertActionCode(
    envelope: Envelope,
    signer: EnvelopeSigner,
    code: string | undefined,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    if (!(await this.requires(envelope, signer, 'action'))) return;
    if (code === undefined) throw new HttpException('access_code_required', 428);
    await this.verifyCode(envelope, signer, 'action', code, ip, userAgent);
  }

  private otpKey(): string {
    const key = this.env.SIGNER_OTP_KEY;
    if (!key) {
      this.logger.error('SIGNER_OTP_KEY is not set; signer access codes are unavailable');
      throw new ServiceUnavailableException('access_code_unavailable');
    }
    return key;
  }
}

function toWire(stored: StoredAccessAuthSettings): AccessAuthSettings {
  return {
    access_auth: stored.access_auth,
    action_auth: stored.action_auth,
    signers: stored.signers.map((s) => ({
      signer_id: s.signer_id,
      access_auth: s.access_auth,
      action_auth: s.action_auth,
      effective_access_auth: effectiveSignerAuth(stored.access_auth, s.access_auth),
      effective_action_auth: effectiveSignerAuth(stored.action_auth, s.action_auth),
    })),
  };
}
