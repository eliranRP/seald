import { AutomationsListInputSchema, AutomationsListOutputSchema } from 'shared';
import { defineTool } from '../../tool';
import { AUTOMATION_FLAGS, AUTOMATION_READ_ANNOTATIONS } from './automations-annotations';

/** `automations_list` -> `AutomationsService.list` (automations A3). */
export const automationsListTool = defineTool({
  name: 'automations_list',
  title: 'List automations',
  description:
    "Lists this account's automations (recipes), most recently updated first. Each shows its trigger, action, whether it is on (status_word Off when not), the destination host for a webhook, and awaiting_approval while an owner approval is open. Never returns a webhook URL or signing secret. Pass next_cursor back as cursor for the next page. Needs automations:read.",
  step: 'step-a3',
  scopes: ['automations:read'],
  annotations: AUTOMATION_READ_ANNOTATIONS,
  requiresFlags: AUTOMATION_FLAGS,
  input: AutomationsListInputSchema,
  output: AutomationsListOutputSchema,
  handler: (args, { principal, services, now }) =>
    services.automations.list(
      principal.ownerId,
      {
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      },
      now,
    ),
});
