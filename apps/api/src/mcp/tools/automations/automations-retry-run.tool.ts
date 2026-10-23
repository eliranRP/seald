import { AutomationsRetryRunInputSchema, AutomationsRetryRunOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { AUTOMATION_FLAGS, AUTOMATION_WRITE_ANNOTATIONS } from './automations-annotations';

/** `automations_retry_run` -> `AutomationsService.retryRun` (automations A3). */
export const automationsRetryRunTool = defineWriteTool({
  name: 'automations_retry_run',
  title: 'Retry an automation run',
  description:
    'Re-enqueues one failed automation run under the same run id. A permanent failure is refused with retry_not_allowed (fix the automation instead); a run whose automation is off is refused with automation_disabled. A second call while the run is queued does nothing (already_queued). Needs automations:write. Requires idempotency_key and dry_run.',
  step: 'step-a3',
  scopes: ['automations:write'],
  annotations: AUTOMATION_WRITE_ANNOTATIONS,
  requiresFlags: AUTOMATION_FLAGS,
  input: AutomationsRetryRunInputSchema,
  output: AutomationsRetryRunOutputSchema,
  preview: (args, { principal, services }) =>
    services.automations.previewRetry(principal.ownerId, args.run_id),
  handler: (args, { principal, services }) =>
    services.automations.retryRun(principal.ownerId, args.run_id),
});
