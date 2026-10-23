import { ApiKeysRevokeInputSchema, ApiKeysRevokeOutputSchema } from 'shared';
import { previewApproval, requestApproval } from '../../approval-pending';
import { defineWriteTool } from '../../tool';
import { GATED_DESTRUCTIVE_ANNOTATIONS, GATED_GUIDANCE } from '../account/gated-helpers';

/**
 * `api_keys_revoke` (WP-45, D5) → `POST /me/api-keys/:id/revoke`, only
 * after the owner approves. Revoking keeps the row and expires that
 * key's pending approvals, as in the app.
 */
export const apiKeysRevokeTool = defineWriteTool({
  name: 'api_keys_revoke',
  title: 'Revoke an API key (owner approves)',
  description: `Asks the account owner to revoke one API key (api_key_id from api_keys_list). A revoked key stops working at once and its pending approvals expire. Revoking the key that makes this call is allowed. ${GATED_GUIDANCE} Needs keys:admin. Requires idempotency_key and dry_run.`,
  step: 'WP-45',
  scopes: ['keys:admin'],
  annotations: GATED_DESTRUCTIVE_ANNOTATIONS,
  atomic: true,
  input: ApiKeysRevokeInputSchema,
  output: ApiKeysRevokeOutputSchema,
  preview: (args, ctx) => previewApproval(ctx, 'api_key_revoke', { api_key_id: args.api_key_id }),
  handler: (args, ctx) =>
    requestApproval(ctx, 'api_key_revoke', 'api_keys_revoke', { api_key_id: args.api_key_id }),
});
