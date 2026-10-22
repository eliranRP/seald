import { AutomationsListRunsInputSchema, AutomationsListRunsOutputSchema } from 'shared';
import { defineTool } from '../../tool';
import { AUTOMATION_FLAGS, AUTOMATION_READ_ANNOTATIONS } from './automations-annotations';

/** `automations_list_runs` -> `AutomationsService.listRuns` (automations A3). */
export const automationsListRunsTool = defineTool({
  name: 'automations_list_runs',
  title: 'List automation runs',
  description:
    'Lists automation runs, newest first, for one automation (automation_id) or all of them, optionally filtered by status. status_word is Done, Failed or Retrying; a queued or running run has none. A failed run shows a plain failure_message and retry_allowed. Pass next_cursor back as cursor for the next page. Needs automations:read.',
  step: 'step-a3',
  scopes: ['automations:read'],
  annotations: AUTOMATION_READ_ANNOTATIONS,
  requiresFlags: AUTOMATION_FLAGS,
  input: AutomationsListRunsInputSchema,
  output: AutomationsListRunsOutputSchema,
  handler: (args, { principal, services }) =>
    services.automations.listRuns(principal.ownerId, {
      ...(args.automation_id !== undefined ? { automationId: args.automation_id } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
    }),
});
