import { AccountDeleteInputSchema, AccountDeleteOutputSchema } from 'shared';
import { previewApproval, requestApproval } from '../../approval-pending';
import { defineWriteTool } from '../../tool';
import { GATED_DESTRUCTIVE_ANNOTATIONS, GATED_GUIDANCE } from './gated-helpers';

/**
 * `account_delete` (WP-45, D5) → `DELETE /me`, only after the owner
 * approves. The approval page repeats the irreversible-deletion warning
 * and asks the owner to type the account email; the agent can do
 * neither. Every call returns `approval_pending`.
 */
export const accountDeleteTool = defineWriteTool({
  name: 'account_delete',
  title: 'Delete the Seald account (owner approves)',
  description: `Asks the account owner to delete their Seald account for good: drafts, contacts, templates, keys and Drive connections are removed, and this key stops working. It cannot be undone. On the approval page the owner reads the warning and types the account email. ${GATED_GUIDANCE} Needs account:admin. Requires idempotency_key and dry_run.`,
  step: 'WP-45',
  scopes: ['account:admin'],
  annotations: GATED_DESTRUCTIVE_ANNOTATIONS,
  atomic: true,
  input: AccountDeleteInputSchema,
  output: AccountDeleteOutputSchema,
  preview: (_args, ctx) => previewApproval(ctx, 'account_delete', {}),
  handler: (_args, ctx) => requestApproval(ctx, 'account_delete', 'account_delete', {}),
});
