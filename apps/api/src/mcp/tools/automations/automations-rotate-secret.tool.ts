import { AutomationsRotateSecretInputSchema, AutomationsRotateSecretOutputSchema } from 'shared';
import { previewApproval, requestApproval } from '../../approval-pending';
import { defineWriteTool } from '../../tool';
import { GATED_ANNOTATIONS, GATED_GUIDANCE } from '../account/gated-helpers';
import { AUTOMATION_FLAGS } from './automations-annotations';

/**
 * `automations_rotate_secret` (WP-45, D5) →
 * `POST /automations/:id/rotate-secret`, only after the owner approves.
 * The new signing secret is shown once on the approval page and never
 * reaches the agent.
 */
export const automationsRotateSecretTool = defineWriteTool({
  name: 'automations_rotate_secret',
  title: 'Rotate a webhook signing secret (owner approves)',
  description: `Asks the account owner to replace the signing secret of a webhook automation. The new secret is never returned to this tool: the owner sees it once on the approval page and puts it in the receiving app. The old secret keeps verifying for 24 hours. A recipe that is not a webhook fails with not_a_webhook. ${GATED_GUIDANCE} Needs automations:write. Requires idempotency_key and dry_run.`,
  step: 'WP-45',
  scopes: ['automations:write'],
  annotations: GATED_ANNOTATIONS,
  requiresFlags: AUTOMATION_FLAGS,
  atomic: true,
  input: AutomationsRotateSecretInputSchema,
  output: AutomationsRotateSecretOutputSchema,
  preview: (args, ctx) =>
    previewApproval(ctx, 'automation_rotate_secret', { automation_id: args.automation_id }),
  handler: (args, ctx) =>
    requestApproval(ctx, 'automation_rotate_secret', 'automations_rotate_secret', {
      automation_id: args.automation_id,
    }),
});
