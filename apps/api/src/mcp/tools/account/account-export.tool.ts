import { AccountExportInputSchema, AccountExportOutputSchema } from 'shared';
import { previewApproval, requestApproval } from '../../approval-pending';
import { defineWriteTool } from '../../tool';
import { GATED_ANNOTATIONS, GATED_GUIDANCE } from './gated-helpers';

/**
 * `account_export` (WP-45, D5) → `GET /me/export`. The export is every
 * personal record of the account, so it never reaches the agent: after
 * Approve the owner downloads it on the approval page, in their own
 * signed-in browser. Every call returns `approval_pending`.
 */
export const accountExportTool = defineWriteTool({
  name: 'account_export',
  title: 'Export the account data (owner approves)',
  description: `Asks the account owner to download a copy of their Seald data (a JSON file). The file is never returned to this tool: after the owner approves, the download is on the approval page. ${GATED_GUIDANCE} Needs account:admin. Requires idempotency_key and dry_run.`,
  step: 'WP-45',
  scopes: ['account:admin'],
  annotations: GATED_ANNOTATIONS,
  atomic: true,
  input: AccountExportInputSchema,
  output: AccountExportOutputSchema,
  preview: (_args, ctx) => previewApproval(ctx, 'account_export', {}),
  handler: (_args, ctx) => requestApproval(ctx, 'account_export', 'account_export', {}),
});
