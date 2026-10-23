import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DEFAULT_LOCALE, isFeatureEnabled } from 'shared';
import { EmailCopyLinkMinter } from '../automations/actions/email/email-copy-link-minter.service';
import { ApprovalLinkMinter } from '../approvals/approval-link-minter.service';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { resolveContentLocale } from '../i18n';
import { AccessCodeMinter } from '../signing/access-auth/access-code-minter.service';
import { isSignersTurn } from '../signing/signing-order';
import { SigningTokenService } from '../signing/signing-token.service';
import { EmailSendError, EmailSender, type EmailMessage } from './email-sender';
import {
  OutboundEmailsRepository,
  withoutSignerLink,
  type OutboundEmailRow,
} from './outbound-emails.repository';
import { TemplateService, type EmailTemplateKind } from './template.service';

export interface DispatchOutcome {
  readonly id: string;
  readonly status: 'sent' | 'retry' | 'failed' | 'skipped';
  readonly provider_id?: string;
  readonly error?: string;
}

export interface FlushResult {
  readonly claimed: number;
  readonly sent: number;
  readonly retried: number;
  readonly failed: number;
  readonly skipped: number;
  readonly outcomes: ReadonlyArray<DispatchOutcome>;
}

/**
 * Drains the `outbound_emails` queue.
 *
 * One row per call to {@link dispatchOne}: claim (atomically flip to
 * `sending` + bump attempts), render the template, hand to the configured
 * `EmailSender`, then mark `sent` / `pending` (retry) / `failed` (final)
 * based on the outcome.
 *
 * Retry policy: exponential backoff (2^n minutes, capped at 6 hours). After
 * `max_attempts` (default 8) a permanent `failed` state stops retries.
 *
 * Signer links (MCP Insert A, migration 0027): `invite` and `reminder`
 * rows store the signer id only. Each dispatch attempt mints a new
 * 256-bit token, writes its hash to `envelope_signers.access_token_hash`
 * (replacing the previous one, so every older link stops working) and
 * renders `/sign/<envelope>?t=<token>` into this one message. The token
 * is never written back to the outbox. A retry re-mints. Nothing rebuilds
 * a link from a hash.
 *
 * The service is deliberately small — the in-process worker loop, the cron
 * endpoint, and the one-shot dev script all call {@link flushOnce}.
 */
@Injectable()
export class EmailDispatcherService {
  private readonly log = new Logger('EmailDispatcher');
  private readonly fromAddress: string;
  private readonly fromName: string;
  // Globally-injected legal-footer vars — surfaced in every template's
  // `<div class="foot">`. CAN-SPAM § 5(a)(5) / CASL § 6(2)(c) require a
  // valid postal address and a working unsubscribe / preferences endpoint
  // on every commercial email. We inject these once here so individual
  // templates don't have to know which vars exist.
  private readonly legalFooterVars: Readonly<Record<string, string>>;
  private readonly publicUrl: string;

  constructor(
    private readonly repo: OutboundEmailsRepository,
    private readonly sender: EmailSender,
    private readonly templates: TemplateService,
    private readonly envelopes: EnvelopesRepository,
    private readonly tokens: SigningTokenService,
    @Inject(APP_ENV) env: AppEnv,
    // WP-10: mints the one-time code of an `access_code` row at dispatch.
    @Optional() private readonly accessCodes?: AccessCodeMinter,
    // WP-21: mints the link token of an `approval_request` row at dispatch.
    @Optional() private readonly approvalLinks?: ApprovalLinkMinter,
    @Optional() private readonly copyLinks?: EmailCopyLinkMinter,
  ) {
    this.publicUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
    this.fromAddress = env.EMAIL_FROM_ADDRESS;
    this.fromName = env.EMAIL_FROM_NAME;
    this.legalFooterVars = Object.freeze({
      legal_entity: env.EMAIL_LEGAL_ENTITY,
      legal_postal: env.EMAIL_LEGAL_POSTAL,
      privacy_url: env.EMAIL_PRIVACY_URL,
      preferences_url: env.EMAIL_PREFERENCES_URL,
    });
  }

  /**
   * Repeatedly claim + send until the queue is empty or `maxBatch` rows
   * have been processed in this call. Returns a tidy summary for the
   * caller (cron endpoint, dev script, tests) to log or surface.
   */
  async flushOnce(
    maxBatch = 50,
    scope?: { readonly envelopeIds?: readonly string[] },
  ): Promise<FlushResult> {
    const outcomes: DispatchOutcome[] = [];
    for (let i = 0; i < maxBatch; i += 1) {
      const outcome = await this.dispatchOne(scope?.envelopeIds);
      if (!outcome) break;
      outcomes.push(outcome);
    }
    const by = { sent: 0, retried: 0, failed: 0, skipped: 0 };
    for (const o of outcomes) {
      if (o.status === 'sent') by.sent += 1;
      else if (o.status === 'retry') by.retried += 1;
      else if (o.status === 'failed') by.failed += 1;
      else by.skipped += 1;
    }
    return {
      claimed: outcomes.length,
      sent: by.sent,
      retried: by.retried,
      failed: by.failed,
      skipped: by.skipped,
      outcomes,
    };
  }

  /**
   * Process one row. Returns null when the queue is empty. Otherwise a
   * dispatch outcome describing what happened (sent / retry / failed /
   * skipped). Exposed directly for tests.
   */
  async dispatchOne(envelopeIds?: readonly string[]): Promise<DispatchOutcome | null> {
    const claimed = await this.repo.claimNext(new Date(), envelopeIds);
    if (!claimed) return null;

    try {
      if (claimed.kind === 'reminder' && !(await this.reminderStillDue(claimed))) {
        this.log.warn(
          `reminder skipped reminder_no_longer_due envelope=${claimed.envelope_id ?? ''} signer=${claimed.signer_id ?? ''}`,
        );
        await this.repo.markSkipped(claimed.id, 'reminder_no_longer_due');
        return { id: claimed.id, status: 'skipped', error: 'reminder_no_longer_due' };
      }
      // Rows queued before 0027 may still carry a plaintext link. It is
      // never used: the link is minted below for this attempt only.
      let payload: Record<string, unknown> = withoutSignerLink(claimed.payload);
      if (SIGNER_LINK_KINDS.has(claimed.kind)) {
        const signUrl = await this.mintSignUrl(claimed);
        if (!signUrl) {
          // Canceled, expired, signed or declined since the row was queued.
          // Rotating now would only revoke a link; nothing is sent.
          this.log.warn(
            `${claimed.kind} skipped signer_not_pending envelope=${claimed.envelope_id ?? ''} signer=${claimed.signer_id ?? ''}`,
          );
          await this.repo.markSkipped(claimed.id, 'signer_not_pending');
          return { id: claimed.id, status: 'skipped', error: 'signer_not_pending' };
        }
        payload = { ...payload, sign_url: signUrl };
      }
      if (claimed.kind === 'access_code') {
        // WP-10: the code exists only in this message; its HMAC is stored.
        const minted = this.accessCodes ? await this.accessCodes.mint(claimed) : null;
        if (!minted) {
          this.log.warn(
            `access_code skipped challenge_not_open envelope=${claimed.envelope_id ?? ''} signer=${claimed.signer_id ?? ''}`,
          );
          await this.repo.markSkipped(claimed.id, 'challenge_not_open');
          return { id: claimed.id, status: 'skipped', error: 'challenge_not_open' };
        }
        payload = { ...payload, ...minted };
      }
      if (claimed.kind === 'approval_request') {
        // WP-21: the approval link token exists only in this message; its
        // hash is stored on the approval. Null: the approval was decided,
        // expired, or superseded by a newer email.
        const minted = this.approvalLinks ? await this.approvalLinks.mint(claimed) : null;
        if (!minted) {
          this.log.warn(`approval_request skipped approval_not_pending outbound=${claimed.id}`);
          await this.repo.markSkipped(claimed.id, 'approval_not_pending');
          return { id: claimed.id, status: 'skipped', error: 'approval_not_pending' };
        }
        payload = { ...payload, ...minted };
      }
      if (claimed.kind === 'automation_copy') {
        // WP-33: the stop link token exists only in this message; its hash is
        // stored. Null: the address already stopped these notices.
        const minted = this.copyLinks ? await this.copyLinks.mint(claimed) : null;
        if (!minted) {
          this.log.warn(`automation_copy skipped recipient_stopped outbound=${claimed.id}`);
          await this.repo.markSkipped(claimed.id, 'recipient_stopped');
          return { id: claimed.id, status: 'skipped', error: 'recipient_stopped' };
        }
        payload = { ...payload, ...minted };
      }
      const rendered = this.render(claimed, payload, await this.localeFor(claimed));
      if (!rendered) {
        await this.repo.markFailed(claimed.id, {
          error: `unknown_template_kind:${claimed.kind}`,
          final: true,
        });
        return { id: claimed.id, status: 'failed', error: `unknown_template_kind:${claimed.kind}` };
      }

      const message: EmailMessage = {
        to: { email: claimed.to_email, name: claimed.to_name },
        from: { email: this.fromAddress, name: this.fromName },
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        // A link-bearing body changes on every attempt (fresh token), so
        // each attempt gets its own provider idempotency key. Reusing the
        // row id would make the provider replay or reject the earlier body.
        idempotencyKey: PER_ATTEMPT_BODY_KINDS.has(claimed.kind)
          ? `${claimed.id}:${claimed.attempts}`
          : claimed.id,
      };

      const result = await this.sender.send(message);
      await this.repo.markSent(claimed.id, result.providerId, new Date());
      if (
        claimed.kind === 'reminder' &&
        claimed.payload['automated'] === true &&
        claimed.envelope_id
      ) {
        try {
          await this.envelopes.appendEvent({
            envelope_id: claimed.envelope_id,
            signer_id: claimed.signer_id,
            actor_kind: 'system',
            event_type: 'reminder_sent',
            metadata: { automated: true },
          });
        } catch (err) {
          // The mail is already sent. A failed audit write must not mark
          // the row pending again, or the next flush would send it twice.
          this.log.error(
            `reminder_sent event failed after send outbound=${claimed.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      return { id: claimed.id, status: 'sent', provider_id: result.providerId };
    } catch (err) {
      return this.handleSendError(claimed, err);
    }
  }

  /**
   * Re-check a queued reminder at send time. Enqueue can be hours ahead of
   * the drain when the worker is off and cron flushes later.
   * Manual reminders still go out when the sender has turned the daily
   * switch off; automated ones do not.
   */
  private async reminderStillDue(row: OutboundEmailRow): Promise<boolean> {
    if (!row.envelope_id || !row.signer_id) return false;
    const envelope = await this.envelopes.findByIdWithAll(row.envelope_id);
    const signer = envelope?.signers.find((item) => item.id === row.signer_id) ?? null;
    if (!envelope || !signer) return false;
    if (envelope.status !== 'awaiting_others') return false;
    if (!(Date.parse(envelope.expires_at) > Date.now())) return false;
    if (signer.signed_at !== null || signer.declined_at !== null) return false;
    // WP-05: never hand a later sequential step its link early.
    if (!isSignersTurn(envelope.delivery_mode, envelope.signers, signer.id)) return false;
    if (row.payload['automated'] === true && !envelope.reminders_enabled) return false;
    return true;
  }

  /**
   * Mint the signer token for this dispatch attempt and return the link.
   * `rotateSignerAccessToken` stores only the hash and is guarded in SQL:
   * the envelope must be `awaiting_others` and the signer must not have
   * signed or declined. Returns null when that guard refuses.
   */
  private async mintSignUrl(row: OutboundEmailRow): Promise<string | null> {
    if (!row.envelope_id || !row.signer_id) return null;
    const token = this.tokens.generate();
    const minted = await this.envelopes.rotateSignerAccessToken(
      row.signer_id,
      this.tokens.hash(token),
    );
    if (!minted) return null;
    return `${this.publicUrl}/sign/${row.envelope_id}?t=${token}`;
  }

  /**
   * WP-38: signer-facing mail uses signer.locale ?? envelope.locale ?? 'en';
   * sender-facing mail (`*_to_sender`, or any row with no signer) uses
   * envelope.locale ?? 'en'. Flag `i18n` off: always `en`, no lookup.
   */
  private async localeFor(row: OutboundEmailRow): Promise<string> {
    if (!isFeatureEnabled('i18n') || !row.envelope_id) return DEFAULT_LOCALE;
    const envelope = await this.envelopes.findByIdWithAll(row.envelope_id);
    if (!envelope) return DEFAULT_LOCALE;
    const signerFacing = row.signer_id !== null && !row.kind.endsWith('_to_sender');
    const signer = signerFacing
      ? envelope.signers.find((item) => item.id === row.signer_id)
      : undefined;
    return resolveContentLocale({
      envelopeLocale: envelope.locale,
      signerLocale: signer?.locale,
    });
  }

  private render(
    row: OutboundEmailRow,
    payload: Readonly<Record<string, unknown>>,
    locale: string,
  ): ReturnType<TemplateService['render']> | null {
    if (!TEMPLATE_KINDS.has(row.kind)) return null;
    // The payload is a JSON blob; TemplateService expects a flat map of
    // string|number values. Coerce unknown values defensively — missing
    // vars render as empty strings already.
    // Per-row payload wins over the global legal-footer defaults so a
    // sender (e.g. an enterprise tenant) can override the postal block
    // without redeploying.
    const vars: Record<string, string | number> = { ...this.legalFooterVars };
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
      else if (v !== null && v !== undefined) vars[k] = String(v);
    }
    return this.templates.render(row.kind as EmailTemplateKind, vars, locale);
  }

  private async handleSendError(row: OutboundEmailRow, err: unknown): Promise<DispatchOutcome> {
    const message = err instanceof Error ? err.message : String(err);
    // After `claimNext`, `attempts` in `row` still holds the value it had
    // *after* the increment — so `row.attempts` is the count of attempts
    // made so far (including this one).
    const attemptsSoFar = row.attempts;
    const transient = err instanceof EmailSendError ? err.transient : true;
    const hitsMax = attemptsSoFar >= row.max_attempts;

    if (!transient || hitsMax) {
      await this.repo.markFailed(row.id, { error: message, final: true });
      this.log.warn(
        `outbound_email ${row.id} (${row.kind} → ${row.to_email}) failed ${
          hitsMax ? '(max attempts)' : '(permanent)'
        }: ${message}`,
      );
      return { id: row.id, status: 'failed', error: message };
    }

    const nextAttemptAt = new Date(Date.now() + backoffMs(attemptsSoFar));
    await this.repo.markFailed(row.id, {
      error: message,
      final: false,
      nextAttemptAt,
    });
    this.log.warn(
      `outbound_email ${row.id} (${row.kind} → ${row.to_email}) will retry at ${nextAttemptAt.toISOString()}: ${message}`,
    );
    return { id: row.id, status: 'retry', error: message };
  }
}

/** Kinds whose email carries the signer's `/sign/…?t=` link. */
const SIGNER_LINK_KINDS = new Set<string>(['invite', 'reminder']);

/** Kinds whose body is minted per attempt (a link token or a one-time code). */
const PER_ATTEMPT_BODY_KINDS = new Set<string>([
  ...SIGNER_LINK_KINDS,
  'access_code',
  'approval_request',
  'automation_copy',
]);

const TEMPLATE_KINDS = new Set<string>([
  'invite',
  'reminder',
  'completed',
  'declined_to_sender',
  'withdrawn_to_signer',
  'withdrawn_after_sign',
  'expired_to_sender',
  'expired_to_signer',
  'signed_to_sender',
  'api_key_created',
  'access_code',
  'approval_request',
  'approval_denied',
  'bulk_complete',
  'automation_copy',
]);

/**
 * Exponential backoff: 2 min, 4, 8, 16, 32, 64, 128, 256 — capped at 6h.
 * Returns the delay in milliseconds for an attempt `n` (1-indexed).
 */
export function backoffMs(attemptsSoFar: number): number {
  const base = 2 * 60 * 1000; // 2 minutes
  const capped = Math.min(6 * 60 * 60 * 1000, base * 2 ** Math.max(0, attemptsSoFar - 1));
  return capped;
}
