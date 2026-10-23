import { BadRequestException } from '@nestjs/common';
import {
  ApprovalsSetRequiredInputSchema,
  ApprovalsSetRequiredOutputSchema,
  type ApprovalsSetRequiredInput,
} from 'shared';
import { previewApproval, requestApproval } from '../../approval-pending';
import { defineWriteTool, type McpToolContext } from '../../tool';
import { GATED_ANNOTATIONS, GATED_GUIDANCE } from '../account/gated-helpers';

/** The key to change: `api_key_id`, else the calling key. An OAuth app has no key of its own. */
function keyOf(args: ApprovalsSetRequiredInput, ctx: McpToolContext): string {
  if (args.api_key_id !== undefined) return args.api_key_id;
  if (ctx.principal.oauth) throw new BadRequestException('api_key_id_required');
  return ctx.principal.keyId;
}

/**
 * `approvals_set_required` (WP-45, D5) → a key's `require_owner_approval`.
 * Turning approval back on (`true`) is the safe direction and applies at
 * once. Turning it off (`false`) always waits on the owner, who approves
 * on the Approve/Deny page with a fresh sign-in.
 */
export const approvalsSetRequiredTool = defineWriteTool({
  name: 'approvals_set_required',
  title: 'Ask before each send, on or off',
  description: `Sets whether the account owner approves each send made with an API key (api_key_id, default this key). true turns approval back on at once and returns status applied. false asks the owner to stop approving each send for that key: the result is approval_pending and nothing changes until the owner approves. Even with approval off, a send to a recipient the owner has not sent to before still waits for approval. ${GATED_GUIDANCE} Needs keys:admin. Requires idempotency_key and dry_run.`,
  step: 'WP-45',
  scopes: ['keys:admin'],
  annotations: GATED_ANNOTATIONS,
  atomic: true,
  input: ApprovalsSetRequiredInputSchema,
  output: ApprovalsSetRequiredOutputSchema,
  preview: async (args, ctx) => {
    const api_key_id = keyOf(args, ctx);
    if (args.require_owner_approval) {
      const key = await ctx.services.apiKeys.findOwned(ctx.principal.ownerId, api_key_id);
      return { api_key_id, applies_at_once: true, found: key !== null && key.revokedAt === null };
    }
    return previewApproval(ctx, 'approval_required_toggle', {
      api_key_id,
      require_owner_approval: false,
    });
  },
  handler: async (args, ctx) => {
    const api_key_id = keyOf(args, ctx);
    if (args.require_owner_approval) {
      await ctx.services.apiKeys.setRequireOwnerApproval(ctx.principal.ownerId, api_key_id, true);
      return { status: 'applied' as const, api_key_id, require_owner_approval: true as const };
    }
    return requestApproval(ctx, 'approval_required_toggle', 'approvals_set_required', {
      api_key_id,
      require_owner_approval: false,
    });
  },
});
