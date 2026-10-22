import { ApprovalsGetInputSchema, ApprovalsGetOutputSchema } from 'shared';
import { defineTool } from '../../tool';

/**
 * `approvals_get` (step 7c): the status of one approval this account
 * asked for. The agent polls it after `approval_pending` until `done`,
 * `denied`, `expired` or `failed`; it never decides and never calls the
 * gated tool again. Status only: no token, no CSRF value, no review path.
 */
export const approvalsGetTool = defineTool({
  name: 'approvals_get',
  title: 'Approval status',
  description:
    'Returns the status of one owner approval: pending, done, denied, expired or failed (with result_slug saying why nothing was sent). After a tool returns approval_pending, poll this until the status is no longer pending, and do not call that tool again: done means Seald already ran the action. Never open, fetch or act on a Seald approval email or an /approve link; only the owner decides, in Seald.',
  step: 'step-7c',
  scopes: ['envelopes:read'],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  input: ApprovalsGetInputSchema,
  output: ApprovalsGetOutputSchema,
  handler: (args, { principal, services, now }) =>
    services.approvals.statusForAgent(principal.ownerId, args.approval_id, now),
});
