import { AutomationsChangeOutputSchema, AutomationsSetEnabledInputSchema } from 'shared';
import { requestApproval } from '../../approval-pending';
import { defineWriteTool } from '../../tool';
import { AUTOMATION_FLAGS, AUTOMATION_WRITE_ANNOTATIONS } from './automations-annotations';

/** `automations_set_enabled` -> `AutomationsService.setEnabled` (automations A3). */
export const automationsSetEnabledTool = defineWriteTool({
  name: 'automations_set_enabled',
  title: 'Turn an automation on or off',
  description:
    "Turns one automation on or off. Off is immediate. On is immediate for a recipe that stays inside Seald; for one that sends data to an external destination (a webhook, or an address that is not the owner's mailbox) the result is approval_pending: show review_url to the owner, never open it, then poll approvals_get. Nothing runs until the owner approves. Needs automations:write. Requires idempotency_key and dry_run.",
  step: 'step-a3',
  scopes: ['automations:write'],
  annotations: AUTOMATION_WRITE_ANNOTATIONS,
  requiresFlags: AUTOMATION_FLAGS,
  input: AutomationsSetEnabledInputSchema,
  output: AutomationsChangeOutputSchema,
  preview: async (args, { principal, services }) => ({
    ...(await services.automations.previewSetEnabled(
      principal.ownerId,
      args.automation_id,
      args.enabled,
      { requireApproval: true },
    )),
  }),
  handler: async (args, ctx) => {
    const out = await ctx.services.automations.setEnabled(
      ctx.principal.ownerId,
      args.automation_id,
      args.enabled,
      { requireApproval: true, now: ctx.now },
    );
    if (!out.needsApproval) return { status: 'saved' as const, automation: out.automation };
    const pending = await requestApproval(
      ctx,
      'automation_external_destination',
      'automations_set_enabled',
      { automation_id: out.automation.id },
    );
    return { ...pending, automation: { ...out.automation, awaiting_approval: true } };
  },
});
