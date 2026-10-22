import { AutomationRunOutputSchema, AutomationsGetRunInputSchema } from 'shared';
import { defineTool } from '../../tool';
import { AUTOMATION_FLAGS, AUTOMATION_READ_ANNOTATIONS } from './automations-annotations';

/** `automations_get_run` -> `AutomationsService.getRun` (automations A3). */
export const automationsGetRunTool = defineTool({
  name: 'automations_get_run',
  title: 'Get an automation run',
  description:
    'Returns one automation run: status, status_word, the failure slug and a plain-language failure_message, the destination status code, and retry_allowed (true only for a failed run that automations_retry_run may re-enqueue). Needs automations:read.',
  step: 'step-a3',
  scopes: ['automations:read'],
  annotations: AUTOMATION_READ_ANNOTATIONS,
  requiresFlags: AUTOMATION_FLAGS,
  input: AutomationsGetRunInputSchema,
  output: AutomationRunOutputSchema,
  handler: (args, { principal, services }) =>
    services.automations.getRun(principal.ownerId, args.run_id),
});
