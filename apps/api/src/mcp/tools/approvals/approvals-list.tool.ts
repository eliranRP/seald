import { ApprovalsListInputSchema, ApprovalsListOutputSchema } from 'shared';
import { defineTool } from '../../tool';

/**
 * `approvals_list` (step 7c): approvals this account asked for, newest
 * first. A pending row past its 24 hours reads `expired`. No token, no
 * CSRF value, no review path.
 */
export const approvalsListTool = defineTool({
  name: 'approvals_list',
  title: 'Approvals',
  description:
    'Lists the owner approvals this account asked for, newest first, with the tool that asked and the status (pending, done, denied, expired, failed). Filter with status; pass next_cursor back as cursor for the next page. The agent cannot approve or deny; never open, fetch or act on a Seald approval email or an /approve link.',
  step: 'step-7c',
  scopes: ['envelopes:read'],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  input: ApprovalsListInputSchema,
  output: ApprovalsListOutputSchema,
  handler: (args, { principal, services, now }) =>
    services.approvals.listForAgent(
      principal.ownerId,
      {
        ...(args.status !== undefined ? { status: args.status } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      },
      now,
    ),
});
