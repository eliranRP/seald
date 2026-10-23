import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  MCP_CONFIRMATION_TTL_SECONDS,
  SIGNER_IS_ACCOUNT_OWNER_NOTE,
  type ApprovalKind,
  type ApprovalPendingResult,
  type EnvelopesPreviewSendOutput,
  type EnvelopesSendOutput,
  type McpEventMetadata,
} from 'shared';
import { TransactionRunner } from '../db/transaction-runner';
import { sameMailbox } from '../email/insert-idempotent';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { ApprovalsRepository } from './approvals.repository';
import { ApprovalsService, type AgentSubject } from './approvals.service';
import { ConfirmationsService } from './confirmations.service';
import { SendGuardService } from './send-guard.service';

/** The verified credential an agent call presented. `ownerId` comes from it, never from arguments. */
export interface AgentCredential {
  readonly ownerId: string;
  readonly keyId: string;
  readonly keyName: string;
  readonly keyPrefix: string;
  readonly requireOwnerApproval: boolean;
  readonly allowNewRecipients: boolean;
  /**
   * WP-27: set when the credential is an OAuth access token. `keyId` is
   * then the grant id, and the grant (not a key) is what asks, is
   * suspended, and is named on the audit rows.
   */
  readonly oauth?: { readonly grantId: string; readonly clientId: string } | null;
}

/** The approvals requester for a credential: a key, or an OAuth grant (WP-27). */
export function requesterOf(cred: AgentCredential): {
  readonly ownerId: string;
  readonly apiKeyId: string | null;
  readonly oauthGrantId: string | null;
} {
  return cred.oauth
    ? { ownerId: cred.ownerId, apiKeyId: null, oauthGrantId: cred.oauth.grantId }
    : { ownerId: cred.ownerId, apiKeyId: cred.keyId, oauthGrantId: null };
}

/** The fields `envelopes_fix_signer` passes (already parsed by the tool's input schema). */
export interface FixSignerArgs {
  readonly envelope_id: string;
  readonly signer_id: string;
  readonly name?: string | undefined;
  readonly email?: string | undefined;
}

/** MCP request events carry this user agent and no client name. */
export const MCP_USER_AGENT = 'SealdMCP/1';

/**
 * Send, remind and cancel for an agent credential (MCP steps 10 and 11,
 * WP-24). The MCP tools are thin adapters over this service, and so will
 * REST v1 be (WP-35).
 *
 * - Send asks the owner (`approval_pending`) unless the key's owner
 *   turned approval off. Even then a recipient who is not known falls
 *   back to approval (unless the owner allowed new recipients), and the
 *   same-turn send needs the 10-minute token from `previewSend`, consumed
 *   in the transaction that locks the envelope and sends.
 * - Remind and cancel always ask the owner; they never take a token.
 * - Every path first refuses a suspended key or owner (`key_send_suspended`
 *   after three denials in 24 hours, `send_suspended` on bounce or
 *   complaint telemetry), and the send caps apply on every path.
 */
@Injectable()
export class AgentEnvelopeActionsService {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly envelopes: EnvelopesService,
    private readonly guard: SendGuardService,
    private readonly confirmations: ConfirmationsService,
    private readonly repo: ApprovalsRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  // ---------------------------------------------------------------------------
  // Send (step 10)
  // ---------------------------------------------------------------------------

  /** Dry run of a send or its preview: every check, no row written. */
  async checkSend(
    cred: AgentCredential,
    envelopeId: string,
    now: Date,
  ): Promise<Record<string, unknown>> {
    await this.assertNotSuspended(cred, now);
    const envelope = await this.envelopes.checkSend(cred.ownerId, envelopeId);
    const ownerEmail = await this.verifiedMailbox(cred.ownerId);
    const ownerIsSigner = envelope.signers.some((s) => sameMailbox(s.email, ownerEmail));
    if (ownerIsSigner) return { ready: false, signer_is_account_owner: true };
    const subject = await this.subject(cred, 'envelope_send', { envelope_id: envelopeId }, now);
    return {
      ready: true,
      signer_is_account_owner: false,
      approval: this.needsApproval(cred, subject) ? 'email' : 'none',
      approve_requires: subject.approveRequires,
      recipients: subject.summary.recipients.length,
      new_recipients: subject.newRecipientEmails.size,
    };
  }

  /**
   * `envelopes_preview_send`. On the approval path it opens (or
   * re-previews) the approval and returns no token; on the unattended
   * path it mints the 10-minute confirmation token bound to this
   * credential, the envelope and `subject_hash`.
   */
  async previewSend(
    cred: AgentCredential,
    envelopeId: string,
    now: Date,
  ): Promise<EnvelopesPreviewSendOutput> {
    await this.assertNotSuspended(cred, now);
    const envelope = await this.envelopes.checkSend(cred.ownerId, envelopeId);
    const ownerEmail = await this.verifiedMailbox(cred.ownerId);
    const signers = envelope.signers.map((s) => ({
      name: s.name,
      email: s.email,
      signer_is_account_owner: sameMailbox(s.email, ownerEmail),
    }));
    const ownerIsSigner = signers.some((s) => s.signer_is_account_owner);
    const summary = {
      title: envelope.title,
      signers,
      field_count: envelope.fields.length,
      expires_at: envelope.expires_at,
      file_sha256: envelope.original_sha256,
      ...(ownerIsSigner ? { note: SIGNER_IS_ACCOUNT_OWNER_NOTE } : {}),
    };
    const none = {
      approval_id: null,
      review_url: null,
      approve_requires: null,
    };
    if (ownerIsSigner) {
      // Still blocks the MCP send: the owner sends this from Seald.
      return { ready: false, summary, signer_is_account_owner: true, approval: 'none', ...none };
    }
    const args = { envelope_id: envelopeId };
    const subject = await this.subject(cred, 'envelope_send', args, now);
    if (this.needsApproval(cred, subject)) {
      const pending = await this.request(
        cred,
        'envelope_send',
        'envelopes_preview_send',
        args,
        now,
      );
      return {
        ready: true,
        summary,
        signer_is_account_owner: false,
        approval: 'email',
        approval_id: pending.approval_id,
        review_url: pending.review_url,
        approve_requires: pending.approve_requires,
      };
    }
    const minted = await this.confirmations.mint(
      requesterOf(cred),
      envelopeId,
      subject.subjectHash,
      now,
    );
    return {
      ready: true,
      summary,
      signer_is_account_owner: false,
      approval: 'none',
      ...none,
      confirmation_token: minted.token,
      expires_in_seconds: MCP_CONFIRMATION_TTL_SECONDS,
    };
  }

  /**
   * `envelopes_send`. Approval path: `approval_pending`, nothing sent
   * until the owner approves. Unattended path: consume the token under
   * the envelope lock, re-check the caps under the owner lock, and send,
   * all in one transaction.
   */
  async send(
    cred: AgentCredential,
    envelopeId: string,
    confirmationToken: string | undefined,
    now: Date,
  ): Promise<EnvelopesSendOutput> {
    await this.assertNotSuspended(cred, now);
    const args = { envelope_id: envelopeId };
    if (cred.requireOwnerApproval) {
      return this.request(cred, 'envelope_send', 'envelopes_send', args, now);
    }
    const subject = await this.subject(cred, 'envelope_send', args, now);
    if (this.needsApproval(cred, subject)) {
      // A recipient this key has not reached before: the owner approves,
      // with a sign-in, even though the key is unattended.
      return this.request(cred, 'envelope_send', 'envelopes_send', args, now);
    }
    if (confirmationToken === undefined) throw new BadRequestException('confirmation_required');

    return this.transactions.run(async () => {
      await this.guard.lockEnvelope(envelopeId);
      // Recomputed under the lock: a draft edited since the preview fails.
      const locked = await this.subject(cred, 'envelope_send', args, now);
      const consumed = await this.confirmations.consume(
        requesterOf(cred),
        confirmationToken,
        envelopeId,
        locked.subjectHash,
        now,
      );
      if (!consumed) throw new ConflictException('confirmation_invalid');
      await this.guard.assertCapsLocked(cred.ownerId, locked.newRecipientEmails.size, now);
      const sent = await this.envelopes.send(
        cred.ownerId,
        envelopeId,
        { email: locked.ownerEmail, name: null },
        { ip: null, user_agent: MCP_USER_AGENT },
        {
          mcp: this.attribution(cred, locked.ownerEmail, 'envelopes_send'),
          newRecipientEmails: locked.newRecipientEmails,
        },
      );
      return { status: 'sent' as const, envelope_id: sent.id, envelope_status: sent.status };
    });
  }

  // ---------------------------------------------------------------------------
  // Remind and cancel (step 11): always the approval path
  // ---------------------------------------------------------------------------

  /** `envelopes_preview_remind` and the remind dry run: the signer, no row written. */
  async previewRemind(
    cred: AgentCredential,
    envelopeId: string,
    signerId: string,
    now: Date,
  ): Promise<{
    readonly envelope_id: string;
    readonly signer: { readonly id: string; readonly name: string; readonly email: string };
    readonly approval: 'email';
  }> {
    await this.assertNotSuspended(cred, now);
    const { envelope, signer } = await this.envelopes.checkRemind(
      cred.ownerId,
      envelopeId,
      signerId,
    );
    const ownerEmail = await this.verifiedMailbox(cred.ownerId);
    if (sameMailbox(signer.email, ownerEmail)) {
      throw new ConflictException('signer_is_account_owner');
    }
    return {
      envelope_id: envelope.id,
      signer: { id: signer.id, name: signer.name, email: signer.email },
      approval: 'email',
    };
  }

  /**
   * `envelopes_remind`. The hourly throttle and the signer's turn are
   * checked first, so the agent hears `remind_throttled` (with
   * `retry_after_seconds`) or `not_your_turn` at once; the owner's
   * Approve re-checks both before the reminder goes out.
   */
  async remind(
    cred: AgentCredential,
    envelopeId: string,
    signerId: string,
    now: Date,
  ): Promise<ApprovalPendingResult> {
    await this.previewRemind(cred, envelopeId, signerId, now);
    return this.request(
      cred,
      'envelope_remind',
      'envelopes_remind',
      { envelope_id: envelopeId, signer_id: signerId },
      now,
    );
  }

  /** Cancel dry run: the envelope can be withdrawn; no row written. */
  async checkCancel(
    cred: AgentCredential,
    envelopeId: string,
    now: Date,
  ): Promise<Record<string, unknown>> {
    await this.assertNotSuspended(cred, now);
    const envelope = await this.envelopes.getById(cred.ownerId, envelopeId);
    if (envelope.status !== 'awaiting_others' && envelope.status !== 'sealing') {
      throw new ConflictException('envelope_terminal');
    }
    return {
      envelope_id: envelope.id,
      withdrawal_emails: envelope.signers.length,
      approval: 'email',
      approve_requires: 'session',
    };
  }

  /** `envelopes_cancel`. Approve always needs a session. */
  async cancel(
    cred: AgentCredential,
    envelopeId: string,
    now: Date,
  ): Promise<ApprovalPendingResult> {
    await this.assertNotSuspended(cred, now);
    return this.request(
      cred,
      'envelope_cancel',
      'envelopes_cancel',
      { envelope_id: envelopeId },
      now,
    );
  }

  // ---------------------------------------------------------------------------
  // Fix a signer and change an expiry (step 15): always the approval path
  // ---------------------------------------------------------------------------

  /** Fix-signer dry run: every check the request makes, no row written. */
  async checkFixSigner(
    cred: AgentCredential,
    args: FixSignerArgs,
    now: Date,
  ): Promise<Record<string, unknown>> {
    await this.assertNotSuspended(cred, now);
    const { signer } = await this.envelopes.checkFixSigner(
      cred.ownerId,
      args.envelope_id,
      args.signer_id,
      args,
    );
    const ownerEmail = await this.verifiedMailbox(cred.ownerId);
    if (sameMailbox(args.email ?? signer.email, ownerEmail)) {
      throw new ConflictException('signer_is_account_owner');
    }
    return {
      envelope_id: args.envelope_id,
      signer_id: signer.id,
      email_changes: args.email !== undefined && args.email !== signer.email.toLowerCase(),
      approval: 'email',
      approve_requires: 'session',
    };
  }

  /** `envelopes_fix_signer`. Approve always needs a session. */
  async fixSigner(
    cred: AgentCredential,
    args: FixSignerArgs,
    now: Date,
  ): Promise<ApprovalPendingResult> {
    await this.checkFixSigner(cred, args, now);
    return this.request(
      cred,
      'envelope_fix_signer',
      'envelopes_fix_signer',
      {
        envelope_id: args.envelope_id,
        signer_id: args.signer_id,
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.email !== undefined ? { email: args.email } : {}),
      },
      now,
    );
  }

  /** Change-expiry dry run. */
  async checkChangeExpiry(
    cred: AgentCredential,
    envelopeId: string,
    expiresAt: string,
    now: Date,
  ): Promise<Record<string, unknown>> {
    await this.assertNotSuspended(cred, now);
    const envelope = await this.envelopes.checkChangeExpiry(
      cred.ownerId,
      envelopeId,
      expiresAt,
      now,
    );
    return {
      envelope_id: envelope.id,
      previous_expires_at: envelope.expires_at,
      expires_at: new Date(expiresAt).toISOString(),
      approval: 'email',
      approve_requires: 'session',
    };
  }

  /** `envelopes_change_expiry`. Approve always needs a session. */
  async changeExpiry(
    cred: AgentCredential,
    envelopeId: string,
    expiresAt: string,
    now: Date,
  ): Promise<ApprovalPendingResult> {
    await this.checkChangeExpiry(cred, envelopeId, expiresAt, now);
    return this.request(
      cred,
      'envelope_change_expiry',
      'envelopes_change_expiry',
      { envelope_id: envelopeId, expires_at: expiresAt },
      now,
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** What `me_get` reports as left today. */
  remaining(
    ownerId: string,
    now: Date,
  ): Promise<{ readonly sends: number; readonly newRecipients: number }> {
    return this.guard.remaining(ownerId, now);
  }

  private needsApproval(cred: AgentCredential, subject: AgentSubject): boolean {
    if (cred.requireOwnerApproval) return true;
    return subject.newRecipientEmails.size > 0 && !cred.allowNewRecipients;
  }

  private subject(
    cred: AgentCredential,
    kind: ApprovalKind,
    args: Record<string, unknown>,
    now: Date,
  ): Promise<AgentSubject> {
    return this.approvals.subjectForAgent({
      requester: requesterOf(cred),
      kind,
      args,
      now,
    });
  }

  private request(
    cred: AgentCredential,
    kind: ApprovalKind,
    tool: string,
    args: Record<string, unknown>,
    now: Date,
  ): Promise<ApprovalPendingResult> {
    return this.approvals.request({
      requester: requesterOf(cred),
      kind,
      tool,
      args,
      now,
    });
  }

  private assertNotSuspended(cred: AgentCredential, now: Date): Promise<void> {
    const ref = requesterOf(cred);
    return this.guard.assertNotSuspended(cred.ownerId, ref.apiKeyId, now, ref.oauthGrantId);
  }

  private async verifiedMailbox(ownerId: string): Promise<string> {
    const mailbox = await this.repo.findOwnerMailbox(ownerId);
    if (!mailbox || mailbox.email === null || !mailbox.verified) {
      throw new ForbiddenException('email_not_verified');
    }
    return mailbox.email;
  }

  /** `metadata.mcp` of the unattended send (no owner approval; no session). */
  private attribution(cred: AgentCredential, ownerEmail: string, tool: string): McpEventMetadata {
    return {
      auth: cred.oauth ? 'oauth' : 'api_key',
      key_id: cred.oauth ? null : cred.keyId,
      key_prefix: cred.oauth ? null : cred.keyPrefix,
      key_name: cred.keyName,
      oauth_client_id: cred.oauth ? cred.oauth.clientId : null,
      oauth_grant_id: cred.oauth ? cred.oauth.grantId : null,
      acting_for_user_id: cred.ownerId,
      acting_for_email: ownerEmail,
      tool,
      approval: 'unattended',
      approved_by_session: false,
    };
  }
}
