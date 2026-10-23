import { ConflictException } from '@nestjs/common';
import { uuid } from 'shared';
import { z } from 'zod';
import type { ApprovalKindHandler, DescribedSubject } from '../../../approvals/kinds/approval-kind';
import type { SendGuardService } from '../../../approvals/send-guard.service';
import type { BulkService } from '../../../bulk/bulk.service';

const Args = z.strictObject({ batch_id: uuid });
type Args = z.infer<typeof Args>;

/**
 * `bulk_send` (MCP step 15). One approval for a whole batch an agent saved
 * as a preview. Approve confirms the batch through the same
 * `BulkService.confirm` the app uses; the bulk worker then sends one
 * envelope per row, each stamped `metadata.mcp`.
 *
 * Bound to every row: its title and recipients, so a batch edited after the
 * request expires the approval. The card lists every recipient (New first),
 * a batch of more than 5 rows needs a sign-in to Approve (the generic
 * `batchSize` rule), and so does any new recipient. Every valid row counts
 * as one send toward the per-owner daily cap, at request time, at decision
 * time and again under the owner lock in `execute`.
 */
export function bulkSendKindHandler(deps: {
  readonly bulk: BulkService;
  readonly guard: SendGuardService;
}): ApprovalKindHandler<Args> {
  async function pendingRows(ownerId: string, batchId: string) {
    const batch = await deps.bulk.get(ownerId, batchId);
    if (batch.status !== 'preview') throw new ConflictException('bulk_batch_not_pending');
    if (!batch.confirmable) throw new ConflictException('bulk_preview_expired');
    const rows = batch.rows.filter((r) => r.status === 'pending');
    if (rows.length === 0) throw new ConflictException('bulk_no_valid_rows');
    return { batch, rows };
  }

  return {
    kind: 'bulk_send',
    tool: 'envelopes_bulk_send_from_template',
    actionLabel: 'Send a document to several people',
    ready: true,
    args: Args,
    highRisk: () => false,
    async describe(args, ctx): Promise<DescribedSubject> {
      const { batch, rows } = await pendingRows(ctx.ownerId, args.batch_id);
      const seen = new Set<string>();
      const recipients: Array<{ name: string; email: string }> = [];
      for (const row of rows) {
        for (const r of row.recipients) {
          const key = r.email.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          recipients.push({ name: r.name, email: r.email });
        }
      }
      return {
        subjectKey: `bulk:${batch.id}`,
        envelopeId: null,
        title: batch.template_title,
        recipients,
        pageCount: null,
        destination: null,
        files: [],
        fields: [],
        batchSize: rows.length,
        extra: {
          template_id: batch.template_id,
          rows: rows.map((r) => ({
            row: r.row,
            title: r.title,
            recipients: r.recipients.map((x) => ({
              name: x.name,
              email: x.email.toLowerCase(),
            })),
          })),
        },
      };
    },
    async checkLimits(args, ctx) {
      const { rows } = await pendingRows(ctx.ownerId, args.batch_id);
      await deps.guard.assertCaps(ctx.ownerId, ctx.newRecipients, ctx.now, rows.length);
    },
    async execute(args, ctx) {
      const { rows } = await pendingRows(ctx.ownerId, args.batch_id);
      const newRecipientEmails = ctx.newRecipientEmails ?? new Set<string>();
      // Under the owner lock, inside the decision's transaction: two
      // approvals racing at the cap give one batch and one Failed.
      await deps.guard.assertCapsLocked(ctx.ownerId, newRecipientEmails.size, ctx.now, rows.length);
      if (!ctx.mcp) throw new ConflictException('approval_credential_unsupported');
      const confirmed = await deps.bulk.confirmForAgent(
        ctx.ownerId,
        args.batch_id,
        { mcp: ctx.mcp, new_recipient_emails: [...newRecipientEmails] },
        ctx.now,
      );
      return { batch_id: confirmed.id, status: confirmed.status, rows: rows.length };
    },
  };
}
