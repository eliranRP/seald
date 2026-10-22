import { Global, Module } from '@nestjs/common';
import { WebhookActionExecutor } from './actions/webhook/webhook.executor';
import { WebhookPgRepository } from './actions/webhook/webhook.repository.pg';
import { WebhookSecretsService } from './actions/webhook/webhook-secrets.service';
import { AUTOMATION_ACTION_EXECUTORS, type AutomationActionExecutors } from './automation-actions';
import { AUTOMATION_EVENT_HOOK } from './automation-event-hook';
import { AutomationWorkerService } from './automation-worker.service';
import { AutomationsCrudRepository } from './automations-crud.repository';
import { AutomationsCrudPgRepository } from './automations-crud.repository.pg';
import { AutomationsPgRepository } from './automations.repository.pg';
import { AutomationsService } from './automations.service';
import { AutomationMatcherService } from './matcher';

/**
 * Workflow automations (A1 + A2 webhook action). Global so
 * `EnvelopesPgRepository` can take the optional `AUTOMATION_EVENT_HOOK`
 * without `EnvelopesModule` importing this module. No routes yet; the MCP
 * tools (WP-30) call `AutomationsService`.
 * Everything is inert while `workflowAutomations` is off or
 * `AUTOMATIONS_DISABLED=true`: no trigger rows, no matching, no worker, no
 * outbound request, and no database query at boot.
 */
@Global()
@Module({
  providers: [
    AutomationsPgRepository,
    { provide: AutomationsCrudRepository, useClass: AutomationsCrudPgRepository },
    AutomationsService,
    AutomationMatcherService,
    AutomationWorkerService,
    WebhookPgRepository,
    WebhookSecretsService,
    WebhookActionExecutor,
    {
      provide: AUTOMATION_ACTION_EXECUTORS,
      useFactory: (webhook: WebhookActionExecutor): AutomationActionExecutors => ({ webhook }),
      inject: [WebhookActionExecutor],
    },
    { provide: AUTOMATION_EVENT_HOOK, useExisting: AutomationMatcherService },
  ],
  exports: [
    AUTOMATION_EVENT_HOOK,
    AutomationsPgRepository,
    AutomationsService,
    AutomationMatcherService,
    AutomationWorkerService,
    WebhookSecretsService,
  ],
})
export class AutomationsModule {}
