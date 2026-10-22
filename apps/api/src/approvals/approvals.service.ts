import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  APPROVAL_POLICY,
  type ApprovalCard,
  type ApprovalDetail,
  type ApprovalKind,
  type ApprovalListResponse,
  type ApprovalPendingResult,
  type ApprovalStatus,
  type ApprovalSummary,
  type ApproveRequires,
  type ApprovalsGetOutput,
  type ApprovalsListOutput,
} from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { insertOutboundEmailIdempotent } from '../email/insert-idempotent';
import {
  OutboundEmailsRepository,
  type InsertOutboundEmailInput,
} from '../email/outbound-emails.repository';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { ApprovalCsrf } from './approval-csrf';
import { buildApprovalDeniedVars, reviewUrlFor } from './approval-email';
import { ApprovalMailBreaker } from './approval-mail-breaker';
import {
  approvalStatus,
  approveRequires,
  cardState,
  displayKeyName,
  expiryFrom,
  hasNoOutcome,
  isFreshForApproval,
  planOwnerEdit,
  sortRecipients,
  tokenCanDecide,
  type ApprovalRecord,
  type TokenMatch,
} from './approval-state';
import { hashApprovalToken, looksLikeApprovalToken } from './approval-token';
import { ApprovalsLifecycleService } from './approvals-lifecycle.service';
import { ApprovalsRepository, type ApprovalKeyFacts } from './approvals.repository';
import type { ApprovalKindHandler, DescribedSubject } from './kinds/approval-kind';
import { ApprovalKindRegistry } from './kinds/approval-kind.registry';
import { ApprovalKindNotReadyError } from './kinds/stub-kinds';
import { computeSubjectHash } from './subject-hash';

/** Who asks: the credential an MCP or REST v1 call presented. `ownerId` comes from it, never from arguments. */
export interface ApprovalRequester {
  readonly ownerId: string;
  readonly apiKeyId: string | null;
  readonly oauthGrantId?: string | null;
}

export interface ApprovalRequestInput {
  readonly requester: ApprovalRequester;
  readonly kind: ApprovalKind;
  readonly args: unknown;
  /** The tool that asked; defaults to the kind's tool. */
  readonly tool?: string;
  readonly now?: Date;
}

/** IP and user agent of the decision request (`approval_decided`). */
export interface DecisionAudit {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

interface Evaluated {
  readonly described: DescribedSubject;
  readonly summary: ApprovalSummary;
  readonly subjectHash: string;
  readonly approveRequires: ApproveRequires;
}

type AnyHandler = ApprovalKindHandler<Record<string, unknown>>;

const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 50;

/**
 * Owner approval (docs/design/mcp-server.md § Owner approval; MCP steps
 * 7a, 7c, 7d server side).
 *
 * - `request` is the one hook every approval-gated tool calls. It returns
 *   `approval_pending` with `review_url` at once; the email goes out
 *   through the outbox and its token is minted at dispatch.
 * - The owner decides from the email link (`/approvals/from-email*`,
 *   login-free unless Approve needs a session) or in the app
 *   (`/approvals/:id/approve|deny`, session JWT). Both resolve the same
 *   row; the first decision wins.
 * - At decision time the service re-describes the subject: a changed
 *   `subject_hash` is Expired; a revoked or expired key, or an action no
 *   longer possible, is Failed with `result_slug`. Only then is the
 *   decision recorded, `approval_decided` appended, and the action run on
 *   the server. The agent is never called back.
 */
@Injectable()
export class ApprovalsService {
  private readonly log = new Logger(ApprovalsService.name);
  private readonly publicUrl: string;
  private readonly appOrigin: string;

  constructor(
    private readonly repo: ApprovalsRepository,
    private readonly registry: ApprovalKindRegistry,
    private readonly breaker: ApprovalMailBreaker,
    private readonly lifecycle: ApprovalsLifecycleService,
    private readonly csrf: ApprovalCsrf,
    private readonly outbox: OutboundEmailsRepository,
    private readonly envelopes: EnvelopesRepository,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.publicUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
    this.appOrigin = new URL(env.APP_PUBLIC_URL).origin;
  }

  // -------------------------------------------------------------------------
  // The hook: ask the owner
  // -------------------------------------------------------------------------

  async request(input: ApprovalRequestInput): Promise<ApprovalPendingResult> {
    const now = input.now ?? new Date();
    const handler = this.registry.get(input.kind);
    if (!handler.ready) throw new ApprovalKindNotReadyError();
    const parsed = handler.args.safeParse(input.args);
    if (!parsed.success) throw new BadRequestException('validation_error');
    const args = parsed.data;

    const { ownerId } = input.requester;
    if (input.requester.apiKeyId === null) {
      // OAuth grants (WP-27) bring their own key-equivalent settings.
      throw new ConflictException('approval_credential_unsupported');
    }
    const key = await this.repo.findKeyFacts(input.requester.apiKeyId);
    if (!key || key.ownerId !== ownerId || key.revokedAt !== null) {
      throw new ForbiddenException('api_key_revoked');
    }
    if (key.expiresAt === null || Date.parse(key.expiresAt) <= now.getTime()) {
      throw new ForbiddenException('api_key_expired');
    }

    // Mail goes only to the account's verified address, never one from arguments.
    const mailbox = await this.repo.findOwnerMailbox(ownerId);
    if (!mailbox || mailbox.email === null || !mailbox.verified) {
      throw new ForbiddenException('email_not_verified');
    }
    const ownerEmail = mailbox.email;

    const evaluated = await this.evaluate(handler, args, ownerId, ownerEmail, key, now);
    const notify = key.approvalNotify;
    if (notify === 'email' && !(await this.breaker.allows(now))) throw approvalLimit();

    const opened = await this.repo.openOrRepreview({
      ownerId,
      apiKeyId: key.id,
      oauthGrantId: input.requester.oauthGrantId ?? null,
      kind: input.kind,
      tool: input.tool ?? handler.tool,
      subjectKey: evaluated.described.subjectKey,
      envelopeId: evaluated.described.envelopeId,
      args,
      summary: evaluated.summary,
      subjectHash: evaluated.subjectHash,
      approveRequires: evaluated.approveRequires,
      notify,
      expiresAt: expiryFrom(now),
      now,
      maxOpenPerKey: APPROVAL_POLICY.maxOpenPerKey,
      maxMailsPerOwnerPerDay: APPROVAL_POLICY.maxRequestMailsPerOwnerPerDay,
      email: notify === 'email' ? requestEmail(ownerEmail) : null,
    });
    if (!('record' in opened)) {
      this.log.warn(`approval_limit owner=${ownerId} key=${key.id} reason=${opened.outcome}`);
      throw approvalLimit();
    }
    this.log.log(
      `approval ${opened.outcome} id=${opened.record.id} kind=${input.kind} owner=${ownerId} key=${key.id}`,
    );
    return {
      status: 'approval_pending',
      message: 'pending owner approval',
      approval_id: opened.record.id,
      summary: opened.record.summary,
      review_url: reviewUrlFor(this.publicUrl, opened.record.id),
      approve_requires: opened.record.approveRequires,
    };
  }

  // -------------------------------------------------------------------------
  // Public page: the email link
  // -------------------------------------------------------------------------

  /**
   * `POST /approvals/from-email/preview`. Never decides. For a link that
   * can still decide it also issues the CSRF value (body) and nonce
   * (cookie, set by the controller).
   */
  async previewFromEmail(
    token: string,
    now: Date = new Date(),
  ): Promise<{ readonly card: ApprovalCard; readonly csrfNonce: string | null }> {
    const found = await this.lookupToken(token);
    if (!found) return { card: { state: 'expired' }, csrfNonce: null };
    let { record } = found;
    const { match } = found;
    if (tokenCanDecide(match) && isPendingUndecided(record, now)) {
      record = await this.expireIfDrifted(record, now);
    }
    const card = this.card(record, match, now);
    if (card.state !== 'pending' || !tokenCanDecide(match)) return { card, csrfNonce: null };
    const issued = this.csrf.issue(record.id);
    return { card: { ...card, csrf: issued.value }, csrfNonce: issued.nonce };
  }

  /**
   * `POST /approvals/from-email`. Approve or Deny with the link token, the
   * CSRF value bound to that approval, the nonce cookie, and the app's
   * Origin. A token an agent re-preview replaced never decides.
   */
  async decideFromEmail(input: {
    readonly token: string;
    readonly decision: 'approve' | 'deny';
    readonly csrf: string;
    readonly csrfNonce: string | undefined;
    readonly origin: string | undefined;
    readonly audit: DecisionAudit;
    readonly now?: Date;
  }): Promise<ApprovalCard> {
    const now = input.now ?? new Date();
    if (input.origin !== this.appOrigin) throw new ForbiddenException('csrf_invalid');
    const found = await this.lookupToken(input.token);
    if (!found) return { state: 'expired', decided: false };
    const { record, match } = found;
    if (!this.csrf.verify(record.id, input.csrfNonce, input.csrf)) {
      throw new ForbiddenException('csrf_invalid');
    }
    if (!tokenCanDecide(match)) return { ...this.card(record, match, now), decided: false };
    const outcome = await this.decide(record, {
      decision: input.decision,
      via: 'email',
      signedIn: false,
      tokenHash: hashApprovalToken(input.token),
      ownerId: null,
      audit: input.audit,
      now,
    });
    return { ...this.card(outcome.record, match, now), decided: outcome.decided };
  }

  // -------------------------------------------------------------------------
  // In-app queue and the guided review (session JWT only)
  // -------------------------------------------------------------------------

  async list(
    user: AuthUser,
    query: { readonly status?: ApprovalStatus; readonly limit?: number; readonly cursor?: string },
    now: Date = new Date(),
  ): Promise<ApprovalListResponse> {
    const page = await this.page(user.id, query, now);
    return {
      items: page.items.map((r) => this.detail(r, now)),
      next_cursor: page.nextCursor,
      pending_count: await this.repo.countPending(user.id, now),
    };
  }

  async get(user: AuthUser, id: string, now: Date = new Date()): Promise<ApprovalDetail> {
    return this.detail(await this.ownedRecord(user.id, id), now);
  }

  /**
   * In-app Approve, also the Approve of the guided review. The session's
   * newest `amr[].timestamp` must be within 12 hours; older, the owner
   * signs in again and returns to the same card.
   */
  async approveInApp(
    user: AuthUser,
    id: string,
    audit: DecisionAudit,
    now: Date = new Date(),
  ): Promise<ApprovalDetail> {
    if (!isFreshForApproval(user.lastSignInAt ?? null, now)) {
      throw new ForbiddenException('fresh_login_required');
    }
    const record = await this.ownedRecord(user.id, id);
    const outcome = await this.decide(record, {
      decision: 'approve',
      via: 'app',
      signedIn: true,
      tokenHash: null,
      ownerId: user.id,
      audit,
      now,
    });
    return this.detail(outcome.record, now);
  }

  /** In-app Deny: a session, no freshness window. */
  async denyInApp(
    user: AuthUser,
    id: string,
    audit: DecisionAudit,
    now: Date = new Date(),
  ): Promise<ApprovalDetail> {
    const record = await this.ownedRecord(user.id, id);
    const outcome = await this.decide(record, {
      decision: 'deny',
      via: 'app',
      signedIn: true,
      tokenHash: null,
      ownerId: user.id,
      audit,
      now,
    });
    return this.detail(outcome.record, now);
  }

  /**
   * After the owner edits from Review (7d): re-mint on the same pending
   * approval. The latest email's token becomes the single alias (that
   * link still decides and shows "Fields updated"), a new email goes out
   * unless `approval_notify` is `none`, and the 24 hours restart. An
   * unchanged subject is a no-op.
   */
  async refreshAfterOwnerEdit(
    user: AuthUser,
    id: string,
    now: Date = new Date(),
  ): Promise<ApprovalDetail> {
    const record = await this.ownedRecord(user.id, id);
    if (!isPendingUndecided(record, now)) throw new ConflictException('approval_not_pending');
    const handler = this.registry.get(record.kind);
    const key = record.apiKeyId ? await this.repo.findKeyFacts(record.apiKeyId) : null;
    if (!key) throw new ConflictException('approval_not_pending');
    const mailbox = await this.repo.findOwnerMailbox(record.ownerId);
    const ownerEmail = mailbox?.email ?? record.summary.approver_email;
    const args = handler.args.parse(record.args);
    const evaluated = await this.evaluate(handler, args, record.ownerId, ownerEmail, key, now);
    const plan = planOwnerEdit(record, evaluated.subjectHash, now);
    if (plan.kind === 'unchanged') return this.detail(record, now);
    const mail = record.notify === 'email' && (await this.breaker.allows(now));
    const applied = await this.repo.applyOwnerEdit({
      id: record.id,
      ownerId: record.ownerId,
      expectSubjectHash: record.subjectHash,
      subjectHash: plan.subjectHash,
      summary: evaluated.summary,
      approveRequires: evaluated.approveRequires,
      previousTokenHash: plan.previousTokenHash,
      expiresAt: plan.expiresAt,
      now,
      maxMailsPerOwnerPerDay: APPROVAL_POLICY.maxRequestMailsPerOwnerPerDay,
      email: mail ? requestEmail(ownerEmail) : null,
    });
    if (applied.outcome === 'not_open') throw new ConflictException('approval_not_pending');
    return this.detail(applied.record, now);
  }

  // -------------------------------------------------------------------------
  // MCP read tools (step 7c): status only, never a token or a review path
  // -------------------------------------------------------------------------

  async statusForAgent(
    ownerId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<ApprovalsGetOutput> {
    const record = await this.ownedRecord(ownerId, id);
    const { status, resultSlug } = approvalStatus(record, now);
    return status === 'failed' && resultSlug ? { status, result_slug: resultSlug } : { status };
  }

  async listForAgent(
    ownerId: string,
    query: { readonly status?: ApprovalStatus; readonly limit?: number; readonly cursor?: string },
    now: Date = new Date(),
  ): Promise<ApprovalsListOutput> {
    const page = await this.page(ownerId, query, now);
    return {
      items: page.items.map((r) => ({
        approval_id: r.id,
        tool: r.tool ?? r.kind,
        status: approvalStatus(r, now).status,
        requested_at: r.createdAt,
        expires_at: r.expiresAt,
      })),
      next_cursor: page.nextCursor,
    };
  }

  // -------------------------------------------------------------------------
  // Decision core
  // -------------------------------------------------------------------------

  private async decide(
    record: ApprovalRecord,
    d: {
      readonly decision: 'approve' | 'deny';
      readonly via: 'email' | 'app';
      readonly signedIn: boolean;
      readonly tokenHash: string | null;
      readonly ownerId: string | null;
      readonly audit: DecisionAudit;
      readonly now: Date;
    },
  ): Promise<{ readonly record: ApprovalRecord; readonly decided: boolean }> {
    if (!isPendingUndecided(record, d.now)) return { record, decided: false };
    const handler = this.registry.get(record.kind);
    const key = record.apiKeyId ? await this.repo.findKeyFacts(record.apiKeyId) : null;
    const mailbox = await this.repo.findOwnerMailbox(record.ownerId);
    const ownerEmail = mailbox?.email ?? record.summary.approver_email;
    const meta = {
      via: d.via,
      ip: d.audit.ip,
      userAgent: d.audit.userAgent,
      signedIn: d.signedIn,
      now: d.now,
    };
    const unchanged = async (): Promise<{ record: ApprovalRecord; decided: false }> => ({
      record: (await this.repo.findById(record.id)) ?? record,
      decided: false,
    });

    let args: Record<string, unknown> = {};
    if (d.decision === 'approve') {
      // Decision-time re-checks, under the conditional update below.
      let evaluated: Evaluated;
      try {
        args = handler.args.parse(record.args);
        if (!key) throw new ForbiddenException('api_key_revoked');
        evaluated = await this.evaluate(handler, args, record.ownerId, ownerEmail, key, d.now);
      } catch (err) {
        const failed = await this.repo.markFailedUndecided(record.id, slugOf(err), meta);
        return failed ? { record: failed, decided: false } : unchanged();
      }
      if (evaluated.subjectHash !== record.subjectHash) {
        // The agent changed the draft (or the account email changed) after
        // the request, with no new preview: this approval cannot apply.
        const expired = await this.repo.markExpired(record.id, 'subject_changed', d.now);
        return expired ? { record: expired, decided: false } : unchanged();
      }
      if (evaluated.approveRequires === 'session' && !d.signedIn) {
        throw new ForbiddenException('session_required');
      }
      if (key && key.revokedAt !== null) {
        const failed = await this.repo.markFailedUndecided(record.id, 'api_key_revoked', meta);
        return failed ? { record: failed, decided: false } : unchanged();
      }
      if (key && (key.expiresAt === null || Date.parse(key.expiresAt) <= d.now.getTime())) {
        const failed = await this.repo.markFailedUndecided(record.id, 'api_key_expired', meta);
        return failed ? { record: failed, decided: false } : unchanged();
      }
    }

    const claimed = await this.repo.claimDecision({
      id: record.id,
      decision: d.decision,
      tokenHash: d.tokenHash,
      ownerId: d.ownerId,
      via: d.via,
      ip: d.audit.ip,
      userAgent: d.audit.userAgent,
      signedIn: d.signedIn,
      subjectHash: record.subjectHash,
      now: d.now,
    });
    if (!claimed) return unchanged();
    this.log.log(`approval ${d.decision} id=${claimed.id} kind=${claimed.kind} via=${d.via}`);

    const audited = await this.appendDecided(claimed, d.decision, d.via, d.signedIn, d.audit, key);
    if (d.decision === 'deny') {
      await this.notifyDenied(claimed, ownerEmail, d.now);
      return { record: claimed, decided: true };
    }
    if (!audited) {
      // No audit row, no action: `approval_decided` precedes any `sent` row.
      const failed = await this.repo.markFailedAfterApprove(
        claimed.id,
        'audit_write_failed',
        d.now,
      );
      return { record: failed ?? claimed, decided: true };
    }
    try {
      const result = await handler.execute(args, {
        ownerId: claimed.ownerId,
        ownerEmail,
        now: d.now,
        approvalId: claimed.id,
        audit: { ip: d.audit.ip, user_agent: d.audit.userAgent },
      });
      const done = await this.repo.markCompleted(claimed.id, result, new Date());
      return { record: done ?? claimed, decided: true };
    } catch (err) {
      const slug = slugOf(err);
      this.log.warn(`approval action failed id=${claimed.id} kind=${claimed.kind} slug=${slug}`);
      const failed = await this.repo.markFailedAfterApprove(claimed.id, slug, new Date());
      return { record: failed ?? claimed, decided: true };
    }
  }

  /** `approval_decided` before any `sent` row (rule S.6: through appendEvent). */
  private async appendDecided(
    record: ApprovalRecord,
    decision: 'approve' | 'deny',
    via: 'email' | 'app',
    signedIn: boolean,
    audit: DecisionAudit,
    key: ApprovalKeyFacts | null,
  ): Promise<boolean> {
    if (record.envelopeId === null) return true;
    try {
      await this.envelopes.appendEvent({
        envelope_id: record.envelopeId,
        actor_kind: 'sender',
        event_type: 'approval_decided',
        ip: audit.ip,
        user_agent: audit.userAgent,
        metadata: {
          approval_id: record.id,
          action: record.kind,
          decision: decision === 'approve' ? 'approved' : 'denied',
          decided_via: via,
          signed_in: signedIn,
          ip: audit.ip,
          user_agent: audit.userAgent,
          key_id: key?.id ?? record.apiKeyId,
          key_name: key ? displayKeyName(key.name) : record.summary.key_name,
          key_prefix: key?.prefix ?? null,
        },
      });
      return true;
    } catch (err) {
      this.log.error(
        `approval_decided event failed id=${record.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /** Deny: a short email to the owner, and the third denial in 24 hours suspends the key's sends. */
  private async notifyDenied(record: ApprovalRecord, ownerEmail: string, now: Date): Promise<void> {
    try {
      const suspended = record.apiKeyId
        ? await this.lifecycle.isSendSuspended(record.apiKeyId, now)
        : false;
      if (suspended) this.log.warn(`key send suspended after denials key=${record.apiKeyId ?? ''}`);
      if (!(await this.breaker.allows(now))) return;
      await insertOutboundEmailIdempotent(this.outbox, {
        kind: 'approval_denied',
        to_email: ownerEmail,
        to_name: '',
        dedupe_key: `approval_denied:${record.id}`,
        payload: {
          approval_id: record.id,
          ...buildApprovalDeniedVars({
            summary: record.summary,
            publicUrl: this.publicUrl,
            suspended,
          }),
        },
      });
    } catch (err) {
      // The decision is recorded; a lost notice must not undo it.
      this.log.error(
        `approval_denied mail failed id=${record.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Describe the subject now and derive everything from it: the card
   * summary (New flags recomputed, New first), `subject_hash`, and
   * whether Approve needs a session.
   */
  private async evaluate(
    handler: AnyHandler,
    args: Record<string, unknown>,
    ownerId: string,
    ownerEmail: string,
    key: ApprovalKeyFacts,
    now: Date,
  ): Promise<Evaluated> {
    const described = await handler.describe(args, { ownerId, ownerEmail, now });
    const known = await this.repo.findKnownRecipients(
      ownerId,
      described.recipients.map((r) => r.email),
    );
    const recipients = sortRecipients(
      described.recipients.map((r) => ({
        name: r.name,
        email: r.email,
        is_new: !known.has(r.email.trim().toLowerCase()),
      })),
    );
    const keyName = displayKeyName(key.name);
    const summary: ApprovalSummary = {
      kind: handler.kind,
      action_label: handler.actionLabel,
      title: described.title,
      recipients,
      page_count: described.pageCount,
      key_name: keyName,
      approver_email: ownerEmail,
      destination: described.destination,
    };
    const subjectHash = computeSubjectHash({
      kind: handler.kind,
      recipients: described.recipients,
      pageCount: described.pageCount,
      keyName,
      approverEmail: ownerEmail,
      destination: described.destination,
      files: described.files,
      fields: described.fields,
      ...(described.extra ? { extra: described.extra } : {}),
    });
    return {
      described,
      summary,
      subjectHash,
      approveRequires: approveRequires({
        highRisk: handler.highRisk(args),
        recipients,
        alwaysRequireSignin: key.alwaysRequireSignin,
        batchSize: described.batchSize ?? 1,
      }),
    };
  }

  /** A pending row whose subject drifted reads Expired from now on. */
  private async expireIfDrifted(record: ApprovalRecord, now: Date): Promise<ApprovalRecord> {
    const handler = this.registry.get(record.kind);
    const key = record.apiKeyId ? await this.repo.findKeyFacts(record.apiKeyId) : null;
    if (!key) return record;
    const mailbox = await this.repo.findOwnerMailbox(record.ownerId);
    const ownerEmail = mailbox?.email ?? record.summary.approver_email;
    try {
      const args = handler.args.parse(record.args);
      const evaluated = await this.evaluate(handler, args, record.ownerId, ownerEmail, key, now);
      if (evaluated.subjectHash === record.subjectHash) return record;
    } catch {
      // Not describable any more (deleted, sent elsewhere): Approve will
      // record Failed with the slug; the preview leaves the row as is.
      return record;
    }
    return (await this.repo.markExpired(record.id, 'subject_changed', now)) ?? record;
  }

  private async lookupToken(
    token: string,
  ): Promise<{ readonly record: ApprovalRecord; readonly match: TokenMatch } | null> {
    if (!looksLikeApprovalToken(token)) return null;
    return this.repo.findByTokenHash(hashApprovalToken(token));
  }

  private async ownedRecord(ownerId: string, id: string): Promise<ApprovalRecord> {
    const record = await this.repo.findById(id);
    // Another owner's approval is indistinguishable from none (404, not 403).
    if (!record || record.ownerId !== ownerId) throw new NotFoundException('approval_not_found');
    return record;
  }

  private card(record: ApprovalRecord, match: TokenMatch, now: Date): ApprovalCard {
    const state = cardState(record, match, now);
    if (state === 'expired' || state === 'superseded') {
      return { state, approval_id: record.id };
    }
    const { resultSlug } = approvalStatus(record, now);
    return {
      state,
      approval_id: record.id,
      summary: record.summary,
      approve_requires: record.approveRequires,
      expires_at: record.expiresAt,
      fields_updated_at: record.ownerEditedAt,
      result_slug: resultSlug,
      review_url: reviewUrlFor(this.publicUrl, record.id),
    };
  }

  private detail(record: ApprovalRecord, now: Date): ApprovalDetail {
    const { status, resultSlug } = approvalStatus(record, now);
    return {
      id: record.id,
      kind: record.kind,
      status,
      summary: record.summary,
      approve_requires: record.approveRequires,
      envelope_id: record.envelopeId,
      requested_at: record.createdAt,
      expires_at: record.expiresAt,
      decided_at: record.approvedAt ?? record.deniedAt ?? record.failedAt,
      fields_updated_at: record.ownerEditedAt,
      result_slug: resultSlug,
      result: status === 'done' ? (record.result ?? {}) : null,
    };
  }

  private async page(
    ownerId: string,
    query: { readonly status?: ApprovalStatus; readonly limit?: number; readonly cursor?: string },
    now: Date,
  ): Promise<{ readonly items: readonly ApprovalRecord[]; readonly nextCursor: string | null }> {
    const limit = Math.min(Math.max(query.limit ?? LIST_LIMIT_DEFAULT, 1), LIST_LIMIT_MAX);
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const result = await this.repo.list(ownerId, {
      ...(query.status ? { status: query.status } : {}),
      limit,
      cursor,
      now,
    });
    const last = result.items[result.items.length - 1];
    return {
      items: result.items,
      nextCursor: result.hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
}

function isPendingUndecided(record: ApprovalRecord, now: Date): boolean {
  return hasNoOutcome(record) && approvalStatus(record, now).status === 'pending';
}

function approvalLimit(): HttpException {
  return new HttpException('approval_limit', HttpStatus.TOO_MANY_REQUESTS);
}

/** The `approval_request` outbox row: ids only, to the verified mailbox. */
function requestEmail(
  ownerEmail: string,
): (record: ApprovalRecord, dedupeKey: string) => InsertOutboundEmailInput {
  return (record, dedupeKey) => ({
    kind: 'approval_request',
    to_email: ownerEmail,
    to_name: '',
    dedupe_key: dedupeKey,
    payload: { approval_id: record.id, subject_hash: record.subjectHash },
  });
}

/** The slug a failed check or action records (`result_slug`). */
export function slugOf(err: unknown): string {
  if (err instanceof HttpException) {
    if (err.getStatus() >= 500) return 'action_failed';
    const body = err.getResponse();
    const raw =
      typeof body === 'string'
        ? body
        : ((body as { message?: string | string[] }).message ?? 'action_failed');
    const slug = Array.isArray(raw) ? raw.join('; ') : raw;
    return /^[a-z0-9_-]{1,64}$/.test(slug) ? slug : 'action_failed';
  }
  return 'action_failed';
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt, i: id }), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { readonly createdAt: string; readonly id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (parsed && typeof parsed === 'object') {
      const { c, i } = parsed as { c?: unknown; i?: unknown };
      if (
        typeof c === 'string' &&
        Number.isFinite(Date.parse(c)) &&
        typeof i === 'string' &&
        /^[0-9a-f-]{36}$/i.test(i)
      ) {
        return { createdAt: c, id: i };
      }
    }
  } catch {
    // fall through
  }
  throw new BadRequestException('invalid_cursor');
}
