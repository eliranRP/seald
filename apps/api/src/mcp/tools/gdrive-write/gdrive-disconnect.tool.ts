import { ApprovalPendingResultSchema, GdriveDisconnectInputSchema } from 'shared';
import { requestApproval } from '../../approval-pending';
import { defineWriteTool } from '../../tool';

/**
 * `gdrive_disconnect` (step 14). The same `GDriveService.revokeAccount`
 * `DELETE /integrations/gdrive/accounts/:id` runs, but only after the
 * owner approves. It never deletes on the agent's say-so: every call
 * returns `approval_pending`. Approve needs a sign-in.
 */
export const gdriveDisconnectTool = defineWriteTool({
  name: 'gdrive_disconnect',
  title: 'Disconnect Google Drive',
  description:
    'Asks the owner to disconnect a Google Drive account from Seald. Nothing is disconnected until the owner approves: the result is approval_pending with an approval_id and a review_url. Show review_url to the user and never open it. approve_requires is session: the owner must sign in to approve. Then poll approvals_get with the approval_id. account_id is optional with one connected account and required with several. Requires idempotency_key and dry_run.',
  step: 'step-14',
  scopes: ['gdrive:write'],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  requiresFlags: ['gdriveIntegration'],
  input: GdriveDisconnectInputSchema,
  output: ApprovalPendingResultSchema,
  preview: async (args, ctx) => {
    const account_id = await ctx.services.drive.resolveAccount(
      ctx.principal.ownerId,
      args.account_id,
    );
    return { account_id, requires: 'owner_approval', disconnects: false };
  },
  handler: async (args, ctx) => {
    const account_id = await ctx.services.drive.resolveAccount(
      ctx.principal.ownerId,
      args.account_id,
    );
    return requestApproval(ctx, 'gdrive_disconnect', 'gdrive_disconnect', { account_id });
  },
});
