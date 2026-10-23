import type { ApprovalKind, ApprovalPendingResult } from 'shared';
import { requesterOf } from './mcp-principal';
import type { McpToolContext } from './tool';

/**
 * Step 7c: the one call an approval-gated tool makes instead of acting.
 * The owner id and the key come from the verified credential, never from
 * the arguments. The result is a successful tool result, not an error:
 * `{ status: 'approval_pending', approval_id, summary, review_url,
 * approve_requires }`. `review_url` is the signed-in review, never the
 * `/approve#` token link, and carries no token.
 *
 * Tools that use it (WP-24 send / remind / cancel, WP-25 Drive, WP-30,
 * WP-45) describe: show `review_url` to the user and never open it; when
 * `approve_requires` is `session`, say the owner must sign in; then poll
 * `approvals_get`.
 */
export function requestApproval(
  ctx: McpToolContext,
  kind: ApprovalKind,
  tool: string,
  args: Record<string, unknown>,
): Promise<ApprovalPendingResult> {
  return ctx.services.approvals.request({
    requester: requesterOf(ctx.principal),
    kind,
    tool,
    args,
    now: ctx.now,
  });
}
