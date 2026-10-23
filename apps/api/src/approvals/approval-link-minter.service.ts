import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { buildApprovalRequestVars } from './approval-email';
import { generateApprovalToken } from './approval-token';
import { ApprovalsRepository } from './approvals.repository';

/**
 * Mints the link token of an `approval_request` email at dispatch (MCP
 * Insert A, WP-13 pattern). The outbox row holds only `approval_id` and
 * the `subject_hash` it was queued for. Each attempt draws a new token
 * and stores its hash on the row in one conditional update, so a retry
 * re-mints and the earlier, undelivered token stops matching. The raw
 * token exists only in the message being sent; nothing rebuilds a link
 * from a hash.
 *
 * Returns null (the dispatcher skips the row) when the approval is no
 * longer open, or when a later re-preview or owner edit superseded the
 * subject this email was queued for.
 */
@Injectable()
export class ApprovalLinkMinter {
  private readonly publicUrl: string;

  constructor(
    private readonly repo: ApprovalsRepository,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.publicUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
  }

  async mint(row: {
    readonly payload: Readonly<Record<string, unknown>>;
  }): Promise<Record<string, string | number> | null> {
    const approvalId = row.payload['approval_id'];
    const subjectHash = row.payload['subject_hash'];
    if (typeof approvalId !== 'string' || typeof subjectHash !== 'string') return null;
    const minted = generateApprovalToken();
    const record = await this.repo.armLinkToken(approvalId, subjectHash, minted.hash, new Date());
    if (!record) return null;
    return buildApprovalRequestVars({
      summary: record.summary,
      approveRequires: record.approveRequires,
      publicUrl: this.publicUrl,
      approvalId: record.id,
      token: minted.token,
      fieldsUpdated: record.ownerEditedAt !== null,
    });
  }
}
