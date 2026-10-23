import { AutomationsDeleteInputSchema, AutomationsDeleteOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { AUTOMATION_FLAGS, AUTOMATION_WRITE_ANNOTATIONS } from './automations-annotations';

/**
 * `automations_delete` (WP-45, D5) → `AutomationsService.remove`, as
 * `DELETE /automations/:id`. Deleting only stops data from leaving
 * Seald, so it needs no approval (like turning a recipe off); its runs,
 * queued jobs and secrets go with it.
 */
export const automationsDeleteTool = defineWriteTool({
  name: 'automations_delete',
  title: 'Delete an automation',
  description:
    'Deletes one automation with its run history and queued runs. Nothing it would have sent goes out afterwards. It cannot be undone; to pause instead, use automations_set_enabled with enabled false. An unknown id is automation_not_found. Needs automations:write. Requires idempotency_key and dry_run.',
  step: 'WP-45',
  scopes: ['automations:write'],
  annotations: { ...AUTOMATION_WRITE_ANNOTATIONS, destructiveHint: true, openWorldHint: false },
  requiresFlags: AUTOMATION_FLAGS,
  input: AutomationsDeleteInputSchema,
  output: AutomationsDeleteOutputSchema,
  preview: async (args, { principal, services }) => {
    const automation = await services.automations.get(principal.ownerId, args.automation_id);
    return { automation_id: automation.id, deletes: true };
  },
  handler: async (args, { principal, services }) => {
    await services.automations.remove(principal.ownerId, args.automation_id);
    return { deleted: true as const, automation_id: args.automation_id };
  },
});
