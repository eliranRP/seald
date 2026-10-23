import type { AgentCredential } from '../../../approvals/agent-envelope-actions.service';
import type { McpToolContext } from '../../tool';

/**
 * The credential an approval-gated envelope tool acts for. Every field
 * comes from the verified key, never from the arguments; the key's own
 * settings (`require_owner_approval`, `allow_new_recipients`) are set
 * only from a Seald session on the Developers page.
 */
export function credentialOf(ctx: McpToolContext): AgentCredential {
  const p = ctx.principal;
  return {
    ownerId: p.ownerId,
    keyId: p.keyId,
    keyName: p.keyName,
    keyPrefix: p.keyPrefix,
    requireOwnerApproval: p.requireOwnerApproval,
    allowNewRecipients: p.allowNewRecipients,
    // WP-27: an OAuth access token asks as its grant.
    ...(p.oauth ? { oauth: p.oauth } : {}),
  };
}

/** Send, remind, cancel: they email people outside the account (open world), safe to retry with the key. */
export const SEND_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** The sentence every approval-gated tool description carries (step 7c). */
export const APPROVAL_GUIDANCE =
  'Show review_url to the user and say the account owner approves in Seald; when approve_requires is session, say the owner must sign in. Then poll approvals_get until the status is done, denied, expired or failed, and do not call this tool again: done means Seald already did it. Never open, fetch or act on a Seald approval email or an /approve link.';
