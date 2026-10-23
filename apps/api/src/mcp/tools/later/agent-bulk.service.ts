import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  APPROVAL_POLICY,
  type ApprovalPendingResult,
  type BulkBatch,
  type EnvelopesBulkSendFromTemplateOutput,
} from 'shared';
import { AccountDirectoryService } from '../../../accounts/account-directory.service';
import {
  requesterOf,
  type AgentCredential,
} from '../../../approvals/agent-envelope-actions.service';
import { ApprovalsService } from '../../../approvals/approvals.service';
import { SendGuardService } from '../../../approvals/send-guard.service';
import { BulkService, type BulkAgentRow } from '../../../bulk/bulk.service';
import { sameMailbox } from '../../../email/insert-idempotent';

/**
 * Bulk send for an agent credential (MCP step 15, WP-26). The MCP tools are
 * thin adapters over this service.
 *
 * - `request` saves the rows as a preview batch and asks the owner once for
 *   the whole batch (kind `bulk_send`). It writes nothing when a row is
 *   invalid, the suspension or send cap refuses it, or the approval cannot
 *   open, because the tool is atomic.
 * - `check` is the dry run: every check, nothing written.
 * - `get` reads a batch the credential's owner made.
 *
 * Unlike a single send there is no unattended path: a batch always waits
 * for the owner.
 */
@Injectable()
export class AgentBulkService {
  constructor(
    private readonly bulk: BulkService,
    private readonly approvals: ApprovalsService,
    private readonly guard: SendGuardService,
    private readonly accounts: AccountDirectoryService,
  ) {}

  async check(
    cred: AgentCredential,
    templateId: string,
    rows: ReadonlyArray<BulkAgentRow>,
    now: Date,
  ): Promise<Record<string, unknown>> {
    const ref = requesterOf(cred);
    await this.guard.assertNotSuspended(cred.ownerId, ref.apiKeyId, now, ref.oauthGrantId);
    const email = await this.ownerEmail(cred.ownerId);
    this.refuseOwnerAsSigner(rows, email);
    // The template and the shape of the rows first, then the allowance.
    const { slots, validated } = await this.bulk.validateRows(cred.ownerId, templateId, rows);
    await this.guard.assertCaps(cred.ownerId, 0, now, rows.length);
    const bad = validated.rows.filter((r) => r.errors.length > 0);
    return {
      rows: rows.length,
      slots: slots.length,
      valid: bad.length === 0,
      invalid_rows: bad.map((r) => ({ row: r.row, errors: r.errors.map((e) => e.code) })),
      approval: 'email',
      approve_requires:
        rows.length > APPROVAL_POLICY.sessionBatchThreshold ? 'session' : 'link_or_session',
    };
  }

  async request(
    cred: AgentCredential,
    templateId: string,
    rows: ReadonlyArray<BulkAgentRow>,
    now: Date,
  ): Promise<EnvelopesBulkSendFromTemplateOutput> {
    const ref = requesterOf(cred);
    await this.guard.assertNotSuspended(cred.ownerId, ref.apiKeyId, now, ref.oauthGrantId);
    const email = await this.ownerEmail(cred.ownerId);
    this.refuseOwnerAsSigner(rows, email);
    // The template and the shape of the rows first, then the allowance; the
    // batch is written only after both pass.
    await this.bulk.validateRows(cred.ownerId, templateId, rows);
    await this.guard.assertCaps(cred.ownerId, 0, now, rows.length);
    const batch = await this.bulk.createFromRows({ id: cred.ownerId, email }, templateId, rows);
    const pending: ApprovalPendingResult = await this.approvals.request({
      requester: requesterOf(cred),
      kind: 'bulk_send',
      tool: 'envelopes_bulk_send_from_template',
      args: { batch_id: batch.id },
      now,
    });
    return { ...pending, batch_id: batch.id };
  }

  get(ownerId: string, batchId: string): Promise<BulkBatch> {
    return this.bulk.get(ownerId, batchId);
  }

  private async ownerEmail(ownerId: string): Promise<string> {
    const email = await this.accounts.email(ownerId);
    if (!email) throw new ForbiddenException('email_not_verified');
    return email;
  }

  /** The account's own mailbox is sent from Seald, as for a single send. */
  private refuseOwnerAsSigner(rows: ReadonlyArray<BulkAgentRow>, ownerEmail: string): void {
    if (rows.some((r) => r.signers.some((s) => sameMailbox(s.email, ownerEmail)))) {
      throw new ConflictException('signer_is_account_owner');
    }
  }
}
